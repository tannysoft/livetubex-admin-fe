import type { CatalogProduct } from './blackmagic'

/**
 * AJA Video Systems — mini converter, fiber (FiDO), frame sync (FS), เครื่องบันทึก Ki Pro/HELO, router KUMO, capture
 * ⚠️ port ตามความรู้ทั่วไปของรุ่น ไม่ใช่ spec sheet ทางการ — บางรุ่นมี loop out/port เสริมที่ไม่ได้ใส่ ตรวจกับของจริง
 */
const AJ = 'AJA'
const A = ['aja', 'เอจา']
const seq = (prefix: string, n: number, from = 1) => Array.from({ length: n }, (_, i) => `${prefix} ${from + i}`)

const CV = [...A, 'mini converter', 'converter', 'แปลง']
const DA = [...A, 'da', 'distribution', 'splitter', 'แยกสัญญาณ']
const FIBER = [...A, 'fido', 'fiber', 'ไฟเบอร์', 'optical', 'lc']
const REC = [...A, 'recorder', 'บันทึก', 'record']
const KUMO = [...A, 'kumo', 'router', 'เราเตอร์', 'matrix', 'videohub']

export const AJA_PRODUCTS: CatalogProduct[] = [
  // ── Mini converter SDI ⇄ HDMI ────────────────────────────────────────────
  { brand: AJ, name: 'AJA Hi5-12G', model: 'Hi5-12G', category: 'converter', aliases: [...CV, 'hi5', '12g', 'sdi to hdmi'],
    inputs: ['12G-SDI IN'], outputs: ['HDMI OUT'] },
  { brand: AJ, name: 'AJA HA5-12G', model: 'HA5-12G', category: 'converter', aliases: [...CV, 'ha5', '12g', 'hdmi to sdi'],
    inputs: ['HDMI IN'], outputs: ['12G-SDI OUT 1', '12G-SDI OUT 2'] },
  { brand: AJ, name: 'AJA Hi5-4K-Plus', model: 'Hi5-4K-Plus', category: 'converter', aliases: [...CV, 'hi5', '4k', 'quad', 'sdi to hdmi'],
    inputs: seq('3G-SDI IN', 4), outputs: ['HDMI OUT'] },
  { brand: AJ, name: 'AJA HA5-4K', model: 'HA5-4K', category: 'converter', aliases: [...CV, 'ha5', '4k', 'quad', 'hdmi to sdi'],
    inputs: ['HDMI IN'], outputs: seq('3G-SDI OUT', 4) },
  { brand: AJ, name: 'AJA Hi5-3G', model: 'Hi5-3G', category: 'converter', aliases: [...CV, 'hi5', '3g', 'hd', 'sdi to hdmi'],
    inputs: ['3G-SDI IN'], outputs: ['HDMI OUT', 'SDI LOOP OUT'] },
  { brand: AJ, name: 'AJA HA5', model: 'HA5', category: 'converter', aliases: [...CV, 'ha5', '3g', 'hd', 'hdmi to sdi'],
    inputs: ['HDMI IN'], outputs: ['3G-SDI OUT 1', '3G-SDI OUT 2'] },
  { brand: AJ, name: 'AJA ROI-SDI', model: 'ROI-SDI', category: 'converter', aliases: [...CV, 'roi', 'scaler', 'region of interest', 'ย่อภาพ'],
    inputs: ['SDI IN'], outputs: ['SDI OUT', 'HDMI OUT'] },
  { brand: AJ, name: 'AJA ROI-HDMI', model: 'ROI-HDMI', category: 'converter', aliases: [...CV, 'roi', 'scaler', 'region of interest', 'ย่อภาพ'],
    inputs: ['HDMI IN'], outputs: ['SDI OUT', 'HDMI OUT'] },
  { brand: AJ, name: 'AJA 12G-AM', model: '12G-AM', category: 'converter', aliases: [...CV, 'audio embedder', 'disembedder', 'embed', 'เสียง'],
    inputs: ['12G-SDI IN', 'AES IN 1-4', 'ANALOG AUDIO IN'], outputs: ['12G-SDI OUT 1', '12G-SDI OUT 2', 'AES OUT 1-4', 'ANALOG AUDIO OUT'] },
  { brand: AJ, name: 'AJA ColorBox', model: 'ColorBox', category: 'converter', aliases: [...CV, 'colorbox', 'lut', 'hdr', 'color'],
    inputs: ['12G-SDI IN', 'HDMI IN'], outputs: ['12G-SDI OUT 1', '12G-SDI OUT 2', 'HDMI OUT'], ios: ['LAN'] },

  // ── DA ──────────────────────────────────────────────────────────────────
  { brand: AJ, name: 'AJA 12GDA 1×6 12G-SDI DA', model: '12GDA', category: 'converter', aliases: [...DA, '12gda', '12g', '1x6', 'reclock'],
    inputs: ['12G-SDI IN'], outputs: seq('12G-SDI OUT', 6) },
  { brand: AJ, name: 'AJA 3GDA 1×6 3G-SDI DA', model: '3GDA', category: 'converter', aliases: [...DA, '3gda', '3g', '1x6', 'reclock'],
    inputs: ['3G-SDI IN'], outputs: seq('3G-SDI OUT', 6) },

  // ── Fiber (FiDO) — ขายแยกตัวส่ง/ตัวรับ ───────────────────────────────────
  { brand: AJ, name: 'AJA FiDO-T-12G (SDI → Fiber)', model: 'FiDO-T-12G', category: 'converter', aliases: [...FIBER, 'tx', 'transmitter', '12g'],
    inputs: ['12G-SDI IN'], outputs: ['FIBER OUT (LC)', 'SDI LOOP OUT'] },
  { brand: AJ, name: 'AJA FiDO-R-12G (Fiber → SDI)', model: 'FiDO-R-12G', category: 'converter', aliases: [...FIBER, 'rx', 'receiver', '12g'],
    inputs: ['FIBER IN (LC)'], outputs: ['12G-SDI OUT 1', '12G-SDI OUT 2'] },
  { brand: AJ, name: 'AJA FiDO-TR-12G (Transceiver)', model: 'FiDO-TR-12G', category: 'converter', aliases: [...FIBER, 'tr', 'transceiver', 'bidirectional', '12g'],
    inputs: ['12G-SDI IN', 'FIBER IN (LC)'], outputs: ['FIBER OUT (LC)', '12G-SDI OUT'] },
  { brand: AJ, name: 'AJA FiDO-2T (2ch SDI → Fiber)', model: 'FiDO-2T', category: 'converter', aliases: [...FIBER, 'tx', '2ch', '3g'],
    inputs: ['3G-SDI IN 1', '3G-SDI IN 2'], outputs: ['FIBER OUT 1 (LC)', 'FIBER OUT 2 (LC)'] },
  { brand: AJ, name: 'AJA FiDO-2R (2ch Fiber → SDI)', model: 'FiDO-2R', category: 'converter', aliases: [...FIBER, 'rx', '2ch', '3g'],
    inputs: ['FIBER IN 1 (LC)', 'FIBER IN 2 (LC)'], outputs: ['3G-SDI OUT 1', '3G-SDI OUT 2'] },
  { brand: AJ, name: 'AJA HB-T-SDI (SDI → HDBaseT)', model: 'HB-T-SDI', category: 'converter', aliases: [...A, 'hdbaset', 'cat6', 'lan', 'tx'],
    inputs: ['3G-SDI IN'], outputs: ['HDBaseT OUT (RJ45)', 'SDI LOOP OUT'] },
  { brand: AJ, name: 'AJA HB-R-SDI (HDBaseT → SDI)', model: 'HB-R-SDI', category: 'converter', aliases: [...A, 'hdbaset', 'cat6', 'lan', 'rx'],
    inputs: ['HDBaseT IN (RJ45)'], outputs: ['3G-SDI OUT 1', '3G-SDI OUT 2'] },

  // ── Frame sync / cross converter ────────────────────────────────────────
  { brand: AJ, name: 'AJA FS-HDR', model: 'FS-HDR', category: 'converter', aliases: [...A, 'frame sync', 'hdr', 'cross converter', 'up down cross', 'colorfront'],
    inputs: [...seq('SDI IN', 4), 'HDMI IN', 'REF IN'], outputs: [...seq('SDI OUT', 4), 'HDMI OUT'], ios: ['LAN'] },
  { brand: AJ, name: 'AJA FS4', model: 'FS4', category: 'converter', aliases: [...A, 'frame sync', 'cross converter', 'up down cross', '4ch'],
    inputs: [...seq('SDI IN', 4), 'HDMI IN', 'REF IN'], outputs: [...seq('SDI OUT', 4), 'HDMI OUT'], ios: ['LAN'] },

  // ── เครื่องบันทึก / สตรีม ──────────────────────────────────────────────
  { brand: AJ, name: 'AJA Ki Pro Ultra 12G', model: 'Ki Pro Ultra 12G', category: 'recorder', aliases: [...REC, 'ki pro', 'kipro', 'prores', 'dnxhd', '12g', '4k'],
    inputs: [...seq('12G-SDI IN', 4), 'HDMI IN', 'XLR AUDIO IN 1', 'XLR AUDIO IN 2'], outputs: [...seq('12G-SDI OUT', 4), 'HDMI OUT'], ios: ['LAN'] },
  { brand: AJ, name: 'AJA Ki Pro GO2', model: 'Ki Pro GO2', category: 'recorder', aliases: [...REC, 'ki pro', 'kipro', 'go', 'h.264', 'hevc', 'usb', '4ch', 'iso'],
    inputs: [...seq('3G-SDI IN', 4), ...seq('HDMI IN', 4)], outputs: ['SDI OUT', 'HDMI OUT'], ios: ['LAN', ...seq('USB', 5)] },
  { brand: AJ, name: 'AJA HELO Plus', model: 'HELO Plus', category: 'recorder', aliases: [...REC, 'helo', 'stream', 'สตรีม', 'rtmp', 'srt', 'encoder', 'h.264'],
    inputs: ['3G-SDI IN', 'HDMI IN', 'AUDIO IN'], outputs: ['3G-SDI OUT', 'HDMI OUT'], ios: ['LAN', 'USB', 'SD CARD'] },
  { brand: AJ, name: 'AJA BRIDGE LIVE', model: 'BRIDGE LIVE', category: 'network', aliases: [...A, 'bridge', 'encoder', 'decoder', 'srt', 'ndi', 'stream', 'สตรีม', 'remote'],
    inputs: seq('12G-SDI IN', 4), outputs: seq('12G-SDI OUT', 4), ios: ['LAN 1', 'LAN 2'] },

  // ── Capture ─────────────────────────────────────────────────────────────
  { brand: AJ, name: 'AJA U-TAP SDI', model: 'U-TAP SDI', category: 'converter', aliases: [...A, 'utap', 'capture', 'usb', 'แคปเจอร์', 'uvc'],
    inputs: ['3G-SDI IN'], outputs: ['USB 3.0 (UVC)', 'SDI LOOP OUT'] },
  { brand: AJ, name: 'AJA U-TAP HDMI', model: 'U-TAP HDMI', category: 'converter', aliases: [...A, 'utap', 'capture', 'usb', 'แคปเจอร์', 'uvc'],
    inputs: ['HDMI IN'], outputs: ['USB 3.0 (UVC)'] },
  { brand: AJ, name: 'AJA Io X3', model: 'Io X3', category: 'converter', aliases: [...A, 'io', 'thunderbolt', 'capture', 'playback', 'แคปเจอร์'],
    inputs: [...seq('3G-SDI IN', 4), 'HDMI IN'], outputs: [...seq('3G-SDI OUT', 4), 'HDMI OUT'], ios: ['THUNDERBOLT 3 1', 'THUNDERBOLT 3 2'] },
  { brand: AJ, name: 'AJA KONA 5', model: 'KONA 5', category: 'other', aliases: [...A, 'kona', 'pcie', 'capture card', 'การ์ดแคปเจอร์', '12g'],
    ios: [...seq('12G-SDI I/O', 4), 'HDMI OUT'] },

  // ── Router KUMO (ช่องเข้า × ช่องออก) ─────────────────────────────────────
  { brand: AJ, name: 'AJA KUMO 1604 (16×4)', model: 'KUMO 1604', category: 'switcher', aliases: [...KUMO, '1604', '16x4', '3g'],
    inputs: seq('SDI IN', 16), outputs: seq('SDI OUT', 4), ios: ['LAN', 'REF'] },
  { brand: AJ, name: 'AJA KUMO 1616-12G (16×16)', model: 'KUMO 1616-12G', category: 'switcher', aliases: [...KUMO, '1616', '16x16', '12g'],
    inputs: seq('12G-SDI IN', 16), outputs: seq('12G-SDI OUT', 16), ios: ['LAN', 'REF'] },
  { brand: AJ, name: 'AJA KUMO 3232-12G (32×32)', model: 'KUMO 3232-12G', category: 'switcher', aliases: [...KUMO, '3232', '32x32', '12g'],
    inputs: seq('12G-SDI IN', 32), outputs: seq('12G-SDI OUT', 32), ios: ['LAN', 'REF'] },
  { brand: AJ, name: 'AJA KUMO CP (แผงควบคุม)', model: 'KUMO CP', category: 'other', aliases: [...KUMO, 'control panel', 'แผงควบคุม', 'cp'],
    ios: ['LAN'] },
]
