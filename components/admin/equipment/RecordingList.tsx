import { RECORDING_CONTAINERS, recordingResolution } from '@/lib/equipment/recording-format'
import type { RecordingSpec, VideoFormat } from '@/lib/types'

/**
 * format ไฟล์บันทึก — รายการที่ตั้งค่าเหมือนกันทุกช่อง (codec · ไฟล์ · ความละเอียด · สื่อ) รวมเป็นบรรทัดเดียว
 * เช่น "PGM, สำรอง, CAM15 — ProRes 422 HQ .mov · 2160p50 · SSD" · รายการที่มีหมายเหตุไม่รวม
 * compact = ตัวเล็กไม่มีชิป (หน้าแชร์ทีมงาน ประหยัดที่)
 */
export default function RecordingList({ recordings, main, compact }: { recordings?: RecordingSpec[]; main?: VideoFormat; compact?: boolean }) {
  const rows = (recordings ?? []).filter((r) => r.codec)
  if (rows.length === 0) return <span className="text-gray-400">ไม่มี</span>
  const groups: { key: string; targets: string[]; parts: { codec: string; ext: string; res: string; media: string }; note: string }[] = []
  for (const r of rows) {
    const parts = {
      codec: r.codec,
      ext: RECORDING_CONTAINERS.find((c) => c.value === r.container)?.label ?? r.container.toLowerCase(),
      res: recordingResolution(r, main),
      media: r.media ?? '',
    }
    const note = r.note?.trim() ?? ''
    const key = note ? r.id : JSON.stringify(parts)
    const g = groups.find((x) => x.key === key)
    if (g) g.targets.push(r.target || 'บันทึก')
    else groups.push({ key, targets: [r.target || 'บันทึก'], parts, note })
  }
  if (compact) {
    return (
      <ul className="space-y-0.5 text-[13px] leading-snug">
        {groups.map((g) => (
          <li key={g.key}>
            <b className="font-semibold">{g.targets.join(', ')}</b>
            <span className="text-gray-500"> — {[`${g.parts.codec} ${g.parts.ext}`, g.parts.res, g.parts.media, g.note].filter(Boolean).join(' · ')}</span>
          </li>
        ))}
      </ul>
    )
  }
  const chip = 'px-1.5 py-px rounded bg-gray-100 text-gray-700 text-xs whitespace-nowrap'
  return (
    <ul className="space-y-1">
      {groups.map((g) => (
        <li key={g.key} className="flex items-baseline gap-x-2 gap-y-1 flex-wrap">
          <span className="font-medium">{g.targets.join(', ')}</span>
          <span className="flex items-center gap-1 flex-wrap">
            <span className={chip}>{g.parts.codec} <span className="text-gray-400">{g.parts.ext}</span></span>
            {g.parts.res && <span className={chip}>{g.parts.res}</span>}
            {g.parts.media && <span className={chip}>{g.parts.media}</span>}
          </span>
          {g.note && <span className="text-xs text-gray-500">{g.note}</span>}
        </li>
      ))}
    </ul>
  )
}
