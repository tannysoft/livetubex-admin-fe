import type { CatalogProduct } from './blackmagic'

/**
 * Accsoon — ส่งภาพไร้สาย (CineView), จอ (M7), อินเตอร์คอม (CoMo), SeeMo, slider, iPad cage
 * port ตาม spec บน accsoon.com (ก.ย. 2569) — ชุดส่งภาพเป็น 1 รายการ = 1 กล่อง: ขาเข้า = ตัวส่ง, ขาออก = ตัวรับ
 * ⚠️ จำนวน headset ต่อชุดของ CoMo เว็บไม่ได้ระบุ — ตั้งตามที่ขายทั่วไป ตรวจกับของจริง
 */
const AC = 'Accsoon'
const A = ['accsoon', 'แอคซูน']

type Ports = Pick<CatalogProduct, 'inputs' | 'outputs' | 'ios'>
const WL = [...A, 'cineview', 'wireless', 'ไร้สาย', 'wireless video', 'ส่งภาพไร้สาย']
const set = (name: string, ports: Ports, extra: string[] = []): CatalogProduct =>
  ({ brand: AC, name: `Accsoon ${name} (ชุด TX+RX)`, model: name, category: 'wireless', aliases: [...WL, 'tx', 'rx', 'set', 'ชุด', 'คู่', ...extra], ...ports })

const MON = [...A, 'monitor', 'จอ', 'มอนิเตอร์']
const IC = [...A, 'como', 'intercom', 'อินเตอร์คอม', 'headset', 'wireless', 'ไร้สาย', 'set', 'ชุด']
const como = (line: string, n: number, extra: string[] = []): CatalogProduct => ({
  brand: AC, name: `Accsoon ${line} (ชุด ${n} headset)`, model: `${line} ×${n}`, category: 'intercom',
  aliases: [...IC, `${n} headset`, `${n} คน`, ...extra], ios: ['3.5mm AUX (master)'],
})

export const ACCSOON_PRODUCTS: CatalogProduct[] = [
  // ── CineView (ส่งภาพไร้สาย) ──────────────────────────────────────────────
  set('CineView Master 4K', {
    inputs: ['HDMI IN (TX)', '3G-SDI IN (TX)'],
    outputs: ['HDMI OUT (RX)', '3G-SDI OUT (RX)', 'HDMI LOOP OUT (TX)', 'USB VIDEO OUT (TX)'],
  }, ['master', '4k', '2.5km']),
  set('CineView Master 4K Lite', {
    inputs: ['HDMI IN (TX)', '3G-SDI IN (TX)'],
    outputs: ['HDMI OUT (RX)', '3G-SDI OUT (RX)', 'USB VIDEO OUT (RX)', 'HDMI LOOP OUT (TX)', 'USB VIDEO OUT (TX)'],
    ios: ['USB-C CAMERA CONTROL (TX)'],
  }, ['master', '4k', 'lite', '350m']),
  set('CineView SE 4K', {
    inputs: ['HDMI IN (TX)', 'SDI IN (TX)'],
    outputs: ['HDMI OUT (RX)', 'SDI OUT (RX)', 'USB VIDEO OUT (RX)', 'USB VIDEO OUT (TX)'],
    ios: ['USB-C CAMERA CONTROL (TX)'],
  }, ['se', '4k', '400m']),
  set('CineView 2 SDI', {
    inputs: ['HDMI IN (TX)', '3G-SDI IN (TX)'],
    outputs: ['HDMI OUT (RX)', '3G-SDI OUT (RX)', 'USB-C UVC (RX)', 'HDMI LOOP OUT (TX)'],
  }, ['2 sdi', 'sdi', '450m']),
  set('CineView SE', {
    inputs: ['SDI IN (TX)', 'HDMI IN (TX)'],
    outputs: ['SDI OUT (RX)', 'HDMI OUT (RX)', 'SDI LOOP OUT (TX)', 'HDMI LOOP OUT (TX)'],
  }, ['se', '1200ft']),
  set('CineView HE', {
    inputs: ['HDMI IN (TX)'],
    outputs: ['HDMI OUT (RX)', 'USB-C UVC (RX)', 'HDMI LOOP OUT (TX)'],
  }, ['he', 'hdmi', '1200ft']),
  // Nano = ตัวส่งอย่างเดียว ส่งเข้าแอปบนมือถือ/แท็บเล็ต (ไม่มีกล่องรับ)
  { brand: AC, name: 'Accsoon CineView Nano (ตัวส่งเข้ามือถือ)', model: 'CineView Nano', category: 'wireless',
    aliases: [...WL, 'nano', 'tx', 'app', 'มือถือ', 'ipad'], inputs: ['HDMI IN'], ios: ['WIFI → APP'] },

  // ── จอ CineView M7 (7 นิ้ว) ─────────────────────────────────────────────
  { brand: AC, name: 'Accsoon CineView M7', model: 'CineView M7', category: 'monitor', aliases: [...MON, 'm7', '7 นิ้ว'],
    inputs: ['HDMI IN', '3G-SDI IN'], outputs: ['HDMI OUT', '3G-SDI OUT'] },
  // Pro = จอที่มีตัวส่ง/ตัวรับไร้สายในตัว (350 ม.)
  { brand: AC, name: 'Accsoon CineView M7 Pro', model: 'CineView M7 Pro', category: 'monitor', aliases: [...MON, 'm7', 'pro', '7 นิ้ว', 'wireless', 'ไร้สาย'],
    inputs: ['HDMI IN', '3G-SDI IN'], outputs: ['HDMI OUT', '3G-SDI OUT'], ios: ['WIRELESS TX/RX'] },
  { brand: AC, name: 'Accsoon CineView M7H Pro', model: 'CineView M7H Pro', category: 'monitor', aliases: [...MON, 'm7h', 'pro', '7 นิ้ว', 'hdmi', 'wireless', 'ไร้สาย'],
    inputs: ['HDMI IN'], outputs: ['HDMI OUT'], ios: ['WIRELESS TX/RX'] },

  // ── CoMo (อินเตอร์คอมไร้สาย ไม่ต้องมี base — master 1 + remote) ──────────
  ...[2, 3, 4, 5, 6, 9].map((n) => como('CoMo II', n, ['como ii', 'como 2', 'dect'])),
  ...[2, 3, 4, 5].map((n) => como('CoMo', n, ['dect'])),
  ...[2, 3, 4, 5].map((n) => como('CoMo SE', n, ['como se', '2.4ghz'])),
  { brand: AC, name: 'Accsoon CoMo II Remote Headset (เพิ่ม/อะไหล่)', model: 'CoMo II Remote', category: 'intercom', aliases: [...IC, 'como ii', 'remote', 'spare'] },

  // ── SeeMo (ใช้ iPhone/Android เป็นจอ/สตรีมผ่าน HDMI) ─────────────────────
  { brand: AC, name: 'Accsoon SeeMo', model: 'SeeMo', category: 'converter', aliases: [...A, 'seemo', 'iphone', 'มือถือ', 'hdmi'],
    inputs: ['HDMI IN'], outputs: ['LIGHTNING / USB-C (to phone)'] },
  { brand: AC, name: 'Accsoon SeeMo Pro', model: 'SeeMo Pro', category: 'converter', aliases: [...A, 'seemo', 'pro', 'iphone', 'มือถือ', 'hdmi'],
    inputs: ['HDMI IN'], outputs: ['LIGHTNING / USB-C (to phone)', 'HDMI LOOP OUT'] },
  { brand: AC, name: 'Accsoon SeeMo 4K', model: 'SeeMo 4K', category: 'converter', aliases: [...A, 'seemo', '4k', 'iphone', 'มือถือ', 'hdmi'],
    inputs: ['HDMI IN'], outputs: ['USB-C (to phone)', 'HDMI LOOP OUT'] },
  { brand: AC, name: 'Accsoon SeeMo 4K for Android', model: 'SeeMo 4K Android', category: 'converter', aliases: [...A, 'seemo', '4k', 'android', 'มือถือ', 'hdmi'],
    inputs: ['HDMI IN'], outputs: ['USB-C (to phone)', 'HDMI LOOP OUT'] },

  // ── Slider / iPad cage ───────────────────────────────────────────────────
  { brand: AC, name: 'Accsoon TopRig S40 (slider มอเตอร์ 40 ซม.)', model: 'TopRig S40', category: 'support', aliases: [...A, 'toprig', 'slider', 'สไลเดอร์', 's40'] },
  { brand: AC, name: 'Accsoon TopRig S60 (slider มอเตอร์ 60 ซม.)', model: 'TopRig S60', category: 'support', aliases: [...A, 'toprig', 'slider', 'สไลเดอร์', 's60'] },
  { brand: AC, name: 'Accsoon PowerCage II (iPad)', model: 'PowerCage II', category: 'support', aliases: [...A, 'powercage', 'ipad', 'cage'] },
  { brand: AC, name: 'Accsoon PowerCage Pro II (iPad Pro)', model: 'PowerCage Pro II', category: 'support', aliases: [...A, 'powercage', 'ipad', 'cage', 'pro'] },
  { brand: AC, name: 'Accsoon PowerCage mini (iPad mini)', model: 'PowerCage mini', category: 'support', aliases: [...A, 'powercage', 'ipad', 'cage', 'mini'] },
]
