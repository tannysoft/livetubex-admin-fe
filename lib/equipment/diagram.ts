import type { DiagramEdge, DiagramNode, DiagramPortRef, PlanDiagram, PortSide } from '../types'

// เรขาคณิตของผังโยง — ใช้ร่วมกันทั้งตัวแก้ไขและหน้า print เพื่อให้ผังที่พิมพ์ตรงกับที่วาด

export const NODE_W = 190
export const NODE_HEADER_H = 40
export const PORT_ROW_H = 22
export const NODE_PAD_BOTTOM = 8
export const GRID = 10

/** ชื่อ port ตามด้าน — io อยู่ฝั่งขวาต่อท้าย outputs */
export function portsOf(n: Pick<DiagramNode, 'inputs' | 'outputs' | 'ios'>, side: PortSide): string[] {
  return side === 'in' ? n.inputs : side === 'out' ? n.outputs : n.ios ?? []
}

/** แถวที่ port อยู่ (ฝั่งขวานับ outputs ก่อนแล้วต่อด้วย ios) */
export function portRow(n: Pick<DiagramNode, 'outputs'>, side: PortSide, index: number): number {
  return side === 'io' ? n.outputs.length + index : index
}

/** ทิศที่เส้นควรออกจาก port: in = ซ้าย, out/io = ขวา */
export function exitSide(side: PortSide): 'in' | 'out' {
  return side === 'in' ? 'in' : 'out'
}

// ── หมายเหตุในกล่อง (อยู่ใต้ port — ไม่กระทบตำแหน่ง port/เส้น) ──
export const NOTE_LINE_H = 13
export const NOTE_PAD = 6
export const NOTE_MAX_LINES = 4
/** ความกว้างที่ใส่ตัวอักษรได้ต่อบรรทัด (font 9.5px ≈ 5.4px/ตัว, เว้นขอบซ้ายขวา) */
const NOTE_CHARS_PER_LINE = 30

// สระบน/ล่าง วรรณยุกต์ไทย ไม่กินความกว้าง
const THAI_MARK = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g
const visualLength = (s: string) => s.replace(THAI_MARK, '').length

/** ตัดเป็นคำ — ภาษาไทยไม่มีเว้นวรรค ใช้ Intl.Segmenter ถ้ามี ไม่งั้นตัดทีละตัว */
function words(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: 'word' }) => { segment(t: string): Iterable<{ segment: string }> } }).Segmenter
  if (Seg) return [...new Seg('th', { granularity: 'word' }).segment(text)].map((x) => x.segment)
  return [...text]
}

/**
 * แบ่งหมายเหตุเป็นบรรทัดให้พอดีกล่อง — ขึ้นบรรทัดใหม่ตาม \n ที่ผู้ใช้พิมพ์ด้วย
 * เกิน NOTE_MAX_LINES → ตัดแล้วต่อ … (ฉบับเต็มดูได้ใน side panel และหน้า print)
 */
export function wrapNote(note: string | undefined, maxLines = NOTE_MAX_LINES): string[] {
  const text = (note ?? '').trim()
  if (!text) return []
  const lines: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const w of words(para)) {
      if (visualLength(line + w) > NOTE_CHARS_PER_LINE && line) {
        lines.push(line.trimEnd())
        line = w.trimStart()
      } else {
        line += w
      }
      // คำเดียวยาวเกินบรรทัด (URL, รหัสยาว) → หั่นกลางคำ
      while (visualLength(line) > NOTE_CHARS_PER_LINE) {
        lines.push(line.slice(0, NOTE_CHARS_PER_LINE))
        line = line.slice(NOTE_CHARS_PER_LINE)
      }
    }
    lines.push(line.trimEnd())
  }
  if (lines.length <= maxLines) return lines
  const cut = lines.slice(0, maxLines)
  cut[maxLines - 1] = cut[maxLines - 1].slice(0, NOTE_CHARS_PER_LINE - 1) + '…'
  return cut
}

export function noteHeight(n: Pick<DiagramNode, 'note'>): number {
  const lines = wrapNote(n.note).length
  return lines ? NOTE_PAD * 2 + lines * NOTE_LINE_H : 0
}

/** ความสูงส่วน port (หัวกล่อง + แถว port) — หมายเหตุวางต่อจากตรงนี้ */
export function portsBottom(n: Pick<DiagramNode, 'inputs' | 'outputs' | 'ios'>): number {
  const rows = Math.max(n.inputs.length, n.outputs.length + (n.ios?.length ?? 0), 1)
  return NODE_HEADER_H + rows * PORT_ROW_H
}

export function nodeHeight(n: Pick<DiagramNode, 'inputs' | 'outputs' | 'ios' | 'note'>): number {
  return portsBottom(n) + NODE_PAD_BOTTOM + noteHeight(n)
}

export function portPosition(n: DiagramNode, side: PortSide, index: number): { x: number; y: number } {
  return {
    x: side === 'in' ? n.x : n.x + NODE_W,
    y: n.y + NODE_HEADER_H + portRow(n, side, index) * PORT_ROW_H + PORT_ROW_H / 2,
  }
}

export function snap(v: number): number {
  return Math.round(v / GRID) * GRID
}

/** เส้นโค้งออกจาก port ตามทิศของด้าน (in = ออกทางซ้าย, out = ออกทางขวา) */
export function edgePath(
  a: { x: number; y: number }, aSide: 'in' | 'out',
  b: { x: number; y: number }, bSide: 'in' | 'out',
): string {
  const reach = Math.max(40, Math.min(160, Math.abs(b.x - a.x) / 2))
  const c1x = a.x + (aSide === 'out' ? reach : -reach)
  const c2x = b.x + (bSide === 'out' ? reach : -reach)
  return `M ${a.x} ${a.y} C ${c1x} ${a.y}, ${c2x} ${b.y}, ${b.x} ${b.y}`
}

/** จุดกึ่งกลางของ cubic bezier ด้านบน (t = 0.5) — ไว้วางป้ายชื่อสาย */
export function edgeMidpoint(
  a: { x: number; y: number }, aSide: 'in' | 'out',
  b: { x: number; y: number }, bSide: 'in' | 'out',
): { x: number; y: number } {
  const reach = Math.max(40, Math.min(160, Math.abs(b.x - a.x) / 2))
  const c1x = a.x + (aSide === 'out' ? reach : -reach)
  const c2x = b.x + (bSide === 'out' ? reach : -reach)
  return {
    x: (a.x + 3 * c1x + 3 * c2x + b.x) / 8,
    y: (a.y + b.y) / 2,
  }
}

export function samePort(a: DiagramPortRef, b: DiagramPortRef): boolean {
  return a.nodeId === b.nodeId && a.side === b.side && a.index === b.index
}

/** ปลายเส้นที่ชี้ไป node/port ที่ไม่มีแล้ว (ลบ node หรือลด port) ต้องถูกทิ้ง */
export function isEdgeValid(e: DiagramEdge, nodes: DiagramNode[]): boolean {
  return [e.from, e.to].every((ref) => {
    const n = nodes.find((x) => x.id === ref.nodeId)
    if (!n) return false
    return ref.index < portsOf(n, ref.side).length
  })
}

export function portName(nodes: DiagramNode[], ref: DiagramPortRef): string {
  const n = nodes.find((x) => x.id === ref.nodeId)
  if (!n) return '?'
  return portsOf(n, ref.side)[ref.index] ?? '?'
}

export function diagramBounds(d: Pick<PlanDiagram, 'nodes'>, pad = 40) {
  if (d.nodes.length === 0) return { x: 0, y: 0, w: 800, h: 450 }
  const xs = d.nodes.map((n) => n.x)
  const ys = d.nodes.map((n) => n.y)
  const x2 = d.nodes.map((n) => n.x + NODE_W)
  const y2 = d.nodes.map((n) => n.y + nodeHeight(n))
  const x = Math.min(...xs) - pad
  const y = Math.min(...ys) - pad
  return { x, y, w: Math.max(...x2) + pad - x, h: Math.max(...y2) + pad - y }
}

// ── จัดตำแหน่งกล่องอัตโนมัติ (ใช้กับผังที่ผู้ช่วย AI ร่าง — AI บอกแค่ว่าอะไรต่อกับอะไร) ──

const COL_GAP = 150
const ROW_GAP = 30
/** คอลัมน์ตั้งต้นของกล่องที่ยังไม่มีเส้น — เรียงตามทางสัญญาณปกติ ซ้าย → ขวา */
const CATEGORY_COLUMN: Partial<Record<DiagramNode['category'], number>> = {
  camera: 0, audio: 0, lens: 0, support: 0,
  converter: 1, wireless: 1, intercom: 1,
  switcher: 2, network: 2,
  recorder: 3, monitor: 3,
}
const CATEGORY_ORDER: DiagramNode['category'][] = [
  'camera', 'audio', 'wireless', 'converter', 'intercom', 'switcher', 'network', 'recorder', 'monitor', 'other',
]

/**
 * วางกล่องเป็นคอลัมน์ตามทางสัญญาณ: คอลัมน์ = ความลึกของ path ที่ยาวที่สุดจากต้นทาง
 * (กล้อง → converter → สวิตเชอร์ → เครื่องบันทึก/จอ) ในคอลัมน์เรียงตามหมวดแล้วตามชื่อ ("CAM 2" ก่อน "CAM 10")
 * onlyIds = วางเฉพาะกล่องใหม่ ต่อท้ายใต้กล่องเดิม (กล่องที่ผู้ใช้จัดไว้แล้วไม่ขยับ)
 */
export function autoLayoutDiagram(d: PlanDiagram, onlyIds?: Set<string>): PlanDiagram {
  const target = d.nodes.filter((n) => !onlyIds || onlyIds.has(n.id))
  if (target.length === 0) return d
  const ids = new Set(target.map((n) => n.id))
  const edges = d.edges.filter((e) => ids.has(e.from.nodeId) && ids.has(e.to.nodeId) && e.from.nodeId !== e.to.nodeId)

  // longest path แบบ relax ซ้ำ จำกัดรอบ = จำนวนกล่อง (กันวนไม่จบถ้ามี cycle จาก port io)
  const depth = new Map(target.map((n) => [n.id, 0]))
  for (let i = 0; i < target.length; i++) {
    let changed = false
    for (const e of edges) {
      const next = (depth.get(e.from.nodeId) ?? 0) + 1
      if (next > (depth.get(e.to.nodeId) ?? 0) && next <= target.length) { depth.set(e.to.nodeId, next); changed = true }
    }
    if (!changed) break
  }
  const connected = new Set(edges.flatMap((e) => [e.from.nodeId, e.to.nodeId]))
  const colOf = (n: DiagramNode) => (connected.has(n.id) ? depth.get(n.id) ?? 0 : CATEGORY_COLUMN[n.category] ?? 3)

  const byCol = new Map<number, DiagramNode[]>()
  for (const n of target) byCol.set(colOf(n), [...(byCol.get(colOf(n)) ?? []), n])
  const rank = (c: DiagramNode['category']) => { const i = CATEGORY_ORDER.indexOf(c); return i < 0 ? CATEGORY_ORDER.length : i }

  const fixed = d.nodes.filter((n) => !ids.has(n.id))
  const originX = fixed.length ? Math.min(...fixed.map((n) => n.x)) : 0
  const originY = fixed.length ? Math.max(...fixed.map((n) => n.y + nodeHeight(n))) + 80 : 0

  const pos = new Map<string, { x: number; y: number }>()
  const byLabel = (a: DiagramNode, b: DiagramNode) => rank(a.category) - rank(b.category) || a.label.localeCompare(b.label, 'th', { numeric: true })
  for (const col of [...byCol.keys()].sort((a, b) => a - b)) {
    // ลดเส้นตัดกัน: กล่องที่มีต้นทางวางแล้ว เรียงตามค่าเฉลี่ย y ของต้นทาง (barycenter)
    // กล่องไม่มีเส้นไปอยู่ล่างสุดของคอลัมน์ ไม่ให้เส้นผ่านหลังกล่อง
    const center = (n: DiagramNode) => {
      const ys = edges.filter((e) => e.to.nodeId === n.id && pos.has(e.from.nodeId)).map((e) => pos.get(e.from.nodeId)!.y)
      return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null
    }
    const list = byCol.get(col)!.sort((a, b) => {
      const ia = connected.has(a.id) ? 0 : 1
      const ib = connected.has(b.id) ? 0 : 1
      if (ia !== ib) return ia - ib
      const ca = center(a)
      const cb = center(b)
      if (ca != null && cb != null && ca !== cb) return ca - cb
      return byLabel(a, b)
    })
    let y = originY
    for (const n of list) {
      // ขยับลงมาให้ตรงกับต้นทางถ้ายังมีที่ว่าง → เส้นสั้นและตรง (ไม่ขยับขึ้น กันทับกล่องก่อนหน้า)
      const c = center(n)
      if (c != null) y = Math.max(y, c)
      pos.set(n.id, { x: snap(originX + col * (NODE_W + COL_GAP)), y: snap(y) })
      y += nodeHeight(n) + ROW_GAP
    }
  }
  return { ...d, nodes: d.nodes.map((n) => (pos.has(n.id) ? { ...n, ...pos.get(n.id)! } : n)) }
}
