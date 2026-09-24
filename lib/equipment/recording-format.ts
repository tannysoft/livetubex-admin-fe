import type { RecordingContainer, RecordingSpec, VideoFormat } from '../types'
import { formatShortLabel } from './video-format'

/**
 * format ไฟล์บันทึกของงาน — 1 แผนมีได้หลายรายการ (PGM, Clean feed, ISO ทุกกล้อง, สำรอง)
 * ความละเอียด/fps: ว่าง = ตามระบบภาพของแผน (videoFormat) · ใส่เองได้ต่อรายการ เช่น ISO บันทึก BRAW 4K ในกล้อง แต่ PGM เป็น HD
 */
export const RECORDING_CODECS: { value: string; label: string; container: RecordingContainer }[] = [
  { value: 'ProRes 422 HQ', label: 'Apple ProRes 422 HQ', container: 'MOV' },
  { value: 'ProRes 422', label: 'Apple ProRes 422', container: 'MOV' },
  { value: 'ProRes 422 LT', label: 'Apple ProRes 422 LT', container: 'MOV' },
  { value: 'ProRes 422 Proxy', label: 'Apple ProRes 422 Proxy', container: 'MOV' },
  { value: 'ProRes 4444', label: 'Apple ProRes 4444', container: 'MOV' },
  { value: 'DNxHD', label: 'Avid DNxHD (HD)', container: 'MXF' },
  { value: 'DNxHR HQX', label: 'Avid DNxHR HQX (4K 10-bit)', container: 'MXF' },
  { value: 'DNxHR SQ', label: 'Avid DNxHR SQ', container: 'MXF' },
  { value: 'H.264', label: 'H.264 / AVC', container: 'MP4' },
  { value: 'H.265', label: 'H.265 / HEVC', container: 'MP4' },
  { value: 'XAVC-I', label: 'Sony XAVC-I', container: 'MXF' },
  { value: 'XAVC S', label: 'Sony XAVC S', container: 'MP4' },
  { value: 'Blackmagic RAW', label: 'Blackmagic RAW', container: 'BRAW' },
  { value: 'ProRes RAW', label: 'Apple ProRes RAW', container: 'MOV' },
  { value: 'X-OCN', label: 'Sony X-OCN', container: 'MXF' },
  { value: 'ARRIRAW', label: 'ARRIRAW', container: 'ARI' },
  { value: 'REDCODE RAW', label: 'REDCODE RAW', container: 'R3D' },
  { value: 'Cinema RAW Light', label: 'Canon Cinema RAW Light', container: 'CRM' },
]

/** ตัวเลือกความละเอียด/fps ที่ใช้บ่อย — พิมพ์เองได้ */
export const RECORDING_RESOLUTIONS = [
  'HD 1080i50', 'HD 1080p50', 'HD 1080p25', 'UHD 2160p50', 'UHD 2160p25',
  '4K DCI 25p', '4K DCI 50p', '6K 25p', '8K 25p', '12K 25p',
]

export const RECORDING_CONTAINERS: { value: RecordingContainer; label: string }[] = [
  { value: 'MOV', label: '.mov' },
  { value: 'MP4', label: '.mp4' },
  { value: 'MXF', label: '.mxf' },
  { value: 'BRAW', label: '.braw' },
  { value: 'R3D', label: '.r3d' },
  { value: 'ARI', label: '.ari' },
  { value: 'CRM', label: '.crm' },
]

/** ตัวเลือกที่ใช้บ่อย — พิมพ์อย่างอื่นเองได้ */
export const RECORDING_TARGETS = ['PGM', 'Clean feed', 'ISO ทุกกล้อง', 'Multiview', 'สำรอง (Backup)']
export const RECORDING_MEDIA = ['SSD', 'SD card', 'CFexpress', 'CFast', 'USB-C disk', 'NAS / Network']

export const RECORDING_PRESETS: Omit<RecordingSpec, 'id'>[] = [
  { target: 'PGM', codec: 'ProRes 422 HQ', container: 'MOV', media: 'SSD' },
  { target: 'ISO ทุกกล้อง', codec: 'H.264', container: 'MP4', media: 'USB-C disk' },
  { target: 'PGM', codec: 'H.264', container: 'MP4', media: 'USB-C disk' },
  // ISO อัดในกล้องความละเอียดสูงกว่า PGM
  { target: 'ISO ทุกกล้อง', codec: 'Blackmagic RAW', container: 'BRAW', resolution: '4K DCI 25p', media: 'CFexpress' },
]

export function defaultContainer(codec: string): RecordingContainer {
  return RECORDING_CODECS.find((c) => c.value === codec)?.container ?? 'MOV'
}

/** ความละเอียดที่ใช้จริง — ตั้งเอง หรือตามระบบภาพหลัก */
export function recordingResolution(r: RecordingSpec, main?: VideoFormat): string {
  return r.resolution?.trim() || (main ? formatShortLabel(main) : '')
}

/**
 * "PGM — ProRes 422 HQ (.mov) · 1080i50 · SSD"
 * ใส่ความละเอียดทุกรายการเมื่อบางรายการต่างจากระบบหลัก (อ่านหัวกระดาษแล้วรู้เลยว่าไฟล์ไหนเป็น HD ไฟล์ไหน 4K)
 */
export function recordingLabel(r: RecordingSpec, main?: VideoFormat, showResolution = !!r.resolution?.trim()): string {
  const ext = RECORDING_CONTAINERS.find((c) => c.value === r.container)?.label ?? r.container.toLowerCase()
  const res = showResolution ? recordingResolution(r, main) : ''
  return `${r.target || 'บันทึก'} — ${r.codec} (${ext})${res ? ` · ${res}` : ''}${r.media ? ` · ${r.media}` : ''}${r.note?.trim() ? ` · ${r.note.trim()}` : ''}`
}

export function recordingsLabel(list: RecordingSpec[] | undefined, main?: VideoFormat): string {
  const rows = (list ?? []).filter((r) => r.codec)
  const mixed = rows.some((r) => r.resolution?.trim())
  return rows.map((r) => recordingLabel(r, main, mixed)).join('  |  ')
}
