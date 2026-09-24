import type { CatalogProduct } from './blackmagic'

/**
 * NAYA (Shanghai Naya Intelligence Technology) — Tally ไร้สาย + อินเตอร์คอมไร้สาย
 * ⚠️ port ต่อรุ่นมาจากความรู้ทั่วไป/คู่มือ ไม่ใช่ spec sheet — ตรวจกับตัวเครื่องอีกครั้ง
 * ระบบ tally ของ NAYA = สถานีฐาน (ต่อ tally จากสวิตเชอร์ผ่าน GPIO / LAN) + ไฟ tally ไร้สายติดกล้อง
 */
const N = 'NAYA'
const A = ['naya', 'นายา', 'wireless', 'ไร้สาย']
// เฉพาะของที่เกี่ยวกับ tally (สถานีฐาน/ไฟ) — beltpack ไม่ใส่ ไม่งั้นค้น "naya tally" แล้ว beltpack ขึ้นก่อน
const T = [...A, 'tally', 'แทลลี่']

const tallyLight = (name: string, extra: string[] = []): CatalogProduct =>
  ({ brand: N, name, category: 'intercom', aliases: [...T, 'light', 'ไฟ tally', 'ไฟติดกล้อง', ...extra], inputs: ['DC IN'], ios: ['WIRELESS'] })

// HDI-TL170 ขายเป็นชุด base + ไฟ → 1 รายการต่อชุด port = ของ base (ไฟเป็นไร้สาย ไม่ต้องโยงในผัง)
const TL170_BASE: Pick<CatalogProduct, 'inputs' | 'ios'> = { inputs: ['TALLY IN (GPIO)', 'DC IN'], ios: ['LAN (ATEM / vMix)', 'USB', 'WIRELESS'] }
const tl170Kit = (n: number): CatalogProduct => ({
  brand: N, name: `NAYA HDI-TL170 ${n}-Light Kit (base + ไฟ ${n} ตัว)`, model: `HDI-TL170 ${n}-Light Kit`, category: 'intercom',
  aliases: [...T, 'tl170', 'hdi-tl170', 'kit', 'set', 'ชุด', `${n} light`, `${n} ไฟ`, `ไฟ ${n}`, 'bmd', 'atem', 'avmatrix', 'hardcase'],
  ...TL170_BASE,
})

export const NAYA_PRODUCTS: CatalogProduct[] = [
  // ── Tally ชุด HDI-TL170 (base + ไฟ) ────────────────────────────────────────
  tl170Kit(4),
  tl170Kit(8),
  // ── Tally base stations (ตัวรับ tally จากสวิตเชอร์ แล้วส่งไร้สายไปไฟ) ─────────
  { brand: N, name: 'HDI-TL170 Tally Base Station (เพิ่ม/อะไหล่)', model: 'HDI-TL170', category: 'intercom', aliases: [...T, 'tl170', 'base', 'สถานีฐาน', 'spare', 'อะไหล่', 'bmd', 'atem', 'avmatrix'],
    ...TL170_BASE },
  { brand: N, name: 'HDI-BS170 Base Station', model: 'HDI-BS170', category: 'intercom', aliases: [...T, 'bs170', 'base', 'intercom', 'สถานีฐาน'],
    inputs: ['TALLY IN (GPIO)', 'DC IN'], outputs: ['4-WIRE OUT'], ios: ['LAN', '4-WIRE', 'WIRELESS'] },
  { brand: N, name: 'HDI-BS180 Base Station', model: 'HDI-BS180', category: 'intercom', aliases: [...T, 'bs180', 'base', 'intercom', 'สถานีฐาน', 'vmix'],
    inputs: ['TALLY IN (GPIO)', 'DC IN'], outputs: ['4-WIRE OUT'], ios: ['LAN (vMix / ATEM)', '4-WIRE', 'WIRELESS'] },
  { brand: N, name: 'HDI-BS280 Base Station', model: 'HDI-BS280', category: 'intercom', aliases: [...T, 'bs280', 'base', 'intercom', 'สถานีฐาน'],
    inputs: ['TALLY IN (GPIO)', 'DC IN'], outputs: ['4-WIRE OUT'], ios: ['LAN', '4-WIRE', 'WIRELESS'] },
  { brand: N, name: 'FDI-BS340 Base Station', model: 'FDI-BS340', category: 'intercom', aliases: [...T, 'bs340', 'base', 'intercom', 'สถานีฐาน', 'full duplex'],
    inputs: ['TALLY IN (GPIO)', 'DC IN'], outputs: ['4-WIRE OUT'], ios: ['LAN', '4-WIRE', '2-WIRE', 'WIRELESS'] },
  { brand: N, name: 'FDI-BS350 Base Station', model: 'FDI-BS350', category: 'intercom', aliases: [...T, 'bs350', 'base', 'intercom', 'สถานีฐาน', 'full duplex'],
    inputs: ['TALLY IN (GPIO)', 'DC IN'], outputs: ['4-WIRE OUT'], ios: ['LAN', '4-WIRE', '2-WIRE', 'WIRELESS'] },
  { brand: N, name: 'AFDI-BS450 Base Station', model: 'AFDI-BS450', category: 'intercom', aliases: [...T, 'bs450', 'base', 'intercom', 'สถานีฐาน', 'full duplex'],
    inputs: ['TALLY IN (GPIO)', 'DC IN'], outputs: ['4-WIRE OUT'], ios: ['LAN', '4-WIRE', '2-WIRE', 'DANTE', 'WIRELESS'] },

  // ── Beltpacks (อินเตอร์คอมไร้สายพกพา) ───────────────────────────────────────
  { brand: N, name: 'HDI-PT190 Beltpack', model: 'HDI-PT190', category: 'intercom', aliases: [...A, 'pt190', 'beltpack', 'เบลท์แพ็ค', 'intercom'],
    inputs: ['HEADSET'], ios: ['WIRELESS'] },
  { brand: N, name: 'FDI-PT310 Beltpack', model: 'FDI-PT310', category: 'intercom', aliases: [...A, 'pt310', 'beltpack', 'เบลท์แพ็ค', 'intercom'],
    inputs: ['HEADSET'], ios: ['WIRELESS'] },
  { brand: N, name: 'FDI-PT320 Beltpack', model: 'FDI-PT320', category: 'intercom', aliases: [...A, 'pt320', 'beltpack', 'เบลท์แพ็ค', 'intercom'],
    inputs: ['HEADSET'], ios: ['WIRELESS'] },
  { brand: N, name: 'AFDI-PT420 Beltpack', model: 'AFDI-PT420', category: 'intercom', aliases: [...A, 'pt420', 'beltpack', 'เบลท์แพ็ค', 'intercom'],
    inputs: ['HEADSET'], ios: ['WIRELESS'] },

  // ── Tally lights (ไฟติดกล้อง) ────────────────────────────────────────────────
  tallyLight('Tally 170 Light (เพิ่ม/อะไหล่)', ['170', 'spare', 'อะไหล่', 'เพิ่ม']),
  tallyLight('Tally 280 Light', ['280']),
  tallyLight('Tally 285 Light', ['285']),
  tallyLight('Tally 350 Light', ['350']),
  tallyLight('Tally 355 Light', ['355']),
  tallyLight('Tally 450 Light', ['450']),
  { brand: N, name: 'Tally Interface (GPIO ↔ Switcher)', model: 'Tally Interface', category: 'intercom', aliases: [...T, 'interface', 'gpio', 'db25'],
    inputs: ['TALLY IN (DB25 / GPIO)'], outputs: ['TALLY OUT'], ios: ['LAN'] },
]
