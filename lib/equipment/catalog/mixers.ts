import type { CatalogProduct } from './blackmagic'

/**
 * มิกเซอร์เสียง — Yamaha, Allen & Heath, Zoom (LiveTrak / PodTrak / Field recorder)
 * ⚠️ port ต่อรุ่นมาจากความรู้ทั่วไป ไม่ใช่ spec sheet — ตรวจกับตัวเครื่องอีกครั้ง
 * ช่อง stereo นับเป็น 1 port (เช่น "ST IN 9/10") ให้กล่องในผังไม่ยาวเกิน
 */
const seq = (prefix: string, n: number, from = 1) => Array.from({ length: n }, (_, i) => `${prefix} ${from + i}`)
const MX = ['mixer', 'มิกเซอร์', 'mixing console', 'เสียง']

// ── Yamaha ───────────────────────────────────────────────────────────────
const Y = 'Yamaha'
const YA = [...MX, 'yamaha', 'ยามาฮ่า']
const mg = (name: string, mono: number, stereo: string[], groups: number, aux: number, usb: boolean): CatalogProduct => ({
  brand: Y, name, category: 'audio', aliases: [...YA, 'mg', name.toLowerCase().replace(/\s+/g, '')],
  inputs: [...seq('MIC/LINE IN', mono), ...stereo],
  outputs: ['STEREO OUT L', 'STEREO OUT R', ...seq('GROUP', groups), ...seq('AUX', aux), 'MONITOR OUT', 'PHONES'],
  ios: usb ? ['USB'] : [],
})

const YAMAHA: CatalogProduct[] = [
  mg('Yamaha MG06', 2, ['ST IN 3/4', 'ST IN 5/6'], 0, 0, false),
  mg('Yamaha MG10', 4, ['ST IN 5/6', 'ST IN 7/8', 'ST IN 9/10'], 0, 1, false),
  mg('Yamaha MG10XU', 4, ['ST IN 5/6', 'ST IN 7/8', 'ST IN 9/10'], 0, 1, true),
  mg('Yamaha MG12', 4, ['ST IN 5/6', 'ST IN 7/8', 'ST IN 9/10', 'ST IN 11/12'], 2, 2, false),
  mg('Yamaha MG12XU', 4, ['ST IN 5/6', 'ST IN 7/8', 'ST IN 9/10', 'ST IN 11/12'], 2, 2, true),
  mg('Yamaha MG16', 8, ['ST IN 9/10', 'ST IN 11/12', 'ST IN 13/14', 'ST IN 15/16'], 4, 4, false),
  mg('Yamaha MG16XU', 8, ['ST IN 9/10', 'ST IN 11/12', 'ST IN 13/14', 'ST IN 15/16'], 4, 4, true),
  mg('Yamaha MG20', 12, ['ST IN 13/14', 'ST IN 15/16', 'ST IN 17/18', 'ST IN 19/20'], 4, 4, false),
  mg('Yamaha MG20XU', 12, ['ST IN 13/14', 'ST IN 15/16', 'ST IN 17/18', 'ST IN 19/20'], 4, 4, true),
  { brand: Y, name: 'Yamaha TF1', category: 'audio', aliases: [...YA, 'tf', 'digital', 'ดิจิทัล'],
    inputs: [...seq('MIC/LINE IN', 16), 'ST IN L', 'ST IN R'], outputs: ['ST OUT L', 'ST OUT R', ...seq('OMNI OUT', 16)], ios: ['NETWORK', 'USB', 'NY64-D SLOT (Dante)'] },
  { brand: Y, name: 'Yamaha TF3', category: 'audio', aliases: [...YA, 'tf', 'digital', 'ดิจิทัล'],
    inputs: [...seq('MIC/LINE IN', 24), 'ST IN L', 'ST IN R'], outputs: ['ST OUT L', 'ST OUT R', ...seq('OMNI OUT', 16)], ios: ['NETWORK', 'USB', 'NY64-D SLOT (Dante)'] },
  { brand: Y, name: 'Yamaha TF5', category: 'audio', aliases: [...YA, 'tf', 'digital', 'ดิจิทัล'],
    inputs: [...seq('MIC/LINE IN', 32), 'ST IN L', 'ST IN R'], outputs: ['ST OUT L', 'ST OUT R', ...seq('OMNI OUT', 16)], ios: ['NETWORK', 'USB', 'NY64-D SLOT (Dante)'] },
  { brand: Y, name: 'Yamaha DM3 Standard', category: 'audio', aliases: [...YA, 'dm3', 'digital', 'ดิจิทัล'],
    inputs: [...seq('MIC/LINE IN', 16), 'ST IN L', 'ST IN R'], outputs: [...seq('OMNI OUT', 8), 'PHONES'], ios: ['NETWORK', 'USB'] },
  { brand: Y, name: 'Yamaha DM3', category: 'audio', aliases: [...YA, 'dm3', 'digital', 'ดิจิทัล', 'dante'],
    inputs: [...seq('MIC/LINE IN', 16), 'ST IN L', 'ST IN R'], outputs: [...seq('OMNI OUT', 8), 'PHONES'], ios: ['DANTE PRIMARY', 'DANTE SECONDARY', 'NETWORK', 'USB'] },
]

// ── Allen & Heath ────────────────────────────────────────────────────────
const AH = 'Allen & Heath'
const AHA = [...MX, 'allen', 'heath', 'allen heath', 'a&h', 'ah', 'อัลเลน']
const qu = (name: string, mics: number, extra: string[]): CatalogProduct => ({
  brand: AH, name, category: 'audio', aliases: [...AHA, 'qu', name.toLowerCase().replace(/[\s-]+/g, ''), ...extra],
  inputs: [...seq('MIC/LINE IN', mics), 'ST IN 1', 'ST IN 2', 'ST IN 3'],
  outputs: ['MAIN L', 'MAIN R', ...seq('MIX OUT', 10), 'ALT OUT L', 'ALT OUT R', 'PHONES'],
  ios: ['dSNAKE', 'NETWORK', 'USB-B (audio)', 'USB-A (record)'],
})

const ALLEN_HEATH: CatalogProduct[] = [
  qu('Allen & Heath QU-16', 16, ['qu16', 'qu 16']),
  qu('Allen & Heath QU-24', 24, ['qu24', 'qu 24']),
  qu('Allen & Heath QU-32', 32, ['qu32', 'qu 32']),
  { brand: AH, name: 'Allen & Heath QU-SB', category: 'audio', aliases: [...AHA, 'qu', 'qusb', 'stagebox'],
    inputs: [...seq('MIC/LINE IN', 16), 'ST IN'], outputs: ['MAIN L', 'MAIN R', ...seq('MIX OUT', 12)], ios: ['dSNAKE', 'NETWORK', 'USB'] },
  { brand: AH, name: 'Allen & Heath QU-PAC', category: 'audio', aliases: [...AHA, 'qu', 'qupac', 'rack'],
    inputs: [...seq('MIC/LINE IN', 16), 'ST IN 1', 'ST IN 2', 'ST IN 3'], outputs: ['MAIN L', 'MAIN R', ...seq('MIX OUT', 10)], ios: ['dSNAKE', 'NETWORK', 'USB'] },
  // Qu-5/6/7 = รุ่นใหม่แทน QU-16/24/32
  qu('Allen & Heath Qu-5', 16, ['qu5', 'qu 5', 'ใหม่']),
  qu('Allen & Heath Qu-6', 24, ['qu6', 'qu 6', 'ใหม่']),
  qu('Allen & Heath Qu-7', 32, ['qu7', 'qu 7', 'ใหม่']),
  { brand: AH, name: 'Allen & Heath SQ-5', category: 'audio', aliases: [...AHA, 'sq', 'sq5'],
    inputs: seq('MIC/LINE IN', 16), outputs: seq('LINE OUT', 12), ios: ['SLINK', 'NETWORK', 'USB', 'I/O SLOT (Dante)'] },
  { brand: AH, name: 'Allen & Heath SQ-6', category: 'audio', aliases: [...AHA, 'sq', 'sq6'],
    inputs: seq('MIC/LINE IN', 24), outputs: seq('LINE OUT', 14), ios: ['SLINK', 'NETWORK', 'USB', 'I/O SLOT (Dante)'] },
  { brand: AH, name: 'Allen & Heath SQ-7', category: 'audio', aliases: [...AHA, 'sq', 'sq7'],
    inputs: seq('MIC/LINE IN', 32), outputs: seq('LINE OUT', 16), ios: ['SLINK', 'NETWORK', 'USB', 'I/O SLOT (Dante)'] },
  { brand: AH, name: 'Allen & Heath CQ-12T', category: 'audio', aliases: [...AHA, 'cq', 'cq12t'],
    inputs: [...seq('MIC/LINE IN', 8), 'ST IN'], outputs: ['MAIN L', 'MAIN R', ...seq('OUT', 4)], ios: ['USB-C', 'USB-A', 'WIFI'] },
  { brand: AH, name: 'Allen & Heath CQ-18T', category: 'audio', aliases: [...AHA, 'cq', 'cq18t'],
    inputs: [...seq('MIC/LINE IN', 16), 'ST IN'], outputs: ['MAIN L', 'MAIN R', ...seq('OUT', 6)], ios: ['USB-C', 'USB-A', 'NETWORK', 'WIFI'] },
  { brand: AH, name: 'Allen & Heath CQ-20B', category: 'audio', aliases: [...AHA, 'cq', 'cq20b'],
    inputs: [...seq('MIC/LINE IN', 16), 'ST IN'], outputs: ['MAIN L', 'MAIN R', ...seq('OUT', 6)], ios: ['USB-C', 'USB-A', 'NETWORK', 'WIFI'] },
  { brand: AH, name: 'Allen & Heath ZEDi-10', category: 'audio', aliases: [...AHA, 'zed', 'zedi10'],
    inputs: [...seq('MIC/LINE IN', 4), 'ST IN 1', 'ST IN 2'], outputs: ['MAIN L', 'MAIN R', 'MONITOR OUT', 'PHONES'], ios: ['USB'] },
  { brand: AH, name: 'Allen & Heath ZED-12FX', category: 'audio', aliases: [...AHA, 'zed', 'zed12fx'],
    inputs: [...seq('MIC/LINE IN', 6), 'ST IN 1', 'ST IN 2', 'ST IN 3'], outputs: ['MAIN L', 'MAIN R', 'GROUP 1', 'GROUP 2', 'AUX 1', 'AUX 2', 'PHONES'], ios: ['USB'] },
  { brand: AH, name: 'Allen & Heath ZED-22FX', category: 'audio', aliases: [...AHA, 'zed', 'zed22fx'],
    inputs: [...seq('MIC/LINE IN', 16), 'ST IN 1', 'ST IN 2', 'ST IN 3'], outputs: ['MAIN L', 'MAIN R', ...seq('GROUP', 4), ...seq('AUX', 4), 'PHONES'], ios: ['USB'] },
]

// ── Zoom ─────────────────────────────────────────────────────────────────
const Z = 'Zoom'
const ZA = ['zoom', 'ซูม']
const ZOOM: CatalogProduct[] = [
  { brand: Z, name: 'Zoom LiveTrak L-6', category: 'audio', aliases: [...ZA, ...MX, 'livetrak', 'l6'],
    inputs: [...seq('MIC/LINE IN', 4), 'ST IN 5/6'], outputs: ['MAIN L', 'MAIN R', 'PHONES 1', 'PHONES 2'], ios: ['USB-C'] },
  { brand: Z, name: 'Zoom LiveTrak L-8', category: 'audio', aliases: [...ZA, ...MX, 'livetrak', 'l8', 'podcast'],
    inputs: [...seq('MIC/LINE IN', 6), 'ST IN 7/8'], outputs: ['MAIN L', 'MAIN R', ...seq('PHONES', 4)], ios: ['USB-C', 'PHONE (3.5mm)'] },
  { brand: Z, name: 'Zoom LiveTrak L-12', category: 'audio', aliases: [...ZA, ...MX, 'livetrak', 'l12'],
    inputs: [...seq('MIC/LINE IN', 8), 'ST IN 9/10', 'ST IN 11/12'], outputs: ['MAIN L', 'MAIN R', ...seq('MONITOR OUT', 5)], ios: ['USB'] },
  { brand: Z, name: 'Zoom LiveTrak L-20', category: 'audio', aliases: [...ZA, ...MX, 'livetrak', 'l20'],
    inputs: [...seq('MIC/LINE IN', 16), 'ST IN 17/18', 'ST IN 19/20'], outputs: ['MAIN L', 'MAIN R', ...seq('MONITOR OUT', 6)], ios: ['USB'] },
  { brand: Z, name: 'Zoom LiveTrak L-20R', category: 'audio', aliases: [...ZA, ...MX, 'livetrak', 'l20r', 'rack'],
    inputs: [...seq('MIC/LINE IN', 16), 'ST IN 17/18', 'ST IN 19/20'], outputs: ['MAIN L', 'MAIN R', ...seq('MONITOR OUT', 6)], ios: ['USB'] },
  { brand: Z, name: 'Zoom PodTrak P4', category: 'audio', aliases: [...ZA, ...MX, 'podtrak', 'p4', 'podcast'],
    inputs: seq('MIC IN', 4), outputs: seq('PHONES', 4), ios: ['USB-C', 'PHONE (3.5mm)'] },
  { brand: Z, name: 'Zoom PodTrak P8', category: 'audio', aliases: [...ZA, ...MX, 'podtrak', 'p8', 'podcast'],
    inputs: seq('MIC IN', 6), outputs: seq('PHONES', 6), ios: ['USB-C', 'PHONE (3.5mm)'] },
  { brand: Z, name: 'Zoom F3', category: 'recorder', aliases: [...ZA, 'field recorder', 'f3', '32bit'],
    inputs: ['XLR IN 1', 'XLR IN 2'], outputs: ['LINE/PHONES'], ios: ['USB-C'] },
  { brand: Z, name: 'Zoom F6', category: 'recorder', aliases: [...ZA, ...MX, 'field recorder', 'f6', '32bit'],
    inputs: seq('XLR IN', 6), outputs: ['MAIN OUT L', 'MAIN OUT R', 'SUB OUT', 'PHONES'], ios: ['USB-C', 'TIMECODE'] },
  { brand: Z, name: 'Zoom F8n Pro', category: 'recorder', aliases: [...ZA, ...MX, 'field recorder', 'f8', 'f8n', '32bit'],
    inputs: seq('XLR IN', 8), outputs: ['MAIN OUT L', 'MAIN OUT R', 'SUB OUT', 'PHONES'], ios: ['USB-C', 'TIMECODE'] },
  { brand: Z, name: 'Zoom H6essential', category: 'recorder', aliases: [...ZA, 'handy recorder', 'h6', '32bit'],
    inputs: seq('XLR IN', 4), outputs: ['LINE/PHONES'], ios: ['USB-C'] },
]

export const MIXER_PRODUCTS: CatalogProduct[] = [...YAMAHA, ...ALLEN_HEATH, ...ZOOM]
