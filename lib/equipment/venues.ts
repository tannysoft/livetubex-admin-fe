import type { LayoutObject, LayoutObjectKind, VenueConfig } from '../types'

/**
 * Preset สถานที่ — ⚠️ ตัวเลขเป็น "ขนาดโดยประมาณ" ไว้ตั้งต้นวางแผน ไม่ได้มาจากแบบก่อสร้าง
 * ผู้ใช้แก้ได้ทุกค่า และควรปูรูป floor plan จริงของสถานที่ (floorImage) เพื่อเช็กสเกล
 * ห้ามนำไปอ้างเป็นขนาดจริงในเอกสารที่ส่งลูกค้าโดยไม่ตรวจ
 */
export const VENUE_PRESETS: (VenueConfig & { presetId: string })[] = [
  {
    presetId: 'impact-arena', name: 'Impact Arena เมืองทองธานี', shape: 'arena',
    width: 46, depth: 76, height: 24,
    stage: { enabled: true, width: 30, depth: 16, height: 1.8, offset: 2 },
    // ทางเดินขึ้นทุก ~10 ม. + ทางเดินขวางคั่นชั้นล่าง/บน — ตัวเลขประมาณจากภาพถ่าย ไม่ใช่แบบจริง
    tiers: { steps: 14, rise: 0.9, run: 1.7, back: true, sides: true, aisleWidth: 1.4, sectionWidth: 10, crossAisle: 8 },
  },
  {
    presetId: 'impact-challenger', name: 'Impact Challenger Hall (1 ฮอลล์)', shape: 'hall',
    width: 100, depth: 200, height: 18,
    stage: { enabled: true, width: 40, depth: 20, height: 1.8, offset: 5 },
  },
  {
    presetId: 'impact-exhibition', name: 'Impact Exhibition Hall (1 ฮอลล์)', shape: 'hall',
    width: 60, depth: 90, height: 10,
    stage: { enabled: true, width: 24, depth: 12, height: 1.5, offset: 3 },
  },
  {
    presetId: 'thunder-dome', name: 'Thunder Dome เมืองทองธานี', shape: 'arena',
    width: 36, depth: 50, height: 16,
    stage: { enabled: true, width: 22, depth: 12, height: 1.6, offset: 2 },
    tiers: { steps: 9, rise: 0.8, run: 1.6, back: true, sides: true },
  },
  {
    presetId: 'bitec-hall', name: 'BITEC บางนา (1 ฮอลล์)', shape: 'hall',
    width: 70, depth: 100, height: 12,
    stage: { enabled: true, width: 30, depth: 14, height: 1.6, offset: 3 },
  },
  {
    presetId: 'qsncc-hall', name: 'ศูนย์ฯ สิริกิติ์ (Exhibition Hall)', shape: 'hall',
    width: 70, depth: 110, height: 12,
    stage: { enabled: true, width: 30, depth: 14, height: 1.6, offset: 3 },
  },
  {
    presetId: 'paragon-hall', name: 'Royal Paragon Hall', shape: 'hall',
    width: 50, depth: 80, height: 9,
    stage: { enabled: true, width: 24, depth: 12, height: 1.5, offset: 2 },
  },
  {
    presetId: 'uob-live', name: 'UOB Live (EmSphere)', shape: 'arena',
    width: 34, depth: 48, height: 18,
    stage: { enabled: true, width: 22, depth: 12, height: 1.6, offset: 2 },
    tiers: { steps: 8, rise: 0.8, run: 1.6, back: true, sides: true },
  },
  {
    presetId: 'huamark-indoor', name: 'อินดอร์ สเตเดียม หัวหมาก', shape: 'arena',
    // รูปทรงอ้างจากภาพถ่ายภายใน: ชามวงรี ที่นั่งล้อมครบทุกด้าน สนามอยู่กลาง (ไม่มีเวทีประจำ)
    // ตัวเลขยังเป็นค่าประมาณ — ภาพถ่ายบอกรูปทรงได้ แต่บอกขนาดจริงไม่ได้
    width: 44, depth: 64, height: 22,
    stage: { enabled: false, width: 24, depth: 14, height: 1.8, offset: 4 },
    tiers: { steps: 18, rise: 0.8, run: 1.5, back: true, sides: true, front: true, curved: true },
  },
  {
    presetId: 'rajamangala', name: 'ราชมังคลากีฬาสถาน (กลางแจ้ง)', shape: 'arena',
    // สนามฟุตบอล 105×68 + ลู่วิ่ง 400 ม. → พื้นราบในวงรีราว 180×95 ม. อัฒจันทร์ล้อมรอบ ไม่มีหลังคา
    // ตัวเลขประมาณจากมาตรฐานลู่วิ่ง/สนาม ไม่ใช่แบบก่อสร้าง
    width: 95, depth: 180, height: 24,
    stage: { enabled: false, width: 60, depth: 24, height: 2, offset: 6 },
    tiers: { steps: 30, rise: 0.8, run: 1.4, back: true, sides: true, front: true, curved: true },
    pitch: { width: 68, depth: 105 },
  },
  {
    presetId: 'ballroom', name: 'Ballroom โรงแรม (ทั่วไป)', shape: 'hall',
    width: 25, depth: 45, height: 7,
    stage: { enabled: true, width: 12, depth: 6, height: 0.9, offset: 1 },
  },
]

export function cloneVenue(v: VenueConfig): VenueConfig {
  return { ...v, stage: { ...v.stage }, tiers: v.tiers ? { ...v.tiers } : undefined, pitch: v.pitch ? { ...v.pitch } : undefined }
}

export const OBJECT_KINDS: { value: LayoutObjectKind; label: string; color: string }[] = [
  { value: 'camera', label: 'กล้อง (ขาตั้ง)', color: '#2563eb' },
  { value: 'jib', label: 'Jib / Crane', color: '#0891b2' },
  { value: 'gimbal', label: 'กล้องโรนิน / Gimbal', color: '#4f46e5' },
  { value: 'remote_head', label: 'Remote Head (หัวรีโมท)', color: '#db2777' },
  { value: 'ob_truck', label: 'รถ OB', color: '#475569' },
  { value: 'desk', label: 'FOH / โต๊ะคอนโทรล', color: '#7c3aed' },
  { value: 'screen', label: 'จอ LED / Projector', color: '#111827' },
  { value: 'speaker', label: 'ลำโพง', color: '#16a34a' },
  { value: 'riser', label: 'Riser / แท่นยก', color: '#d97706' },
  { value: 'podium', label: 'โพเดียม / แท่นพูด', color: '#92400e' },
  { value: 'generic', label: 'อื่นๆ', color: '#6b7280' },
]

/** วัตถุที่มีกรวยมุมภาพ + มุมมองจากกล้อง + คอลัมน์เลนส์ในหน้าพิมพ์ */
export function isCameraKind(kind: LayoutObjectKind): boolean {
  return kind === 'camera' || kind === 'jib' || kind === 'gimbal' || kind === 'remote_head'
}

export function kindMeta(kind: LayoutObjectKind) {
  return OBJECT_KINDS.find((k) => k.value === kind) ?? OBJECT_KINDS[OBJECT_KINDS.length - 1]
}

/** ค่าตั้งต้นต่อชนิด — ขนาดเป็นเมตร */
export const KIND_DEFAULTS: Record<LayoutObjectKind, Partial<LayoutObject>> = {
  camera: { mountHeight: 1.6, fov: 30, range: 40 },
  // ถือด้วยมือ — เลนส์ราวระดับอก, มุมกว้าง ระยะใกล้
  gimbal: { mountHeight: 1.3, fov: 60, range: 15 },
  // หัวรีโมท pan/tilt บนเสา/ขาสูงหรือแขวน truss — คุมจากห้องคอนโทรล ไม่มีคนยืนประจำ
  remote_head: { mountHeight: 3, fov: 40, range: 30 },
  jib: { mountHeight: 4, fov: 50, range: 30, w: 1.2, d: 7, h: 1.2 },
  ob_truck: { w: 2.6, d: 12, h: 3.6 },
  desk: { w: 4, d: 2, h: 1 },
  screen: { w: 8, d: 0.3, h: 4.5 },
  speaker: { w: 1.2, d: 1.2, h: 3 },
  riser: { w: 2.4, d: 2.4, h: 0.6 },
  // หมุน 180° = ด้านหน้า (ป้าย) หันหาผู้ชม ผู้พูดยืนฝั่งเวที
  podium: { w: 0.6, d: 0.5, h: 1.15, rotation: 180 },
  generic: { w: 1, d: 1, h: 1 },
}

/** หมวดอุปกรณ์ในคลัง → ชนิดวัตถุ 3D ที่น่าจะใช่ */
export function kindForCategory(category: string): LayoutObjectKind {
  if (category === 'camera') return 'camera'
  if (category === 'monitor') return 'screen'
  if (category === 'audio') return 'speaker'
  if (category === 'switcher') return 'desk'
  return 'generic'
}
