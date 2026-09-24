import type { CatalogProduct } from './blackmagic'

/**
 * Sony mirrorless (Alpha / ZV / Cinema Line FX) — ราคาใน prices.ts เป็น "body อย่างเดียว"
 * ⚠️ port ต่อรุ่นมาจากความรู้ทั่วไป ไม่ใช่ spec sheet — ตรวจกับตัวเครื่องอีกครั้ง
 * งาน OB ใช้เป็นกล้องส่ง HDMI เข้าสวิตเชอร์ (ผ่าน converter HDMI→SDI) — port หลักคือ HDMI OUT
 */
const S = 'Sony'
const A = ['sony', 'โซนี่', 'mirrorless', 'มิเรอร์เลส', 'alpha', 'body']

// micro HDMI = รุ่นเล็ก/รุ่นเก่า, full HDMI = A7S III, A1, A7 IV, FX3 ฯลฯ
const cam = (name: string, hdmi: 'micro' | 'full', extra: string[] = [], more: Pick<CatalogProduct, 'inputs' | 'outputs' | 'ios'> = {}): CatalogProduct => ({
  brand: S, name, category: 'camera', aliases: [...A, ...extra],
  inputs: ['MIC IN (3.5mm)', ...(more.inputs ?? [])],
  outputs: [hdmi === 'full' ? 'HDMI OUT' : 'HDMI OUT (micro)', 'HEADPHONE', ...(more.outputs ?? [])],
  ios: ['USB-C', ...(more.ios ?? [])],
})

export const SONY_PRODUCTS: CatalogProduct[] = [
  // ── Full frame A7 ────────────────────────────────────────────────────────
  cam('Sony A7 II', 'micro', ['a7ii', 'a7m2', 'รุ่นเก่า']),
  cam('Sony A7 III', 'micro', ['a7iii', 'a7m3']),
  cam('Sony A7 IV', 'full', ['a7iv', 'a7m4']),
  cam('Sony A7 V', 'full', ['a7v', 'a7m5']),
  cam('Sony A7S II', 'micro', ['a7sii', 'a7s2', 'รุ่นเก่า']),
  cam('Sony A7S III', 'full', ['a7siii', 'a7s3']),
  cam('Sony A7R IV', 'micro', ['a7riv', 'a7r4']),
  cam('Sony A7R V', 'full', ['a7rv', 'a7r5']),
  cam('Sony A7C', 'micro', ['a7c']),
  cam('Sony A7C II', 'micro', ['a7cii', 'a7c2']),
  cam('Sony A7CR', 'micro', ['a7cr']),
  // ── Flagship ─────────────────────────────────────────────────────────────
  cam('Sony A1', 'full', ['a1', 'alpha 1'], { ios: ['LAN'] }),
  cam('Sony A1 II', 'full', ['a1ii', 'alpha 1 ii'], { ios: ['LAN'] }),
  cam('Sony A9 III', 'full', ['a9iii', 'a9 3'], { ios: ['LAN'] }),
  // ── APS-C ────────────────────────────────────────────────────────────────
  cam('Sony A6400', 'micro', ['a6400', 'apsc']),
  cam('Sony A6600', 'micro', ['a6600', 'apsc']),
  cam('Sony A6700', 'micro', ['a6700', 'apsc']),
  // ── ZV (vlog) ────────────────────────────────────────────────────────────
  cam('Sony ZV-E10', 'micro', ['zve10', 'zv e10', 'vlog', 'apsc']),
  cam('Sony ZV-E10 II', 'micro', ['zve10ii', 'zv e10 ii', 'vlog', 'apsc']),
  cam('Sony ZV-E1', 'micro', ['zve1', 'zv e1', 'vlog']),
  // ── Cinema Line (body แบบ mirrorless) ────────────────────────────────────
  cam('Sony FX30', 'full', ['fx30', 'cinema line', 'apsc'], { inputs: ['XLR 1 (handle)', 'XLR 2 (handle)'], outputs: ['TIMECODE'] }),
  cam('Sony FX3', 'full', ['fx3', 'cinema line'], { inputs: ['XLR 1 (handle)', 'XLR 2 (handle)'], outputs: ['TIMECODE'] }),
  cam('Sony FX2', 'full', ['fx2', 'cinema line']),
]
