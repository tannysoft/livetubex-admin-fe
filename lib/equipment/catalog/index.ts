import { BLACKMAGIC_PRODUCTS, type CatalogProduct } from './blackmagic'
import { HOLLYLAND_PRODUCTS } from './hollyland'
import { NAYA_PRODUCTS } from './naya'
import { ADAM_AUDIO_PRODUCTS } from './adam-audio'
import { FOCUSRITE_PRODUCTS } from './focusrite'
import { SONY_PRODUCTS } from './sony'
import { DJI_PRODUCTS } from './dji'
import { MIXER_PRODUCTS } from './mixers'
import { VAXIS_PRODUCTS } from './vaxis'
import { SWIT_PRODUCTS } from './swit'
import { ACCSOON_PRODUCTS } from './accsoon'
import { PEPLINK_PRODUCTS } from './peplink'
import { PANASONIC_PRODUCTS } from './panasonic'
import { AVMATRIX_PRODUCTS } from './avmatrix'
import { AJA_PRODUCTS } from './aja'
import { PRICE_THB } from './prices'

export type { CatalogProduct }

/** ยี่ห้อที่มีในแค็ตตาล็อก — ไว้โชว์ใน placeholder/คำอธิบาย */
export const CATALOG_BRANDS = ['Blackmagic Design', 'Sony', 'Panasonic', 'DJI', 'Hollyland', 'Vaxis', 'SWIT', 'Accsoon', 'Peplink', 'AVMATRIX', 'AJA', 'NAYA', 'Yamaha', 'Allen & Heath', 'Zoom', 'ADAM Audio', 'Focusrite']

/** รวมทุกยี่ห้อ — เพิ่มยี่ห้อใหม่ที่นี่ · ราคาแยกไว้ที่ prices.ts (key = name) แล้วรวมเข้าตรงนี้ */
export const PRODUCT_CATALOG: CatalogProduct[] = [
  ...BLACKMAGIC_PRODUCTS, ...HOLLYLAND_PRODUCTS, ...NAYA_PRODUCTS, ...ADAM_AUDIO_PRODUCTS, ...FOCUSRITE_PRODUCTS,
  ...SONY_PRODUCTS, ...DJI_PRODUCTS, ...MIXER_PRODUCTS, ...VAXIS_PRODUCTS, ...SWIT_PRODUCTS, ...ACCSOON_PRODUCTS, ...PEPLINK_PRODUCTS, ...PANASONIC_PRODUCTS, ...AVMATRIX_PRODUCTS, ...AJA_PRODUCTS,
].map((p) => {
  const entry = PRICE_THB[p.name]
  if (entry == null) return p
  return Array.isArray(entry) ? { ...p, price: entry[0], priceNote: entry[1] } : { ...p, price: entry }
})

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9ก-๙]+/g, ' ').trim()
// แบบไม่มีช่องว่าง — "m/e" กลายเป็น "me", "12g-sdi" เป็น "12gsdi" ให้พิมพ์แบบไหนก็เจอ
const joined = (s: string) => s.toLowerCase().replace(/[^a-z0-9ก-๙]+/g, '')

/**
 * ค้นแบบทุกคำต้องเจอ (AND) ในชื่อ/รุ่น/ยี่ห้อ/alias — "atem 4 me" เจอ "ATEM 4 M/E Constellation HD"
 * เรียงให้ชื่อที่ "เริ่มด้วย" คำค้นมาก่อน แล้วค่อยชื่อสั้น (รุ่นพื้นฐานมาก่อนรุ่น Pro/ISO)
 */
export function searchCatalog(query: string, limit = 8): CatalogProduct[] {
  const words = norm(query).split(' ').filter(Boolean)
  if (words.length === 0) return []
  const q = joined(query)
  return PRODUCT_CATALOG
    .map((p) => {
      const text = [p.name, p.model ?? '', p.brand, ...(p.aliases ?? [])].join(' ')
      const spaced = norm(text)
      const tight = joined(text)
      if (!words.every((w) => spaced.includes(w) || tight.includes(joined(w)))) return null
      const nameTight = joined(p.name)
      const score = (nameTight.startsWith(q) ? 0 : nameTight.startsWith(joined(words[0])) ? 1 : 2) * 1000 + nameTight.length
      return { p, score }
    })
    .filter((x): x is { p: CatalogProduct; score: number } => !!x)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((x) => x.p)
}
