'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  PlusIcon, TrashIcon, DocumentDuplicateIcon, PrinterIcon, ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import FormListbox from '@/components/ui/FormListbox'
import FormDatePicker from '@/components/ui/FormDatePicker'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  getEquipmentPlans, createEquipmentPlan, deleteEquipmentPlan,
} from '@/lib/equipment/plans'
import { PLAN_STATUSES } from '@/lib/equipment/constants'
import { getJobs } from '@/lib/firebase-utils'
import { formatDate } from '@/lib/utils'
import VideoFormatPicker from '@/components/admin/equipment/VideoFormatPicker'
import RecordingFormatsEditor from '@/components/admin/equipment/RecordingFormatsEditor'
import { DEFAULT_VIDEO_FORMAT, formatShortLabel } from '@/lib/equipment/video-format'
import type { EquipmentPlan, Job, RecordingSpec, VideoFormat } from '@/lib/types'

const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand'

export default function EquipmentPlansPage() {
  const router = useRouter()
  const [plans, setPlans] = useState<EquipmentPlan[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<EquipmentPlan | null>(null)

  const [title, setTitle] = useState('')
  const [jobId, setJobId] = useState('')
  const [date, setDate] = useState('')
  const [location, setLocation] = useState('')
  const [videoFormat, setVideoFormat] = useState<VideoFormat | undefined>(DEFAULT_VIDEO_FORMAT)
  const [recordings, setRecordings] = useState<RecordingSpec[]>([])
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [p, j] = await Promise.all([getEquipmentPlans(), getJobs()])
      setPlans(p)
      setJobs(j)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const pickJob = (id: string) => {
    const prev = jobs.find((j) => j.id === jobId)
    const job = jobs.find((j) => j.id === id)
    setJobId(id)
    // ช่องที่ยังว่าง หรือยังเป็นค่าที่เติมมาจากงานก่อนหน้า → เปลี่ยนตามงานใหม่
    // ช่องที่ผู้ใช้พิมพ์แก้เองแล้ว → ไม่ทับ
    const follows = (current: string, prevValue?: string) => !current.trim() || current === (prevValue ?? '')
    if (follows(title, prev?.title)) setTitle(job?.title ?? '')
    if (follows(date, prev?.date)) setDate(job?.date ?? '')
    if (follows(location, prev?.location)) setLocation(job?.location ?? '')
  }

  const handleCreate = async () => {
    if (!title.trim()) { setError('กรุณากรอกชื่อแผน'); return }
    setCreating(true)
    try {
      const job = jobs.find((j) => j.id === jobId)
      const id = await createEquipmentPlan({
        title: title.trim(),
        jobId: job?.id,
        jobTitle: job?.title,
        date: date || undefined,
        endDate: job?.endDate && date === job.date ? job.endDate : undefined,
        location: location.trim() || undefined,
        videoFormat,
        recordings,
        status: 'draft',
        items: [],
        diagrams: [],
      })
      router.push(`/admin/equipment/plans/edit?id=${id}`)
    } finally {
      setCreating(false)
    }
  }

  /** งาน OB มัก setup ซ้ำเดิม — สำเนาทั้งรายการ+ผัง แล้วล้างสถานะจัดของ */
  const handleDuplicate = async (plan: EquipmentPlan) => {
    const id = await createEquipmentPlan({
      title: `${plan.title} (สำเนา)`,
      location: plan.location,
      videoFormat: plan.videoFormat,
      recordings: plan.recordings ?? [],
      fohFeeds: plan.fohFeeds ?? [],
      status: 'draft',
      notes: plan.notes,
      // สำเนา = งานใหม่ → ค่าเช่ายังไม่ได้ลงบัญชี (ถอด expenseId ไม่งั้นต้นทุนงานใหม่จะไม่ถูกนับ)
      items: plan.items.map((it) => ({ ...it, packed: false, returned: false, expenseId: undefined, expenseCode: undefined })),
      diagrams: plan.diagrams,
      layouts: plan.layouts ?? [],
      extraCosts: (plan.extraCosts ?? []).map((c) => ({ ...c, expenseId: undefined, expenseCode: undefined })),
    })
    router.push(`/admin/equipment/plans/edit?id=${id}`)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await deleteEquipmentPlan(deleteTarget.id)
    setDeleteTarget(null)
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">แผนจัดอุปกรณ์ / ผังโยง</h1>
          <p className="text-gray-500 mt-1">รายการของที่ใช้ต่องาน จดว่าโยกไปไหน พร้อมผังโยงสัญญาณ</p>
        </div>
        <button
          onClick={() => { setError(''); setJobId(''); setTitle(''); setDate(''); setLocation(''); setVideoFormat(DEFAULT_VIDEO_FORMAT); setRecordings([]); setShowCreate(true) }}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand text-white text-sm font-medium rounded-xl hover:bg-brand-dark transition-colors"
        >
          <PlusIcon className="w-4 h-4" /> สร้างแผนใหม่
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
        </div>
      ) : plans.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
          <ClipboardDocumentListIcon className="w-10 h-10 text-gray-300 mx-auto" />
          <p className="text-gray-400 text-sm mt-3">ยังไม่มีแผนจัดอุปกรณ์</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {plans.map((plan) => {
            const status = PLAN_STATUSES.find((s) => s.value === plan.status)
            const packed = plan.items.filter((i) => i.packed).length
            return (
              <div key={plan.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/admin/equipment/plans/edit?id=${plan.id}`} className="font-semibold text-gray-900 hover:text-brand line-clamp-2">
                    {plan.title}
                  </Link>
                  <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${status?.color ?? ''}`}>{status?.label}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {[plan.date ? `${formatDate(plan.date)}${plan.endDate && plan.endDate !== plan.date ? ` – ${formatDate(plan.endDate)}` : ''}` : '', plan.location].filter(Boolean).join(' · ') || '—'}
                </p>
                <div className="mt-4 flex gap-4 text-sm text-gray-600">
                  <span><b className="text-gray-900">{plan.items.length}</b> รายการ</span>
                  <span>จัดแล้ว <b className="text-gray-900">{packed}/{plan.items.length}</b></span>
                  <span><b className="text-gray-900">{plan.diagrams.length + (plan.layouts?.length ?? 0)}</b> ผัง</span>
                  {plan.videoFormat && <span className="ml-auto px-2 py-0.5 rounded-md bg-gray-100 text-xs font-medium text-gray-700">{formatShortLabel(plan.videoFormat)}{plan.videoFormat.range !== 'SDR' ? ` ${plan.videoFormat.range}` : ''}</span>}
                </div>
                <div className="mt-4 pt-3 border-t border-gray-50 flex items-center gap-1">
                  <Link href={`/admin/equipment/plans/edit?id=${plan.id}`} className="px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand-soft rounded-lg transition-colors">
                    เปิดแผน
                  </Link>
                  <div className="flex-1" />
                  <Link title="พิมพ์" href={`/admin/equipment/plans/print?id=${plan.id}`} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                    <PrinterIcon className="w-4 h-4" />
                  </Link>
                  <button title="ทำสำเนา" onClick={() => handleDuplicate(plan)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                    <DocumentDuplicateIcon className="w-4 h-4" />
                  </button>
                  <button title="ลบ" onClick={() => setDeleteTarget(plan)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="สร้างแผนจัดอุปกรณ์" size="lg">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">ผูกกับงาน (ไม่บังคับ)</label>
            <FormListbox
              value={jobId}
              onChange={pickJob}
              options={[{ value: '', label: 'ไม่ผูกกับงาน' }, ...jobs.map((j) => ({ value: j.id, label: `${j.title} — ${formatDate(j.date)}` }))]}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">ชื่อแผน *</label>
            <input className={inputCls} value={title} onChange={(e) => { setTitle(e.target.value); setError('') }} placeholder="เช่น OB คอนเสิร์ต Impact Arena" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">วันที่</label>
              <FormDatePicker value={date} onChange={setDate} allowClear />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">สถานที่</label>
              <input className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">ระบบภาพ</label>
            <VideoFormatPicker value={videoFormat} onChange={setVideoFormat} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">format ไฟล์บันทึก</label>
            <RecordingFormatsEditor value={recordings} onChange={setRecordings} mainFormat={videoFormat} />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">ยกเลิก</button>
            <button onClick={handleCreate} disabled={creating} className="px-5 py-2.5 bg-brand text-white text-sm font-medium rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-60">
              {creating ? 'กำลังสร้าง...' : 'สร้างแผน'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="ลบแผน"
        message={`ต้องการลบแผน "${deleteTarget?.title}" พร้อมรายการและผังโยงทั้งหมดใช่หรือไม่?`}
        confirmLabel="ลบ"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
        danger
      />
    </div>
  )
}
