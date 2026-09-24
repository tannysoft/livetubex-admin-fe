'use client'

import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline'
import FormListbox from '@/components/ui/FormListbox'
import SuggestInput from '@/components/ui/SuggestInput'
import { newId } from '@/lib/equipment/plans'
import {
  RECORDING_CODECS, RECORDING_CONTAINERS, RECORDING_MEDIA, RECORDING_PRESETS, RECORDING_RESOLUTIONS, RECORDING_TARGETS,
  defaultContainer, recordingsLabel,
} from '@/lib/equipment/recording-format'
import type { RecordingContainer, RecordingSpec, VideoFormat } from '@/lib/types'
import { formatShortLabel } from '@/lib/equipment/video-format'

interface RecordingFormatsEditorProps {
  value: RecordingSpec[] | undefined
  onChange: (next: RecordingSpec[]) => void
  /** ระบบภาพหลักของแผน — รายการที่ไม่ใส่ความละเอียดเองใช้ค่านี้ */
  mainFormat?: VideoFormat
}

const inputCls = 'w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand'

/** format ไฟล์บันทึก — หลายรายการต่อแผน (PGM / ISO / สำรอง) */
export default function RecordingFormatsEditor({ value, onChange, mainFormat }: RecordingFormatsEditorProps) {
  const mainLabel = mainFormat ? formatShortLabel(mainFormat) : ''
  const list = value ?? []
  const patch = (id: string, p: Partial<RecordingSpec>) => onChange(list.map((r) => (r.id === id ? { ...r, ...p } : r)))
  const add = (preset: Omit<RecordingSpec, 'id'>) => onChange([...list, { id: newId(), ...preset }])

  return (
    <div className="space-y-2">
      {list.map((r) => (
        // 2 บรรทัด + minmax(0,…) — ไม่งั้น dropdown codec (ชื่อยาว) ดันช่องพิมพ์จนเหลือตัวอักษรเดียว
        <div key={r.id} className="flex items-start gap-2 rounded-xl border border-gray-200 p-2">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_7rem] gap-2">
              <SuggestInput className={inputCls} value={r.target} onChange={(v) => patch(r.id, { target: v })} options={RECORDING_TARGETS} placeholder="บันทึกอะไร เช่น PGM, ISO ทุกกล้อง" />
              <FormListbox
                value={r.codec}
                // เปลี่ยน codec → เปลี่ยนนามสกุลไฟล์ตาม (ProRes = .mov, H.264 = .mp4 …) แก้ทีหลังได้
                onChange={(v) => patch(r.id, { codec: v, container: defaultContainer(v) })}
                options={[
                  ...RECORDING_CODECS.map((c) => ({ value: c.value, label: c.label })),
                  ...(RECORDING_CODECS.some((c) => c.value === r.codec) ? [] : [{ value: r.codec, label: r.codec }]),
                ]}
              />
              <FormListbox value={r.container} onChange={(v) => patch(r.id, { container: v as RecordingContainer })} options={RECORDING_CONTAINERS} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)] gap-2">
              <SuggestInput
                className={inputCls}
                value={r.resolution ?? ''}
                onChange={(v) => patch(r.id, { resolution: v })}
                options={RECORDING_RESOLUTIONS}
                placeholder={mainLabel ? `ตามระบบหลัก ${mainLabel}` : 'ความละเอียด เช่น 4K DCI 25p'}
              />
              <SuggestInput className={inputCls} value={r.media ?? ''} onChange={(v) => patch(r.id, { media: v })} options={RECORDING_MEDIA} placeholder="สื่อบันทึก เช่น SSD, HyperDeck" />
              <input className={inputCls} value={r.note ?? ''} onChange={(e) => patch(r.id, { note: e.target.value })} placeholder="bitrate / เครื่อง / ชื่อไฟล์" />
            </div>
          </div>
          <button type="button" onClick={() => onChange(list.filter((x) => x.id !== r.id))} title="ลบ" className="shrink-0 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-1.5">
        {RECORDING_PRESETS.map((p) => (
          <button
            key={`${p.target}-${p.codec}`}
            type="button"
            onClick={() => add(p)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:border-gray-300"
          >
            <PlusIcon className="w-3 h-3" /> {p.target} {p.codec}
          </button>
        ))}
        <button
          type="button"
          onClick={() => add({ target: '', codec: 'ProRes 422 HQ', container: 'MOV' })}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand-soft rounded-lg"
        >
          <PlusIcon className="w-3 h-3" /> เพิ่มเอง
        </button>
      </div>
      {list.length > 0 && (
        <p className="text-xs text-gray-500">หัวกระดาษ: <b className="text-gray-700">{recordingsLabel(list, mainFormat)}</b></p>
      )}
    </div>
  )
}
