import type { EquipmentPlan, LayoutObject, LayoutObjectKind, PlanItem, PlanLayout, VenueConfig } from '../types'
import { KIND_DEFAULTS, VENUE_PRESETS, cloneVenue, insideFootprint, isCameraKind, rackInRoom } from './venues'
import { newId } from './plans'

/**
 * โซนในผังวาง 3D — ผู้ช่วย AI เลือกโซน (ไม่วางพิกัดเอง) แล้วฝั่งเว็บแปลงเป็นตำแหน่งจริงตามขนาดสถานที่
 * ซ้าย/ขวา = มองจาก FOH ไปทางเวที (ฝั่งผู้ชม) · พิกัด: x ซ้าย(-)/ขวา(+), z ลึก เวทีอยู่ฝั่ง -z, (0,0) = กลางพื้นที่ราบ
 * ⚠️ รายการโซนต้องตรงกับ LAYOUT_ZONES ใน functions/src/equipment-agent/types.ts
 */
export type LayoutZone =
  | 'stage_front_left' | 'stage_front_center' | 'stage_front_right' | 'on_stage'
  | 'floor_left' | 'floor_right' | 'foh_center' | 'back_left' | 'back_right' | 'ob_area'

export const LAYOUT_ZONES: { value: LayoutZone; label: string }[] = [
  { value: 'stage_front_left', label: 'หน้าเวทีซ้าย' },
  { value: 'stage_front_center', label: 'หน้าเวทีกลาง (pit)' },
  { value: 'stage_front_right', label: 'หน้าเวทีขวา' },
  { value: 'on_stage', label: 'บนเวที' },
  { value: 'floor_left', label: 'กลางฮอลล์ฝั่งซ้าย' },
  { value: 'floor_right', label: 'กลางฮอลล์ฝั่งขวา' },
  { value: 'foh_center', label: 'กลางหลังสุด แถว FOH' },
  { value: 'back_left', label: 'หลังฮอลล์ซ้าย' },
  { value: 'back_right', label: 'หลังฮอลล์ขวา' },
  { value: 'ob_area', label: 'พื้นที่รถ OB (นอกฮอลล์ด้านหลัง)' },
]

export interface ZonePlacement {
  zone?: LayoutZone
  kind: LayoutObjectKind
  label: string
  itemId?: string
  note?: string
  /** สลับตำแหน่ง (x/z/y/หันหน้า) กับวัตถุนี้ — ใช้แทน zone (ผู้ช่วย AI: swap_positions) */
  swapWith?: { label: string; itemId?: string }
}

export const FOH_LABEL = 'FOH'
const SPACING = 2.5

const round1 = (v: number) => Math.round(v * 10) / 10
/** rotation ที่หันจาก (x,z) ไปหาเป้า — 0° = หัน -z (เวที), เพิ่ม = ตามเข็มเมื่อมองจากด้านบน (ดู buildObject) */
const aim = (x: number, z: number, tx: number, tz: number) => Math.round((Math.atan2(tx - x, -(tz - z)) * 180) / Math.PI)

function stageGeom(v: VenueConfig) {
  const s = v.stage
  const back = -v.depth / 2 + (s.enabled ? s.offset : 0)
  const front = s.enabled ? back + s.depth : -v.depth / 2 + 2
  const halfW = s.enabled ? s.width / 2 : v.width / 4
  return { front, center: s.enabled ? back + s.depth / 2 : front - 2, halfW, height: s.enabled ? s.height : 0 }
}

/** ตำแหน่ง FOH: กลาง ห่างผนังหลัง 3 ม. (หลังสุดของพื้นที่ราบ) */
export function fohPosition(v: VenueConfig): { x: number; z: number } {
  return { x: 0, z: round1(v.depth / 2 - 3) }
}

/** จุดเริ่ม + ทิศที่เรียงเมื่อมีหลายตัวในโซนเดียว */
function zoneAnchor(v: VenueConfig, zone: LayoutZone): { x: number; z: number; y: number; dx: number; dz: number; face?: number } {
  const st = stageGeom(v)
  const foh = fohPosition(v)
  const sideX = Math.min(v.width / 2 - 2, st.halfW + 1)
  switch (zone) {
    // หน้าเวที: ห่างขอบเวที 2 ม. เรียงเข้าหากลาง
    case 'stage_front_left': return { x: -sideX + 1, z: st.front + 2, y: 0, dx: SPACING, dz: 0 }
    case 'stage_front_right': return { x: sideX - 1, z: st.front + 2, y: 0, dx: -SPACING, dz: 0 }
    case 'stage_front_center': return { x: 0, z: st.front + 1.5, y: 0, dx: SPACING, dz: 0 }
    // บนเวที: ค่อนหลัง หันหาผู้ชม
    case 'on_stage': return { x: 0, z: st.center - 1, y: st.height, dx: SPACING, dz: 0, face: 180 }
    case 'floor_left': return { x: -(v.width / 2 - 2), z: round1((st.front + foh.z) / 2), y: 0, dx: 0, dz: SPACING }
    case 'floor_right': return { x: v.width / 2 - 2, z: round1((st.front + foh.z) / 2), y: 0, dx: 0, dz: SPACING }
    // กลางหลัง แถว FOH: หลังโต๊ะ FOH 2.2 ม. เรียงออกข้างทั้งสองฝั่ง (กล้อง tele อยู่หลังสุดมองข้ามหัวคน)
    case 'foh_center': return { x: 0, z: round1(Math.min(foh.z + 2.2, v.depth / 2 - 0.6)), y: 0, dx: SPACING, dz: 0 }
    case 'back_left': return { x: -(v.width / 2 - 3), z: round1(v.depth / 2 - 2), y: 0, dx: SPACING, dz: 0 }
    case 'back_right': return { x: v.width / 2 - 3, z: round1(v.depth / 2 - 2), y: 0, dx: -SPACING, dz: 0 }
    case 'ob_area': return { x: 0, z: round1(v.depth / 2 + 10), y: 0, dx: 4, dz: 0, face: 0 }
  }
}

/** เรียงหลายตัวในโซน — โซนกลาง (foh_center/pit/บนเวที) กระจายสลับซ้าย-ขวารอบจุดกลาง */
function offsetFor(zone: LayoutZone, i: number): number {
  const centered = zone === 'foh_center' || zone === 'stage_front_center' || zone === 'on_stage'
  if (!centered) return i
  // 0, +1, -1, +2, -2 … แต่ foh_center มีโต๊ะ FOH อยู่กลาง → เริ่มที่ ±1
  const k = zone === 'foh_center' ? Math.floor(i / 2) + 1 : Math.ceil(i / 2)
  return (i % 2 === (zone === 'foh_center' ? 0 : 1) ? -1 : 1) * k
}

/** วาง/ย้ายวัตถุตามโซน — วัตถุเดิมที่ planItemId + label ตรงกันถูกย้าย ไม่สร้างซ้ำ */
export function applyZonePlacements(layout: PlanLayout, placements: ZonePlacement[]): PlanLayout {
  const v = layout.venue
  const st = stageGeom(v)
  const counts = new Map<LayoutZone, number>()
  let objects = [...layout.objects]
  // หาวัตถุเดิม: ผูก item เดียวกันก่อน (ชื่อ/ชนิดในผังอาจไม่ตรงกับที่ผู้ช่วยส่งมา เช่น gimbal vs camera) แล้วค่อยเทียบชื่อ
  const find = (ref: { label: string; itemId?: string }) =>
    (ref.itemId ? objects.find((o) => o.planItemId === ref.itemId) : undefined) ?? objects.find((o) => o.label === ref.label)
  for (const p of placements) {
    if (p.swapWith) {
      const a = find(p)
      const b = find(p.swapWith)
      if (!a || !b || a.id === b.id) continue
      const pa = { x: a.x, z: a.z, y: a.y, rotation: a.rotation }
      const pb = { x: b.x, z: b.z, y: b.y, rotation: b.rotation }
      objects = objects.map((o) => (o.id === a.id ? { ...o, ...pb } : o.id === b.id ? { ...o, ...pa } : o))
      continue
    }
    if (!p.zone) continue
    const zone = p.zone
    const a = zoneAnchor(v, zone)
    const existing = find(p)
    // ช่องถัดไปในโซนที่ยังว่าง — ของเดิมที่อยู่ในโซนนั้นแล้ว (เช่น ย้ายกล้องเข้าโซนที่มีตัวอื่น) ต้องไม่ทับกัน
    let i = counts.get(zone) ?? 0
    let x = 0
    let z = 0
    for (;; i++) {
      const k = offsetFor(zone, i)
      x = round1(a.x + a.dx * k)
      z = round1(a.z + a.dz * k)
      if (i > 40 || !objects.some((o) => o.id !== existing?.id && Math.hypot(o.x - x, o.z - z) < 1.5)) break
    }
    counts.set(zone, i + 1)
    const kind = existing?.kind ?? p.kind // ย้ายของเดิม = คงชนิดเดิม (โรนินยังเป็นโรนิน)
    const rotation = a.face ?? (isCameraKind(kind) ? aim(x, z, 0, st.center) : 0)
    const pos = { x, z, y: a.y, rotation }
    if (existing) {
      objects = objects.map((o) => (o.id === existing.id ? { ...o, ...pos, ...(p.note ? { note: p.note } : {}) } : o))
    } else {
      objects.push({
        id: newId(), kind: p.kind, label: p.label, ...pos, ...KIND_DEFAULTS[p.kind],
        ...(p.itemId ? { planItemId: p.itemId } : {}), ...(p.note ? { note: p.note } : {}),
      })
    }
  }
  return ensureRoomRacks({ ...layout, objects })
}

/** ห้องคอนโทรลทุกห้องต้องมีตู้ Rack ข้างใน (จุดโยงสาย) — ไม่มี = ใส่ให้ · ไม่มีอะไรเปลี่ยน = คืนตัวเดิม (เทียบ === ได้) */
export function ensureRoomRacks(layout: PlanLayout): PlanLayout {
  const objects = [...layout.objects]
  for (const room of layout.objects.filter((o) => o.kind === 'control_room')) {
    if (objects.some((o) => o.kind === 'rack' && insideFootprint(room, o.x, o.z))) continue
    objects.push(rackInRoom(room, newId(), `RACK ${objects.filter((o) => o.kind === 'rack').length + 1}`))
  }
  return objects.length === layout.objects.length ? layout : { ...layout, objects }
}

/** มี FOH ในผังหรือยัง — ถ้าไม่มี วางโต๊ะ FOH กลางหลังสุด (ทุกงานมี FOH) */
export function ensureFoh(layout: PlanLayout): PlanLayout {
  if (layout.objects.some((o) => o.kind === 'desk' && /foh/i.test(o.label))) return layout
  const p = fohPosition(layout.venue)
  const desk: LayoutObject = { id: newId(), kind: 'desk', label: FOH_LABEL, x: p.x, z: p.z, y: 0, rotation: 0, ...KIND_DEFAULTS.desk }
  return { ...layout, objects: [...layout.objects, desk] }
}

/** สถานที่ตั้งต้นจากชื่อสถานที่ของแผน (จับคำหลักกับชื่อ preset) — ไม่เจอ = preset แรก */
export function venueForLocation(location?: string): VenueConfig {
  const loc = (location ?? '').toLowerCase()
  const hit = loc && VENUE_PRESETS.find((p) => p.name.toLowerCase().split(/[\s()]+/).filter((w) => w.length >= 4).some((w) => loc.includes(w)))
  return cloneVenue(hit || VENUE_PRESETS[0])
}

/** ผังวางใหม่ — มีโต๊ะ FOH มาให้เสมอ */
export function newLayout(plan: Pick<EquipmentPlan, 'location'>, name: string): PlanLayout {
  return ensureFoh({ id: newId(), name, venue: venueForLocation(plan.location), objects: [] })
}

/** ผังวางหลังผู้ช่วย AI วาง — ใช้ผังแรก (ไม่มี = สร้างใหม่) · วัตถุที่อ้างแถวที่ถูกเอาออกจากแผนถูกลบตาม */
export function applyAgentLayout(
  base: PlanLayout[], placements: ZonePlacement[], plan: Pick<EquipmentPlan, 'location'>, items: PlanItem[],
): PlanLayout[] {
  if (placements.length === 0) return base
  const ids = new Set(items.map((i) => i.id))
  const prune = (l: PlanLayout): PlanLayout => ({ ...l, objects: l.objects.filter((o) => !o.planItemId || ids.has(o.planItemId)) })
  const [first, ...rest] = base.length ? base.map(prune) : [newLayout(plan, 'ผังวาง 1')]
  return [ensureFoh(applyZonePlacements(first, placements)), ...rest]
}

/** โซนที่ใกล้ตำแหน่งนี้ที่สุด — บอกผู้ช่วย AI ว่าของแต่ละชิ้นอยู่แถวไหน (ใช้ตัดสินใจย้าย/สลับ) */
function nearestZone(v: VenueConfig, x: number, z: number): LayoutZone {
  let best: LayoutZone = LAYOUT_ZONES[0].value
  let dist = Infinity
  for (const { value } of LAYOUT_ZONES) {
    const a = zoneAnchor(v, value)
    const d = Math.hypot(a.x - x, a.z - z)
    if (d < dist) { dist = d; best = value }
  }
  return best
}

/** สรุปผังวางให้ผู้ช่วย AI อ่าน — กันวางซ้ำ + บอกว่าแต่ละชิ้นอยู่โซนไหน */
export function layoutAgentText(layouts: PlanLayout[] | undefined): string {
  const l = layouts?.[0]
  if (!l) return ''
  return `${l.name} (${l.venue.name}): ` + l.objects
    .map((o) => `${o.label} (${o.kind} @ ${nearestZone(l.venue, o.x, o.z)})${o.planItemId ? ` [item ${o.planItemId}]` : ''}`).join(', ')
}
