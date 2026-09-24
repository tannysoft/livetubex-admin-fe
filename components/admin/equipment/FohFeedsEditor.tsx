'use client'

import { ArrowRightIcon, ExclamationTriangleIcon, PlusIcon, Squares2X2Icon, XMarkIcon } from '@heroicons/react/24/outline'
import FormListbox from '@/components/ui/FormListbox'
import FormCheckbox from '@/components/ui/FormCheckbox'
import SuggestInput from '@/components/ui/SuggestInput'
import VideoFormatPicker from '@/components/admin/equipment/VideoFormatPicker'
import { newId } from '@/lib/equipment/plans'
import { DEFAULT_VIDEO_FORMAT } from '@/lib/equipment/video-format'
import {
  FEED_CONNECTIONS, FEED_DESTINATIONS, FEED_PRESETS, FEED_SOURCES, feedFormatLabel, interlacedToProgressive,
} from '@/lib/equipment/foh-feeds'
import type { FeedConnection, FohFeed, VideoFormat } from '@/lib/types'

interface FohFeedsEditorProps {
  value: FohFeed[] | undefined
  onChange: (next: FohFeed[]) => void
  /** ระบบภาพหลักของแผน — feed ที่ไม่ตั้ง format เองใช้ค่านี้ */
  mainFormat?: VideoFormat
  /** กด "จัดผังส่ง FOH" → สร้าง/อัปเดตผังโยงจาก feed (ไม่ส่ง = ไม่มีปุ่ม) */
  onBuildDiagram?: () => void
}

const inputCls = 'w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand'

/** สัญญาณที่ส่งให้ทีม Visual ที่ FOH — แถวละ 1 feed */
export default function FohFeedsEditor({ value, onChange, mainFormat, onBuildDiagram }: FohFeedsEditorProps) {
  const list = value ?? []
  const patch = (id: string, p: Partial<FohFeed>) => onChange(list.map((f) => (f.id === id ? { ...f, ...p } : f)))
  const add = (preset: Omit<FohFeed, 'id'>) => onChange([...list, { id: newId(), ...preset }])

  return (
    <div className="space-y-2">
      {list.map((f, i) => (
        <div key={f.id} className="rounded-xl border border-gray-200 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <span className="shrink-0 mt-2 w-6 text-center text-xs font-bold text-gray-400">{i + 1}</span>
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_0.8fr_0.7fr] gap-2 items-center">
              <SuggestInput className={inputCls} value={f.source} onChange={(v) => patch(f.id, { source: v })} options={FEED_SOURCES} placeholder="สัญญาณ เช่น PGM, AUX 1" />
              <ArrowRightIcon className="hidden sm:block w-4 h-4 text-gray-300" />
              <SuggestInput className={inputCls} value={f.destination} onChange={(v) => patch(f.id, { destination: v })} options={FEED_DESTINATIONS} placeholder="ส่งเข้า เช่น LED Processor" />
              <FormListbox value={f.connection} onChange={(v) => patch(f.id, { connection: v as FeedConnection })} options={FEED_CONNECTIONS} />
              <input className={inputCls} value={f.cableLength ?? ''} onChange={(e) => patch(f.id, { cableLength: e.target.value })} placeholder="ระยะสาย" />
            </div>
            <button type="button" onClick={() => onChange(list.filter((x) => x.id !== f.id))} title="ลบ" className="shrink-0 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="pl-8 pr-10 space-y-2">
            <FormCheckbox
              size="sm"
              checked={!f.format}
              // เลิกติ๊ก → เริ่มจากระบบหลัก แล้วปรับเฉพาะที่ต่าง
              onChange={(same) => patch(f.id, { format: same ? undefined : { ...(mainFormat ?? DEFAULT_VIDEO_FORMAT), note: undefined } })}
              label={`ใช้ระบบภาพหลัก${mainFormat ? '' : ' (แผนยังไม่ได้ระบุ)'}`}
            />
            {f.format && <VideoFormatPicker compact withNote={false} value={f.format} onChange={(v) => patch(f.id, { format: v })} />}
            <div className="grid grid-cols-1 sm:grid-cols-[0.8fr_1.2fr] gap-2">
              <input className={inputCls} value={f.destInput ?? ''} onChange={(e) => patch(f.id, { destInput: e.target.value })} placeholder="ช่องรับปลายทาง เช่น E2 Input 3 (SDI)" />
              <input className={inputCls} value={f.note ?? ''} onChange={(e) => patch(f.id, { note: e.target.value })} placeholder="หมายเหตุ เช่น มีกราฟิก, ขอ tally, ผู้ประสานทีม Visual" />
            </div>
            <p className="text-[11px] text-gray-500">format ที่ส่ง: <b className="text-gray-700">{feedFormatLabel(f, mainFormat)}</b></p>
            {interlacedToProgressive(f, mainFormat) && (
              <p className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
                <ExclamationTriangleIcon className="w-3.5 h-3.5 shrink-0 mt-px" />
                {f.destination} ทำงานแบบ progressive — ส่ง 1080i ไปมักต้อง deinterlace ภาพเคลื่อนไหวจะเป็นหวี เช็กกับทีม Visual หรือเลิกติ๊ก “ใช้ระบบภาพหลัก” แล้วตั้ง 1080p (ผังจะแทรก cross converter ให้)
              </p>
            )}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-1.5">
        {FEED_PRESETS.map((p) => (
          <button
            key={`${p.source}-${p.destination}`}
            type="button"
            onClick={() => add(p)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:border-gray-300"
          >
            <PlusIcon className="w-3 h-3" /> {p.source} → {p.destination}
          </button>
        ))}
        <button type="button" onClick={() => add({ source: '', destination: '', connection: 'SDI' })} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand-soft rounded-lg">
          <PlusIcon className="w-3 h-3" /> เพิ่มเอง
        </button>
        {onBuildDiagram && list.length > 0 && (
          <button type="button" onClick={onBuildDiagram} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-medium hover:bg-brand-dark">
            <Squares2X2Icon className="w-3.5 h-3.5" /> จัดผังส่ง FOH
          </button>
        )}
      </div>
    </div>
  )
}
