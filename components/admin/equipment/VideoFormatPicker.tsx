'use client'

import FormListbox from '@/components/ui/FormListbox'
import {
  RANGES, RESOLUTIONS, VIDEO_PRESETS, DEFAULT_VIDEO_FORMAT, formatFullLabel, formatShortLabel, frameRatesFor, sameFormat,
} from '@/lib/equipment/video-format'
import type { VideoFormat, VideoRange, VideoResolution } from '@/lib/types'

interface VideoFormatPickerProps {
  value?: VideoFormat
  onChange: (v: VideoFormat | undefined) => void
  /** แสดงช่องหมายเหตุ (สตรีม/ส่งออก) */
  withNote?: boolean
  /** ย่อ: ไม่มีปุ่มลัดและบรรทัดสรุป (ใช้ในแถว feed FOH) */
  compact?: boolean
}

const inputCls = 'w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand'

/** เลือกระบบภาพของงาน — ปุ่มลัดที่ใช้บ่อย + ปรับละเอียดเอง */
export default function VideoFormatPicker({ value, onChange, withNote = true, compact = false }: VideoFormatPickerProps) {
  const v = value ?? DEFAULT_VIDEO_FORMAT
  const set = (patch: Partial<VideoFormat>) => {
    const next = { ...v, ...patch }
    // เปลี่ยน interlaced ↔ progressive แล้ว frame rate เดิมใช้ไม่ได้ → เลือกค่าที่ใกล้สุด
    const rates = frameRatesFor(next.resolution)
    if (!rates.includes(next.frameRate)) next.frameRate = rates.reduce((a, b) => (Math.abs(b - next.frameRate) < Math.abs(a - next.frameRate) ? b : a))
    onChange(next)
  }

  return (
    <div className="space-y-2">
      {!compact && <div className="flex flex-wrap gap-1.5">
        {VIDEO_PRESETS.map((p) => {
          const active = sameFormat(value, p)
          return (
            <button
              key={`${formatShortLabel(p)}-${p.range}`}
              type="button"
              onClick={() => onChange({ ...p, ...(value?.note ? { note: value.note } : {}) })}
              className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${active ? 'border-brand bg-brand-soft text-gray-900' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
            >
              {formatShortLabel(p)}{p.range !== 'SDR' ? ` ${p.range}` : ''}
            </button>
          )
        })}
        {value && (
          <button type="button" onClick={() => onChange(undefined)} className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600">ไม่ระบุ</button>
        )}
      </div>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <FormListbox value={v.resolution} onChange={(x) => set({ resolution: x as VideoResolution })} options={RESOLUTIONS} />
        <FormListbox
          value={String(v.frameRate)}
          onChange={(x) => set({ frameRate: Number(x) })}
          options={frameRatesFor(v.resolution).map((r) => ({ value: String(r), label: `${r} ${v.resolution === '1080i' ? 'fields/s (i)' : 'fps'}` }))}
        />
        <FormListbox value={v.range} onChange={(x) => set({ range: x as VideoRange })} options={RANGES} />
      </div>
      {withNote && (
        <input
          className={inputCls}
          value={value?.note ?? ''}
          onChange={(e) => set({ note: e.target.value })}
          placeholder="ส่งออก / สตรีม เช่น สตรีม YouTube 1080p25, ส่งสัญญาณให้ช่อง 1080i50"
        />
      )}
      {!compact && <p className={`text-xs ${value ? 'text-gray-500' : 'text-gray-400'}`}>
        {value ? <>หัวกระดาษ: <b className="text-gray-700">{formatFullLabel(value)}</b></> : 'ยังไม่ระบุ — กดปุ่มด้านบนหรือเลือกเอง'}
      </p>}
    </div>
  )
}
