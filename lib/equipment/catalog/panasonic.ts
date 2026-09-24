import type { CatalogProduct } from './blackmagic'

/**
 * Panasonic Lumix — GH series (M4/3 mirrorless) + box camera ที่ใช้ sensor ตระกูลเดียวกัน
 * ⚠️ port มาจากความรู้ทั่วไป/Wikipedia ไม่ใช่ spec sheet — ตรวจกับตัวเครื่องอีกครั้ง
 * timecode ของ GH5S/GH6/GH7 เข้าทาง flash sync socket (ต้องใช้สายแปลง เช่น Tentacle C25)
 */
const P = 'Panasonic'
const A = ['panasonic', 'พานาโซนิค', 'lumix', 'ลูมิกซ์', 'mirrorless', 'มิเรอร์เลส', 'm43', 'micro four thirds']

type Ports = Pick<CatalogProduct, 'inputs' | 'outputs' | 'ios'>
const gh = (name: string, hdmi: 'micro' | 'full', extra: string[] = [], more: Ports = {}): CatalogProduct => ({
  brand: P, name: `Lumix ${name}`, model: name, category: 'camera', aliases: [...A, 'gh', ...extra],
  inputs: ['MIC IN (3.5mm)', ...(more.inputs ?? [])],
  outputs: [hdmi === 'full' ? 'HDMI OUT' : 'HDMI OUT (micro)', 'HEADPHONE', ...(more.outputs ?? [])],
  ios: ['USB-C', ...(more.ios ?? [])],
})
const TC: Ports = { inputs: ['TIMECODE IN (flash sync)'] }

export const PANASONIC_PRODUCTS: CatalogProduct[] = [
  // ── GH series ────────────────────────────────────────────────────────────
  gh('GH4', 'micro', ['gh4', 'รุ่นเก่า']),
  gh('GH5', 'full', ['gh5']),
  gh('GH5S', 'full', ['gh5s', 'low light'], TC),
  gh('GH5 II', 'full', ['gh5ii', 'gh5 2', 'gh5m2', 'live streaming']),
  gh('GH6', 'full', ['gh6'], TC),
  gh('GH7', 'full', ['gh7', '32bit'], TC),
  // ── XLR adapter (เสียบ hot shoe) ────────────────────────────────────────
  { brand: P, name: 'Panasonic DMW-XLR1 (XLR adapter)', model: 'DMW-XLR1', category: 'audio',
    aliases: [...A, 'xlr1', 'xlr', 'adapter', 'gh5', 'gh6'], inputs: ['XLR IN 1', 'XLR IN 2'], outputs: ['HOT SHOE (to camera)'] },
  { brand: P, name: 'Panasonic DMW-XLR2 (XLR adapter 4ch 32-bit)', model: 'DMW-XLR2', category: 'audio',
    aliases: [...A, 'xlr2', 'xlr', 'adapter', 'gh7', '32bit'], inputs: ['XLR IN 1', 'XLR IN 2', 'LINE IN (3.5mm)'], outputs: ['HOT SHOE (to camera)'] },
  // ── Box camera (sensor ตระกูล GH/S — มี SDI + LAN เหมาะกับงานไลฟ์หลายกล้อง) ──
  { brand: P, name: 'Lumix BGH1 (box camera)', model: 'BGH1', category: 'camera',
    aliases: [...A, 'bgh1', 'box', 'บ็อกซ์', 'remote', 'poe'],
    inputs: ['TIMECODE IN / GENLOCK IN', 'MIC IN (3.5mm)'], outputs: ['3G-SDI OUT', 'HDMI OUT'], ios: ['LAN (PoE+)', 'USB-C'] },
  { brand: P, name: 'Lumix BS1H (box camera full frame)', model: 'BS1H', category: 'camera',
    aliases: [...A, 'bs1h', 'box', 'บ็อกซ์', 'full frame', 'remote', 'poe'],
    inputs: ['TIMECODE IN / GENLOCK IN', 'MIC IN (3.5mm)'], outputs: ['3G-SDI OUT', 'HDMI OUT'], ios: ['LAN (PoE+)', 'USB-C'] },
]
