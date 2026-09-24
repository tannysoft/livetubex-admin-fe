/**
 * Type ของแผนจัดอุปกรณ์ — ฝาแฝดของ lib/types.ts ฝั่งเว็บ (functions เป็นคนละ package import ข้ามกันไม่ได้)
 * ⚠️ แก้ Equipment / PlanItem / PlanDiagram / DEFAULT_PORTS ฝั่งเว็บแล้วต้องแก้ที่นี่ด้วย
 */

export type EquipmentCategory =
  | 'camera' | 'lens' | 'switcher' | 'audio' | 'monitor' | 'converter' | 'wireless' | 'recorder'
  | 'intercom' | 'network' | 'cable' | 'power' | 'support' | 'lighting' | 'other'

export const CATEGORIES: EquipmentCategory[] = [
  'camera', 'lens', 'switcher', 'audio', 'monitor', 'converter', 'wireless', 'recorder',
  'intercom', 'network', 'cable', 'power', 'support', 'lighting', 'other',
]

export const CATEGORY_LABEL: Record<EquipmentCategory, string> = {
  camera: 'กล้อง', lens: 'เลนส์', switcher: 'สวิตเชอร์', audio: 'เสียง', monitor: 'มอนิเตอร์',
  converter: 'Converter/Router', wireless: 'Wireless Video (ส่งภาพไร้สาย)', recorder: 'Recorder/Encoder', intercom: 'Intercom/Tally',
  network: 'Network', cable: 'สาย', power: 'ไฟฟ้า/UPS', support: 'ขาตั้ง/Grip/Gimbal', lighting: 'ไฟส่องสว่าง', other: 'อื่นๆ',
}

/** โซนในผังวาง 3D — ⚠️ ฝาแฝดของ LayoutZone ใน lib/equipment/layout-zones.ts (ฝั่งเว็บแปลงเป็นพิกัด) */
export const LAYOUT_ZONES = [
  'stage_front_left', 'stage_front_center', 'stage_front_right', 'on_stage',
  'floor_left', 'floor_right', 'foh_center', 'back_left', 'back_right', 'ob_area',
] as const
export type LayoutZone = (typeof LAYOUT_ZONES)[number]
export const LAYOUT_KINDS = ['camera', 'jib', 'ob_truck', 'desk', 'screen', 'speaker', 'riser', 'podium', 'gimbal', 'remote_head', 'micro_stand', 'action_cam', 'ptz', 'tele_lens', 'box_lens', 'generic'] as const
export type LayoutKind = (typeof LAYOUT_KINDS)[number]
/** วาง/ย้ายตามโซน — หรือ swapWith = สลับตำแหน่งกับวัตถุอื่นในผัง (zone ไม่ใช้) · ⚠️ ฝาแฝดของ ZonePlacement ใน lib/equipment/layout-zones.ts */
export interface ZonePlacement { zone?: LayoutZone; kind: LayoutKind; label: string; itemId?: string; note?: string; swapWith?: { label: string; itemId?: string } }

export type SignalType = 'sdi' | 'hdmi' | 'fiber' | 'audio' | 'network' | 'intercom' | 'control' | 'power' | 'other'
export const SIGNALS: SignalType[] = ['sdi', 'hdmi', 'fiber', 'audio', 'network', 'intercom', 'control', 'power', 'other']

export interface Equipment {
  id: string
  code: string
  name: string
  category: EquipmentCategory
  brand?: string
  model?: string
  quantity: number
  storageLocation?: string
  status: 'available' | 'repair' | 'retired'
  inputs?: string[]
  outputs?: string[]
  ios?: string[]
  ownership?: 'owned' | 'rental' | 'partner'
  partnerName?: string
  rentalVendor?: string
  rentalRate?: number
  notes?: string
}

export interface PlanItem {
  id: string
  equipmentId?: string
  isRental?: boolean
  origin?: 'owned' | 'rental' | 'partner'
  code?: string
  name: string
  category: EquipmentCategory
  quantity: number
  fromLocation?: string
  toLocation?: string
  note?: string
  attachedTo?: string  // ติดกับแถวอื่น (เลนส์ → กล้อง)
  useFrom?: string     // ใช้ไม่เต็มงาน (YYYY-MM-DD) — ว่าง = ทั้งงาน
  useTo?: string
  packed?: boolean
  returned?: boolean
  rentalVendor?: string
  unitCost?: number
  rentalDays?: number
  expenseId?: string
  expenseCode?: string
}

export type PortSide = 'in' | 'out' | 'io'

export interface DiagramNode {
  id: string
  equipmentId?: string
  planItemId?: string
  label: string
  sub?: string
  category: EquipmentCategory
  x: number
  y: number
  inputs: string[]
  outputs: string[]
  ios?: string[]
  note?: string
}

export interface DiagramEdge {
  id: string
  from: { nodeId: string; side: PortSide; index: number }
  to: { nodeId: string; side: PortSide; index: number }
  signal: SignalType
  label?: string
  note?: string
}

export interface PlanDiagram {
  id: string
  name: string
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}

/** ส่วนของแผนที่ client ส่งมา (สถานะล่าสุดบนจอ รวมที่ยังไม่ได้ autosave) */
export interface AgentPlanInput {
  id: string
  title: string
  date?: string
  endDate?: string
  location?: string
  notes?: string
  /** ระบบภาพของงาน เช่น "1080i50 · SDR · Rec.709 · HD-SDI" (คำนวณฝั่งเว็บ) */
  videoSystem?: string
  /** format ไฟล์บันทึก เช่น "PGM — ProRes 422 HQ (.mov) · SSD  |  ISO ทุกกล้อง — H.264 (.mp4)" */
  recordingSystem?: string
  /** สัญญาณที่ต้องส่งให้ทีม Visual ที่ FOH — บรรทัดละ 1 feed (สัญญาณ → ปลายทาง ทาง/format/ระยะ) */
  fohFeeds?: string
  /** ผังวาง 3D ที่มีอยู่ (ผังแรก) — ชื่อวัตถุ + item ที่ผูก ไว้กันวางซ้ำ */
  layoutSummary?: string
  items: PlanItem[]
  diagrams: PlanDiagram[]
}

export const DEFAULT_PORTS: Record<EquipmentCategory, { inputs: string[]; outputs: string[]; ios?: string[] }> = {
  camera: { inputs: [], outputs: ['SDI OUT'] },
  lens: { inputs: [], outputs: [] },
  switcher: { inputs: ['IN 1', 'IN 2', 'IN 3', 'IN 4'], outputs: ['PGM', 'AUX', 'MV'] },
  audio: { inputs: ['IN 1', 'IN 2'], outputs: ['MAIN L/R'] },
  monitor: { inputs: ['IN'], outputs: [] },
  converter: { inputs: ['IN'], outputs: ['OUT'] },
  wireless: { inputs: ['SDI IN (TX)', 'HDMI IN (TX)'], outputs: ['SDI OUT (RX)', 'HDMI OUT (RX)'] },
  recorder: { inputs: ['IN'], outputs: ['LOOP'] },
  intercom: { inputs: [], outputs: [], ios: ['CH A'] },
  network: { inputs: [], outputs: [], ios: ['UPLINK', 'PORT 1', 'PORT 2', 'PORT 3', 'PORT 4'] },
  cable: { inputs: [], outputs: [] },
  power: { inputs: ['AC IN'], outputs: ['OUT 1', 'OUT 2'] },
  support: { inputs: [], outputs: [] },
  lighting: { inputs: ['AC IN'], outputs: [] },
  other: { inputs: ['IN'], outputs: ['OUT'] },
}

/** เหมือน newId() ฝั่งเว็บ */
export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}
