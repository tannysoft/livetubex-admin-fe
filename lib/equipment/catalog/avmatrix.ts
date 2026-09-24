import type { CatalogProduct } from './blackmagic'

/**
 * AVMATRIX — สวิตเชอร์ SHARK/PVS, converter, DA, encoder, capture, PTZ, fiber, router/multiviewer, tally
 * port ตาม spec บน avmatrix.com (ก.ย. 2569) — ที่เว็บไม่ระบุ (audio out, LAN, จำนวนตัวรับ tally) ตั้งตามที่ขายทั่วไป ตรวจกับของจริง
 * ⚠️ SHARK H4M/S4M เว็บไม่แยก input ต่อรุ่น — ตั้งตามคู่ H4 (HDMI ×4) / S4 (SDI ×2 + HDMI ×2)
 */
const AV = 'AVMATRIX'
const A = ['avmatrix', 'av matrix', 'เอวีเมทริกซ์']
const seq = (prefix: string, n: number, from = 1) => Array.from({ length: n }, (_, i) => `${prefix} ${from + i}`)

const SW = [...A, 'switcher', 'สวิตเชอร์', 'mixer', 'streaming', 'สตรีม']
const SH = [...SW, 'shark']
const CV = [...A, 'converter', 'แปลง']
const DA = [...A, 'da', 'distribution', 'splitter', 'แยกสัญญาณ']
const ENC = [...A, 'encoder', 'stream', 'สตรีม', 'rtmp', 'srt']
const CAP = [...A, 'capture', 'usb', 'แคปเจอร์']
const PTZ = [...A, 'ptz', 'eagle', 'กล้อง ptz']

// SHARK 4 ช่อง: PGM HDMI ×2, MV, USB-C (UVC) · MIC/LINE 2 ช่อง · GPIO tally
const shark4 = (name: string, inputs: string[], extra: string[]): CatalogProduct => ({
  brand: AV, name: `AVMATRIX ${name}`, model: name, category: 'switcher', aliases: [...SH, ...extra],
  inputs: [...inputs, 'MIC/LINE 1', 'MIC/LINE 2'],
  outputs: ['HDMI PGM 1', 'HDMI PGM 2 / AUX', 'HDMI MULTIVIEW', 'USB-C (UVC)'],
  ios: ['GPIO TALLY', 'LAN (STREAM)'],
})

export const AVMATRIX_PRODUCTS: CatalogProduct[] = [
  // ── สวิตเชอร์ SHARK / PVS ─────────────────────────────────────────────────
  shark4('SHARK S4', ['SDI IN 1', 'SDI IN 2', 'HDMI IN 3', 'HDMI IN 4'], ['s4', '4ch', 'sdi', 'hdmi', 'pvs0402e']),
  shark4('SHARK S4 PLUS', ['SDI IN 1', 'SDI IN 2', 'HDMI IN 3', 'HDMI IN 4'], ['s4 plus', '4ch', 'sdi', 'hdmi', '10.1']),
  shark4('SHARK H4', seq('HDMI IN', 4), ['h4', '4ch', 'hdmi']),
  shark4('SHARK H4 PLUS', seq('HDMI IN', 4), ['4ch', 'h4 plus', 'hdmi', '10.1']),
  // M = มิกเซอร์เสียงในตัว: ไมค์ 6 + stereo 2 · ออก XLR balanced + TRS มอนิเตอร์
  ...([['SHARK H4M', seq('HDMI IN', 4)], ['SHARK S4M', ['SDI IN 1', 'SDI IN 2', 'HDMI IN 3', 'HDMI IN 4']]] as const).map(([name, vids]): CatalogProduct => ({
    brand: AV, name: `AVMATRIX ${name} (มิกเซอร์เสียงในตัว)`, model: name, category: 'switcher',
    aliases: [...SH, name.toLowerCase().replace('shark ', ''), '4ch', 'audio mixer', 'มิกเซอร์เสียง', 'all in one'],
    inputs: [...vids, ...seq('MIC', 6), 'STEREO IN 1', 'STEREO IN 2'],
    outputs: ['HDMI PGM 1', 'HDMI PGM 2 / AUX', 'HDMI MULTIVIEW', 'USB-C (UVC)', 'XLR OUT L', 'XLR OUT R', 'TRS MONITOR'],
    ios: ['GPIO TALLY', 'LAN (STREAM)'],
  })),
  {
    brand: AV, name: 'AVMATRIX SHARK S6', model: 'SHARK S6', category: 'switcher', aliases: [...SH, 's6', '6ch', 'vs0605e', 'sdi', 'hdmi'],
    inputs: [...seq('SDI IN', 4), 'HDMI IN 5', 'HDMI IN 6', 'MIC 1', 'MIC 2'],
    outputs: ['SDI PGM 1', 'SDI PGM 2', 'HDMI PGM', 'SDI AUX 1', 'SDI AUX 2', 'HDMI MULTIVIEW', 'USB-C (UVC)'],
    ios: ['GPIO TALLY', 'RS232/422/485 (PTZ)', 'LAN (STREAM)'],
  },
  {
    // เว็บระบุ 6×3G-SDI + 2×4K HDMI (เลือกเข้า 6 ช่องสลับ)
    brand: AV, name: 'AVMATRIX SHARK S6 PLUS 17.3"', model: 'SHARK S6 PLUS', category: 'switcher', aliases: [...SH, 's6 plus', '6ch', '17.3', 'portable', 'sdi', 'hdmi'],
    inputs: [...seq('SDI IN', 6), 'HDMI IN 1', 'HDMI IN 2', 'XLR/TRS IN 1', 'XLR/TRS IN 2'],
    outputs: ['HDMI PGM A', 'HDMI PGM B', ...seq('SDI PGM/AUX', 4), 'HDMI MULTIVIEW', 'USB-C (UVC)', '3.5mm OUT', 'RCA OUT'],
    ios: ['GPIO TALLY', 'PTZ CONTROL', 'LAN (STREAM)'],
  },
  ...(['SHARK S8X', 'SHARK S8X PLUS 17.3"'] as const).map((name): CatalogProduct => ({
    brand: AV, name: `AVMATRIX ${name}`, model: name.replace(' 17.3"', ''), category: 'switcher',
    aliases: [...SH, 's8x', '8ch', 'sdi', 'hdmi', 'ndi', 'srt', ...(name.includes('PLUS') ? ['plus', '17.3', 'portable'] : [])],
    inputs: [...seq('SDI IN', 6), 'SDI/HDMI IN 7', 'SDI/HDMI IN 8', 'REF IN', 'XLR/TRS IN 1', 'XLR/TRS IN 2', '3.5mm IN'],
    outputs: ['HDMI PGM A', 'HDMI PGM B', ...seq('SDI PGM/AUX', 4), 'HDMI MULTIVIEW', 'REF OUT', 'USB-C (UVC)', 'XLR OUT', '3.5mm OUT'],
    ios: ['GPIO TALLY', 'PTZ CONTROL (8 ch)', 'LAN (STREAM/NDI)'],
  })),
  {
    brand: AV, name: 'AVMATRIX PVS0615U 15.6" (6CH SDI/HDMI)', model: 'PVS0615U', category: 'switcher', aliases: [...SW, 'pvs0615u', 'pvs', '6ch', '15.6', 'portable'],
    inputs: [...seq('SDI IN', 4), 'HDMI/DVI/VGA IN 5', 'HDMI/DVI/VGA IN 6', 'TRS AUDIO IN'],
    outputs: ['SDI PGM 1', 'SDI PGM 2', 'SDI PGM 3', 'HDMI PGM 1', 'HDMI PGM 2', 'SDI AUX 1', 'SDI AUX 2', 'SDI AUX 3', 'HDMI MULTIVIEW', 'USB-C (UVC)'],
    ios: ['TALLY'],
  },
  {
    brand: AV, name: 'AVMATRIX KM32-4K Chroma Key', model: 'KM32-4K', category: 'switcher', aliases: [...A, 'km32', 'chroma key', 'keyer', 'green screen', 'คีย์'],
    inputs: ['HDMI IN FOREGROUND', 'HDMI IN BACKGROUND', 'HDMI IN DSK', 'AUDIO IN', 'TALLY IN'],
    outputs: ['HDMI PGM', 'HDMI CLEAN PGM', 'HDMI MATTE', 'HDMI AUX'],
  },
  // ── Tally ─────────────────────────────────────────────────────────────────
  {
    brand: AV, name: 'AVMATRIX TS3019 Wireless Tally (base)', model: 'TS3019', category: 'intercom', aliases: [...A, 'ts3019', 'tally', 'ทัลลี่', 'wireless', 'ไร้สาย', 'vmix'],
    inputs: ['GPIO IN'], ios: ['USB-C (vMix)', 'RS-485', 'RS-232'],
  },
  { brand: AV, name: 'AVMATRIX TS3019 Tally Light (ตัวรับ/เพิ่ม)', model: 'TS3019 Tally Light', category: 'intercom', aliases: [...A, 'ts3019', 'tally', 'ทัลลี่', 'lamp', 'ไฟ tally'] },
  // ── Converter ─────────────────────────────────────────────────────────────
  { brand: AV, name: 'AVMATRIX Mini SC1112 SDI to HDMI', model: 'Mini SC1112', category: 'converter', aliases: [...CV, 'sc1112', 'mini', 'sdi to hdmi'], inputs: ['3G-SDI IN'], outputs: ['HDMI OUT', '3G-SDI LOOP OUT'] },
  { brand: AV, name: 'AVMATRIX Mini SC1221 HDMI to SDI', model: 'Mini SC1221', category: 'converter', aliases: [...CV, 'sc1221', 'mini', 'hdmi to sdi'], inputs: ['HDMI IN'], outputs: ['3G-SDI OUT', 'HDMI LOOP OUT'] },
  { brand: AV, name: 'AVMATRIX SC1120 SDI to HDMI Scaling', model: 'SC1120', category: 'converter', aliases: [...CV, 'sc1120', 'scaler', 'sdi to hdmi', 'av'], inputs: ['3G-SDI IN'], outputs: ['HDMI OUT', 'CVBS OUT', 'AUDIO OUT'] },
  { brand: AV, name: 'AVMATRIX SC2031 HDMI to SDI Scaling', model: 'SC2031', category: 'converter', aliases: [...CV, 'sc2031', 'scaler', 'hdmi to sdi'], inputs: ['HDMI IN', 'AUDIO IN'], outputs: ['3G-SDI OUT 1', '3G-SDI OUT 2', 'HDMI LOOP OUT'] },
  { brand: AV, name: 'AVMATRIX SC2030 Cross Converter (scaling)', model: 'SC2030', category: 'converter', aliases: [...CV, 'sc2030', 'cross', 'scaler', 'sdi', 'hdmi'], inputs: ['HDMI IN', '3G-SDI IN', 'AUDIO IN'], outputs: ['3G-SDI OUT 1', '3G-SDI OUT 2', 'HDMI OUT'] },
  { brand: AV, name: 'AVMATRIX SC2040 3G-SDI/HDMI Bidirectional', model: 'SC2040', category: 'converter', aliases: [...CV, 'sc2040', 'bidirectional', 'สองทาง', 'sdi', 'hdmi'], inputs: ['3G-SDI IN', 'HDMI IN'], outputs: ['HDMI OUT (จาก SDI)', '3G-SDI OUT (จาก HDMI)', 'AUDIO OUT'] },
  { brand: AV, name: 'AVMATRIX SC7030 Multi-signal Cross Converter', model: 'SC7030', category: 'converter', aliases: [...CV, 'sc7030', 'vga', 'dvi', 'cvbs', 'ypbpr', 'analog'], inputs: ['SDI IN', 'HDMI IN', 'DVI-I IN', 'VGA IN', 'CVBS IN', 'S-VIDEO IN', 'YPbPr IN', 'AUDIO IN'], outputs: ['SDI OUT 1', 'SDI OUT 2', 'HDMI OUT'] },
  { brand: AV, name: 'AVMATRIX SC1112-12G 12G-SDI to HDMI 2.0', model: 'SC1112-12G', category: 'converter', aliases: [...CV, 'sc1112', '12g', '4k', 'sdi to hdmi'], inputs: ['12G-SDI IN'], outputs: ['HDMI 2.0 OUT', '12G-SDI LOOP OUT'] },
  { brand: AV, name: 'AVMATRIX SC1221-12G HDMI 2.0 to 12G-SDI', model: 'SC1221-12G', category: 'converter', aliases: [...CV, 'sc1221', '12g', '4k', 'hdmi to sdi'], inputs: ['HDMI 2.0 IN'], outputs: ['12G-SDI OUT 1', '12G-SDI OUT 2', 'HDMI LOOP OUT'] },
  {
    brand: AV, name: 'AVMATRIX SC2020-12G 12G-SDI/HDMI 2.0 Bidirectional', model: 'SC2020-12G', category: 'converter', aliases: [...CV, 'sc2020', '12g', '4k', 'bidirectional', 'sfp', 'fiber'],
    inputs: ['12G-SDI IN', 'HDMI 2.0 IN'], outputs: ['12G-SDI LOOP OUT', '12G-SDI OUT 1', '12G-SDI OUT 2', 'HDMI LOOP OUT', 'HDMI OUT 1', 'HDMI OUT 2'], ios: ['12G SFP (fiber in/out)'],
  },
  // ── Distribution Amplifier ────────────────────────────────────────────────
  { brand: AV, name: 'AVMATRIX SD1141 1×4 SDI DA', model: 'SD1141', category: 'converter', aliases: [...DA, 'sd1141', '1x4', 'sdi'], inputs: ['3G-SDI IN'], outputs: seq('SDI OUT', 4) },
  { brand: AV, name: 'AVMATRIX SD1191 1×9 SDI DA', model: 'SD1191', category: 'converter', aliases: [...DA, 'sd1191', '1x9', 'sdi'], inputs: ['3G-SDI IN'], outputs: seq('SDI OUT', 9) },
  { brand: AV, name: 'AVMATRIX SD1121-12G 12G-SDI Repeater', model: 'SD1121-12G', category: 'converter', aliases: [...DA, 'sd1121', '12g', 'repeater', 'reclock'], inputs: ['12G-SDI IN'], outputs: ['12G-SDI OUT 1', '12G-SDI OUT 2'] },
  { brand: AV, name: 'AVMATRIX SD1151-12G 1×5 12G-SDI DA', model: 'SD1151-12G', category: 'converter', aliases: [...DA, 'sd1151', '12g', '1x5'], inputs: ['12G-SDI IN'], outputs: [...seq('12G-SDI OUT', 5), 'SFP OUT (option)'] },
  { brand: AV, name: 'AVMATRIX SD1242-4K 1×4 HDMI DA (4K60)', model: 'SD1242-4K', category: 'converter', aliases: [...DA, 'sd1242', 'hdmi', '4k', '1x4'], inputs: ['HDMI IN'], outputs: seq('HDMI OUT', 4) },
  { brand: AV, name: 'AVMATRIX SD2080 SDI/HDMI Splitter & Converter (4+4)', model: 'SD2080', category: 'converter', aliases: [...DA, ...CV, 'sd2080', '2x8', 'sdi', 'hdmi'], inputs: ['HDMI IN', '3G-SDI IN'], outputs: [...seq('3G-SDI OUT', 4), ...seq('HDMI OUT', 4)] },
  // ── Fiber ─────────────────────────────────────────────────────────────────
  { brand: AV, name: 'AVMATRIX FE1121 3G-SDI Fiber Extender (ชุด TX+RX)', model: 'FE1121', category: 'converter', aliases: [...A, 'fe1121', 'fiber', 'ไฟเบอร์', 'extender', 'sfp', 'tx', 'rx', 'ชุด'], inputs: ['3G-SDI IN (TX)'], outputs: ['3G-SDI LOOP OUT (TX)', '3G-SDI OUT (RX)'] },
  { brand: AV, name: 'AVMATRIX FE1121-12G 12G-SDI Fiber Extender (ชุด TX+RX)', model: 'FE1121-12G', category: 'converter', aliases: [...A, 'fe1121', '12g', 'fiber', 'ไฟเบอร์', 'extender', 'sfp', 'tx', 'rx', 'ชุด'], inputs: ['12G-SDI IN (TX)'], outputs: ['12G-SDI LOOP OUT (TX)', '12G-SDI OUT (RX)'] },
  // ── Router / Multiviewer ──────────────────────────────────────────────────
  { brand: AV, name: 'AVMATRIX MSS0811 8×8 3G-SDI Matrix', model: 'MSS0811', category: 'converter', aliases: [...A, 'mss0811', 'router', 'matrix', '8x8'], inputs: seq('SDI IN', 8), outputs: seq('SDI OUT', 8), ios: ['LAN (control)'] },
  { brand: AV, name: 'AVMATRIX MSS1611-S 16×16 SDI Seamless Switcher', model: 'MSS1611-S', category: 'converter', aliases: [...A, 'mss1611', 'router', 'matrix', '16x16'], inputs: seq('SDI IN', 16), outputs: seq('SDI OUT', 16), ios: ['LAN (control)'] },
  { brand: AV, name: 'AVMATRIX MMV1630 16CH SDI Multiviewer & Switcher', model: 'MMV1630', category: 'monitor', aliases: [...A, 'mmv1630', 'multiviewer', 'multiview', '16ch'], inputs: seq('SDI IN', 16), outputs: ['HDMI MV OUT', 'SDI MV OUT'], ios: ['LAN (control)'] },
  { brand: AV, name: 'AVMATRIX MV0430 Mini 4CH SDI Multiviewer', model: 'MV0430', category: 'monitor', aliases: [...A, 'mv0430', 'multiviewer', 'multiview', '4ch', 'mini'], inputs: seq('SDI IN', 4), outputs: ['HDMI MV OUT', 'SDI MV OUT'] },
  // ── Encoder / Recorder ────────────────────────────────────────────────────
  { brand: AV, name: 'AVMATRIX SE1117 SDI Streaming Encoder', model: 'SE1117', category: 'recorder', aliases: [...ENC, 'se1117', 'sdi', 'h.265'], inputs: ['3G-SDI IN'], outputs: ['SDI LOOP OUT'], ios: ['LAN (PoE)'] },
  { brand: AV, name: 'AVMATRIX SE1217 HDMI Streaming Encoder', model: 'SE1217', category: 'recorder', aliases: [...ENC, 'se1217', 'hdmi', 'h.265'], inputs: ['HDMI IN'], outputs: ['HDMI LOOP OUT'], ios: ['LAN (PoE)'] },
  { brand: AV, name: 'AVMATRIX SE2017 SDI/HDMI Encoder & Recorder', model: 'SE2017', category: 'recorder', aliases: [...ENC, 'se2017', 'recorder', 'บันทึก', 'sd card'], inputs: ['SDI IN', 'HDMI IN', 'LINE AUDIO IN'], outputs: ['SDI LOOP OUT', 'HDMI LOOP OUT', 'USB-C (UVC)'], ios: ['LAN (PoE)'] },
  { brand: AV, name: 'AVMATRIX DE20-4K HDMI Encoder & Decoder', model: 'DE20-4K', category: 'recorder', aliases: [...ENC, 'de20', 'decoder', '4k', 'hdmi'], inputs: ['HDMI IN'], outputs: ['HDMI OUT'], ios: ['LAN (PoE)'] },
  { brand: AV, name: 'AVMATRIX DE21-4K PRO HDMI/NDI Encoder & Decoder', model: 'DE21-4K PRO', category: 'recorder', aliases: [...ENC, 'de21', 'decoder', 'ndi', '4k', 'hdmi'], inputs: ['HDMI IN', '3.5mm AUDIO IN'], outputs: ['HDMI OUT', '3.5mm AUDIO OUT'], ios: ['LAN (NDI / PoE)'] },
  // ── Capture ───────────────────────────────────────────────────────────────
  { brand: AV, name: 'AVMATRIX UC1118 SDI to USB 3.1 Capture', model: 'UC1118', category: 'recorder', aliases: [...CAP, 'uc1118', 'sdi'], inputs: ['3G-SDI IN'], outputs: ['SDI LOOP OUT', 'USB 3.1 (UVC)'] },
  { brand: AV, name: 'AVMATRIX UC2018 SDI/HDMI to USB 3.1 Capture', model: 'UC2018', category: 'recorder', aliases: [...CAP, 'uc2018', 'sdi', 'hdmi'], inputs: ['3G-SDI IN', 'HDMI IN', 'AUDIO IN'], outputs: ['SDI LOOP OUT', 'HDMI LOOP OUT', 'USB 3.1 (UVC)'] },
  { brand: AV, name: 'AVMATRIX UC2218-4K Dual HDMI Capture', model: 'UC2218-4K', category: 'recorder', aliases: [...CAP, 'uc2218', 'hdmi', '4k', 'dual'], inputs: ['HDMI IN 1', 'HDMI IN 2'], outputs: ['HDMI LOOP OUT', 'USB 3.1 (UVC)'] },
  { brand: AV, name: 'AVMATRIX UC1218-4K HDMI 2.0 Capture', model: 'UC1218-4K', category: 'recorder', aliases: [...CAP, 'uc1218', 'hdmi', '4k'], inputs: ['HDMI 2.0 IN'], outputs: ['HDMI LOOP OUT', 'USB (UVC)'] },
  { brand: AV, name: 'AVMATRIX UC7018 Multi-signal to USB Capture', model: 'UC7018', category: 'recorder', aliases: [...CAP, 'uc7018', 'vga', 'dvi', 'cvbs'], inputs: ['SDI IN', 'HDMI IN', 'DVI/VGA IN', 'CVBS IN', 'AUDIO IN'], outputs: ['USB 3.0 (UVC)'] },
  { brand: AV, name: 'AVMATRIX VC41 4CH 3G-SDI PCIe Capture', model: 'VC41', category: 'recorder', aliases: [...CAP, 'vc41', 'pcie', 'card', 'การ์ด'], inputs: seq('SDI IN', 4) },
  { brand: AV, name: 'AVMATRIX VC42 4CH HDMI PCIe Capture', model: 'VC42', category: 'recorder', aliases: [...CAP, 'vc42', 'pcie', 'card', 'การ์ด'], inputs: seq('HDMI IN', 4) },
  { brand: AV, name: 'AVMATRIX VC12-4K HDMI PCIe Capture', model: 'VC12-4K', category: 'recorder', aliases: [...CAP, 'vc12', 'pcie', '4k', 'card', 'การ์ด'], inputs: ['HDMI IN'], outputs: ['HDMI LOOP OUT'] },
  // ── PTZ ───────────────────────────────────────────────────────────────────
  ...([['P12A', '12x'], ['P20A', '20x'], ['P30A', '30x']] as const).map(([m, zoom]): CatalogProduct => ({
    brand: AV, name: `AVMATRIX EAGLE ${m}-AI PTZ (FHD, ${zoom} tracking)`, model: `EAGLE ${m}-AI`, category: 'camera',
    aliases: [...PTZ, m.toLowerCase(), zoom, 'ai', 'tracking', 'ndi'],
    inputs: ['AUDIO IN'], outputs: ['3G-SDI OUT', 'HDMI OUT', 'USB (UVC)'], ios: ['LAN (NDI|HX3 / PoE)', 'RS232/RS485'],
  })),
  ...([['P20', '20x'], ['P30', '30x']] as const).map(([m, zoom]): CatalogProduct => ({
    brand: AV, name: `AVMATRIX EAGLE ${m}-4K PTZ (${zoom})`, model: `EAGLE ${m}-4K`, category: 'camera',
    aliases: [...PTZ, m.toLowerCase(), zoom, '4k', '12g', 'broadcast', 'ndi'],
    inputs: ['AUDIO IN'], outputs: ['12G-SDI OUT 1', '12G-SDI OUT 2', 'HDMI OUT'], ios: ['LAN (NDI|HX3 / PoE)', 'RS232/RS422'],
  })),
  ...(['PKC3000', 'PKC3500', 'PKC4000'] as const).map((m): CatalogProduct => ({
    brand: AV, name: `AVMATRIX ${m} PTZ Controller`, model: m, category: 'other',
    aliases: [...A, m.toLowerCase(), 'ptz', 'controller', 'joystick', 'จอยสติ๊ก', 'คอนโทรล'],
    ios: m === 'PKC3500' ? ['LAN (VISCA/ONVIF)'] : ['LAN (VISCA/ONVIF)', 'RS232/RS422/RS485'],
  })),
  { brand: AV, name: 'AVMATRIX WM12-Mini Wireless Mic', model: 'WM12-Mini', category: 'audio', aliases: [...A, 'wm12', 'mic', 'ไมค์', 'wireless', 'ไร้สาย'], outputs: ['3.5mm OUT', 'USB-C OUT'] },
  { brand: AV, name: 'AVMATRIX VM40 Vlog Monitor', model: 'VM40', category: 'monitor', aliases: [...A, 'vm40', 'monitor', 'จอ', 'vlog', 'selfie'], inputs: ['HDMI IN'] },
]
