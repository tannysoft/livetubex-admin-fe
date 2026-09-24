import { EQUIPMENT_CATEGORIES } from './constants'
import type { PlanItem } from '../types'

/**
 * จัดกลุ่มรายการของแผน (ตามหมวด / ตามปลายทาง) + เลนส์ต่อใต้กล้อง
 * ใช้ร่วมหน้าพิมพ์และหน้าแชร์ทีมงาน — generic เพราะหน้าแชร์ได้ item แบบตัด field การเงินออก
 */
export type GroupBy = 'category' | 'destination'

type GroupableItem = Pick<PlanItem, 'id' | 'attachedTo' | 'category' | 'toLocation' | 'note'>

/**
 * เบอร์กล้องของแถวกล้อง เช่น "CAM 1" — อ่านจากหมายเหตุ (CAM 1 / CAM1 / Cam-1) แล้วค่อยปลายทาง ("จุดกล้อง 1")
 * ไม่ใช่กล้อง/หาไม่เจอ = '' · ใช้โชว์ป้ายหน้าชื่อ + เรียงกล้องตามเบอร์
 */
export function camTag(it: Pick<PlanItem, 'category' | 'note' | 'toLocation' | 'attachedTo'>): string {
  // แถวที่ติดกล้องอยู่ (เลนส์ที่ลงหมวดกล้องไว้ ฯลฯ) ไม่ใช่ตัวกล้อง — ไม่ติดป้ายซ้ำกับแถวแม่
  if (it.category !== 'camera' || it.attachedTo) return ''
  const m = it.note?.match(/\bcam\s*-?\s*(\d+)/i) ?? it.toLocation?.match(/(?:จุดกล้อง|\bcam)\s*-?\s*(\d+)/i)
  return m ? `CAM ${Number(m[1])}` : ''
}

/** เรียงกล้องตามเบอร์ (ที่ไม่มีเบอร์ต่อท้ายตามลำดับเดิม) — แถวหมวดอื่นคงลำดับเดิม */
export function sortByCam<T extends Pick<PlanItem, 'category' | 'note' | 'toLocation' | 'attachedTo'>>(rows: T[]): T[] {
  const num = (r: T) => { const t = camTag(r); return t ? Number(t.slice(4)) : Infinity }
  if (!rows.some((r) => camTag(r))) return rows
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

export function groupItems<T extends GroupableItem>(items: T[], by: GroupBy): { title: string; rows: GroupRow<T>[] }[] {
  if (by === 'category') {
    // เลนส์ที่ติดกล้องอยู่ ไปอยู่กลุ่มกล้อง (ใต้ตัวกล้อง) ไม่ใช่กลุ่มเลนส์
    const ids = new Set(items.map((i) => i.id))
    const parentOf = (i: T) => (i.attachedTo && ids.has(i.attachedTo) ? items.find((p) => p.id === i.attachedTo) : undefined)
    const groupCat = (i: T) => parentOf(i)?.category ?? i.category
    return EQUIPMENT_CATEGORIES
      .map((c) => ({ title: c.label, rows: withChildren(sortByCam(items.filter((i) => groupCat(i) === c.value)), items) }))
      .filter((g) => g.rows.length > 0)
  }
  const keys = [...new Set(items.map((i) => i.toLocation?.trim() || ''))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'th')))
  return keys.map((k) => ({ title: k || 'ยังไม่ระบุปลายทาง', rows: withChildren(sortByCam(items.filter((i) => (i.toLocation?.trim() || '') === k)), items) }))
}

