'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import FormListbox from '@/components/ui/FormListbox'
import FormDatePicker from '@/components/ui/FormDatePicker'
import VideoFormatPicker from '@/components/admin/equipment/VideoFormatPicker'
import RecordingFormatsEditor from '@/components/admin/equipment/RecordingFormatsEditor'
import FohFeedsEditor from '@/components/admin/equipment/FohFeedsEditor'
import { PLAN_STATUSES } from '@/lib/equipment/constants'
import { formatDate } from '@/lib/utils'
import type { EquipmentPlan, EquipmentPlanStatus, Job } from '@/lib/types'

/** field หัวแผนที่แก้ใน modal นี้ — ที่เหลือ (รายการ/ผัง) แก้ในแท็บ */
export type PlanInfo = Pick<EquipmentPlan,
  'title' | 'jobId' | 'jobTitle' | 'date' | 'endDate' | 'location' | 'status' | 'videoFormat' | 'recordings' | 'fohFeeds' | 'notes'>

interface PlanInfoModalProps {
  isOpen: boolean
  onClose: () => void
  plan: EquipmentPlan
  jobs: Job[]
  onSave: (patch: PlanInfo) => void
}

const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand'
const labelCls = 'block text-xs font-semibold text-gray-500 mb-1.5'

function pickInfo(p: EquipmentPlan): PlanInfo {
  return {
    title: p.title, jobId: p.jobId, jobTitle: p.jobTitle, date: p.date, endDate: p.endDate, location: p.location,
    status: p.status, videoFormat: p.videoFormat, recordings: p.recordings, fohFeeds: p.fohFeeds, notes: p.notes,
  }
}

/**
 * แก้ข้อมูลหัวแผน — แก้เป็นร่างใน modal แล้วค่อยเข้าแผน (autosave) ตอนกดบันทึก ยกเลิกได้
 * ร่างเริ่มใหม่ทุกครั้งที่เปิด (หน้าแก้แผน mount ใหม่ด้วย key)
 */
export default function PlanInfoModal({ isOpen, onClose, plan, jobs, onSave }: PlanInfoModalProps) {
  const [draft, setDraft] = useState<PlanInfo>(() => pickInfo(plan))
  const set = (patch: Partial<PlanInfo>) => setDraft((d) => ({ ...d, ...patch }))

  const pickJob = (id: string) => {
    const prev = jobs.find((j) => j.id === draft.jobId)
    const job = jobs.find((j) => j.id === id)
    // ช่องที่ว่าง/ยังเป็นค่าจากงานเดิม → เปลี่ยนตามงานใหม่ ส่วนที่พิมพ์แก้เองแล้วไม่ทับ
    const follow = (current: string | undefined, prevValue?: string, next?: string) =>
      !current?.trim() || current === (prevValue ?? '') ? next ?? '' : current
    set({
      jobId: job?.id ?? '',
      jobTitle: job?.title ?? '',
      title: follow(draft.title, prev?.title, job?.title) || draft.title,
      date: follow(draft.date, prev?.date, job?.date),
      endDate: follow(draft.endDate, prev?.endDate, job?.endDate),
      location: follow(draft.location, prev?.location, job?.location),
    })
  }

  const save = () => {
    onSave({ ...draft, title: draft.title.trim() || plan.title })
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="แก้ไขข้อมูลแผน" size="4xl">
      <div className="space-y-4">
        <div>
          <label className={labelCls}>ชื่อแผน</label>
          <input className={`${inputCls} text-base font-semibold`} value={draft.title} onChange={(e) => set({ title: e.target.value })} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>งาน</label>
            <FormListbox
              value={draft.jobId ?? ''}
              onChange={pickJob}
              options={[{ value: '', label: 'ไม่ผูกกับงาน' }, ...jobs.map((j) => ({ value: j.id, label: `${j.title} — ${formatDate(j.date)}` }))]}
            />
          </div>
          <div>
            <label className={labelCls}>สถานะ</label>
            <FormListbox value={draft.status} onChange={(v) => set({ status: v as EquipmentPlanStatus })} options={PLAN_STATUSES} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>วันที่</label>
              <FormDatePicker value={draft.date ?? ''} onChange={(v) => set({ date: v })} allowClear />
            </div>
            <div>
              <label className={labelCls}>ถึงวันที่</label>
              <FormDatePicker value={draft.endDate ?? ''} onChange={(v) => set({ endDate: v })} minDate={draft.date || undefined} allowClear />
            </div>
          </div>
          <div>
            <label className={labelCls}>สถานที่</label>
            <input className={inputCls} value={draft.location ?? ''} onChange={(e) => set({ location: e.target.value })} />
          </div>
        </div>
        <div>
          <label className={labelCls}>ระบบภาพ (โชว์บนหัวกระดาษทุกหน้า)</label>
          <VideoFormatPicker value={draft.videoFormat} onChange={(v) => set({ videoFormat: v })} />
        </div>
        <div>
          <label className={labelCls}>format ไฟล์บันทึก</label>
          <RecordingFormatsEditor value={draft.recordings} onChange={(recordings) => set({ recordings })} mainFormat={draft.videoFormat} />
        </div>
        <div>
          <label className={labelCls}>ส่งภาพให้ทีม Visual (FOH)</label>
          <FohFeedsEditor value={draft.fohFeeds} onChange={(fohFeeds) => set({ fohFeeds })} mainFormat={draft.videoFormat} />
        </div>
        <div>
          <label className={labelCls}>หมายเหตุของแผน</label>
          <textarea className={inputCls} rows={3} value={draft.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} placeholder="เช่น เวลาโหลดของ, รถที่ใช้, ผู้รับผิดชอบ" />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl">ยกเลิก</button>
          <button onClick={save} className="px-5 py-2.5 bg-brand text-white text-sm font-medium rounded-xl hover:bg-brand-dark">บันทึก</button>
        </div>
      </div>
    </Modal>
  )
}
