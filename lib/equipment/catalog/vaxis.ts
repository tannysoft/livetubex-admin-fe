import type { CatalogProduct } from './blackmagic'

/**
 * Vaxis — ส่งภาพไร้สาย (Atom / Storm) เป็นชุดคู่ TX+RX ตามที่ขายจริง
 * ⚠️ port และชื่อรุ่นมาจากความรู้ทั่วไป ไม่ใช่ spec sheet — ตรวจกับตัวเครื่องอีกครั้ง
 */
const V = 'Vaxis'
const A = ['vaxis', 'แวกซิส', 'wireless', 'ไร้สาย', 'wireless video', 'ส่งภาพไร้สาย']

type Ports = Pick<CatalogProduct, 'inputs' | 'outputs' | 'ios'>

/**
 * ขายเป็นคู่ TX+RX → 1 รายการในสต็อก = 1 ชุด และเป็น 1 กล่องในผังระบบ
 * ขาเข้า = port ของตัวส่ง (ฝั่งกล้อง), ขาออก = port ของตัวรับ (ฝั่งสวิตเชอร์) + loop out ของตัวส่ง
 * ในผังจึงโยง กล้อง → ชุด Vaxis → สวิตเชอร์ ได้ตรงๆ
 */
const set = (name: string, ports: Ports, extra: string[] = []): CatalogProduct =>
  ({ brand: V, name: `Vaxis ${name} (ชุด TX+RX)`, model: name, category: 'wireless', aliases: [...A, 'tx', 'rx', 'set', 'ชุด', 'คู่', ...extra], ...ports })

const HDMI: Ports = { inputs: ['HDMI IN (TX)'], outputs: ['HDMI OUT (RX)', 'HDMI LOOP OUT (TX)'], ios: ['USB-C (TX)', 'USB-C (RX)'] }
const SDI: Ports = { inputs: ['SDI IN (TX)', 'HDMI IN (TX)'], outputs: ['SDI OUT (RX)', 'HDMI OUT (RX)', 'SDI LOOP OUT (TX)'], ios: ['USB-C (TX)', 'USB-C (RX)'] }
const STORM: Ports = {
  inputs: ['3G-SDI IN (TX)', 'HDMI IN (TX)', 'TIMECODE IN (TX)'],
  outputs: ['3G-SDI OUT 1 (RX)', '3G-SDI OUT 2 (RX)', 'HDMI OUT (RX)', '3G-SDI LOOP OUT (TX)', 'HDMI LOOP OUT (TX)'],
  ios: ['USB-C (TX)', 'USB-C (RX)', 'TALLY (RX)'],
}
// DV = ตัวส่ง 1 + ตัวรับ 2 (dual view)
const STORM_DV: Ports = {
  inputs: ['3G-SDI IN (TX)', 'HDMI IN (TX)', 'TIMECODE IN (TX)'],
  outputs: ['3G-SDI OUT (RX1)', 'HDMI OUT (RX1)', '3G-SDI OUT (RX2)', 'HDMI OUT (RX2)', '3G-SDI LOOP OUT (TX)', 'HDMI LOOP OUT (TX)'],
  ios: ['USB-C (TX)', 'USB-C (RX1)', 'USB-C (RX2)', 'TALLY (RX1)', 'TALLY (RX2)'],
}

export const VAXIS_PRODUCTS: CatalogProduct[] = [
  // ── Atom (ระยะสั้น-กลาง) ─────────────────────────────────────────────────
  set('Atom 500', HDMI, ['atom', '500', 'hdmi']),
  set('Atom 500 SDI', SDI, ['atom', '500', 'sdi']),
  set('Atom 600 SDI', SDI, ['atom', '600', 'sdi']),
  set('Atom 800 SDI', SDI, ['atom', '800', 'sdi']),
  // ── Storm (ระยะไกล งานโปร) ───────────────────────────────────────────────
  set('Storm 800', STORM, ['storm', '800']),
  set('Storm 1000', STORM, ['storm', '1000']),
  set('Storm 2000', STORM, ['storm', '2000']),
  set('Storm 3000', STORM, ['storm', '3000']),
  { ...set('Storm 3000 DV', STORM_DV, ['storm', '3000', 'dv', 'dual']), name: 'Vaxis Storm 3000 DV (ชุด TX + RX 2 ตัว)' },
]
