import type {
  EquipmentCategory, EquipmentPlanStatus, EquipmentStatus, SignalType,
} from '../types'

export const EQUIPMENT_CATEGORIES: { value: EquipmentCategory; label: string }[] = [
  { value: 'camera', label: 'กล้อง' },
  { value: 'lens', label: 'เลนส์' },
  { value: 'switcher', label: 'สวิตเชอร์ / Vision Mixer' },
  { value: 'audio', label: 'เสียง' },
  { value: 'monitor', label: 'มอนิเตอร์ / Multiview' },
  { value: 'converter', label: 'Converter / Router' },
  { value: 'wireless', label: 'Wireless Video' },
  { value: 'recorder', label: 'Recorder / Encoder' },
  { value: 'intercom', label: 'Intercom / Tally' },
  { value: 'network', label: 'Network' },
  { value: 'cable', label: 'สาย / Cable' },
  { value: 'power', label: 'ไฟฟ้า / UPS' },
  { value: 'support', label: 'ขาตั้ง / Grip' },
  { value: 'lighting', label: 'ไฟส่องสว่าง' },
  { value: 'other', label: 'อื่นๆ' },
]

export function categoryLabel(c: EquipmentCategory): string {
  return EQUIPMENT_CATEGORIES.find((x) => x.value === c)?.label ?? c
}

/** สีหัวกล่องในผังระบบ — แยกหมวดให้มองออกเร็ว (ไม่ใช่สีแบรนด์ จึงเป็น hex คงที่) */
export const CATEGORY_COLORS: Record<EquipmentCategory, string> = {
  camera: '#2563eb',
  lens: '#0891b2',
  switcher: '#7c3aed',
  audio: '#16a34a',
  monitor: '#475569',
  converter: '#d97706',
  wireless: '#0284c7',
  recorder: '#db2777',
  intercom: '#0d9488',
  network: '#4f46e5',
  cable: '#78716c',
  power: '#ca8a04',
  support: '#6b7280',
  lighting: '#ea580c',
  other: '#6b7280',
}

/** port ตั้งต้นต่อหมวด — เติมให้ตอนเพิ่มอุปกรณ์ใหม่ แก้ทีหลังได้ */
export const DEFAULT_PORTS: Record<EquipmentCategory, { inputs: string[]; outputs: string[]; ios?: string[] }> = {
  camera: { inputs: [], outputs: ['SDI OUT'] },
  lens: { inputs: [], outputs: [] },
  switcher: { inputs: ['IN 1', 'IN 2', 'IN 3', 'IN 4'], outputs: ['PGM', 'AUX', 'MV'] },
  audio: { inputs: ['IN 1', 'IN 2'], outputs: ['MAIN L/R'] },
  monitor: { inputs: ['IN'], outputs: [] },
  converter: { inputs: ['IN'], outputs: ['OUT'] },
  // ชุดส่งภาพไร้สาย = 1 กล่อง: ขาเข้าคือตัวส่ง (ฝั่งกล้อง) ขาออกคือตัวรับ (ฝั่งสวิตเชอร์)
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

export const EQUIPMENT_STATUSES: { value: EquipmentStatus; label: string; color: string }[] = [
  { value: 'available', label: 'พร้อมใช้', color: 'bg-green-100 text-green-700' },
  { value: 'repair', label: 'ส่งซ่อม', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'retired', label: 'เลิกใช้', color: 'bg-gray-100 text-gray-500' },
]

export const PLAN_STATUSES: { value: EquipmentPlanStatus; label: string; color: string }[] = [
  { value: 'draft', label: 'ร่าง', color: 'bg-gray-100 text-gray-600' },
  { value: 'ready', label: 'จัดของครบ', color: 'bg-blue-100 text-blue-700' },
  { value: 'on_site', label: 'อยู่หน้างาน', color: 'bg-purple-100 text-purple-700' },
  { value: 'returned', label: 'เก็บกลับแล้ว', color: 'bg-green-100 text-green-700' },
]

/**
 * ประเภทสัญญาณ — สี + ลายเส้น (dash) คู่กันเสมอ
 * เพราะผังมักถูก print ขาวดำ สีอย่างเดียวแยกไม่ออก
 */
export const SIGNAL_TYPES: { value: SignalType; label: string; color: string; dash?: string }[] = [
  { value: 'sdi', label: 'SDI', color: '#2563eb' },
  { value: 'hdmi', label: 'HDMI', color: '#7c3aed', dash: '10 4' },
  { value: 'fiber', label: 'Fiber', color: '#ea580c', dash: '14 4 3 4' },
  { value: 'audio', label: 'Audio', color: '#16a34a', dash: '3 4' },
  { value: 'network', label: 'Network', color: '#0d9488', dash: '8 3 2 3 2 3' },
  { value: 'intercom', label: 'Intercom', color: '#db2777', dash: '6 6' },
  { value: 'control', label: 'Control / Tally', color: '#64748b', dash: '2 3' },
  { value: 'power', label: 'Power', color: '#ca8a04', dash: '12 3' },
  { value: 'other', label: 'อื่นๆ', color: '#111827', dash: '5 3' },
]

export function signalMeta(s: SignalType) {
  return SIGNAL_TYPES.find((x) => x.value === s) ?? SIGNAL_TYPES[SIGNAL_TYPES.length - 1]
}

/** ชื่อผังที่ใช้บ่อย — เป็นแค่ปุ่มลัดตอนสร้างผังใหม่ */
