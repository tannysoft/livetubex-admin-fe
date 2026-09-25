'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  PlusIcon, TrashIcon, DocumentDuplicateIcon, PrinterIcon, ClipboardDocumentListIcon, MapPinIcon, ShareIcon, CubeIcon,
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
import { THAI_MONTHS_SHORT, formatDate, thaiYear } from '@/lib/utils'
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
          <h1 className="text-2xl font-bold text-gray-900">แผนจัดอุปกรณ์ / ผังระบบ</h1>
          <p className="text-gray-500 mt-1">รายการของที่ใช้ต่องาน จดว่าโยกไปไหน พร้อมผังระบบ</p>
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
            const total = plan.items.length
            const pct = total ? Math.round((packed / total) * 100) : 0
            const cal = calendarBadge(plan.date, plan.endDate)
            const layouts = plan.layouts?.length ?? 0
            const href = `/admin/equipment/plans/edit?id=${plan.id}`
            return (
              // ทั้งการ์ดกดเปิดแผนได้ (Link ซ้อนชั้นล่าง) — ปุ่มพิมพ์/สำเนา/ลบอยู่ชั้นบน
              <div key={plan.id} className="group relative bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all p-4 flex gap-4">
                <Link href={href} aria-label={`เปิดแผน ${plan.title}`} className="absolute inset-0 rounded-2xl" />
                <div className={`shrink-0 w-16 rounded-xl text-center py-2 ${cal ? 'bg-brand-soft text-brand' : 'bg-gray-50 text-gray-400'}`}>
                  {cal ? (
                    <>
                      <p className="text-[11px] font-semibold leading-none">{cal.month}</p>
                      <p className={`font-bold leading-tight mt-1 tabular-nums ${cal.days.length > 2 ? 'text-base' : 'text-2xl'}`}>{cal.days}</p>
                      <p className="text-[10px] opacity-70 leading-none mt-0.5">{cal.year}</p>
                    </>
                  ) : <p className="text-[11px] pt-3">ไม่มีวัน</p>}
                </div>

                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="flex items-start gap-2">
                    <p className="flex-1 min-w-0 font-semibold text-gray-900 group-hover:text-brand line-clamp-2 leading-snug">{plan.title}</p>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium ${status?.color ?? ''}`}>{status?.label}</span>
                  </div>
                  {plan.location && (
                    <p className="flex items-center gap-1 text-xs text-gray-500 mt-0.5 truncate">
                      <MapPinIcon className="w-3.5 h-3.5 shrink-0" />{plan.location}
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                    <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className={`h-full rounded-full ${pct === 100 ? 'bg-green-500' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="tabular-nums shrink-0">จัดแล้ว <b className="text-gray-800">{packed}/{total}</b></span>
                  </div>

                  <div className="mt-3 flex items-center gap-1.5 flex-wrap text-[11px] text-gray-600">
                    <Stat icon={<ClipboardDocumentListIcon className="w-3.5 h-3.5" />}>{total} รายการ</Stat>
                    {plan.diagrams.length > 0 && <Stat icon={<ShareIcon className="w-3.5 h-3.5" />}>ผังระบบ</Stat>}
                    {layouts > 0 && <Stat icon={<CubeIcon className="w-3.5 h-3.5" />}>3D{layouts > 1 ? ` ×${layouts}` : ''}</Stat>}
                    {plan.videoFormat && <Stat>{formatShortLabel(plan.videoFormat)}{plan.videoFormat.range !== 'SDR' ? ` ${plan.videoFormat.range}` : ''}</Stat>}
                    <div className="relative ml-auto flex items-center opacity-60 group-hover:opacity-100 transition-opacity">
                      <Link title="พิมพ์" href={`/admin/equipment/plans/print?id=${plan.id}`} className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg">
                        <PrinterIcon className="w-4 h-4" />
                      </Link>
                      <button title="ทำสำเนา" onClick={() => handleDuplicate(plan)} className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg">
                        <DocumentDuplicateIcon className="w-4 h-4" />
                      </button>
                      <button title="ลบ" onClick={() => setDeleteTarget(plan)} className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
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
        message={`ต้องการลบแผน "${deleteTarget?.title}" พร้อมรายการและผังระบบทั้งหมดใช่หรือไม่?`}
        confirmLabel="ลบ"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
        danger
      />
    </div>
  )
}

/** ป้ายปฏิทินบนการ์ด: "ก.ย." / "26–27" / "2569" — งานข้ามเดือน = "ก.ย.–ต.ค." */
function calendarBadge(date?: string, endDate?: string) {
  if (!date) return null
  const a = new Date(date + 'T00:00:00')
  const b = endDate && endDate > date ? new Date(endDate + 'T00:00:00') : a
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
  return {
    month: sameMonth ? THAI_MONTHS_SHORT[a.getMonth()] : `${THAI_MONTHS_SHORT[a.getMonth()]}–${THAI_MONTHS_SHORT[b.getMonth()]}`,
    days: a.getTime() === b.getTime() ? `${a.getDate()}` : `${a.getDate()}–${b.getDate()}`,
    year: String(thaiYear(b.getFullYear())),
  }
}

function Stat({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-50 border border-gray-100">{icon}{children}</span>
}
