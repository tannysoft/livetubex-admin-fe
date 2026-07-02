'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  MapPinIcon,
  CalendarIcon,
  MagnifyingGlassIcon,
  EyeIcon,
  EyeSlashIcon,
  BuildingOffice2Icon,
  BanknotesIcon,
} from '@heroicons/react/24/outline'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Badge from '@/components/ui/Badge'
import {
  getJobs,
  updateJob,
  deleteJob,
} from '@/lib/firebase-utils'
import type { Job } from '@/lib/types'
import { formatCurrency, formatDate, jobStatusColor, jobStatusLabel, paymentCycleLabel } from '@/lib/utils'
import { SkeletonCard } from '@/components/ui/Skeleton'

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [deleteJobId, setDeleteJobId] = useState<string | null>(null)

  const loadJobs = async () => {
    setLoading(true)
    try {
      const data = await getJobs()
      setJobs(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadJobs()
  }, [])

  const handleDelete = async (id: string) => {
    await deleteJob(id)
    loadJobs()
  }

  // toggle แสดง/ซ่อนใน LIFF (default = true ถ้าไม่เคยตั้งค่า)
  const handleToggleShowInLiff = async (job: Job) => {
    const current = job.showInLiff !== false  // undefined → treated as true
    const next = !current
    // optimistic update
    setJobs((prev) => prev.map((j) => j.id === job.id ? { ...j, showInLiff: next } : j))
    try {
      await updateJob(job.id, { showInLiff: next })
    } catch {
      // rollback ถ้า error
      setJobs((prev) => prev.map((j) => j.id === job.id ? { ...j, showInLiff: current } : j))
    }
  }

  const filtered = jobs.filter(
    (j) =>
      j.title.toLowerCase().includes(search.toLowerCase()) ||
      j.location.toLowerCase().includes(search.toLowerCase()) ||
      j.clientName.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">จัดการงานถ่ายทอดสด</h1>
          <p className="text-gray-500 mt-1">{jobs.length} งานทั้งหมด</p>
        </div>
        <Link
          href="/admin/jobs/new"
          className="flex items-center gap-2 px-5 py-2.5 bg-[#f73727] text-white text-sm font-medium rounded-xl hover:bg-red-600 transition-colors shadow-md shadow-red-200"
        >
          <PlusIcon className="w-4 h-4" />
          เพิ่มงานใหม่
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่องาน สถานที่ หรือลูกค้า..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727] bg-white"
        />
      </div>

      {/* Job cards */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg font-medium">ไม่พบงาน</p>
          <p className="text-sm mt-1">ลองเปลี่ยนคำค้นหา หรือเพิ่มงานใหม่</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((job) => {
            const showing = job.showInLiff !== false
            const dateLabel = `${formatDate(job.date)}${job.endDate && job.endDate !== job.date ? ` – ${formatDate(job.endDate)}` : ''}`
            return (
              <div
                key={job.id}
                className="group flex bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all overflow-hidden"
              >
                {/* แถบสีสถานะด้านซ้าย */}
                <div className={`w-1.5 shrink-0 ${jobStatusBar(job.status)}`} />

                <div className="flex-1 min-w-0 p-5">
                  {/* header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/admin/jobs/new?id=${job.id}`}
                          className="font-semibold text-gray-900 leading-snug hover:text-[#f73727] transition-colors"
                        >
                          {job.title}
                        </Link>
                        <Badge label={jobStatusLabel(job.status)} colorClass={jobStatusColor(job.status)} />
                      </div>
                      {job.description && (
                        <p className="text-sm text-gray-500 mt-1 line-clamp-1">{job.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleToggleShowInLiff(job)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          showing ? 'text-green-600 bg-green-50 hover:bg-green-100' : 'text-gray-300 hover:bg-gray-100'
                        }`}
                        title={showing ? 'แสดงใน LIFF · กดเพื่อซ่อน' : 'ซ่อนจาก LIFF · กดเพื่อแสดง'}
                      >
                        {showing ? <EyeIcon className="w-4 h-4" /> : <EyeSlashIcon className="w-4 h-4" />}
                      </button>
                      <Link
                        href={`/admin/jobs/new?id=${job.id}`}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => setDeleteJobId(job.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* meta grid */}
                  <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                    <MetaItem icon={CalendarIcon} label="วันงาน" value={dateLabel} />
                    <MetaItem icon={MapPinIcon} label="สถานที่" value={job.location || '—'} />
                    <MetaItem icon={BuildingOffice2Icon} label="ลูกค้า" value={job.clientName || '—'} />
                    <MetaItem icon={BanknotesIcon} label="ราคาขาย" value={formatCurrency(job.budget)} valueClass="text-[#f73727] font-bold" />
                  </div>

                  {job.paymentCycle && (
                    <div className="mt-3 pt-3 border-t border-gray-50">
                      <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg text-xs font-medium">
                        รอบจ่าย: {paymentCycleLabel(job.paymentCycle)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Delete Dialog */}
      <ConfirmDialog
        isOpen={!!deleteJobId}
        onClose={() => setDeleteJobId(null)}
        onConfirm={() => deleteJobId && handleDelete(deleteJobId)}
        title="ลบงาน"
        message="ต้องการลบงานนี้ใช่หรือไม่? ข้อมูลจะถูกลบถาวร"
        confirmLabel="ลบ"
        danger
      />

    </div>
  )
}

// สีแถบสถานะด้านซ้ายของ card
function jobStatusBar(status: string): string {
  switch (status) {
    case 'published': return 'bg-blue-400'
    case 'in_progress': return 'bg-amber-400'
    case 'completed': return 'bg-green-400'
    case 'cancelled': return 'bg-red-300'
    default: return 'bg-gray-200' // draft
  }
}

function MetaItem({ icon: Icon, label, value, valueClass = 'text-gray-700' }: {
  icon: typeof CalendarIcon
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className="w-4 h-4 text-gray-300 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[11px] text-gray-400 leading-tight">{label}</div>
        <div className={`text-sm font-medium truncate ${valueClass}`}>{value}</div>
      </div>
    </div>
  )
}
