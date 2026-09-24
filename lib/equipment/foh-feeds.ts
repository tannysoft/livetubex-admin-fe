import type { EquipmentCategory, FeedConnection, FohFeed, VideoFormat } from '../types'
import { formatShortLabel, rangeLabel, sdiLevel } from './video-format'

/**
 * การส่งภาพให้ทีม Visual ที่ FOH — แต่ละ feed = สัญญาณ 1 เส้นที่ต้องส่งมอบ
 * format ไม่ระบุ = ตามระบบภาพหลัก (plan.videoFormat)
 */
export const FEED_SOURCES = ['PGM', 'Clean feed (ไม่มีกราฟิก)', 'AUX 1', 'AUX 2', 'Multiview', 'CAM 1 (ISO)', 'Playback / VT']
/**
 * เครื่องปลายทางที่ FOH — presentation switcher / LED processor / media server ของทีม Visual
 * category = สีกล่องในผัง FOH · progressive = เครื่องที่ทำงานแบบ progressive (ส่ง interlaced ไปมักต้องแปลง/ภาพกระตุก — เตือนให้เช็ก)
 */
export const FOH_SYSTEMS: { name: string; category: EquipmentCategory; progressive?: boolean }[] = [
  { name: 'Barco E2', category: 'switcher', progressive: true },
  { name: 'Barco S3-4K', category: 'switcher', progressive: true },
  { name: 'Barco Event Master EX / E3', category: 'switcher', progressive: true },
  { name: 'Analog Way Aquilon (LivePremier)', category: 'switcher', progressive: true },
  { name: 'Analog Way Pulse / Midra', category: 'switcher', progressive: true },
  { name: 'Christie Spyder X80', category: 'switcher', progressive: true },
  { name: 'Novastar VX / H series', category: 'converter', progressive: true },
  { name: 'Novastar MCTRL', category: 'converter', progressive: true },
  { name: 'Colorlight / Brompton LED Processor', category: 'converter', progressive: true },
  { name: 'LED Processor', category: 'converter', progressive: true },
  { name: 'Resolume / Media server', category: 'recorder', progressive: true },
  { name: 'disguise (d3)', category: 'recorder', progressive: true },
  { name: 'FOH switcher (ทีม Visual)', category: 'switcher' },
  { name: 'จอ Confidence', category: 'monitor' },
  { name: 'Projector', category: 'monitor', progressive: true },
]
export const FEED_DESTINATIONS = FOH_SYSTEMS.map((s) => s.name)

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9ก-๙]+/g, '')

/** preset ของปลายทาง (จับคู่หลวมๆ — "E2", "barco e2 #1" ก็เจอ Barco E2) */
export function fohSystemOf(destination: string): (typeof FOH_SYSTEMS)[number] | undefined {
  const d = norm(destination)
  if (!d) return undefined
  return FOH_SYSTEMS.find((s) => norm(s.name) === d)
    ?? FOH_SYSTEMS.find((s) => s.name.split(/[\s/()]+/).filter((w) => w.length >= 2 && !/^(barco|analog|way|series|led|processor)$/i.test(w)).some((w) => d.includes(norm(w))))
}

/** feed ที่ส่ง interlaced ไปเครื่องที่ทำงาน progressive — ควรเช็ก/แปลงก่อน */
export function interlacedToProgressive(feed: FohFeed, main?: VideoFormat): boolean {
  const f = feedFormat(feed, main)
  return !!f && f.resolution === '1080i' && !!fohSystemOf(feed.destination)?.progressive
}

export const FEED_CONNECTIONS: { value: FeedConnection; label: string }[] = [
  { value: 'SDI', label: 'SDI' },
  { value: 'HDMI', label: 'HDMI' },
  { value: 'Fiber', label: 'Fiber (SDI over fiber)' },
  { value: 'NDI', label: 'NDI (LAN)' },
  { value: 'SRT', label: 'SRT / IP' },
  { value: 'Other', label: 'อื่นๆ' },
]

export const FEED_PRESETS: Omit<FohFeed, 'id'>[] = [
  { source: 'PGM', destination: 'Barco E2', connection: 'SDI' },
  { source: 'Clean feed (ไม่มีกราฟิก)', destination: 'Barco E2', connection: 'SDI' },
  { source: 'PGM', destination: 'LED Processor', connection: 'SDI' },
  { source: 'AUX 1', destination: 'Resolume / Media server', connection: 'SDI' },
]

/** format ที่ใช้จริงของ feed */
export function feedFormat(feed: FohFeed, main?: VideoFormat): VideoFormat | undefined {
  return feed.format ?? main
}

/** "1080p50 · SDR · Rec.709 · 3G-SDI" หรือ "ตามระบบภาพหลัก" */
export function feedFormatLabel(feed: FohFeed, main?: VideoFormat): string {
  const f = feedFormat(feed, main)
  if (!f) return 'ตามระบบภาพหลัก (ยังไม่ระบุ)'
  const sdi = feed.connection === 'SDI' || feed.connection === 'Fiber' ? ` · ${sdiLevel(f)}` : ''
  return `${formatShortLabel(f)} · ${rangeLabel(f.range)}${sdi}${feed.format ? '' : ' (ตามระบบหลัก)'}`
}

/** บรรทัดสรุปบนหัวกระดาษ: "PGM → LED Processor · AUX 1 → Resolume" */
export function fohSummary(feeds: FohFeed[] | undefined): string {
  return (feeds ?? []).filter((f) => f.source || f.destination).map((f) => `${f.source || '?'} → ${f.destination || '?'}`).join(' · ')
}

/** ข้อความเต็มให้ผู้ช่วย AI — 1 บรรทัดต่อ feed */
export function fohAgentText(feeds: FohFeed[] | undefined, main?: VideoFormat): string {
  return (feeds ?? []).map((f, i) =>
    `${i + 1}. ${f.source || '?'} → ${f.destination || '?'}${f.destInput ? ` [${f.destInput}]` : ''} ทาง ${f.connection} · ${feedFormatLabel(f, main)}`
    + `${f.cableLength ? ` · ระยะ ${f.cableLength}` : ''}${f.note ? ` · ${f.note}` : ''}`,
  ).join('\n')
}
