import type { CatalogProduct } from './blackmagic'

/**
 * Peplink / Pepwave — router bonding หลายซิม (SpeedFusion) ใช้ส่งสตรีมจากหน้างาน
 * ชื่อรุ่นตาม peplink.com (ก.ย. 2569) + รุ่นเก่าที่ยังใช้กันเยอะในงานไลฟ์ (MAX HD2/HD4/Transit)
 * ⚠️ จำนวน port LAN/WAN มาจากความรู้ทั่วไป — เว็บไม่ได้ระบุในหน้ารวม ตรวจกับตัวเครื่อง
 * port "CELLULAR n" ไม่ใช่สาย ใส่ไว้ให้เห็นในผังว่ากล่องนี้ bond กี่ซิม
 */
const P = 'Peplink'
const A = ['peplink', 'pepwave', 'เปปลิงค์', 'router', 'เราเตอร์', 'bonding', 'speedfusion', 'sim', 'ซิม', 'internet', 'เน็ต']

const seq = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => (n === 1 ? prefix : `${prefix} ${i + 1}`))

const r = (
  name: string,
  spec: { modems: number; tech: '5G' | 'LTE'; wan: number; lan: number; wifi?: boolean; sfp?: boolean; serial?: boolean },
  extra: string[] = [],
): CatalogProduct => ({
  brand: P, name: `Peplink ${name}`, model: name, category: 'network',
  aliases: [...A, spec.tech.toLowerCase(), `${spec.modems} ซิม`, `${spec.modems} modem`, ...extra],
  inputs: ['DC IN'],
  ios: [
    ...seq('WAN', spec.wan),
    ...seq('LAN', spec.lan),
    ...(spec.sfp ? ['SFP'] : []),
    ...(spec.serial ? ['SERIAL'] : []),
    ...Array.from({ length: spec.modems }, (_, i) => `CELLULAR ${i + 1} (${spec.tech})`),
    ...(spec.wifi === false ? [] : ['WI-FI']),
  ],
})

export const PEPLINK_PRODUCTS: CatalogProduct[] = [
  // ── BR series (ตัวเล็ก ติดรถ/กระเป๋า) ────────────────────────────────────
  r('MAX BR1 Mini', { modems: 1, tech: 'LTE', wan: 1, lan: 1 }, ['br1', 'mini']),
  r('MAX BR1 Mini 5G', { modems: 1, tech: '5G', wan: 1, lan: 1 }, ['br1', 'mini']),
  r('MAX BR1 Mini Core', { modems: 1, tech: 'LTE', wan: 1, lan: 1, wifi: false }, ['br1', 'mini', 'core', 'iot']),
  r('MAX BR1 Mini M2M', { modems: 1, tech: 'LTE', wan: 1, lan: 1, serial: true }, ['br1', 'mini', 'm2m', 'serial']),
  r('MAX BR1 Pro 5G', { modems: 1, tech: '5G', wan: 1, lan: 4 }, ['br1', 'pro']),
  r('MAX BR1 Pro CAT-20', { modems: 1, tech: 'LTE', wan: 1, lan: 4 }, ['br1', 'pro', 'cat20', 'cat-20']),
  r('BR1 Pro (5GK)', { modems: 1, tech: '5G', wan: 1, lan: 4 }, ['br1', 'pro', '5gk']),
  r('BR2 Pro (5GK)', { modems: 2, tech: '5G', wan: 1, lan: 4 }, ['br2', 'pro', '5gk', 'dual']),
  r('MAX BR2 Pro', { modems: 2, tech: '5G', wan: 2, lan: 4 }, ['br2', 'pro', 'dual']),
  r('MAX BR2', { modems: 2, tech: 'LTE', wan: 1, lan: 4 }, ['br2', 'dual']),
  r('BR2 Micro', { modems: 2, tech: 'LTE', wan: 1, lan: 1 }, ['br2', 'micro', 'dual']),
  // ── Transit (ติดรถ) ──────────────────────────────────────────────────────
  r('MAX Transit Duo Pro', { modems: 2, tech: 'LTE', wan: 1, lan: 1 }, ['transit', 'duo', 'dual', 'รถ']),
  r('MAX Transit Pro E', { modems: 1, tech: '5G', wan: 1, lan: 1 }, ['transit', 'pro e', 'รถ']),
  r('MAX Transit (รุ่นเก่า)', { modems: 1, tech: 'LTE', wan: 1, lan: 1 }, ['transit', 'cat12', 'cat18', 'รุ่นเก่า']),
  r('MAX Transit Duo (รุ่นเก่า)', { modems: 2, tech: 'LTE', wan: 1, lan: 1 }, ['transit', 'duo', 'dual', 'รุ่นเก่า']),
  // ── HD / MBX / PDX (หลายซิม — งานไลฟ์ใหญ่) ───────────────────────────────
  r('MAX HD2 (รุ่นเก่า)', { modems: 2, tech: 'LTE', wan: 1, lan: 4 }, ['hd2', 'dual', 'รุ่นเก่า']),
  r('MAX HD2 Mini (รุ่นเก่า)', { modems: 2, tech: 'LTE', wan: 1, lan: 1 }, ['hd2', 'mini', 'dual', 'รุ่นเก่า']),
  r('MAX HD4 (รุ่นเก่า)', { modems: 4, tech: 'LTE', wan: 1, lan: 4 }, ['hd4', 'quad', 'รุ่นเก่า']),
  r('MAX HD4 MBX (รุ่นเก่า)', { modems: 4, tech: 'LTE', wan: 2, lan: 4 }, ['hd4', 'mbx', 'quad', 'รุ่นเก่า']),
  r('MBX (2 modem)', { modems: 2, tech: '5G', wan: 2, lan: 4 }, ['mbx', 'dual']),
  r('MBX (4 modem)', { modems: 4, tech: '5G', wan: 2, lan: 4 }, ['mbx', 'quad']),
  r('PDX', { modems: 4, tech: '5G', wan: 1, lan: 1 }, ['pdx', 'quad', 'battery', 'แบต', 'กระเป๋า']),
  // ── Dome (outdoor ติดเสา/หลังคารถ ต่อสายเดียว PoE) ────────────────────────
  r('HD1 Dome Pro', { modems: 1, tech: '5G', wan: 0, lan: 1, wifi: false }, ['dome', 'outdoor', 'poe']),
  r('Dome Pro Duo', { modems: 2, tech: '5G', wan: 0, lan: 1, wifi: false }, ['dome', 'duo', 'outdoor', 'poe']),
  r('Dome Pro LR', { modems: 2, tech: '5G', wan: 0, lan: 1, wifi: false }, ['dome', 'lr', 'outdoor', 'poe', 'maritime']),
  // ── Balance (router สาขา/รวมเน็ตหลายสาย) ─────────────────────────────────
  r('Balance 20X', { modems: 1, tech: 'LTE', wan: 1, lan: 4 }, ['balance', '20x']),
  r('Balance 310', { modems: 0, tech: 'LTE', wan: 3, lan: 4, wifi: false }, ['balance', '310']),
  r('Balance 310 5G', { modems: 1, tech: '5G', wan: 3, lan: 4, wifi: false }, ['balance', '310']),
  r('Balance 310 Fiber 5G', { modems: 1, tech: '5G', wan: 3, lan: 4, wifi: false, sfp: true }, ['balance', '310', 'fiber']),
  r('Balance 310X', { modems: 0, tech: 'LTE', wan: 3, lan: 4, wifi: false }, ['balance', '310x']),
  r('Balance 380 (รุ่นเก่า)', { modems: 0, tech: 'LTE', wan: 3, lan: 4, wifi: false }, ['balance', '380', 'รุ่นเก่า']),
  r('Balance 580X', { modems: 0, tech: 'LTE', wan: 5, lan: 4, wifi: false, sfp: true }, ['balance', '580x']),
]
