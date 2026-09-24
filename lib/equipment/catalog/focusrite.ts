import type { CatalogProduct } from './blackmagic'

/**
 * Focusrite — audio interface (Scarlett / Clarett+ / Red), preamp (ISA), Dante (RedNet), Vocaster
 * ⚠️ port ต่อรุ่นมาจากความรู้ทั่วไป ไม่ใช่ spec sheet — ตรวจกับตัวเครื่องอีกครั้ง
 * ชื่อ "4th Gen" คือรุ่นปัจจุบัน — รุ่นเก่า (3rd Gen) ใส่ไว้ให้เพราะยังใช้กันเยอะ
 */
const F = 'Focusrite'
const A = ['focusrite', 'โฟกัสไรท์', 'audio interface', 'อินเตอร์เฟส', 'usb audio']

const seq = (prefix: string, n: number, from = 1) => Array.from({ length: n }, (_, i) => `${prefix} ${from + i}`)
const fr = (name: string, ports: Pick<CatalogProduct, 'inputs' | 'outputs' | 'ios'>, extra: string[] = [], model?: string): CatalogProduct =>
  ({ brand: F, name, model, category: 'audio', aliases: [...A, ...extra], ...ports })

export const FOCUSRITE_PRODUCTS: CatalogProduct[] = [
  // ── Scarlett 4th Gen ─────────────────────────────────────────────────────
  fr('Scarlett Solo 4th Gen', { inputs: ['MIC IN (XLR)', 'INST IN'], outputs: ['LINE OUT L', 'LINE OUT R', 'HEADPHONE'], ios: ['USB-C'] }, ['scarlett', 'solo', '4th', 'gen 4']),
  fr('Scarlett 2i2 4th Gen', { inputs: ['IN 1 (XLR/TRS)', 'IN 2 (XLR/TRS)'], outputs: ['LINE OUT L', 'LINE OUT R', 'HEADPHONE'], ios: ['USB-C'] }, ['scarlett', '2i2', '4th', 'gen 4']),
  fr('Scarlett 4i4 4th Gen', { inputs: ['IN 1 (XLR/TRS)', 'IN 2 (XLR/TRS)', 'LINE IN 3', 'LINE IN 4'], outputs: [...seq('LINE OUT', 4), 'HEADPHONE'], ios: ['USB-C', 'MIDI'] }, ['scarlett', '4i4', '4th', 'gen 4']),
  fr('Scarlett 16i16 4th Gen', { inputs: [...seq('MIC/LINE IN', 2), ...seq('LINE IN', 4, 3), 'ADAT IN', 'S/PDIF IN'], outputs: [...seq('LINE OUT', 4), 'ADAT OUT', 'S/PDIF OUT', 'HEADPHONE 1', 'HEADPHONE 2'], ios: ['USB-C', 'MIDI'] }, ['scarlett', '16i16', '4th', 'gen 4', 'rack']),
  fr('Scarlett 18i16 4th Gen', { inputs: [...seq('MIC/LINE IN', 4), ...seq('LINE IN', 4, 5), 'ADAT IN', 'S/PDIF IN'], outputs: [...seq('LINE OUT', 8), 'ADAT OUT', 'S/PDIF OUT', 'HEADPHONE 1', 'HEADPHONE 2'], ios: ['USB-C', 'MIDI'] }, ['scarlett', '18i16', '4th', 'gen 4', 'rack']),
  fr('Scarlett 18i20 4th Gen', { inputs: [...seq('MIC/LINE IN', 8), 'ADAT IN 1', 'ADAT IN 2', 'S/PDIF IN'], outputs: [...seq('LINE OUT', 10), 'ADAT OUT 1', 'ADAT OUT 2', 'S/PDIF OUT', 'HEADPHONE 1', 'HEADPHONE 2', 'WORD CLOCK OUT'], ios: ['USB-C', 'MIDI'] }, ['scarlett', '18i20', '4th', 'gen 4', 'rack']),
  fr('Scarlett OctoPre', { inputs: seq('MIC/LINE IN', 8), outputs: [...seq('LINE OUT', 8), 'ADAT OUT'], ios: ['WORD CLOCK'] }, ['scarlett', 'octopre', 'preamp', 'adat']),
  fr('Scarlett OctoPre Dynamic', { inputs: seq('MIC/LINE IN', 8), outputs: [...seq('LINE OUT', 8), 'ADAT OUT'], ios: ['ADAT IN', 'WORD CLOCK'] }, ['scarlett', 'octopre', 'preamp', 'adat']),
  // ── Scarlett 3rd Gen (รุ่นเก่า ยังใช้เยอะ) ───────────────────────────────
  fr('Scarlett Solo 3rd Gen', { inputs: ['MIC IN (XLR)', 'INST IN'], outputs: ['LINE OUT L', 'LINE OUT R', 'HEADPHONE'], ios: ['USB-C'] }, ['scarlett', 'solo', '3rd', 'gen 3', 'รุ่นเก่า']),
  fr('Scarlett 2i2 3rd Gen', { inputs: ['IN 1 (XLR/TRS)', 'IN 2 (XLR/TRS)'], outputs: ['LINE OUT L', 'LINE OUT R', 'HEADPHONE'], ios: ['USB-C'] }, ['scarlett', '2i2', '3rd', 'gen 3', 'รุ่นเก่า']),
  fr('Scarlett 4i4 3rd Gen', { inputs: ['IN 1 (XLR/TRS)', 'IN 2 (XLR/TRS)', 'LINE IN 3', 'LINE IN 4'], outputs: [...seq('LINE OUT', 4), 'HEADPHONE'], ios: ['USB-C', 'MIDI'] }, ['scarlett', '4i4', '3rd', 'gen 3', 'รุ่นเก่า']),
  fr('Scarlett 8i6 3rd Gen', { inputs: ['IN 1 (XLR/TRS)', 'IN 2 (XLR/TRS)', ...seq('LINE IN', 4, 3), 'S/PDIF IN'], outputs: [...seq('LINE OUT', 4), 'S/PDIF OUT', 'HEADPHONE 1', 'HEADPHONE 2'], ios: ['USB-C', 'MIDI'] }, ['scarlett', '8i6', '3rd', 'gen 3', 'รุ่นเก่า']),
  fr('Scarlett 18i8 3rd Gen', { inputs: [...seq('MIC/LINE IN', 4), ...seq('LINE IN', 4, 5), 'ADAT IN', 'S/PDIF IN'], outputs: [...seq('LINE OUT', 4), 'S/PDIF OUT', 'HEADPHONE 1', 'HEADPHONE 2'], ios: ['USB-C', 'MIDI'] }, ['scarlett', '18i8', '3rd', 'gen 3', 'รุ่นเก่า']),
  fr('Scarlett 18i20 3rd Gen', { inputs: [...seq('MIC/LINE IN', 8), 'ADAT IN 1', 'ADAT IN 2', 'S/PDIF IN'], outputs: [...seq('LINE OUT', 10), 'ADAT OUT 1', 'ADAT OUT 2', 'S/PDIF OUT', 'HEADPHONE 1', 'HEADPHONE 2', 'WORD CLOCK OUT'], ios: ['USB-C', 'MIDI'] }, ['scarlett', '18i20', '3rd', 'gen 3', 'รุ่นเก่า', 'rack']),
  // ── Clarett+ ─────────────────────────────────────────────────────────────
  fr('Clarett+ 2Pre', { inputs: ['IN 1 (XLR/TRS)', 'IN 2 (XLR/TRS)', 'ADAT IN'], outputs: [...seq('LINE OUT', 4), 'HEADPHONE'], ios: ['USB-C', 'MIDI'] }, ['clarett', 'clarett plus', '2pre']),
  fr('Clarett+ 4Pre', { inputs: [...seq('MIC/LINE IN', 4), ...seq('LINE IN', 4, 5), 'ADAT IN', 'S/PDIF IN'], outputs: [...seq('LINE OUT', 4), 'S/PDIF OUT', 'HEADPHONE 1', 'HEADPHONE 2'], ios: ['USB-C', 'MIDI'] }, ['clarett', 'clarett plus', '4pre']),
  fr('Clarett+ 8Pre', { inputs: [...seq('MIC/LINE IN', 8), 'ADAT IN 1', 'ADAT IN 2', 'S/PDIF IN'], outputs: [...seq('LINE OUT', 10), 'ADAT OUT 1', 'ADAT OUT 2', 'S/PDIF OUT', 'HEADPHONE 1', 'HEADPHONE 2', 'WORD CLOCK OUT'], ios: ['USB-C', 'MIDI'] }, ['clarett', 'clarett plus', '8pre', 'rack']),
  fr('Clarett+ OctoPre', { inputs: seq('MIC/LINE IN', 8), outputs: [...seq('LINE OUT', 8), 'ADAT OUT 1', 'ADAT OUT 2'], ios: ['ADAT IN', 'WORD CLOCK'] }, ['clarett', 'clarett plus', 'octopre', 'preamp', 'adat']),
  // ── Red (Thunderbolt / Dante / Pro Tools HD) ─────────────────────────────
  fr('Red 4Pre', { inputs: [...seq('MIC/LINE IN', 4), ...seq('LINE IN', 4, 5), 'ADAT IN 1', 'ADAT IN 2', 'S/PDIF IN'], outputs: [...seq('LINE OUT', 8), 'ADAT OUT 1', 'ADAT OUT 2', 'S/PDIF OUT', 'HEADPHONE 1', 'HEADPHONE 2'], ios: ['THUNDERBOLT 1', 'THUNDERBOLT 2', 'DANTE (RJ45) 1', 'DANTE (RJ45) 2', 'DIGILINK', 'WORD CLOCK'] }, ['red', 'thunderbolt', 'dante', '4pre']),
  fr('Red 8Pre', { inputs: [...seq('MIC/LINE IN', 8), ...seq('LINE IN', 8, 9), 'ADAT IN 1', 'ADAT IN 2', 'S/PDIF IN'], outputs: [...seq('LINE OUT', 16), 'ADAT OUT 1', 'ADAT OUT 2', 'S/PDIF OUT', 'HEADPHONE 1', 'HEADPHONE 2'], ios: ['THUNDERBOLT 1', 'THUNDERBOLT 2', 'DANTE (RJ45) 1', 'DANTE (RJ45) 2', 'DIGILINK 1', 'DIGILINK 2', 'WORD CLOCK'] }, ['red', 'thunderbolt', 'dante', '8pre']),
  fr('Red 8Line', { inputs: [...seq('MIC/LINE IN', 2), ...seq('LINE IN', 8, 3), 'ADAT IN', 'S/PDIF IN'], outputs: [...seq('LINE OUT', 8), 'ADAT OUT', 'S/PDIF OUT', 'HEADPHONE 1', 'HEADPHONE 2'], ios: ['THUNDERBOLT 1', 'THUNDERBOLT 2', 'DANTE (RJ45) 1', 'DANTE (RJ45) 2', 'DIGILINK', 'WORD CLOCK'] }, ['red', 'thunderbolt', 'dante', '8line']),
  fr('Red 16Line', { inputs: [...seq('MIC/LINE IN', 2), ...seq('LINE IN', 16, 3), 'ADAT IN 1', 'ADAT IN 2', 'S/PDIF IN'], outputs: [...seq('LINE OUT', 16), 'ADAT OUT 1', 'ADAT OUT 2', 'S/PDIF OUT', 'HEADPHONE 1', 'HEADPHONE 2'], ios: ['THUNDERBOLT 1', 'THUNDERBOLT 2', 'DANTE (RJ45) 1', 'DANTE (RJ45) 2', 'DIGILINK 1', 'DIGILINK 2', 'WORD CLOCK'] }, ['red', 'thunderbolt', 'dante', '16line']),
  // ── RedNet (Dante) ───────────────────────────────────────────────────────
  fr('RedNet X2P', { inputs: ['MIC/LINE IN 1', 'MIC/LINE IN 2'], outputs: ['LINE OUT L', 'LINE OUT R', 'HEADPHONE'], ios: ['DANTE (RJ45)', 'PoE'] }, ['rednet', 'dante', 'x2p', 'poe']),
  fr('RedNet AM2', { inputs: [], outputs: ['LINE OUT L', 'LINE OUT R', 'HEADPHONE'], ios: ['DANTE (RJ45)', 'PoE'] }, ['rednet', 'dante', 'am2', 'headphone', 'poe']),
  fr('RedNet A8R', { inputs: seq('LINE IN', 8), outputs: seq('LINE OUT', 8), ios: ['DANTE PRIMARY', 'DANTE SECONDARY', 'WORD CLOCK'] }, ['rednet', 'dante', 'a8r']),
  fr('RedNet A16R MkII', { inputs: seq('LINE IN', 16), outputs: seq('LINE OUT', 16), ios: ['DANTE PRIMARY', 'DANTE SECONDARY', 'WORD CLOCK', 'AES/EBU'] }, ['rednet', 'dante', 'a16r']),
  fr('RedNet MP8R', { inputs: seq('MIC/LINE IN', 8), outputs: [], ios: ['DANTE PRIMARY', 'DANTE SECONDARY', 'WORD CLOCK'] }, ['rednet', 'dante', 'mp8r', 'preamp']),
  fr('RedNet D16R MkII', { inputs: seq('AES/EBU IN', 8), outputs: seq('AES/EBU OUT', 8), ios: ['DANTE PRIMARY', 'DANTE SECONDARY', 'WORD CLOCK'] }, ['rednet', 'dante', 'd16r', 'aes']),
  fr('RedNet D64R', { inputs: ['MADI IN (COAX)', 'MADI IN (OPTICAL)'], outputs: ['MADI OUT (COAX)', 'MADI OUT (OPTICAL)'], ios: ['DANTE PRIMARY', 'DANTE SECONDARY', 'WORD CLOCK'] }, ['rednet', 'dante', 'd64r', 'madi']),
  fr('RedNet PCIeR', { inputs: [], outputs: [], ios: ['DANTE PRIMARY', 'DANTE SECONDARY', 'PCIe'] }, ['rednet', 'dante', 'pcie', 'card']),
  fr('RedNet HD32R', { inputs: [], outputs: [], ios: ['DANTE PRIMARY', 'DANTE SECONDARY', 'DIGILINK 1', 'DIGILINK 2', 'WORD CLOCK'] }, ['rednet', 'dante', 'hd32r', 'pro tools']),
  // ── ISA preamps ──────────────────────────────────────────────────────────
  fr('ISA One', { inputs: ['MIC IN (XLR)', 'LINE IN', 'INST IN', 'INSERT RETURN'], outputs: ['LINE OUT (XLR)', 'INSERT SEND', 'DI OUT', 'HEADPHONE'], ios: [] }, ['isa', 'preamp', 'ปรีแอมป์']),
  fr('ISA Two', { inputs: ['MIC IN 1', 'MIC IN 2', 'LINE IN 1', 'LINE IN 2', 'INST IN 1', 'INST IN 2'], outputs: ['LINE OUT 1', 'LINE OUT 2'], ios: [] }, ['isa', 'preamp', 'ปรีแอมป์']),
  fr('ISA 428 MkII', { inputs: [...seq('MIC IN', 4), ...seq('LINE IN', 4), ...seq('INST IN', 4)], outputs: seq('LINE OUT', 4), ios: ['ADAT (optional card)', 'WORD CLOCK'] }, ['isa', 'preamp', 'ปรีแอมป์', '428']),
  fr('ISA 828 MkII', { inputs: [...seq('MIC IN', 8), ...seq('LINE IN', 8)], outputs: seq('LINE OUT', 8), ios: ['ADAT (optional card)', 'WORD CLOCK'] }, ['isa', 'preamp', 'ปรีแอมป์', '828']),
  fr('ISA ADN8', { inputs: [], outputs: [], ios: ['DANTE PRIMARY', 'DANTE SECONDARY', 'ADAT OUT', 'AES OUT', 'WORD CLOCK'] }, ['isa', 'adn8', 'dante', 'card']),
  // ── Vocaster (podcast / streaming) ───────────────────────────────────────
  fr('Vocaster One', { inputs: ['MIC IN (XLR)'], outputs: ['LINE OUT L', 'LINE OUT R', 'HEADPHONE'], ios: ['USB-C', 'BLUETOOTH', 'CAMERA (3.5mm)'] }, ['vocaster', 'podcast', 'พอดแคสต์']),
  fr('Vocaster Two', { inputs: ['MIC IN 1 (XLR)', 'MIC IN 2 (XLR)'], outputs: ['LINE OUT L', 'LINE OUT R', 'HEADPHONE 1', 'HEADPHONE 2'], ios: ['USB-C', 'BLUETOOTH', 'CAMERA (3.5mm)'] }, ['vocaster', 'podcast', 'พอดแคสต์']),
]
