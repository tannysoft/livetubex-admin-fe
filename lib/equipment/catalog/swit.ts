import type { CatalogProduct } from './blackmagic'

/**
 * SWIT — จอมอนิเตอร์ (on-camera / production / broadcast), ส่งภาพไร้สาย (FLOW / CURVE),
 * แบตเตอรี่ V-mount และแท่นชาร์จ
 * ⚠️ port และชื่อรุ่นมาจากความรู้ทั่วไป ไม่ใช่ spec sheet — ตรวจกับตัวเครื่องอีกครั้ง
 */
const S = 'SWIT'
const A = ['swit', 'สวิต']

type Ports = Pick<CatalogProduct, 'inputs' | 'outputs' | 'ios'>
const MON = [...A, 'monitor', 'จอ', 'มอนิเตอร์']
const mon = (name: string, ports: Ports, extra: string[] = []): CatalogProduct =>
  ({ brand: S, name: `SWIT ${name}`, model: name, category: 'monitor', aliases: [...MON, ...extra], ...ports })

// 3G = จอ HD ทั่วไป · 12G = จอ 4K broadcast · มี loop out ทั้ง SDI และ HDMI
const SDI3G: Ports = { inputs: ['3G-SDI IN', 'HDMI IN'], outputs: ['3G-SDI LOOP OUT', 'HDMI OUT'] }
const SDI3G_DUAL: Ports = { inputs: ['3G-SDI IN 1', '3G-SDI IN 2', 'HDMI IN'], outputs: ['3G-SDI LOOP OUT 1', '3G-SDI LOOP OUT 2', 'HDMI OUT'], ios: ['TALLY (GPI)', 'LAN'] }
const SDI12G: Ports = { inputs: ['12G-SDI IN 1', '12G-SDI IN 2', 'HDMI IN'], outputs: ['12G-SDI LOOP OUT 1', '12G-SDI LOOP OUT 2', 'HDMI OUT'], ios: ['TALLY (GPI)', 'LAN'] }
// K15: 2× 3G-SDI in + 2× loop out, HDMI 1.4 in, USB-A (LUT/firmware), USB-C (calibration probe) — ไม่มี tally/LAN
const K_FIELD: Ports = {
  inputs: ['3G-SDI IN 1', '3G-SDI IN 2', 'HDMI IN'],
  outputs: ['3G-SDI LOOP OUT 1', '3G-SDI LOOP OUT 2', 'HEADPHONE'],
  ios: ['USB-A (LUT)', 'USB-C (probe)'],
}
const QUAD: Ports = { inputs: ['12G-SDI IN 1', '12G-SDI IN 2', '12G-SDI IN 3', '12G-SDI IN 4', 'HDMI IN'], outputs: ['12G-SDI LOOP OUT 1', '12G-SDI LOOP OUT 2', '12G-SDI LOOP OUT 3', '12G-SDI LOOP OUT 4', 'HDMI OUT'], ios: ['TALLY (GPI)', 'LAN'] }

const WL = [...A, 'wireless', 'ไร้สาย', 'wireless video', 'ส่งภาพไร้สาย']
// ขายเป็นคู่ TX+RX → 1 รายการ = 1 กล่องในผัง: ขาเข้า = ตัวส่ง (ฝั่งกล้อง), ขาออก = ตัวรับ (ฝั่งสวิตเชอร์)
const set = (name: string, ports: Ports, extra: string[] = []): CatalogProduct =>
  ({ brand: S, name: `SWIT ${name} (ชุด TX+RX)`, model: name, category: 'wireless', aliases: [...WL, 'tx', 'rx', 'set', 'ชุด', 'คู่', ...extra], ...ports })
// port ตาม spec บน swit.cc
const FLOW: Ports = {
  inputs: ['SDI IN (TX)', 'HDMI IN (TX)'],
  outputs: ['SDI OUT (RX)', 'HDMI OUT (RX)', 'SDI LOOP OUT (TX)'],
  ios: ['USB-C (TX)', 'USB-C (RX)'],
}
// FLOW6500 / FLOW10K: ตัวรับมีแค่ SDI OUT (ไม่มี HDMI out)
const FLOW_LONG: Ports = { inputs: ['SDI IN (TX)', 'HDMI IN (TX)'], outputs: ['SDI OUT (RX)', 'SDI LOOP OUT (TX)'] }
// CREW ทุกรุ่น: TX = SDI in + loop, HDMI in · RX = SDI out ×2, HDMI out, USB-C capture · 1 TX รับได้ถึง 4 RX
const CREW: Ports = {
  inputs: ['SDI IN (TX)', 'HDMI IN (TX)'],
  outputs: ['SDI OUT 1 (RX)', 'SDI OUT 2 (RX)', 'HDMI OUT (RX)', 'USB-C CAPTURE (RX)', 'SDI LOOP OUT (TX)'],
}
const CREW_2RX: Ports = {
  inputs: ['SDI IN (TX)', 'HDMI IN (TX)'],
  outputs: [
    'SDI OUT 1 (RX1)', 'SDI OUT 2 (RX1)', 'HDMI OUT (RX1)', 'USB-C CAPTURE (RX1)',
    'SDI OUT 1 (RX2)', 'SDI OUT 2 (RX2)', 'HDMI OUT (RX2)', 'USB-C CAPTURE (RX2)',
    'SDI LOOP OUT (TX)',
  ],
}
const CURVE: Ports = { inputs: ['HDMI IN (TX)'], outputs: ['HDMI OUT (RX)', 'USB-C CAPTURE (RX)'] }

const PWR = [...A, 'battery', 'แบต', 'แบตเตอรี่', 'v-mount', 'vmount']
const bat = (name: string, extra: string[] = []): CatalogProduct =>
  ({ brand: S, name: `SWIT ${name}`, model: name, category: 'power', aliases: [...PWR, ...extra], outputs: ['D-TAP OUT', 'USB OUT'] })

export const SWIT_PRODUCTS: CatalogProduct[] = [
  // ── On-camera monitors ───────────────────────────────────────────────────
  mon('CM-S75F 5.5"', SDI3G, ['cm-s75f', '5.5', 'on-camera']),
  mon('CM-S73H 7"', { inputs: ['HDMI IN'], outputs: ['HDMI OUT'] }, ['cm-s73h', '7 นิ้ว', 'on-camera', 'hdmi']),
  mon('S-1071F 7"', SDI3G, ['s-1071f', '7 นิ้ว', 'on-camera']),
  mon('S-1073F 7"', SDI3G, ['s-1073f', '7 นิ้ว', 'on-camera']),
  mon('S-1093H 9"', SDI3G, ['s-1093h', '9 นิ้ว']),
  // ── Production / director monitors ───────────────────────────────────────
  mon('S-1133F 13.3"', SDI3G_DUAL, ['s-1133f', '13 นิ้ว', 'director']),
  mon('S-1173F 17.3"', SDI3G_DUAL, ['s-1173f', '17 นิ้ว', 'director']),
  mon('S-1223F 21.5"', SDI3G_DUAL, ['s-1223f', '22 นิ้ว', 'director']),
  mon('S-1243F 24"', SDI3G_DUAL, ['s-1243f', '24 นิ้ว', 'director']),
  mon('S-1273F 27"', SDI3G_DUAL, ['s-1273f', '27 นิ้ว', 'director']),
  // ── K series field monitor (FHD 1500nit) — port ตาม spec บน swit.cc (K15) ──
  mon('K15 15.4" 1500nit', K_FIELD, ['k15', '15 นิ้ว', 'field monitor', 'high bright', 'สว่าง', '1500nit']),
  mon('K21 21.5" 1500nit', K_FIELD, ['k21', '22 นิ้ว', 'field monitor', 'high bright', 'สว่าง', '1500nit']),
  // ── 4K / HDR broadcast monitors ──────────────────────────────────────────
  mon('BM-U175 17.3" 4K', SDI12G, ['bm-u175', '17 นิ้ว', '4k', '12g', 'broadcast']),
  mon('BM-U215 21.5" 4K', SDI12G, ['bm-u215', '22 นิ้ว', '4k', '12g', 'broadcast']),
  mon('BM-U245 24" 4K', SDI12G, ['bm-u245', '24 นิ้ว', '4k', '12g', 'broadcast']),
  mon('BM-U275 27" 4K', SDI12G, ['bm-u275', '27 นิ้ว', '4k', '12g', 'broadcast']),
  mon('BM-U325 32" 4K', QUAD, ['bm-u325', '32 นิ้ว', '4k', '12g', 'broadcast', 'quad']),
  mon('FM-215HDR 21.5" HDR', SDI12G, ['fm-215hdr', 'hdr', '22 นิ้ว', 'grading']),
  // ── Wireless video ───────────────────────────────────────────────────────
  // CREW = รุ่นโปร (1.2 กม. / MAX 3 กม.) · -V = ตัวส่งมีแผ่น V-mount คู่
  set('CREW', CREW, ['crew', '1.2km']),
  { ...set('CREW', CREW_2RX, ['crew', '1.2km', 'dual', '2rx']), name: 'SWIT CREW (ชุด TX + RX 2 ตัว)' },
  set('CREW-V', CREW, ['crew', 'crew v', 'v-mount', '1.2km']),
  set('CREW MAX', CREW, ['crew', 'max', '3km']),
  set('CREW-V MAX', CREW, ['crew', 'crew v', 'max', 'v-mount', '3km']),
  set('FLOW500', FLOW, ['flow', '500', '150m']),
  set('FLOW2000', FLOW, ['flow', '2000', '600m']),
  set('FLOW6500', FLOW_LONG, ['flow', '6500', '2km']),
  set('FLOW10K', FLOW_LONG, ['flow', '10k', '10000', '3km']),
  set('CURVE500+', CURVE, ['curve', '500', 'hdmi', 'usb capture']),
  // ── แบตเตอรี่ V-mount / แท่นชาร์จ ─────────────────────────────────────────
  bat('PB-S98S 98Wh', ['pb-s98s', '98wh']),
  bat('PB-M98S 98Wh (mini)', ['pb-m98s', '98wh', 'mini']),
  bat('S-8083S 130Wh', ['s-8083s', '8083', '130wh']),
  bat('PB-S220S 220Wh', ['pb-s220s', '220wh']),
  bat('PB-R290S+ 290Wh', ['pb-r290s', '290wh']),
  // MINO = V-mount ขนาดพกพา — port ตาม spec บน swit.cc (MINO-S210): V-mount 200W, D-Tap 120W, USB-A 5V, USB-C PD 65W เข้า/ออก
  ...([['MINO-S70', '70Wh'], ['MINO-S140', '140Wh'], ['MINO-S210', '210Wh']] as const).map(([m, wh]): CatalogProduct => ({
    brand: S, name: `SWIT ${m} ${wh} (V-mount พกพา)`, model: m, category: 'power',
    aliases: [...PWR, 'mino', m.toLowerCase(), wh.toLowerCase(), 'pocket', 'พกพา'],
    outputs: ['V-MOUNT OUT', 'D-TAP OUT', 'USB-A OUT'], ios: ['USB-C PD (in/out)'],
  })),
  { brand: S, name: 'SWIT PC-P461S แท่นชาร์จ 4 ช่อง', model: 'PC-P461S', category: 'power', aliases: [...PWR, 'charger', 'ชาร์จ', 'แท่นชาร์จ'], inputs: ['AC IN'] },
  { brand: S, name: 'SWIT S-3602S แท่นชาร์จ 2 ช่อง', model: 'S-3602S', category: 'power', aliases: [...PWR, 'charger', 'ชาร์จ', 'แท่นชาร์จ'], inputs: ['AC IN'] },
]
