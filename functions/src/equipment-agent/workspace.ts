import {
  CATEGORY_LABEL, DEFAULT_PORTS, newId,
  type AgentPlanInput, type DiagramEdge, type DiagramNode, type Equipment, type EquipmentCategory,
  type LayoutKind, type LayoutZone, type PlanDiagram, type PlanItem, type PortSide, type SignalType, type ZonePlacement,
} from './types'

/**
 * ร่างแผนที่ agent แก้อยู่ — อยู่ในหน่วยความจำเท่านั้น ไม่เขียน Firestore
 * ทุก method คืนข้อความสั้นๆ ให้ LLM อ่าน (ผลลัพธ์ของ tool) และตรวจความถูกต้องเองทุกครั้ง
 * เพื่อให้ร่างที่ส่งกลับไปผ่านเงื่อนไขเดียวกับที่หน้าเว็บบังคับ (ของชนวัน, port มีจริง, port ละเส้นเดียว)
 */

/** การจองของแผนอื่น 1 แถว — ช่วงวันที่แถวนั้นใช้จริง (useFrom/useTo ตัดในวันงานแล้ว) */
export interface OtherBooking { quantity: number; start: string; end: string; title: string }

export interface OtherPlanUsage {
  /** equipmentId → การจองของแผนอื่นที่วันทับกับแผนนี้ */
  bookings: Map<string, OtherBooking[]>
  /** equipmentId → ชื่อแผนที่ใช้อยู่ */
  plans: Map<string, string[]>
  /** แผนนี้ไม่มีวันที่ → เช็กของชนไม่ได้ */
  noDate: boolean
}

interface DayRange { start: string; end: string }

/** ฝาแฝดของ clipItemRange() ใน lib/equipment/availability.ts */
export function clipRange(it: { useFrom?: string; useTo?: string }, pr: DayRange): DayRange {
  const start = it.useFrom && it.useFrom > pr.start ? it.useFrom : pr.start
  const end = it.useTo && it.useTo < pr.end ? it.useTo : pr.end
  return start <= end && start <= pr.end && end >= pr.start ? { start, end } : pr
}

function nextDay(ymd: string): string {
  const d = new Date(ymd + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10) // server เป็น UTC ล้วน อ่าน/เขียน UTC คู่กัน วันไม่เลื่อน
}

function daysIn(r: DayRange, max = 92): string[] {
  const out: string[] = []
  for (let d = r.start, i = 0; d <= r.end && i < max; d = nextDay(d), i++) out.push(d)
  return out
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

export interface Issue {
  level: 'error' | 'warning'
  message: string
}

const NO_PORT_CATEGORIES: EquipmentCategory[] = ['cable', 'support', 'lens', 'lighting', 'power']
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
const tight = (s: string) => s.toLowerCase().replace(/[^a-z0-9ก-๙]+/g, '')

export class Workspace {
  items: PlanItem[]
  diagrams: PlanDiagram[]
  readonly newDiagramIds = new Set<string>()
  readonly newNodeIds = new Set<string>()
  /** วัตถุที่จะวาง/ย้ายในผังวาง 3D — เว็บแปลงโซนเป็นพิกัดเอง */
  placements: ZonePlacement[] = []
  private readonly equipment: Map<string, Equipment>

  constructor(
    readonly plan: AgentPlanInput,
    equipmentList: Equipment[],
    readonly usage: OtherPlanUsage,
  ) {
    this.items = structuredClone(plan.items ?? [])
    this.diagrams = structuredClone(plan.diagrams ?? [])
    this.equipment = new Map(equipmentList.map((e) => [e.id, e]))
  }

  // ── อ่านข้อมูล ────────────────────────────────────────────────────────────

  private draftQty(equipmentId: string, exceptItemId?: string): number {
    return this.items
      .filter((i) => i.equipmentId === equipmentId && i.id !== exceptItemId)
      .reduce((s, i) => s + (i.quantity || 0), 0)
  }

  /** วันงานของแผน — ไม่มีวันที่ = null (เช็กของชนกับงานอื่นไม่ได้) */
  planRange(): DayRange | null {
    const p = this.plan
    if (!p.date) return null
    return { start: p.date, end: p.endDate && p.endDate >= p.date ? p.endDate : p.date }
  }

  /** ช่วงที่แถวนี้ใช้จริง (ใช้ไม่เต็มงาน = ช่วงย่อย) */
  itemRange(it: { useFrom?: string; useTo?: string }): DayRange | null {
    const pr = this.planRange()
    return pr ? clipRange(it, pr) : null
  }

  /**
   * จำนวนที่ยังหยิบเพิ่มได้ในช่วง range (ไม่ระบุ = ทั้งงาน) — หักแผนอื่น + ที่ใส่ในร่างนี้แล้ว ทีละวัน แล้วเอาวันที่ว่างน้อยสุด
   * แถวที่จองคนละวันไม่แย่งของกัน
   */
  available(e: Equipment, exceptItemId?: string, range?: DayRange): number {
    const pr = this.planRange()
    if (!pr) return Math.max(0, e.quantity - this.draftQty(e.id, exceptItemId))
    const others = this.usage.bookings.get(e.id) ?? []
    const mine = this.items.filter((i) => i.equipmentId === e.id && i.id !== exceptItemId).map((i) => ({ q: i.quantity || 0, r: clipRange(i, pr) }))
    let free = e.quantity
    for (const day of daysIn(range ?? pr)) {
      const used = others.reduce((s, b) => s + (b.start <= day && day <= b.end ? b.quantity : 0), 0)
        + mine.reduce((s, m) => s + (m.r.start <= day && day <= m.r.end ? m.q : 0), 0)
      free = Math.min(free, e.quantity - used)
    }
    return Math.max(0, free)
  }

  /** ตรวจ useFrom/useTo ที่ LLM ส่งมา — คืนข้อความผิด หรือช่วงที่ใช้ (undefined = ทั้งงาน) */
  private parseUseRange(useFrom?: string, useTo?: string): string | { useFrom?: string; useTo?: string } {
    if (!useFrom && !useTo) return {}
    const pr = this.planRange()
    if (!pr) return 'แผนยังไม่มีวันที่ — กำหนดวันใช้รายแถวไม่ได้'
    if ((useFrom && !YMD.test(useFrom)) || (useTo && !YMD.test(useTo))) return 'useFrom/useTo ต้องเป็น YYYY-MM-DD'
    const start = useFrom || pr.start
    const end = useTo || pr.end
    if (start < pr.start || end > pr.end || start > end) return `วันใช้ต้องอยู่ในวันงาน ${pr.start} ถึง ${pr.end}`
    if (start === pr.start && end === pr.end) return {}
    return { useFrom: start, useTo: end }
  }

  private describeEquipment(e: Equipment): string {
    const own = e.ownership ?? 'owned'
    const source = own === 'rental'
      ? `ของเช่า (${e.rentalVendor || 'ไม่ระบุร้าน'} ฿${e.rentalRate ?? 0}/ชิ้น/วัน)`
      : own === 'partner' ? `พาร์ทเนอร์ (${e.partnerName || '-'})` : 'ของบริษัท'
    const ports = `port in:${e.inputs?.length ?? 0} out:${e.outputs?.length ?? 0} io:${e.ios?.length ?? 0}`
    const status = e.status === 'repair' ? ' ⚠ส่งซ่อม' : ''
    const busy = this.usage.plans.get(e.id)
    return `${e.id} | ${e.code} | ${e.name}${[e.brand, e.model].filter(Boolean).length ? ` (${[e.brand, e.model].filter(Boolean).join(' ')})` : ''}`
      + ` | ${e.category} | ${source} | ว่าง ${this.available(e)}/${e.quantity}${busy ? ` (งานอื่นใช้: ${busy.join(', ')})` : ''}`
      + ` | ${ports}${e.storageLocation ? ` | เก็บที่ ${e.storageLocation}` : ''}${status}`
  }

  inventoryOverview(): string {
    const rows: string[] = []
    for (const cat of Object.keys(CATEGORY_LABEL) as EquipmentCategory[]) {
      const list = [...this.equipment.values()].filter((e) => e.category === cat && e.status !== 'retired')
      if (list.length === 0) continue
      const count = (o: string) => list.filter((e) => (e.ownership ?? 'owned') === o)
        .reduce((s, e) => s + this.available(e), 0)
      rows.push(`${cat} (${CATEGORY_LABEL[cat]}): ${list.length} รายการ — ว่างตอนนี้ ของบริษัท ${count('owned')} ชิ้น, พาร์ทเนอร์ ${count('partner')}, ของเช่า ${count('rental')}`)
    }
    const dateNote = this.usage.noDate
      ? '⚠ แผนนี้ยังไม่มีวันที่ — ตัวเลข "ว่าง" ไม่ได้หักงานอื่น'
      : `ช่วงงาน ${this.plan.date}${this.plan.endDate && this.plan.endDate !== this.plan.date ? ` ถึง ${this.plan.endDate}` : ''} (หักของที่งานอื่นช่วงนี้ใช้แล้ว)`
    return rows.length ? `${dateNote}\n${rows.join('\n')}` : 'คลังว่าง — ยังไม่มีอุปกรณ์ในระบบ'
  }

  /**
   * รายการคลังทั้งหมด (ไม่รวมที่ปลดระวาง) ใส่ใน message แรก — ตัดรอบค้นคลังทิ้งเกือบหมด
   * คลังใหญ่เกิน → ส่งแค่ภาพรวม ให้โมเดลค้นเอง (กัน context บวม)
   */
  inventoryCatalog(max = 400): string {
    const list = [...this.equipment.values()]
      .filter((e) => e.status !== 'retired')
      .sort((a, b) => a.category.localeCompare(b.category) || ownRank(a) - ownRank(b) || a.code.localeCompare(b.code))
    if (list.length === 0) return 'คลังอุปกรณ์: ว่าง — ยังไม่มีอุปกรณ์ในระบบ'
    if (list.length > max) {
      return `คลังอุปกรณ์ (${list.length} รายการ — มากเกินจะแสดงทั้งหมด ใช้ search_inventory ค้น):\n${this.inventoryOverview()}`
    }
    return [
      `คลังอุปกรณ์ทั้งหมด ${list.length} รายการ (id | รหัส | ชื่อ | หมวด | ที่มา | ว่าง/ทั้งหมด | จำนวน port) — ใช้ id จากตรงนี้กับ add_items ได้เลย:`,
      this.inventoryOverview().split('\n')[0],
      ...list.map((e) => this.describeEquipment(e)),
    ].join('\n')
  }

  searchInventory(args: { query?: string; category?: EquipmentCategory; ownership?: 'owned' | 'rental' | 'partner'; onlyAvailable?: boolean; limit?: number }): string {
    const words = norm(args.query ?? '').split(' ').filter(Boolean)
    const limit = Math.min(Math.max(args.limit ?? 40, 1), 80)
    const list = [...this.equipment.values()]
      .filter((e) => e.status !== 'retired')
      .filter((e) => !args.category || e.category === args.category)
      .filter((e) => !args.ownership || (e.ownership ?? 'owned') === args.ownership)
      .filter((e) => !args.onlyAvailable || this.available(e) > 0)
      .filter((e) => {
        if (words.length === 0) return true
        const text = [e.code, e.name, e.brand, e.model, e.category, CATEGORY_LABEL[e.category], e.rentalVendor, e.partnerName, e.storageLocation].filter(Boolean).join(' ')
        return words.every((w) => norm(text).includes(w) || tight(text).includes(tight(w)))
      })
      // ของบริษัทก่อน แล้วพาร์ทเนอร์ แล้วของเช่า — ใช้ของตัวเองก่อนเสมอ
      .sort((a, b) => ownRank(a) - ownRank(b) || a.code.localeCompare(b.code))
    if (list.length === 0) return 'ไม่พบอุปกรณ์ที่ตรงเงื่อนไข — ลองคำค้นอื่น หรือถ้าไม่มีจริงใช้ add_external_items (เช่าเพิ่ม)'
    const shown = list.slice(0, limit)
    return shown.map((e) => this.describeEquipment(e)).join('\n')
      + (list.length > shown.length ? `\n… และอีก ${list.length - shown.length} รายการ (ค้นให้แคบลง)` : '')
  }

  getPorts(ids: string[]): string {
    return ids.map((id) => {
      const e = this.equipment.get(id)
      if (!e) return `${id}: ไม่พบในคลัง`
      const d = DEFAULT_PORTS[e.category]
      const ins = e.inputs ?? d.inputs
      const outs = e.outputs ?? d.outputs
      const ios = e.ios ?? d.ios ?? []
      return `${e.id} ${e.name}\n  IN: ${ins.join(', ') || '-'}\n  OUT: ${outs.join(', ') || '-'}\n  IO: ${ios.join(', ') || '-'}`
    }).join('\n')
  }

  listPlan(): string {
    const itemLines = this.items.map((i) => {
      const lock = i.expenseId ? ' 🔒ลงบัญชีแล้ว' : ''
      const origin = i.origin ?? (i.equipmentId ? 'owned' : 'rental')
      return `${i.id} | ${i.name}${i.code ? ` [${i.code}]` : ''} | ${i.category} | x${i.quantity} | ${origin}`
        + ` | ${i.fromLocation || '-'} → ${i.toLocation || '(ยังไม่ระบุปลายทาง)'}${i.note ? ` | ${i.note}` : ''}${lock}`
        + (i.attachedTo ? ` | ↳ ติดกับ item ${i.attachedTo}` : '')
        + (i.useFrom || i.useTo ? ` | 📅 ใช้ ${this.itemRange(i)?.start} ถึง ${this.itemRange(i)?.end}` : '')
    })
    const diagramLines = this.diagrams.map((d) => {
      const nodes = d.nodes.map((n) => {
        const used = (side: PortSide) => (n[side === 'in' ? 'inputs' : side === 'out' ? 'outputs' : 'ios'] ?? [])
          .map((p, idx) => (this.portUsed(d, n.id, side, idx) ? `${p}✔` : p))
        return `  - ${n.id} "${n.label}" (${n.category}${n.planItemId ? `, item ${n.planItemId}` : ''}) IN[${used('in').join(', ')}] OUT[${used('out').join(', ')}] IO[${used('io').join(', ')}]${n.note ? ` 📝 ${n.note.replace(/\n/g, ' / ')}` : ''}`
      })
      const edges = d.edges.map((e) => `  ~ ${e.id}: ${this.portLabel(d, e.from)} → ${this.portLabel(d, e.to)} (${e.signal}${e.label ? `, ${e.label}` : ''})`)
      return `ผัง ${d.id} "${d.name}" — ${d.nodes.length} กล่อง, ${d.edges.length} เส้น\n${[...nodes, ...edges].join('\n')}`
    })
    return [
      `รายการอุปกรณ์ (${this.items.length} แถว):`,
      ...(itemLines.length ? itemLines : ['(ว่าง)']),
      '',
      `ผังโยง (${this.diagrams.length} ผัง):`,
      ...(diagramLines.length ? diagramLines : ['(ยังไม่มี)']),
      '(✔ = port นั้นถูกโยงแล้ว)',
      '',
      `ผังวาง 3D ที่มีอยู่: ${this.plan.layoutSummary || '(ยังไม่มี — วางครั้งแรกระบบสร้างผังพร้อมโต๊ะ FOH ให้)'}`,
      `วางในร่างนี้: ${this.placements.length ? this.placements.map((p) => (p.swapWith ? `${p.label} ⇄ ${p.swapWith.label}` : `${p.label} → ${p.zone}`)).join(', ') : '(ยังไม่มี)'}`,
    ].join('\n')
  }

  /** หากล้อง/ของจาก item id, ชื่อกล่องในผังโยง (เช่น "CAM 2") หรือหมายเหตุของแถว */
  private resolveItem(ref: string): PlanItem | undefined {
    const byId = this.items.find((i) => i.id === ref)
    if (byId) return byId
    for (const d of this.diagrams) {
      const n = d.nodes.find((x) => x.planItemId && norm(x.label) === norm(ref))
      if (n) return this.items.find((i) => i.id === n.planItemId)
    }
    return this.items.find((i) => norm(i.note ?? '') === norm(ref)) ?? this.items.find((i) => norm(i.name) === norm(ref))
  }

  /** ชื่อที่ใช้ในผัง (label กล่องผังโยง) — ไม่มี = ชื่ออุปกรณ์ */
  private labelOf(it: PlanItem): string {
    for (const d of this.diagrams) {
      const n = d.nodes.find((x) => x.planItemId === it.id)
      if (n) return n.label
    }
    return it.name
  }

  /**
   * สลับตำแหน่งกล้อง 2 ตัวทั้งแผน: ปลายทางของกล้อง (+ ของในชุดย้ายตาม), บรรทัดรองของกล่องในผังโยง (จุดติดตั้ง), ตำแหน่งในผังวาง 3D
   * เลนส์/ของในชุดยังติดกล้องตัวเดิม — ถ้าจะให้เลนส์อยู่กับจุดเดิมต้อง update_items attachTo แยก
   */
  swapPositions(a: string, b: string): string {
    const A = this.resolveItem(a)
    const B = this.resolveItem(b)
    if (!A) return `✗ ไม่พบ ${a} (ใช้ item id หรือชื่อกล่องในผังโยง เช่น "CAM 2")`
    if (!B) return `✗ ไม่พบ ${b}`
    if (A.id === B.id) return '✗ เป็นตัวเดียวกัน'
    const locA = A.toLocation ?? ''
    const locB = B.toLocation ?? ''
    const kidsA = this.items.filter((c) => c.attachedTo === A.id && (c.toLocation ?? '') === locA)
    const kidsB = this.items.filter((c) => c.attachedTo === B.id && (c.toLocation ?? '') === locB)
    A.toLocation = locB
    B.toLocation = locA
    for (const c of kidsA) c.toLocation = locB
    for (const c of kidsB) c.toLocation = locA
    let subs = 0
    for (const d of this.diagrams) {
      const na = d.nodes.find((n) => n.planItemId === A.id)
      const nb = d.nodes.find((n) => n.planItemId === B.id)
      if (na && nb) {
        const s = na.sub
        if (nb.sub) na.sub = nb.sub; else delete na.sub
        if (s) nb.sub = s; else delete nb.sub
        subs++
      }
    }
    const labelA = this.labelOf(A)
    const labelB = this.labelOf(B)
    this.placements.push({ kind: 'camera', label: labelA, itemId: A.id, swapWith: { label: labelB, itemId: B.id } })
    return `✓ สลับ ${labelA} ⇄ ${labelB}: ปลายทาง "${locB || '-'}" ⇄ "${locA || '-'}" (ของในชุด ${kidsA.length + kidsB.length} ชิ้นย้ายตาม)`
      + ` · ผังโยงสลับบรรทัดรอง ${subs} ผัง · ผังวาง 3D สลับตำแหน่ง`
      + ' — ถ้าเลนส์ต้องอยู่กับจุดเดิมให้ update_items attachTo เพิ่ม และแก้ note ของกล้อง (update_node) ให้ตรงเลนส์'
  }

  // ── ผังวาง 3D (เลือกโซน ไม่วางพิกัด) ────────────────────────────────────────

  place3d(objects: { zone: LayoutZone; kind?: LayoutKind; label?: string; itemId?: string; note?: string }[]): string {
    return objects.map((o) => {
      const item = o.itemId ? this.items.find((i) => i.id === o.itemId) : undefined
      if (o.itemId && !item) return `✗ ${o.itemId}: ไม่มีในรายการ`
      if (o.kind === 'desk' && /foh/i.test(o.label ?? '')) return '– FOH วางให้อัตโนมัติอยู่แล้ว ไม่ต้องวาง'
      const kind: LayoutKind = o.kind ?? (item?.category === 'camera' ? 'camera' : 'generic')
      const label = o.label?.trim() || item?.name || kind
      const p: ZonePlacement = { zone: o.zone, kind, label, ...(item ? { itemId: item.id } : {}), ...(o.note ? { note: o.note } : {}) }
      // สั่งวางชื่อเดิมซ้ำ = ย้ายโซน
      const i = this.placements.findIndex((x) => !x.swapWith && x.label === label && x.itemId === p.itemId)
      if (i >= 0) this.placements[i] = p
      else this.placements.push(p)
      return `✓ ${label} → ${o.zone}`
    }).join('\n')
  }

  // ── แก้รายการอุปกรณ์ ──────────────────────────────────────────────────────

  addItems(items: { equipmentId: string; quantity: number; toLocation?: string; note?: string; attachTo?: string; useFrom?: string; useTo?: string }[]): string {
    return items.map((req) => {
      const e = this.equipment.get(req.equipmentId)
      if (!e) return `✗ ${req.equipmentId}: ไม่พบในคลัง (ใช้ id จาก search_inventory เท่านั้น)`
      const use = this.parseUseRange(req.useFrom, req.useTo)
      if (typeof use === 'string') return `✗ ${e.name}: ${use}`
      const useR = this.itemRange(use) ?? undefined
      const parent = req.attachTo ? this.items.find((i) => i.id === req.attachTo) : undefined
      if (req.attachTo && !parent) return `✗ ${e.name}: attachTo ${req.attachTo} ไม่มีในรายการ (ใช้ item id ของกล้องจาก add_items/list_plan)`
      if (parent?.attachedTo) return `✗ ${e.name}: ${parent.name} ติดกับแถวอื่นอยู่แล้ว — attachTo ต้องเป็นแถวแม่ (กล้อง)`
      if (e.status === 'retired') return `✗ ${e.name}: เลิกใช้แล้ว`
      const qty = Math.max(1, Math.floor(req.quantity || 1))
      const avail = this.available(e, undefined, useR)
      if (qty > avail) {
        const busy = this.usage.plans.get(e.id)
        return `✗ ${e.name}: ขอ ${qty} แต่ว่างแค่ ${avail}/${e.quantity}${busy ? ` (งานอื่นช่วงเดียวกันใช้: ${busy.join(', ')})` : ''} — ลดจำนวน หาตัวอื่น หรือเช่าเพิ่ม`
      }
      const origin = e.ownership ?? 'owned'
      const counterpart = origin === 'rental' ? e.rentalVendor : origin === 'partner' ? e.partnerName : undefined
      // ของเดิมแถวเดียวกัน ปลายทางเดียวกัน → รวมจำนวน ไม่แตกแถวซ้ำ
      const same = this.items.find((i) => i.equipmentId === e.id && !i.expenseId && (i.attachedTo ?? '') === (parent?.id ?? '')
        && (i.toLocation ?? '') === (req.toLocation ?? i.toLocation ?? '')
        && (i.useFrom ?? '') === (use.useFrom ?? '') && (i.useTo ?? '') === (use.useTo ?? ''))
      if (same) {
        same.quantity += qty
        if (req.toLocation) same.toLocation = req.toLocation
        if (req.note) same.note = [same.note, req.note].filter(Boolean).join(' · ')
        return `✓ ${e.name}: รวมเข้าแถวเดิม ${same.id} → x${same.quantity}`
      }
      const item: PlanItem = {
        id: newId(), equipmentId: e.id, code: e.code, name: e.name, category: e.category,
        quantity: qty, packed: false, returned: false, origin,
        fromLocation: counterpart || e.storageLocation,
        // ของที่ติดกล้อง ไปที่เดียวกับกล้องถ้าไม่ระบุ
        ...(req.toLocation || parent?.toLocation ? { toLocation: req.toLocation || parent?.toLocation } : {}),
        ...(req.note ? { note: req.note } : {}),
        ...(parent ? { attachedTo: parent.id } : {}),
        ...use,
        ...(origin !== 'owned' ? { rentalVendor: counterpart, unitCost: e.rentalRate ?? 0, rentalDays: use.useFrom && useR ? daysIn(useR).length : 1 } : {}),
      }
      this.items.push(item)
      return `✓ ${e.name} x${qty} → item ${item.id}${parent ? ` (ติดกับ ${parent.name})` : ''}${use.useFrom ? ` (ใช้ ${use.useFrom} ถึง ${use.useTo})` : ''}${e.status === 'repair' ? ' (⚠ สถานะส่งซ่อม — แจ้งผู้ใช้)' : ''}`
    }).join('\n')
  }

  addExternalItems(items: { name: string; category: EquipmentCategory; quantity: number; origin?: 'rental' | 'partner'; vendor?: string; unitCost?: number; rentalDays?: number; toLocation?: string; note?: string; useFrom?: string; useTo?: string }[]): string {
    return items.map((req) => {
      if (!req.name?.trim()) return '✗ ต้องมีชื่อ'
      const use = this.parseUseRange(req.useFrom, req.useTo)
      if (typeof use === 'string') return `✗ ${req.name}: ${use}`
      const useR = use.useFrom ? this.itemRange(use) : null
      const item: PlanItem = {
        id: newId(), name: req.name.trim(), category: req.category, quantity: Math.max(1, Math.floor(req.quantity || 1)),
        packed: false, returned: false, origin: req.origin ?? 'rental',
        ...(req.vendor ? { rentalVendor: req.vendor } : {}),
        unitCost: Math.max(0, req.unitCost ?? 0),
        rentalDays: Math.max(1, Math.floor(req.rentalDays ?? (useR ? daysIn(useR).length : 1))),
        ...use,
        ...(req.toLocation ? { toLocation: req.toLocation } : {}),
        ...(req.note ? { note: req.note } : {}),
      }
      this.items.push(item)
      return `✓ (นอกคลัง) ${item.name} x${item.quantity} → item ${item.id}`
    }).join('\n')
  }

  updateItems(updates: { itemId: string; quantity?: number; fromLocation?: string; toLocation?: string; note?: string; attachTo?: string; useFrom?: string; useTo?: string }[]): string {
    return updates.map((u) => {
      const it = this.items.find((i) => i.id === u.itemId)
      if (!it) return `✗ ${u.itemId}: ไม่พบในแผน`
      if (u.useFrom != null || u.useTo != null) {
        // "" ทั้งคู่ = กลับเป็นทั้งงาน · ส่งมาข้างเดียว = อีกข้างใช้ค่าเดิมของแถว
        const use = this.parseUseRange(u.useFrom ?? it.useFrom, u.useTo ?? it.useTo)
        if (typeof use === 'string') return `✗ ${it.name}: ${use}`
        const e = it.equipmentId ? this.equipment.get(it.equipmentId) : undefined
        const r = this.itemRange(use) ?? undefined
        if (e && (u.quantity ?? it.quantity) > this.available(e, it.id, r)) return `✗ ${it.name}: ช่วงวันนั้นว่างแค่ ${this.available(e, it.id, r)} ชิ้น`
        delete it.useFrom
        delete it.useTo
        Object.assign(it, use)
        if (it.origin && it.origin !== 'owned' && !it.expenseId && r) it.rentalDays = daysIn(r).length
      }
      if (u.quantity != null) {
        const qty = Math.max(1, Math.floor(u.quantity))
        if (it.expenseId && qty !== it.quantity) return `✗ ${it.name}: ลงบัญชีแล้ว แก้จำนวนไม่ได้`
        const e = it.equipmentId ? this.equipment.get(it.equipmentId) : undefined
        const r = this.itemRange(it) ?? undefined
        if (e && qty > this.available(e, it.id, r)) return `✗ ${it.name}: ว่างแค่ ${this.available(e, it.id, r)} ชิ้น`
        it.quantity = qty
      }
      if (u.fromLocation != null) it.fromLocation = u.fromLocation
      const notes: string[] = []
      if (u.toLocation != null && u.toLocation !== (it.toLocation ?? '')) {
        // ย้ายกล้อง → ของในชุดที่อยู่ที่เดิมย้ายตาม (เหมือนตารางหน้าเว็บ)
        const prev = it.toLocation ?? ''
        const kids = this.items.filter((c) => c.attachedTo === it.id && (c.toLocation ?? '') === prev)
        for (const c of kids) c.toLocation = u.toLocation
        if (kids.length) notes.push(`ของในชุด ${kids.length} ชิ้นย้ายตาม`)
        it.toLocation = u.toLocation
      }
      if (u.note != null) it.note = u.note
      if (u.attachTo != null) {
        // "" = ถอดออกจากกล้อง
        if (u.attachTo === '') delete it.attachedTo
        else {
          const parent = this.items.find((i) => i.id === u.attachTo)
          if (!parent || parent.id === it.id) return `✗ ${it.name}: attachTo ${u.attachTo} ไม่มีในรายการ`
          if (parent.attachedTo) return `✗ ${it.name}: ${parent.name} ติดกับแถวอื่นอยู่แล้ว`
          if (this.items.some((i) => i.attachedTo === it.id)) return `✗ ${it.name}: มีของติดอยู่กับแถวนี้ ย้ายไปติดแถวอื่นไม่ได้`
          it.attachedTo = parent.id
          // เปลี่ยน/สลับเลนส์ไปกล้องอื่น → ไปอยู่ที่เดียวกับกล้องใหม่ (ถ้าไม่ได้สั่งปลายทางเอง)
          if (u.toLocation == null && parent.toLocation) it.toLocation = parent.toLocation
          notes.push(`ติดกับ ${parent.name}${parent.toLocation ? ` → ${parent.toLocation}` : ''}`)
        }
      }
      return `✓ ${it.name} แก้แล้ว${notes.length ? ` (${notes.join(' · ')})` : ''}`
    }).join('\n')
  }

  removeItems(ids: string[]): string {
    return ids.map((id) => {
      const it = this.items.find((i) => i.id === id)
      if (!it) return `✗ ${id}: ไม่พบ`
      if (it.expenseId) return `✗ ${it.name}: ลงบัญชีเป็นรายจ่ายแล้ว ลบไม่ได้`
      this.items = this.items.filter((i) => i.id !== id)
      // ของที่ติดแถวนี้ (เลนส์) ยังอยู่ในแผน แค่ไม่ได้จับคู่แล้ว
      for (const c of this.items) if (c.attachedTo === id) delete c.attachedTo
      // กล่องในผังที่มาจากแถวนี้ต้องออกไปด้วย ไม่งั้นผังอ้างของที่ไม่มีในรายการ
      let removed = 0
      for (const d of this.diagrams) {
        const gone = new Set(d.nodes.filter((n) => n.planItemId === id).map((n) => n.id))
        removed += gone.size
        d.nodes = d.nodes.filter((n) => !gone.has(n.id))
        d.edges = d.edges.filter((e) => !gone.has(e.from.nodeId) && !gone.has(e.to.nodeId))
      }
      return `✓ ลบ ${it.name}${removed ? ` (+ กล่องในผัง ${removed} กล่อง)` : ''}`
    }).join('\n')
  }

  // ── แก้ผังโยง ─────────────────────────────────────────────────────────────

  private diagram(id: string): PlanDiagram | undefined {
    return this.diagrams.find((d) => d.id === id) ?? this.diagrams.find((d) => norm(d.name) === norm(id))
  }

  createDiagram(name: string): string {
    const existing = this.diagrams.find((d) => norm(d.name) === norm(name))
    if (existing) return `มีผัง "${existing.name}" อยู่แล้ว → ${existing.id} (ใช้ต่อได้ หรือ clear_diagram ก่อนถ้าจะวาดใหม่)`
    const d: PlanDiagram = { id: newId(), name: name.trim() || 'Video', nodes: [], edges: [] }
    this.diagrams.push(d)
    this.newDiagramIds.add(d.id)
    return `✓ สร้างผัง "${d.name}" → ${d.id}`
  }

  clearDiagram(id: string): string {
    const d = this.diagram(id)
    if (!d) return `✗ ไม่พบผัง ${id}`
    d.nodes = []
    d.edges = []
    this.newDiagramIds.add(d.id) // วาดใหม่ทั้งผัง → จัดตำแหน่งใหม่ทั้งผัง
    return `✓ ล้างผัง "${d.name}" แล้ว`
  }

  deleteDiagram(id: string): string {
    const d = this.diagram(id)
    if (!d) return `✗ ไม่พบผัง ${id}`
    this.diagrams = this.diagrams.filter((x) => x.id !== d.id)
    return `✓ ลบผัง "${d.name}"`
  }

  addNodes(diagramId: string, nodes: { itemId?: string; label?: string; sub?: string; note?: string; category?: EquipmentCategory; inputs?: string[]; outputs?: string[]; ios?: string[] }[]): string {
    const d = this.diagram(diagramId)
    if (!d) return `✗ ไม่พบผัง ${diagramId} — create_diagram ก่อน`
    return nodes.map((req) => {
      const item = req.itemId ? this.items.find((i) => i.id === req.itemId) : undefined
      if (req.itemId && !item) return `✗ ${req.itemId}: ไม่มีในรายการอุปกรณ์ของแผน (add_items ก่อน)`
      if (!item && !req.label) return '✗ กล่องอิสระ (ของสถานที่/ลูกค้า) ต้องมี label'
      const e = item?.equipmentId ? this.equipment.get(item.equipmentId) : undefined
      const category = item?.category ?? req.category ?? 'other'
      if (item) {
        // กล่องต่อแถวห้ามเกินจำนวนชิ้น — ของ 1 ชิ้นอยู่ได้กล่องเดียวต่อผัง
        const placed = d.nodes.filter((n) => n.planItemId === item.id).length
        if (placed >= item.quantity && !NO_PORT_CATEGORIES.includes(category)) {
          return `✗ ${item.name}: มี ${item.quantity} ชิ้น วางในผังนี้ครบแล้ว — เพิ่มจำนวนใน update_items ก่อนถ้าต้องการอีก`
        }
      }
      const d0 = DEFAULT_PORTS[category]
      const placedCount = item ? d.nodes.filter((n) => n.planItemId === item.id).length : 0
      const label = req.label ?? (item && item.quantity > 1 ? `${item.name} #${placedCount + 1}` : item?.name ?? '')
      const sub = req.sub ?? ([e?.brand, e?.model].filter(Boolean).join(' ') || item?.toLocation)
      const node: DiagramNode = {
        id: newId(),
        ...(item?.equipmentId ? { equipmentId: item.equipmentId } : {}),
        ...(item ? { planItemId: item.id } : {}),
        label,
        ...(sub ? { sub } : {}),
        ...(req.note?.trim() ? { note: req.note.trim() } : {}),
        category,
        x: 0, y: 0, // ตำแหน่งจริงจัดฝั่งเว็บ (autoLayoutDiagram) — LLM วางพิกัดได้ไม่สวย
        inputs: [...(req.inputs ?? e?.inputs ?? d0.inputs)],
        outputs: [...(req.outputs ?? e?.outputs ?? d0.outputs)],
        ios: [...(req.ios ?? (e ? e.ios ?? [] : d0.ios ?? []))],
      }
      d.nodes.push(node)
      this.newNodeIds.add(node.id)
      return `✓ ${node.id} "${node.label}" IN[${node.inputs.join(', ')}] OUT[${node.outputs.join(', ')}] IO[${(node.ios ?? []).join(', ')}]`
    }).join('\n')
  }

  /** แก้ชื่อ / บรรทัดรอง / หมายเหตุของกล่อง — ส่ง note เป็น "" = ลบหมายเหตุ */
  updateNode(diagramId: string, nodeId: string, patch: { label?: string; sub?: string; note?: string }): string {
    const d = this.diagram(diagramId)
    const n = d && this.findNode(d, nodeId)
    if (!d || !n) return `✗ ไม่พบกล่อง ${nodeId}`
    if (patch.label != null && patch.label.trim()) n.label = patch.label.trim()
    if (patch.sub != null) { if (patch.sub.trim()) n.sub = patch.sub.trim(); else delete n.sub }
    if (patch.note != null) { if (patch.note.trim()) n.note = patch.note.trim(); else delete n.note }
    return `✓ "${n.label}"${n.sub ? ` (${n.sub})` : ''}${n.note ? ` 📝 ${n.note}` : ''}`
  }

  /** เพิ่ม port ต่อท้าย (ไม่แทรกกลาง เพราะเส้นอ้าง port ด้วย index) */
  addPorts(diagramId: string, nodeId: string, side: PortSide, names: string[]): string {
    const d = this.diagram(diagramId)
    const n = d && this.findNode(d, nodeId)
    if (!d || !n) return `✗ ไม่พบกล่อง ${nodeId}`
    const key = side === 'in' ? 'inputs' : side === 'out' ? 'outputs' : 'ios'
    n[key] = [...(n[key] ?? []), ...names]
    return `✓ "${n.label}" ${key}: ${(n[key] ?? []).join(', ')}`
  }

  removeNodes(diagramId: string, nodeIds: string[]): string {
    const d = this.diagram(diagramId)
    if (!d) return `✗ ไม่พบผัง ${diagramId}`
    const gone = new Set(nodeIds.map((id) => this.findNode(d, id)?.id).filter((x): x is string => !!x))
    d.nodes = d.nodes.filter((n) => !gone.has(n.id))
    d.edges = d.edges.filter((e) => !gone.has(e.from.nodeId) && !gone.has(e.to.nodeId))
    return `✓ ลบ ${gone.size} กล่อง`
  }

  private findNode(d: PlanDiagram, ref: string): DiagramNode | undefined {
    return d.nodes.find((n) => n.id === ref) ?? d.nodes.find((n) => norm(n.label) === norm(ref))
  }

  private ports(n: DiagramNode, side: PortSide): string[] {
    return side === 'in' ? n.inputs : side === 'out' ? n.outputs : n.ios ?? []
  }

  private portUsed(d: PlanDiagram, nodeId: string, side: PortSide, index: number): boolean {
    return d.edges.some((e) => [e.from, e.to].some((r) => r.nodeId === nodeId && r.side === side && r.index === index))
  }

  private portLabel(d: PlanDiagram, ref: DiagramEdge['from']): string {
    const n = d.nodes.find((x) => x.id === ref.nodeId)
    return `${n?.label ?? '?'}.${n ? this.ports(n, ref.side)[ref.index] ?? '?' : '?'}`
  }

  /** หา port จากชื่อ — ต้นทางลองขาออกก่อน ปลายทางลองขาเข้าก่อน แล้วค่อย io */
  private resolvePort(n: DiagramNode, name: string, role: 'from' | 'to'): { side: PortSide; index: number } | string {
    const order: PortSide[] = role === 'from' ? ['out', 'io'] : ['in', 'io']
    for (const side of order) {
      const list = this.ports(n, side)
      let idx = list.findIndex((p) => p === name)
      if (idx < 0) idx = list.findIndex((p) => norm(p) === norm(name))
      if (idx < 0) idx = list.findIndex((p) => tight(p) === tight(name))
      if (idx >= 0) return { side, index: idx }
    }
    const wrong = role === 'from' ? n.inputs : n.outputs
    if (wrong.some((p) => norm(p) === norm(name))) {
      return `"${name}" ของ "${n.label}" เป็น${role === 'from' ? 'ขาเข้า ใช้เป็นต้นทางไม่ได้' : 'ขาออก ใช้เป็นปลายทางไม่ได้'} (ต้นทาง = OUT/IO, ปลายทาง = IN/IO)`
    }
    return `"${n.label}" ไม่มี port "${name}" — มี IN[${n.inputs.join(', ')}] OUT[${n.outputs.join(', ')}] IO[${(n.ios ?? []).join(', ')}]`
  }

  connect(diagramId: string, links: { fromNode: string; fromPort: string; toNode: string; toPort: string; signal: SignalType; label?: string }[]): string {
    const d = this.diagram(diagramId)
    if (!d) return `✗ ไม่พบผัง ${diagramId}`
    return links.map((l) => {
      const a = this.findNode(d, l.fromNode)
      const b = this.findNode(d, l.toNode)
      if (!a) return `✗ ไม่พบกล่อง ${l.fromNode}`
      if (!b) return `✗ ไม่พบกล่อง ${l.toNode}`
      if (a.id === b.id) return `✗ โยงเข้าตัวเองไม่ได้ (${a.label})`
      const from = this.resolvePort(a, l.fromPort, 'from')
      if (typeof from === 'string') return `✗ ${from}`
      const to = this.resolvePort(b, l.toPort, 'to')
      if (typeof to === 'string') return `✗ ${to}`
      // 1 port = 1 หัวสาย — ขาออกที่ต้องแยกหลายปลายทางต้องผ่าน DA/Router
      if (this.portUsed(d, a.id, from.side, from.index)) return `✗ ${a.label}.${l.fromPort} มีสายเสียบอยู่แล้ว — ใช้ port อื่น หรือผ่าน DA/router`
      if (this.portUsed(d, b.id, to.side, to.index)) return `✗ ${b.label}.${l.toPort} มีสายเสียบอยู่แล้ว`
      const edge: DiagramEdge = {
        id: newId(),
        from: { nodeId: a.id, ...from },
        to: { nodeId: b.id, ...to },
        signal: l.signal,
        ...(l.label ? { label: l.label } : {}),
      }
      d.edges.push(edge)
      return `✓ ${edge.id}: ${a.label}.${this.ports(a, from.side)[from.index]} → ${b.label}.${this.ports(b, to.side)[to.index]}`
    }).join('\n')
  }

  disconnect(diagramId: string, edgeIds: string[]): string {
    const d = this.diagram(diagramId)
    if (!d) return `✗ ไม่พบผัง ${diagramId}`
    const before = d.edges.length
    d.edges = d.edges.filter((e) => !edgeIds.includes(e.id))
    return `✓ ลบ ${before - d.edges.length} เส้น`
  }

  // ── ตรวจทั้งแผน ───────────────────────────────────────────────────────────

  validate(): Issue[] {
    const issues: Issue[] = []
    // ของชนวัน / เกินจำนวน
    // เช็กทีละวัน — แถวที่ใช้ไม่เต็มงานนับเฉพาะวันที่ใช้
    const pr = this.planRange()
    const byEq = new Set(this.items.filter((i) => i.equipmentId).map((i) => i.equipmentId!))
    for (const id of byEq) {
      const e = this.equipment.get(id)
      if (!e) continue
      const rows = this.items.filter((i) => i.equipmentId === id)
      const others = this.usage.bookings.get(id) ?? []
      let worst: { day: string; need: number; free: number } | null = null
      for (const day of pr ? daysIn(pr) : ['']) {
        const need = rows.reduce((s, i) => { const r = pr ? clipRange(i, pr) : null; return s + (!r || (r.start <= day && day <= r.end) ? i.quantity : 0) }, 0)
        const free = e.quantity - others.reduce((s, b) => s + (b.start <= day && day <= b.end ? b.quantity : 0), 0)
        if (need > free && (!worst || need - free > worst.need - worst.free)) worst = { day, need, free }
      }
      if (worst) issues.push({ level: 'error', message: `${e.name}: ใช้ ${worst.need} แต่ว่างแค่ ${Math.max(0, worst.free)}/${e.quantity}${worst.day && pr && pr.start !== pr.end ? ` วันที่ ${worst.day}` : ''}${this.usage.plans.get(id) ? ` (ชนกับ ${this.usage.plans.get(id)!.join(', ')})` : ''}` })
      if (e.status === 'repair') issues.push({ level: 'warning', message: `${e.name}: สถานะในคลังคือ "ส่งซ่อม"` })
    }
    for (const d of this.diagrams) {
      const ids = new Set(d.nodes.map((n) => n.id))
      const seen = new Map<string, number>()
      for (const e of d.edges) {
        for (const r of [e.from, e.to]) {
          const n = d.nodes.find((x) => x.id === r.nodeId)
          if (!ids.has(r.nodeId) || !n || r.index >= this.ports(n, r.side).length) {
            issues.push({ level: 'error', message: `ผัง "${d.name}": เส้น ${e.id} อ้าง port ที่ไม่มีแล้ว` })
            continue
          }
          const k = `${r.nodeId}:${r.side}:${r.index}`
          seen.set(k, (seen.get(k) ?? 0) + 1)
        }
      }
      for (const [k, count] of seen) {
        if (count < 2) continue
        const [nodeId, side, index] = k.split(':')
        const n = d.nodes.find((x) => x.id === nodeId)!
        issues.push({ level: 'error', message: `ผัง "${d.name}": ${n.label}.${this.ports(n, side as PortSide)[Number(index)]} มีสาย ${count} เส้น (port ละ 1 เส้น)` })
      }
      for (const n of d.nodes) {
        if (NO_PORT_CATEGORIES.includes(n.category)) continue
        if (!d.edges.some((e) => e.from.nodeId === n.id || e.to.nodeId === n.id)) {
          issues.push({ level: 'warning', message: `ผัง "${d.name}": "${n.label}" ยังไม่ได้โยงสายเลย` })
        }
      }
    }
    const noDest = this.items.filter((i) => !i.toLocation)
    if (noDest.length) issues.push({ level: 'warning', message: `ยังไม่ระบุปลายทาง ${noDest.length} รายการ: ${noDest.slice(0, 8).map((i) => i.name).join(', ')}${noDest.length > 8 ? '…' : ''}` })
    if (this.usage.noDate) issues.push({ level: 'warning', message: 'แผนยังไม่มีวันที่ — ยังเช็กของชนกับงานอื่นไม่ได้' })
    return issues
  }

  validateText(): string {
    const issues = this.validate()
    if (issues.length === 0) return '✓ ไม่พบปัญหา'
    return issues.map((i) => `${i.level === 'error' ? '✗' : '⚠'} ${i.message}`).join('\n')
  }
}

function ownRank(e: Equipment): number {
  const o = e.ownership ?? 'owned'
  return o === 'owned' ? 0 : o === 'partner' ? 1 : 2
}
