import { EQUIPMENT_CATEGORIES } from './constants'
import type { PlanItem } from '../types'

/**
 * จัดกลุ่มรายการของแผน (ตามหมวด / ตามปลายทาง) + เลนส์ต่อใต้กล้อง
 * ใช้ร่วมหน้าพิมพ์และหน้าแชร์ทีมงาน — generic เพราะหน้าแชร์ได้ item แบบตัด field การเงินออก
 */
export type GroupBy = 'category' | 'destination'

type GroupableItem = Pick<PlanItem, 'id' | 'attachedTo' | 'category' | 'toLocation' | 'note'>

type CamItem = Pick<PlanItem, 'id' | 'category' | 'note' | 'toLocation' | 'attachedTo'>
/** planItemId → "CAM n" ที่อ่านจากป้ายกล่องในผังโยง / วัตถุในผังวาง 3D */
export type CamLabels = Map<string, string>

const camOf = (text: string | undefined) => {
  const m = text?.match(/\bcam\s*-?\s*(\d+)/i)
  return m ? `CAM ${Number(m[1])}` : ''
}

/**
 * เบอร์กล้องต่อแถว — อ่านจากป้ายในผังโยง ("CAM 1") ก่อน แล้วผังวาง 3D
 * ไม่ต้องเขียนเบอร์กล้องซ้ำในหมายเหตุของรายการ
 */
export function camLabels(plan: { diagrams?: { nodes: { planItemId?: string; label: string }[] }[]; layouts?: { objects: { planItemId?: string; label: string }[] }[] }): CamLabels {
  const map: CamLabels = new Map()
  const add = (id: string | undefined, label: string) => { const t = camOf(label); if (id && t && !map.has(id)) map.set(id, t) }
  for (const d of plan.diagrams ?? []) for (const n of d.nodes) add(n.planItemId, n.label)
  for (const l of plan.layouts ?? []) for (const o of l.objects) add(o.planItemId, o.label)
  return map
}

/**
 * เบอร์กล้องของแถวกล้อง เช่น "CAM 1" — ผังโยง/ผัง 3D (labels) → หมายเหตุ (ข้อมูลเก่า) → ปลายทาง ("จุดกล้อง 1")
 * ไม่ใช่กล้อง/หาไม่เจอ = '' · ใช้โชว์ป้ายหน้าชื่อ + เรียงกล้องตามเบอร์
 */
export function camTag(it: CamItem, labels?: CamLabels): string {
  // แถวที่ติดกล้องอยู่ (เลนส์ที่ลงหมวดกล้องไว้ ฯลฯ) ไม่ใช่ตัวกล้อง — ไม่ติดป้ายซ้ำกับแถวแม่
  if (it.category !== 'camera' || it.attachedTo) return ''
  const fromLoc = it.toLocation?.match(/(?:จุดกล้อง|\bcam)\s*-?\s*(\d+)/i)
  return labels?.get(it.id) || camOf(it.note) || (fromLoc ? `CAM ${Number(fromLoc[1])}` : '')
}

/** หมายเหตุที่มีแค่เบอร์กล้อง ("CAM1", "CAM 1") — ป้ายบอกอยู่แล้ว ไม่ต้องโชว์ */
export function isCamOnlyNote(note: string | undefined): boolean {
  return /^\s*cam\s*-?\s*\d+\s*$/i.test(note ?? '')
}

/** เรียงกล้องตามเบอร์ (ที่ไม่มีเบอร์ต่อท้ายตามลำดับเดิม) — แถวหมวดอื่นคงลำดับเดิม */
export function sortByCam<T extends CamItem>(rows: T[], labels?: CamLabels): T[] {
  const num = (r: T) => { const t = camTag(r, labels); return t ? Number(t.slice(4)) : Infinity }
  if (!rows.some((r) => camTag(r, labels))) return rows
  return rows.map((r, i) => ({ r, i })).sort((a, b) => {
    const cam = (x: T) => x.category === 'camera'
    if (cam(a.r) && cam(b.r)) return num(a.r) - num(b.r) || a.i - b.i
    return a.i - b.i
  }).map((x) => x.r)
}

export interface GroupRow<T> { item: T; child: boolean }

/** เรียงแถวในกลุ่ม: ของที่ติดกล้อง (เลนส์) ต่อใต้กล้องของมัน ถ้ากล้องอยู่กลุ่มเดียวกัน */
function withChildren<T extends GroupableItem>(rows: T[], all: T[]): GroupRow<T>[] {
  const ids = new Set(all.map((i) => i.id))
  const inGroup = new Set(rows.map((r) => r.id))
  const nested = (i: T) => !!i.attachedTo && ids.has(i.attachedTo) && inGroup.has(i.attachedTo)
  return rows.filter((r) => !nested(r)).flatMap((r) => [
    { item: r, child: false },
    ...rows.filter((c) => c.attachedTo === r.id && nested(c)).map((c) => ({ item: c, child: true })),
  ])
}

export function groupItems<T extends GroupableItem>(items: T[], by: GroupBy, labels?: CamLabels): { title: string; rows: GroupRow<T>[] }[] {
  if (by === 'category') {
    // เลนส์ที่ติดกล้องอยู่ ไปอยู่กลุ่มกล้อง (ใต้ตัวกล้อง) ไม่ใช่กลุ่มเลนส์
    const ids = new Set(items.map((i) => i.id))
    const parentOf = (i: T) => (i.attachedTo && ids.has(i.attachedTo) ? items.find((p) => p.id === i.attachedTo) : undefined)
    const groupCat = (i: T) => parentOf(i)?.category ?? i.category
    return EQUIPMENT_CATEGORIES
      .map((c) => ({ title: c.label, rows: withChildren(sortByCam(items.filter((i) => groupCat(i) === c.value), labels), items) }))
      .filter((g) => g.rows.length > 0)
  }
  // จุดที่มีกล้องเรียงตามเบอร์กล้อง (CAM 1, 2, … 10) · ที่เหลือเรียงชื่อแบบตัวเลขธรรมชาติ ("จุด 2" ก่อน "จุด 10") · ไม่ระบุไว้ท้าย
  const camNum = (k: string) => Math.min(...items
    .filter((i) => (i.toLocation?.trim() || '') === k)
    .map((i) => { const t = camTag(i, labels); return t ? Number(t.slice(4)) : Infinity }))
  const keys = [...new Set(items.map((i) => i.toLocation?.trim() || ''))].sort((a, b) => {
    if (a === '' || b === '') return a === '' ? (b === '' ? 0 : 1) : -1
    const ca = camNum(a), cb = camNum(b)
    if (ca !== cb) return ca - cb
    return a.localeCompare(b, 'th', { numeric: true })
  })
  return keys.map((k) => ({ title: k || 'ยังไม่ระบุปลายทาง', rows: withChildren(sortByCam(items.filter((i) => (i.toLocation?.trim() || '') === k), labels), items) }))
}

