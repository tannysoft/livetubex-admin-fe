import type { Equipment, EquipmentPlan, PlanItem } from '../types'
import { formatDatePill } from '../utils'

// ตรวจของชนกันระหว่างแผน — ของชิ้นเดียวกันอยู่ 2 งานในวันเดียวกันไม่ได้
// นับเฉพาะแผนที่ยังไม่ "เก็บกลับแล้ว" และมีวันที่ (แผนไม่มีวันที่ = เช็กไม่ได้ ถือว่าไม่ชน)
// แต่ละแถวจองได้ไม่เต็มงาน (PlanItem.useFrom/useTo) → นับเป็นรายวันเสมอ ไม่รวมแผนทั้งก้อน
// ⚠️ ฝาแฝดฝั่งผู้ช่วย AI: functions/src/equipment-agent/index.ts (loadOtherUsage) + workspace.ts (available/validate)

export interface PlanRange { start: string; end: string }

export function planRange(p: Pick<EquipmentPlan, 'date' | 'endDate'>): PlanRange | null {
  if (!p.date) return null
  return { start: p.date, end: p.endDate && p.endDate >= p.date ? p.endDate : p.date }
}

/** ISO date (YYYY-MM-DD) เทียบเป็น string ได้ตรงๆ */
export function rangesOverlap(a: PlanRange, b: PlanRange): boolean {
  return a.start <= b.end && b.start <= a.end
}

/** ช่วงที่แถวนี้ใช้จริง — useFrom/useTo ตัดให้อยู่ในวันงาน · ไม่ใส่/ผิดรูป = ทั้งงาน */
export function clipItemRange(it: Pick<PlanItem, 'useFrom' | 'useTo'>, pr: PlanRange): PlanRange {
  const start = it.useFrom && it.useFrom > pr.start ? it.useFrom : pr.start
  const end = it.useTo && it.useTo < pr.end ? it.useTo : pr.end
  return start <= end && start <= pr.end && end >= pr.start ? { start, end } : pr
}

export function itemRange(it: Pick<PlanItem, 'useFrom' | 'useTo'>, plan: Pick<EquipmentPlan, 'date' | 'endDate'>): PlanRange | null {
  const pr = planRange(plan)
  return pr ? clipItemRange(it, pr) : null
}

/** แถวนี้ใช้ไม่เต็มงานไหม (มีช่วงย่อยที่ต่างจากวันงาน) */
export function isPartialItem(it: Pick<PlanItem, 'useFrom' | 'useTo'>, plan: Pick<EquipmentPlan, 'date' | 'endDate'>): boolean {
  const pr = planRange(plan)
  if (!pr) return false
  const r = clipItemRange(it, pr)
  return r.start !== pr.start || r.end !== pr.end
}

/** ป้ายวันที่ใช้ของแถวที่ใช้ไม่เต็มงาน เช่น "เฉพาะ จ. 25 ก.ย." / "จ. 25 – อ. 26 ก.ย." — เต็มงาน = '' */
export function itemUseLabel(it: Pick<PlanItem, 'useFrom' | 'useTo'>, plan: Pick<EquipmentPlan, 'date' | 'endDate'>): string {
  const pr = planRange(plan)
  if (!pr) return ''
  const r = clipItemRange(it, pr)
  if (r.start === pr.start && r.end === pr.end) return ''
  return r.start === r.end ? `เฉพาะ ${formatDatePill(r.start)}` : `${formatDatePill(r.start)} – ${formatDatePill(r.end)}`
}

/** วันถัดไปแบบ YYYY-MM-DD (อ่านเวลาท้องถิ่น — ห้าม toISOString เพราะ UTC+7 เลื่อนวัน) */
export function nextDay(ymd: string): string {
  const d = new Date(ymd + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function daysIn(r: PlanRange, max = 92): string[] {
  const out: string[] = []
  for (let d = r.start, i = 0; d <= r.end && i < max; d = nextDay(d), i++) out.push(d)
  return out
}

/** การจองของ 1 แถว (เฉพาะของในสต็อก) */
export interface Booking { equipmentId: string; quantity: number; start: string; end: string; planId: string; title: string; itemId: string }

export function planBookings(p: EquipmentPlan): Booking[] {
  const pr = planRange(p)
  if (!pr) return []
  return p.items.filter((it) => it.equipmentId).map((it) => {
    const r = clipItemRange(it, pr)
    return { equipmentId: it.equipmentId!, quantity: it.quantity || 0, start: r.start, end: r.end, planId: p.id, title: p.title, itemId: it.id }
  })
}

/** แผนอื่นที่วันทับกับแผนนี้ (ตัดตัวเองและแผนที่เก็บกลับแล้ว) */
export function overlappingPlans(self: Pick<EquipmentPlan, 'id' | 'date' | 'endDate'>, all: EquipmentPlan[]): EquipmentPlan[] {
  const r = planRange(self)
  if (!r) return []
  return all.filter((p) => {
    if (p.id === self.id || p.status === 'returned') return false
    const pr = planRange(p)
    return !!pr && rangesOverlap(r, pr)
  })
}

export interface Usage { used: number; plans: { id: string; title: string; quantity: number }[] }

/**
 * จำนวนที่ถูกจองต่อ equipmentId ในช่วง range — ใช้ "วันที่จองมากที่สุด" ในช่วง
 * (แถวที่จองคนละวันไม่แย่งของกัน) · รายชื่อแผน = แผนที่จองของชิ้นนั้นทับช่วงนี้
 */
export function usageByEquipment(plans: EquipmentPlan[], range: PlanRange): Map<string, Usage> {
  const bookings = plans.flatMap(planBookings).filter((b) => b.start <= range.end && range.start <= b.end)
  const map = new Map<string, Usage>()
  const byEq = new Map<string, Booking[]>()
  for (const b of bookings) byEq.set(b.equipmentId, [...(byEq.get(b.equipmentId) ?? []), b])
  for (const [id, list] of byEq) {
    let peak = 0
    for (const day of daysIn(range)) peak = Math.max(peak, list.reduce((s, b) => s + (b.start <= day && day <= b.end ? b.quantity : 0), 0))
    const perPlan = new Map<string, { id: string; title: string; quantity: number }>()
    for (const b of list) {
      const cur = perPlan.get(b.planId) ?? { id: b.planId, title: b.title, quantity: 0 }
      cur.quantity += b.quantity
      perPlan.set(b.planId, cur)
    }
    map.set(id, { used: peak, plans: [...perPlan.values()] })
  }
  return map
}

export interface ItemConflict { item: PlanItem; equipment: Equipment; available: number; usage: Usage; need: number; day?: string }

/**
 * รายการในแผนนี้ที่เกินจำนวนที่ว่าง (เมื่อรวมกับแผนอื่นที่จองวันเดียวกัน) — เช็กทีละวัน
 * ของรุ่นเดียวกันอาจอยู่หลายแถว (เลนส์ตัวเดียวกันจับคู่คนละกล้อง/คนละวัน) → รวมจำนวนต่อวันต่อ equipmentId
 */
export function planConflicts(
  self: EquipmentPlan, all: EquipmentPlan[], equipmentById: Map<string, Equipment>,
): ItemConflict[] {
  const mine = planBookings(self)
  const others = overlappingPlans(self, all).flatMap(planBookings)
  const out: ItemConflict[] = []
  for (const id of new Set(mine.map((b) => b.equipmentId))) {
    const eq = equipmentById.get(id)
    if (!eq) continue
    const myList = mine.filter((b) => b.equipmentId === id)
    const otherList = others.filter((b) => b.equipmentId === id)
    if (otherList.length === 0) continue
    // วันที่แย่ที่สุด (ว่างน้อยสุดเทียบกับที่ต้องใช้)
    let worst: { day: string; need: number; used: number } | null = null
    const days = new Set(myList.flatMap((b) => daysIn({ start: b.start, end: b.end })))
    for (const day of [...days].sort()) {
      const need = myList.reduce((s, b) => s + (b.start <= day && day <= b.end ? b.quantity : 0), 0)
      const used = otherList.reduce((s, b) => s + (b.start <= day && day <= b.end ? b.quantity : 0), 0)
      if (need > eq.quantity - used && (!worst || need - (eq.quantity - used) > worst.need - (eq.quantity - worst.used))) worst = { day, need, used }
    }
    if (!worst) continue
    const w = worst
    const onDay = otherList.filter((b) => b.start <= w.day && w.day <= b.end)
    const perPlan = new Map<string, { id: string; title: string; quantity: number }>()
    for (const b of onDay) {
      const cur = perPlan.get(b.planId) ?? { id: b.planId, title: b.title, quantity: 0 }
      cur.quantity += b.quantity
      perPlan.set(b.planId, cur)
    }
    const item = self.items.find((i) => i.id === myList.find((b) => b.start <= w.day && w.day <= b.end)?.itemId)!
    out.push({ item, equipment: eq, available: Math.max(0, eq.quantity - w.used), usage: { used: w.used, plans: [...perPlan.values()] }, need: w.need, day: w.day })
  }
  return out
}

export interface RangeUsage {
  /** วันที่ใช้มากที่สุดในช่วง — แผนคนละวันในช่วงเดียวกันไม่แย่งของกัน จึงไม่รวมกันตรงๆ */
  peak: number
  peakDate: string
  plans: { id: string; title: string; quantity: number; start: string; end: string }[]
}

/**
 * ของที่ถูกจองต่อ equipmentId ในช่วงวันที่ (รวมหัวท้าย) — ใช้ทำหน้าสรุปของเหลือ
 * นับแผนที่ยังไม่เก็บกลับและมีวันที่เท่านั้น (หลักเดียวกับ overlappingPlans) · แถวที่จองไม่เต็มงานนับเฉพาะวันที่ใช้
 */
export function usageInRange(plans: EquipmentPlan[], range: PlanRange, maxDays = 92): { usage: Map<string, RangeUsage>; plans: EquipmentPlan[] } {
  const active = plans.filter((p) => {
    if (p.status === 'returned') return false
    const pr = planRange(p)
    return !!pr && rangesOverlap(range, pr)
  })
  const bookings = active.flatMap(planBookings).filter((b) => b.start <= range.end && range.start <= b.end)
  const usage = new Map<string, RangeUsage>()
  for (const day of daysIn(range, maxDays)) {
    const today = new Map<string, number>()
    for (const b of bookings) if (b.start <= day && day <= b.end) today.set(b.equipmentId, (today.get(b.equipmentId) ?? 0) + b.quantity)
    for (const [id, used] of today) {
      const cur = usage.get(id)
      if (!cur || used > cur.peak) usage.set(id, { peak: used, peakDate: day, plans: cur?.plans ?? [] })
    }
  }
  // รายชื่อแผนที่ใช้ของชิ้นนั้นในช่วง พร้อมช่วงวันที่แถวนั้นจองจริง (แผนเดียวกันหลายแถว = รวมจำนวน)
  const seen = new Map<string, RangeUsage['plans'][number]>()
  for (const b of bookings) {
    const key = `${b.equipmentId}|${b.planId}|${b.start}|${b.end}`
    const cur = seen.get(key)
    if (cur) { cur.quantity += b.quantity; continue }
    const row = { id: b.planId, title: b.title, quantity: b.quantity, start: b.start, end: b.end }
    seen.set(key, row)
    usage.get(b.equipmentId)?.plans.push(row)
  }
  return { usage, plans: active }
}
