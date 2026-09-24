import type { CatalogProduct } from './blackmagic'

/**
 * ADAM Audio — ลำโพงมอนิเตอร์สตูดิโอ (active) + ซับวูฟเฟอร์
 * ⚠️ port ต่อรุ่นมาจากความรู้ทั่วไป ไม่ใช่ spec sheet — ตรวจกับตัวเครื่องอีกครั้ง
 * ราคาในคลัง = ต่อข้าง (ร้านไทยมักขายเป็นคู่ — ดู prices.ts)
 */
const AD = 'ADAM Audio'
const A = ['adam', 'adam audio', 'อดัม', 'monitor speaker', 'ลำโพง', 'ลำโพงมอนิเตอร์', 'studio monitor']

const spk = (name: string, ports: Pick<CatalogProduct, 'inputs' | 'outputs' | 'ios'>, extra: string[] = []): CatalogProduct =>
  ({ brand: AD, name, category: 'audio', aliases: [...A, ...extra], ...ports })
const XLR_RCA = { inputs: ['XLR IN', 'RCA IN', 'AC IN'] }
const XLR_NET = { inputs: ['XLR IN', 'AC IN'], ios: ['ETHERNET (A Control)'] }

export const ADAM_AUDIO_PRODUCTS: CatalogProduct[] = [
  // ── T Series (entry) ─────────────────────────────────────────────────────
  spk('T5V', XLR_RCA, ['t series', '5 นิ้ว']),
  spk('T7V', XLR_RCA, ['t series', '7 นิ้ว']),
  spk('T8V', XLR_RCA, ['t series', '8 นิ้ว']),
  spk('T10S (Subwoofer)', { inputs: ['XLR IN L', 'XLR IN R', 'RCA IN L', 'RCA IN R', 'AC IN'], outputs: ['XLR OUT L', 'XLR OUT R'] }, ['t series', 'sub', 'ซับ']),
  // ── D Series (desktop) ───────────────────────────────────────────────────
  spk('D3V', { inputs: ['TRS IN', 'RCA IN', 'USB-C', 'AC IN'], outputs: ['SUB OUT'] }, ['d series', 'desktop', 'usb']),
  // ── A Series (AV / AH) ───────────────────────────────────────────────────
  spk('A4V', XLR_NET, ['a series', '4 นิ้ว']),
  spk('A7V', XLR_NET, ['a series', '7 นิ้ว']),
  spk('A8H', XLR_NET, ['a series', '8 นิ้ว', 'horizontal', '3 way']),
  spk('A44H', XLR_NET, ['a series', 'horizontal']),
  spk('A77H', XLR_NET, ['a series', 'horizontal']),
  // ── S Series (main / midfield) ───────────────────────────────────────────
  spk('S2V', XLR_NET, ['s series']),
  spk('S3V', XLR_NET, ['s series']),
  spk('S3H', XLR_NET, ['s series', 'horizontal']),
  spk('S5V', XLR_NET, ['s series', 'main monitor']),
  spk('S5H', XLR_NET, ['s series', 'horizontal', 'main monitor']),
  // ── Subwoofers ───────────────────────────────────────────────────────────
  spk('Sub7 (Subwoofer)', { inputs: ['XLR IN L', 'XLR IN R', 'RCA IN L', 'RCA IN R', 'AC IN'], outputs: ['XLR OUT L', 'XLR OUT R'] }, ['sub', 'ซับ']),
  spk('Sub8 (Subwoofer)', { inputs: ['XLR IN L', 'XLR IN R', 'RCA IN L', 'RCA IN R', 'AC IN'], outputs: ['XLR OUT L', 'XLR OUT R'] }, ['sub', 'ซับ']),
  spk('Sub10 Mk2 (Subwoofer)', { inputs: ['XLR IN L', 'XLR IN R', 'AC IN'], outputs: ['XLR OUT L', 'XLR OUT R'] }, ['sub', 'ซับ']),
  spk('Sub12 (Subwoofer)', { inputs: ['XLR IN L', 'XLR IN R', 'AC IN'], outputs: ['XLR OUT L', 'XLR OUT R'] }, ['sub', 'ซับ']),
  spk('Sub15 (Subwoofer)', { inputs: ['XLR IN L', 'XLR IN R', 'AC IN'], outputs: ['XLR OUT L', 'XLR OUT R'] }, ['sub', 'ซับ']),
  // ── Headphones ───────────────────────────────────────────────────────────
  { brand: AD, name: 'H200 (Headphones)', model: 'H200', category: 'audio', aliases: [...A, 'headphone', 'หูฟัง'], inputs: ['3.5mm / 6.3mm'] },
  { brand: AD, name: 'Studio Pro SP-5 (Headphones)', model: 'SP-5', category: 'audio', aliases: [...A, 'headphone', 'หูฟัง', 'sp5'], inputs: ['3.5mm / 6.3mm'] },
]
