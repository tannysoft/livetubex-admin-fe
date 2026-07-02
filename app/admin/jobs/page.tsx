'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Badge from '@/components/ui/Badge'
import {
  getJobs,
  updateJob,
  deleteJob,
} from '@/lib/firebase-utils'
import type { Job } from '@/lib/types'
import { formatCurrency, jobStatusColor, jobStatusLabel, paymentCycleLabel } from '@/lib/utils'
import { SkeletonTableRow } from '@/components/ui/Skeleton'

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

      {/* Job table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/70 text-left text-xs font-medium text-gray-400">
                <th className="px-5 py-3 whitespace-nowrap w-px">วันงาน</th>
                <th className="px-5 py-3">งาน</th>
                <th className="px-5 py-3 hidden md:table-cell">สถานที่</th>
                <th className="px-2 py-3 whitespace-nowrap w-px">สถานะ</th>
                <th className="px-5 py-3 text-right whitespace-nowrap">ราคาขาย</th>
                <th className="px-5 py-3 text-right w-32"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonTableRow key={i} cols={6} />)
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-gray-400">
                    <p className="text-base font-medium">ไม่พบงาน</p>
                    <p className="text-sm mt-1">ลองเปลี่ยนคำค้นหา หรือเพิ่มงานใหม่</p>
                  </td>
                </tr>
              ) : (
                filtered.map((job) => {
                  const showing = job.showInLiff !== false
                  const d = new Date(job.date + 'T00:00:00')
                  const multiDay = !!job.endDate && job.endDate !== job.date
                  const dEnd = new Date((multiDay ? job.endDate! : job.date) + 'T00:00:00')
                  return (
                    <tr
                      key={job.id}
                      className={`group hover:bg-gray-50/60 transition-colors ${
                        job.status === 'cancelled' ? 'opacity-50' : ''
                      }`}
                    >
                      {/* วันงาน */}
                      <td className="px-5 py-4 whitespace-nowrap align-top">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-gray-100 text-xs font-medium text-gray-700">
                          {jobDateLabel(d, dEnd, multiDay)}
                        </span>
                      </td>

                      {/* งาน */}
                      <td className="px-5 py-4 align-top min-w-[200px] max-w-[320px]">
                        <Link
                          href={`/admin/jobs/new?id=${job.id}`}
                          className="font-semibold text-gray-900 hover:text-[#f73727] transition-colors line-clamp-2 leading-snug"
                        >
                          {job.title}
                        </Link>
                        {/* ลูกค้าใต้ชื่องาน (จอเล็กพ่วงสถานที่ด้วย) */}
                        <p className="text-xs text-gray-500 mt-1 truncate">
                          {job.clientName || '—'}
                          <span className="md:hidden">{job.location ? ` · ${job.location}` : ''}</span>
                        </p>
                      </td>

                      {/* สถานที่ */}
                      <td className="px-5 py-4 align-top hidden md:table-cell max-w-[180px]">
                        <span className="text-gray-600 truncate block">{job.location || '—'}</span>
                      </td>

                      {/* สถานะ */}
                      <td className="px-2 py-4 align-top whitespace-nowrap">
                        <Badge label={jobStatusLabel(job.status)} colorClass={jobStatusColor(job.status)} />
                      </td>

                      {/* ราคาขาย */}
                      <td className="px-5 py-4 align-top text-right whitespace-nowrap">
                        <div className="font-bold text-[#f73727]">{formatCurrency(job.budget)}</div>
                        {job.paymentCycle && (
                          <div className="text-[11px] text-blue-600 mt-0.5">{paymentCycleLabel(job.paymentCycle)}</div>
                        )}
                      </td>

                      {/* actions */}
                      <td className="px-5 py-4 align-top">
                        <div className="flex items-center justify-end gap-1">
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
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

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

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
// วันที่แบบกระชับบรรทัดเดียว: "3 ก.ค. 68" / "3–5 ก.ค. 68" / "28 ก.ค. – 2 ส.ค. 68"
function jobDateLabel(d: Date, dEnd: Date, multiDay: boolean): string {
  const yy = (dd: Date) => String((dd.getFullYear() + 543) % 100)
  if (!multiDay) return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${yy(d)}`
  if (d.getFullYear() !== dEnd.getFullYear())
    return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${yy(d)} – ${dEnd.getDate()} ${THAI_MONTHS[dEnd.getMonth()]} ${yy(dEnd)}`
  if (d.getMonth() !== dEnd.getMonth())
    return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} – ${dEnd.getDate()} ${THAI_MONTHS[dEnd.getMonth()]} ${yy(d)}`
  return `${d.getDate()}–${dEnd.getDate()} ${THAI_MONTHS[d.getMonth()]} ${yy(d)}`
}
