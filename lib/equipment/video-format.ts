import type { VideoFormat, VideoResolution, VideoRange } from '../types'

/**
 * ระบบภาพของงาน — ความละเอียด / frame rate / SDR-HDR → ป้ายสั้นแบบที่ทีมพูดกัน ("1080i50", "2160p59.94")
 * interlaced ใช้ "field rate" ตามธรรมเนียม broadcast (1080i50 = 25 เฟรม/วิ) — ประเทศไทยออกอากาศ 1080i50
 */
export const RESOLUTIONS: { value: VideoResolution; label: string }[] = [
  { value: '720p', label: '720p (HD)' },
  { value: '1080i', label: '1080i (Full HD interlaced)' },
  { value: '1080p', label: '1080p (Full HD)' },
  { value: '2160p', label: '2160p (UHD 4K)' },
]

const PROGRESSIVE_RATES = [23.98, 24, 25, 29.97, 30, 50, 59.94, 60]
const INTERLACED_RATES = [50, 59.94, 60]

export function frameRatesFor(res: VideoResolution): number[] {
  return res === '1080i' ? INTERLACED_RATES : PROGRESSIVE_RATES
}

export const RANGES: { value: VideoRange; label: string }[] = [
  { value: 'SDR', label: 'SDR · Rec.709' },
  { value: 'HLG', label: 'HDR HLG · Rec.2020' },
  { value: 'PQ', label: 'HDR PQ · Rec.2020' },
]

/** ปุ่มลัดที่ใช้บ่อยในงานไทย */
export const VIDEO_PRESETS: VideoFormat[] = [
  { resolution: '1080i', frameRate: 50, range: 'SDR' },
  { resolution: '1080p', frameRate: 50, range: 'SDR' },
  { resolution: '1080p', frameRate: 25, range: 'SDR' },
  { resolution: '1080p', frameRate: 29.97, range: 'SDR' },
  { resolution: '1080p', frameRate: 59.94, range: 'SDR' },
  { resolution: '2160p', frameRate: 50, range: 'SDR' },
  { resolution: '2160p', frameRate: 50, range: 'HLG' },
]

export const DEFAULT_VIDEO_FORMAT: VideoFormat = { resolution: '1080i', frameRate: 50, range: 'SDR' }

const rate = (r: number) => (Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0$/, ''))

/** "1080i50", "2160p59.94" */
export function formatShortLabel(f: Pick<VideoFormat, 'resolution' | 'frameRate'>): string {
  return `${f.resolution}${rate(f.frameRate)}`
}

/** มาตรฐาน SDI ขั้นต่ำที่สายทั้งระบบต้องรองรับ — ใช้เลือก converter/router/สาย */
export function sdiLevel(f: Pick<VideoFormat, 'resolution' | 'frameRate'>): string {
  const high = f.frameRate > 30
  if (f.resolution === '2160p') return high ? '12G-SDI' : '6G-SDI'
  if (f.resolution === '1080p' && high) return '3G-SDI'
  return 'HD-SDI'
}

export function rangeLabel(r: VideoRange): string {
  return RANGES.find((x) => x.value === r)?.label ?? r
}

/** "1080i50 · SDR · Rec.709 · HD-SDI — หมายเหตุ" สำหรับหัวกระดาษ */
export function formatFullLabel(f: VideoFormat): string {
  return [formatShortLabel(f), rangeLabel(f.range), sdiLevel(f)].join(' · ') + (f.note?.trim() ? ` — ${f.note.trim()}` : '')
}

export function sameFormat(a?: VideoFormat, b?: VideoFormat): boolean {
  return !!a && !!b && a.resolution === b.resolution && a.frameRate === b.frameRate && a.range === b.range
}
