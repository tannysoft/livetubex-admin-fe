import type { CatalogProduct } from './blackmagic'

/**
 * Hollyland — ส่งวิดีโอไร้สาย / อินเตอร์คอมไร้สาย / ไมค์ไร้สาย
 * ⚠️ port ต่อรุ่นมาจากความรู้ทั่วไป ไม่ใช่ spec sheet — ตรวจกับตัวเครื่องอีกครั้ง
 * ชุด TX/RX แยกเป็นคนละรายการ เพราะในผังระบบเป็นคนละกล่อง (ตัวส่งอยู่ที่กล้อง ตัวรับอยู่ที่สวิตเชอร์)
 */
const H = 'Hollyland'
// รวมสะกดผิดที่พบบ่อยไว้ใน alias ให้ค้นเจอ
const A = ['hollyland', 'holyland', 'wireless', 'ไร้สาย']

const tx = (name: string, ports: Pick<CatalogProduct, 'inputs' | 'outputs' | 'ios'>, extra: string[] = []): CatalogProduct =>
  ({ brand: H, name: `${name} TX (ตัวส่ง)`, model: `${name} TX`, category: 'wireless', aliases: [...A, 'tx', 'transmitter', ...extra], ...ports })
const rx = (name: string, ports: Pick<CatalogProduct, 'inputs' | 'outputs' | 'ios'>, extra: string[] = []): CatalogProduct =>
  ({ brand: H, name: `${name} RX (ตัวรับ)`, model: `${name} RX`, category: 'wireless', aliases: [...A, 'rx', 'receiver', ...extra], ...ports })

// ── อินเตอร์คอมขายเป็นชุด (SKU จริงของ Hollyland: -2S/-4S/-8S = จำนวน headset, -4B/-8B = จำนวน beltpack) ──
const IC = [...A, 'intercom', 'อินเตอร์คอม', 'set', 'ชุด']
/** master headset + (n-1) remote headsets — ไม่ต้องมี base station */
const hsSet = (line: string, n: number): CatalogProduct => ({
  brand: H, name: `${line}-${n}S (ชุด ${n} headset)`, model: `${line}-${n}S`, category: 'intercom',
  aliases: [...IC, 'headset', `${n}s`, `${n} headset`, `${n} คน`], ios: ['USB-C'],
})
/** hub + n remote headsets (C1 Pro-HUB) — hub ต่อ 4-wire/2-wire/LAN เข้าระบบอื่นได้ */
const hubSet = (line: string, n: number): CatalogProduct => ({
  brand: H, name: `${line}-HUB${n}S (Hub + ${n} headset)`, model: `${line}-HUB${n}S`, category: 'intercom',
  aliases: [...IC, 'hub', 'headset', `hub${n}s`, `${n} headset`, `${n} คน`], ios: ['4-WIRE', '2-WIRE', 'LAN', 'USB-C'],
})
/** base station + n beltpacks */
const bpSet = (line: string, n: number, baseIos: string[]): CatalogProduct => ({
  brand: H, name: `${line}-${n}B (Base + ${n} beltpack)`, model: `${line}-${n}B`, category: 'intercom',
  aliases: [...IC, 'base', 'beltpack', `${n}b`, `${n} beltpack`, `${n} คน`], ios: baseIos,
})

export const HOLLYLAND_PRODUCTS: CatalogProduct[] = [
  // ── Wireless video — Mars ────────────────────────────────────────────────
  tx('Mars 300 Pro', { inputs: ['HDMI IN'], outputs: ['HDMI LOOP OUT'] }),
  rx('Mars 300 Pro', { outputs: ['HDMI OUT'] }),
  tx('Mars 400S Pro', { inputs: ['SDI IN', 'HDMI IN'], outputs: ['SDI LOOP OUT'] }),
  rx('Mars 400S Pro', { outputs: ['SDI OUT', 'HDMI OUT'] }),
  tx('Mars 400S Pro II', { inputs: ['SDI IN', 'HDMI IN'], outputs: ['SDI LOOP OUT'] }),
  rx('Mars 400S Pro II', { outputs: ['SDI OUT', 'HDMI OUT'] }),
  tx('Mars 4K', { inputs: ['SDI IN', 'HDMI IN'], outputs: ['SDI LOOP OUT'], ios: ['USB-C'] }),
  rx('Mars 4K', { outputs: ['SDI OUT', 'HDMI OUT'], ios: ['USB-C'] }),
  { brand: H, name: 'Mars M1', category: 'monitor', aliases: [...A, 'monitor', 'rx'], inputs: ['HDMI IN', 'SDI IN'], outputs: ['HDMI OUT', 'SDI OUT'] },
  { brand: H, name: 'Mars M1 Enhanced', category: 'monitor', aliases: [...A, 'monitor', 'rx'], inputs: ['HDMI IN', 'SDI IN'], outputs: ['HDMI OUT', 'SDI OUT'] },

  // ── Wireless video — Cosmo ───────────────────────────────────────────────
  tx('Cosmo C1', { inputs: ['SDI IN', 'HDMI IN'], outputs: ['SDI LOOP OUT'] }),
  rx('Cosmo C1', { outputs: ['SDI OUT', 'HDMI OUT'] }),
  tx('Cosmo C2', { inputs: ['SDI IN', 'HDMI IN'], outputs: ['SDI LOOP OUT'] }),
  rx('Cosmo C2', { outputs: ['SDI OUT', 'HDMI OUT'] }),
  tx('Cosmo 400', { inputs: ['SDI IN', 'HDMI IN'], outputs: ['SDI LOOP OUT'] }),
  rx('Cosmo 400', { outputs: ['SDI OUT', 'HDMI OUT'] }),
  tx('Cosmo 600', { inputs: ['SDI IN', 'HDMI IN'], outputs: ['SDI LOOP OUT'] }),
  rx('Cosmo 600', { outputs: ['SDI OUT', 'HDMI OUT'] }),
  tx('Cosmo 1000', { inputs: ['SDI IN', 'HDMI IN'], outputs: ['SDI LOOP OUT'] }),
  rx('Cosmo 1000', { outputs: ['SDI OUT', 'HDMI OUT'] }),
  tx('Cosmo 2000', { inputs: ['SDI IN', 'HDMI IN'], outputs: ['SDI LOOP OUT'] }),
  rx('Cosmo 2000', { outputs: ['SDI OUT', 'HDMI OUT'] }),

  // ── Wireless video — Pyro ────────────────────────────────────────────────
  tx('Pyro S', { inputs: ['SDI IN', 'HDMI IN'], outputs: ['HDMI LOOP OUT'], ios: ['USB-C'] }),
  rx('Pyro S', { outputs: ['SDI OUT', 'HDMI OUT'], ios: ['USB-C'] }),
  tx('Pyro H', { inputs: ['HDMI IN'], outputs: ['HDMI LOOP OUT'], ios: ['USB-C'] }),
  rx('Pyro H', { outputs: ['HDMI OUT'], ios: ['USB-C'] }),
  { brand: H, name: 'Pyro 7', category: 'monitor', aliases: [...A, 'monitor', 'tx', 'rx'], inputs: ['HDMI IN', 'SDI IN'], outputs: ['HDMI OUT', 'SDI OUT'], ios: ['USB-C'] },

  // ── Wireless intercom ────────────────────────────────────────────────────
  // ชุด = 1 รายการในสต็อก (นับเป็น 1 ชุด) และเป็น 1 กล่องในผังระบบ — port คือของตัวแม่/base station
  // ตัวเดี่ยว (เพิ่ม/อะไหล่) เก็บไว้ท้ายชุดสำหรับซื้อเพิ่มทีหลัง
  // Solidcom C1 — master headset + remote headsets (ไม่ต้องมี base)
  ...[2, 3, 4, 6, 8].map((n) => hsSet('Solidcom C1', n)),
  ...[2, 3, 4, 6, 8].map((n) => hsSet('Solidcom C1 Pro', n)),
  ...[4, 6, 8].map((n) => hubSet('Solidcom C1 Pro', n)),
  ...[4, 5, 6, 8].map((n) => hsSet('Solidcom SE', n)),
  // Solidcom M1 / Mars T1000 / Syscom — base station + beltpacks
  ...[4, 8].map((n) => bpSet('Solidcom M1', n, ['4-WIRE', '2-WIRE', 'LAN', 'CASCADE'])),
  ...[4].map((n) => bpSet('Mars T1000', n, ['4-WIRE', '2-WIRE', 'TALLY', 'CASCADE'])),
  ...[4, 8].map((n) => bpSet('Syscom 1000T', n, ['4-WIRE', '2-WIRE', 'TALLY', 'CASCADE', 'LAN'])),
  ...[4, 8].map((n) => bpSet('Syscom 421', n, ['4-WIRE', '2-WIRE', 'TALLY'])),
  // ตัวเดี่ยว — ซื้อเพิ่ม / อะไหล่
  { brand: H, name: 'Solidcom C1 Remote Headset (เพิ่ม/อะไหล่)', model: 'Solidcom C1 Remote', category: 'intercom', aliases: [...A, 'intercom', 'headset', 'spare'] },
  { brand: H, name: 'Solidcom C1 Pro Remote Headset (เพิ่ม/อะไหล่)', model: 'Solidcom C1 Pro Remote', category: 'intercom', aliases: [...A, 'intercom', 'headset', 'spare'] },
  { brand: H, name: 'Solidcom C1 Pro Hub (แยก)', model: 'Solidcom C1 Pro Hub', category: 'intercom', aliases: [...A, 'intercom', 'hub'], ios: ['4-WIRE', '2-WIRE', 'LAN', 'USB-C'] },
  { brand: H, name: 'Solidcom SE Remote Headset (เพิ่ม/อะไหล่)', model: 'Solidcom SE Remote', category: 'intercom', aliases: [...A, 'intercom', 'headset', 'spare'] },
  { brand: H, name: 'Solidcom M1 Beltpack (เพิ่ม/อะไหล่)', model: 'Solidcom M1 Beltpack', category: 'intercom', aliases: [...A, 'intercom', 'beltpack', 'spare'], ios: ['HEADSET'] },
  { brand: H, name: 'Mars T1000 Beltpack (เพิ่ม/อะไหล่)', model: 'Mars T1000 Beltpack', category: 'intercom', aliases: [...A, 'intercom', 'beltpack', 'spare'], ios: ['HEADSET'] },
  { brand: H, name: 'Syscom 1000T Beltpack (เพิ่ม/อะไหล่)', model: 'Syscom 1000T Beltpack', category: 'intercom', aliases: [...A, 'intercom', 'beltpack', 'spare'], ios: ['HEADSET'] },
  { brand: H, name: 'Syscom 421 Beltpack (เพิ่ม/อะไหล่)', model: 'Syscom 421 Beltpack', category: 'intercom', aliases: [...A, 'intercom', 'beltpack', 'spare'], ios: ['HEADSET'] },
  { brand: H, name: 'Wireless Tally System', category: 'intercom', aliases: [...A, 'tally'], ios: ['GPIO', 'LAN'] },

  // ── Wireless microphones ─────────────────────────────────────────────────
  { brand: H, name: 'Lark M1', category: 'audio', aliases: [...A, 'mic', 'ไมค์'], outputs: ['3.5mm OUT'] },
  { brand: H, name: 'Lark M2', category: 'audio', aliases: [...A, 'mic', 'ไมค์'], outputs: ['3.5mm OUT'] },
  { brand: H, name: 'Lark M2S', category: 'audio', aliases: [...A, 'mic', 'ไมค์'], outputs: ['3.5mm OUT'] },
  { brand: H, name: 'Lark Max', category: 'audio', aliases: [...A, 'mic', 'ไมค์'], outputs: ['3.5mm OUT'], ios: ['USB-C'] },
  { brand: H, name: 'Lark Max 2', category: 'audio', aliases: [...A, 'mic', 'ไมค์'], outputs: ['3.5mm OUT'], ios: ['USB-C'] },
  { brand: H, name: 'Lark 150', category: 'audio', aliases: [...A, 'mic', 'ไมค์'], outputs: ['3.5mm OUT'] },
  { brand: H, name: 'Lark C1', category: 'audio', aliases: [...A, 'mic', 'ไมค์'], outputs: ['LIGHTNING / USB-C'] },
  { brand: H, name: 'Lark A1', category: 'audio', aliases: [...A, 'mic', 'ไมค์'], outputs: ['USB-C'] },
]
