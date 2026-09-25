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
    // มุมอัฒจันทร์เป็นโค้ง (ไม่ใช่เหลี่ยม) · ขอบล่างเป็นผนังตรง ~3 ขั้น (นั่งไม่ได้) แล้วค่อยเป็นที่นั่ง 11 แถว — ความสูงรวมเท่าเดิม (14 ขั้น)
    tiers: { steps: 11, rise: 0.9, run: 1.7, back: true, sides: true, aisleWidth: 1.4, sectionWidth: 10, crossAisle: 5, wallSteps: 3, cornerRadius: 14 },
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
  { value: 'remote_head', label: 'Remote Head (หัวแขวน)', color: '#db2777' },
  { value: 'micro_stand', label: 'ขา Micro (เสาสูง)', color: '#0d9488' },
  { value: 'action_cam', label: 'Action Cam (ไม้ถือสั้น)', color: '#ea580c' },
  { value: 'ptz', label: 'กล้อง PTZ', color: '#65a30d' },
  { value: 'tele_lens', label: 'กล้องเลนส์ Tele (40x)', color: '#0369a1' },
  { value: 'box_lens', label: 'กล้อง Box Lens (เลนส์ tele)', color: '#1e40af' },
  { value: 'mirrorless', label: 'กล้อง Mirrorless (ขาตั้ง)', color: '#9333ea' },
  { value: 'ob_truck', label: 'รถ OB', color: '#475569' },
  { value: 'control_room', label: 'ห้องคอนโทรล', color: '#0f766e' },
  { value: 'rack', label: 'ตู้ Rack OB', color: '#1f2937' },
  { value: 'desk', label: 'FOH / โต๊ะคอนโทรล', color: '#7c3aed' },
  { value: 'screen', label: 'จอ LED / Projector', color: '#111827' },
  { value: 'speaker', label: 'ลำโพง', color: '#16a34a' },
  { value: 'riser', label: 'Riser / แท่นยก', color: '#d97706' },
  { value: 'podium', label: 'โพเดียม / แท่นพูด', color: '#92400e' },
  { value: 'generic', label: 'อื่นๆ', color: '#6b7280' },
]

/** วัตถุที่มีกรวยมุมภาพ + มุมมองจากกล้อง + คอลัมน์เลนส์ในหน้าพิมพ์ */
export function isCameraKind(kind: LayoutObjectKind): boolean {
  return kind === 'camera' || kind === 'jib' || kind === 'gimbal' || kind === 'remote_head' || kind === 'micro_stand' || kind === 'action_cam' || kind === 'ptz' || kind === 'tele_lens' || kind === 'box_lens' || kind === 'mirrorless'
}

export function kindMeta(kind: LayoutObjectKind) {
  return OBJECT_KINDS.find((k) => k.value === kind) ?? OBJECT_KINDS[OBJECT_KINDS.length - 1]
}

/** ค่าตั้งต้นต่อชนิด — ขนาดเป็นเมตร */
export const KIND_DEFAULTS: Record<LayoutObjectKind, Partial<LayoutObject>> = {
  camera: { mountHeight: 1.6, fov: 30, range: 40 },
  // ถือด้วยมือ — เลนส์ราวระดับอก, มุมกว้าง ระยะใกล้
  gimbal: { mountHeight: 1.3, fov: 60, range: 15 },
  // Remote head (หัว Jimmy Jib ไม่มีตัวเครน) ห้อยหัวลงจาก truss/เพดาน — mountHeight = ระดับเลนส์ คุมจากห้องคอนโทรล
  remote_head: { mountHeight: 6, fov: 40, range: 30 },
  // กล้องเล็ก (Micro Studio ฯลฯ) บนเสาสูง/ขาตั้งไฟ ฐานสามขา — ไม่มีคนประจำ
  micro_stand: { mountHeight: 3, fov: 40, range: 30 },
  // GoPro/Insta360/Osmo Action บนไม้ถือสั้น (คล้ายไม้ selfie) — ถือระดับอก มุมกว้างมาก ระยะใกล้
  action_cam: { mountHeight: 1.4, fov: 110, range: 8 },
  // กล้อง PTZ (หัวหมุนในตัว) บนขาตั้งสูง/ชั้นวาง — คุมจากห้องคอนโทรล
  ptz: { mountHeight: 2.2, fov: 45, range: 30 },
  // กล้อง + เลนส์ tele แบบถือ (ENG ~40x–46x เช่น Canon CJ45, Fujinon UA46x) บนขาตั้ง — แคบกว่ากล้องปกติ แต่ไม่ไกลเท่า box lens
  tele_lens: { mountHeight: 1.7, fov: 15, range: 50 },
  // กล้อง broadcast + box lens (เช่น Fujinon 76x) บนขาตั้งงานหนัก — มุมแคบ ยิงไกลจาก FOH
  box_lens: { mountHeight: 1.8, fov: 10, range: 60 },
  jib: { mountHeight: 4, fov: 50, range: 30, w: 1.2, d: 7, h: 1.2 },
  ob_truck: { w: 2.6, d: 12, h: 3.6 },
  // ห้องคอนโทรล (ห้องในสถานที่ / เต็นท์ / ตู้คอนเทนเนอร์) — ผนังโปร่งให้เห็นโต๊ะข้างใน · ประตูอยู่ด้านหน้า (-z)
  control_room: { w: 6, d: 4, h: 2.8 },
  // ตู้ Rack 19" บนล้อ (สวิตเชอร์/converter/router) — จุดรวมสายในห้องคอนโทรล
  rack: { w: 0.6, d: 0.8, h: 1.6 },
  // กล้อง mirrorless (Sony FX3/A7, Lumix GH7 ฯลฯ) บนขาตั้งกล้องถ่ายภาพ — มุมกลาง ระยะใกล้-กลาง
  mirrorless: { mountHeight: 1.5, fov: 50, range: 20 },
  desk: { w: 4, d: 2, h: 1 },
  screen: { w: 8, d: 0.3, h: 4.5 },
  speaker: { w: 1.2, d: 1.2, h: 3 },
  riser: { w: 2.4, d: 2.4, h: 0.6 },
  // หมุน 180° = ด้านหน้า (ป้าย) หันหาผู้ชม ผู้พูดยืนฝั่งเวที
  podium: { w: 0.6, d: 0.5, h: 1.15, rotation: 180 },
  generic: { w: 1, d: 1, h: 1 },
}

/** หมวดอุปกรณ์ในสต็อก → ชนิดวัตถุ 3D ที่น่าจะใช่ */
export function kindForCategory(category: string): LayoutObjectKind {
  if (category === 'camera') return 'camera'
  if (category === 'monitor') return 'screen'
  if (category === 'audio') return 'speaker'
  if (category === 'switcher') return 'desk'
  return 'generic'
}

const footprint = (o: LayoutObject) => ({ w: o.w ?? KIND_DEFAULTS[o.kind]?.w ?? 1, d: o.d ?? KIND_DEFAULTS[o.kind]?.d ?? 1 })

/** จุด (x, z) อยู่ในพื้นที่ของวัตถุ (คิดการหมุนแล้ว) — ใช้หาว่าตู้ Rack อยู่ในห้องคอนโทรลไหน */
export function insideFootprint(o: LayoutObject, x: number, z: number): boolean {
  const { w, d } = footprint(o)
  const a = (o.rotation * Math.PI) / 180
  const dx = x - o.x
  const dz = z - o.z
  const lx = dx * Math.cos(a) + dz * Math.sin(a)
  const lz = -dx * Math.sin(a) + dz * Math.cos(a)
  return Math.abs(lx) <= w / 2 && Math.abs(lz) <= d / 2
}

/**
 * ตู้ Rack ในห้องคอนโทรล (จุดให้โยงสายเข้า): ชิดผนังขวา หันหน้าเข้ากลางห้อง ไม่ทับโต๊ะที่ชิดผนังหลัง
 * ระดับพื้นห้อง + มองทะลุตามห้อง (ห้องใต้อัฒจันทร์) · id ให้ผู้เรียกสร้าง (lib นี้ไม่ผูก firebase)
 */
export function rackInRoom(room: LayoutObject, id: string, label: string): LayoutObject {
  const { w } = footprint(room)
  const rack = KIND_DEFAULTS.rack
  const lx = w / 2 - 0.12 - (rack.d ?? 0.8) / 2
  const a = (room.rotation * Math.PI) / 180
  const r = (n: number) => Math.round(n * 100) / 100
  return {
    id, kind: 'rack', label, ...rack,
    x: r(room.x + lx * Math.cos(a)), z: r(room.z + lx * Math.sin(a)), y: r(room.y + 0.08),
    rotation: (room.rotation + 270) % 360,
    ...(room.underTier ? { underTier: true } : {}),
  }
}
