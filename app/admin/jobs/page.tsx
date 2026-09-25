'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  PlusIcon,
  PaperAirplaneIcon,
  CheckBadgeIcon,
  PencilIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Badge from '@/components/ui/Badge'
import {
  getJobsWithBudget,
  updateJob,
  deleteJob,
} from '@/lib/firebase-utils'
import type { Job } from '@/lib/types'
import { formatCurrency, jobStatusColor, jobStatusLabel, paymentCycleLabel } from '@/lib/utils'
import { SkeletonTableRow } from '@/components/ui/Skeleton'
import { getCalendarEntries } from '@/lib/calendar'
import { getAccountingStatuses, setJobAccountingStatus, type AccountingStatusDef } from '@/lib/job-accounting'
import AccountingStatusMenu from '@/components/admin/AccountingStatusMenu'
import AccountingStatusManager from '@/components/admin/AccountingStatusManager'
import SendJobModal from '@/components/admin/SendJobModal'
import GoogleCalendarButton, { GoogleAddedBadge } from '@/components/admin/GoogleCalendarButton'

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [deleteJobId, setDeleteJobId] = useState<string | null>(null)
  const [sendJob, setSendJob] = useState<Job | null>(null)
  const [doneJob, setDoneJob] = useState<Job | null>(null)
  // jobId → เวลาที่กดลง Google Calendar (ป้าย) — อ่านจากปฏิทินงาน โหลดไม่ได้ก็แค่ไม่มีป้าย
  const [googleAdded, setGoogleAddedMap] = useState<Map<string, string>>(new Map())
  const markGoogle = (jobId: string, at: string | undefined) => setGoogleAddedMap((m) => {
    const n = new Map(m)
    if (at) n.set(jobId, at); else n.delete(jobId)
    return n
  })

  // สถานะทางบัญชี — รายการ/สีแก้ได้ (settings/jobAccounting) · ค่าของงานอยู่ใน jobFinance (มากับ getJobsWithBudget)
  const [acctStatuses, setAcctStatuses] = useState<AccountingStatusDef[]>([])
  const [acctFilter, setAcctFilter] = useState<string | null>(null) // null = ทั้งหมด, '' = ไม่ระบุ
  const [managing, setManaging] = useState(false)
  useEffect(() => {
    getAccountingStatuses().then(setAcctStatuses).catch((e) => console.error(e))
  }, [])
  const acctOf = (j: Job) => (j.accountingStatus && acctStatuses.some((s) => s.id === j.accountingStatus) ? j.accountingStatus : '')
  const acctUsage = new Map<string, number>()
  for (const j of jobs) acctUsage.set(acctOf(j), (acctUsage.get(acctOf(j)) ?? 0) + 1)

  const handleAccountingStatus = async (job: Job, id: string) => {
    const prev = job.accountingStatus
    setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, accountingStatus: id || undefined } : j)))
    try {
      await setJobAccountingStatus(job.id, id)
    } catch (e) {
      console.error(e)
      setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, accountingStatus: prev } : j)))
    }
  }

  useEffect(() => {
    getCalendarEntries()
      .then((list) => setGoogleAddedMap(new Map(list.filter((e) => e.jobId && e.googleAddedAt).map((e) => [e.jobId!, e.googleAddedAt!]))))
      .catch(() => {})
  }, [])

  const loadJobs = async () => {
    setLoading(true)
    try {
      const data = await getJobsWithBudget()
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
      (acctFilter === null || acctOf(j) === acctFilter) &&
      (j.title.toLowerCase().includes(search.toLowerCase()) ||
        j.location.toLowerCase().includes(search.toLowerCase()) ||
        j.clientName.toLowerCase().includes(search.toLowerCase()) ||
        (j.docNumber ?? '').toLowerCase().includes(search.toLowerCase()))
  )
  const chipCls = (on: boolean) => `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${on ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">งานถ่ายทอดสด</h1>
          <p className="text-gray-500 mt-1">{jobs.length} งานทั้งหมด</p>
        </div>
        <Link
          href="/admin/jobs/new"
          className="flex items-center gap-2 px-5 py-2.5 bg-brand text-white text-sm font-medium rounded-xl hover:bg-brand-dark transition-colors shadow-md shadow-brand-tint"
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
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-white"
        />
      </div>

      {/* กรองสถานะบัญชี */}
      {acctStatuses.length > 0 && !loading && (
        <div className="flex items-center gap-2 flex-wrap -mt-2">
          <span className="text-xs text-gray-400">สถานะบัญชี</span>
          <button onClick={() => setAcctFilter(null)} className={chipCls(acctFilter === null)}>ทั้งหมด <span className="opacity-60">{jobs.length}</span></button>
          {acctStatuses.map((st) => (
            <button key={st.id} onClick={() => setAcctFilter(acctFilter === st.id ? null : st.id)} className={chipCls(acctFilter === st.id)}>
              <span className="w-2 h-2 rounded-full" style={{ background: st.color }} />
              {st.label} <span className="opacity-60">{acctUsage.get(st.id) ?? 0}</span>
            </button>
          ))}
          {(acctUsage.get('') ?? 0) > 0 && (
            <button onClick={() => setAcctFilter(acctFilter === '' ? null : '')} className={chipCls(acctFilter === '')}>ไม่ระบุ <span className="opacity-60">{acctUsage.get('')}</span></button>
          )}
          <button onClick={() => setManaging(true)} className="text-xs text-gray-400 hover:text-brand ml-1">แก้ชื่อ/สี</button>
        </div>
      )}

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
                <th className="px-2 py-3 whitespace-nowrap w-px">บัญชี</th>
                <th className="px-5 py-3 text-right whitespace-nowrap">ราคาขาย</th>
                <th className="px-5 py-3 text-right w-32"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonTableRow key={i} cols={7} />)
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-gray-400">
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
                          className="font-semibold text-gray-900 hover:text-brand transition-colors line-clamp-2 leading-snug"
                        >
                          {job.title}
                        </Link>
                        {/* ลูกค้าใต้ชื่องาน (จอเล็กพ่วงสถานที่ด้วย) */}
                        <p className="text-xs text-gray-500 mt-1 truncate">
                          {job.clientName || '—'}
                          {job.docNumber && <span className="text-gray-400"> · {job.docNumber}</span>}
                          <span className="md:hidden">{job.location ? ` · ${job.location}` : ''}</span>
                        </p>
                      </td>

                      {/* สถานที่ */}
                      <td className="px-5 py-4 align-top hidden md:table-cell max-w-[180px]">
                        <span className="text-gray-600 truncate block">{job.location || '—'}</span>
                      </td>

                      {/* สถานะ */}
                      <td className="px-2 py-4 align-top whitespace-nowrap">
                        <div className="flex flex-col items-start gap-1">
                          <Badge label={jobStatusLabel(job.status)} colorClass={jobStatusColor(job.status)} />
                          <GoogleAddedBadge addedAt={googleAdded.get(job.id)} />
                        </div>
                      </td>

                      {/* สถานะบัญชี */}
                      <td className="px-2 py-4 align-top whitespace-nowrap">
                        <AccountingStatusMenu
                          statuses={acctStatuses}
                          value={acctOf(job)}
                          onChange={(id) => handleAccountingStatus(job, id)}
                          onManage={() => setManaging(true)}
                        />
                      </td>

                      {/* ราคาขาย */}
                      <td className="px-5 py-4 align-top text-right whitespace-nowrap">
                        <div className="font-bold text-brand">{formatCurrency(job.budget ?? 0)}</div>
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
                          {job.status !== 'cancelled' && (
                            <button
                              onClick={() => setDoneJob(job)}
                              className={`p-1.5 rounded-lg transition-colors ${job.status === 'completed' ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`}
                              title={job.status === 'completed' ? 'แจ้ง Freelancer เบิกเงินทาง LINE' : 'งานเสร็จสิ้น — แจ้ง Freelancer เบิกเงินทาง LINE'}
                            >
                              <CheckBadgeIcon className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => setSendJob(job)}
                            className="p-1.5 text-gray-400 hover:text-brand hover:bg-brand-soft rounded-lg transition-colors"
                            title="ส่งรายละเอียดงานให้ Freelancer ทาง LINE"
                          >
                            <PaperAirplaneIcon className="w-4 h-4" />
                          </button>
                          <GoogleCalendarButton variant="icon" job={job} addedAt={googleAdded.get(job.id)} onChange={(at) => markGoogle(job.id, at)} />
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

      {managing && (
        <AccountingStatusManager
          statuses={acctStatuses}
          usage={acctUsage}
          onClose={() => setManaging(false)}
          onSaved={(list) => {
            setAcctStatuses(list)
            if (acctFilter && !list.some((x) => x.id === acctFilter)) setAcctFilter(null)
            setManaging(false)
          }}
        />
      )}

      {sendJob && <SendJobModal job={sendJob} onClose={() => setSendJob(null)} />}
      {doneJob && (
        <SendJobModal
          mode="completed"
          job={doneJob}
          onClose={() => setDoneJob(null)}
          onJobChanged={(patch) => setJobs((list) => list.map((j) => (j.id === doneJob.id ? { ...j, ...patch } : j)))}
        />
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
