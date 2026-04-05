'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  EnvelopeIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline'
import FormListbox from '@/components/ui/FormListbox'
import { getPayments, getFreelancers, getJobs, getAppSettings, sendPaymentReport, type FreelancerReportPayload } from '@/lib/firebase-utils'
import type { BillingCycle, Job, Payment, Freelancer } from '@/lib/types'
import { calcTax, formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'

const MONTH_LABELS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
  'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
  'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

function thaiYear(y: number) { return y + 543 }

function buildPeriodLabel(month: number, year: number, cycle: BillingCycle) {
  const prefix = cycle === 'mid' ? 'กลางเดือน' : 'สิ้นเดือน'
  return `${prefix}${MONTH_LABELS[month - 1]} ${thaiYear(year)}`
}

function paidAtMatch(paidAt: string | undefined, year: number, month: number): boolean {
  if (!paidAt) return false
  // paidAt = "2026-04-05T..."
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return paidAt.startsWith(prefix)
}

interface FreelancerGroup {
  freelancer: Freelancer
  payments: Payment[]
}

export default function ReportPage() {
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear]   = useState(now.getFullYear())

  const [payments, setPayments]       = useState<Payment[]>([])
  const [freelancers, setFreelancers] = useState<Freelancer[]>([])
  const [jobs, setJobs]               = useState<Job[]>([])
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed]   = useState<Set<string>>(new Set())
  const [sending, setSending]       = useState(false)
  const [toast, setToast]           = useState<{ type: 'ok' | 'fail'; message: string } | null>(null)
  // period label ที่ตั้งไว้ในหน้าตั้งค่า (ถ้ามี จะใช้เป็น period ในอีเมล)
  const [settingPeriod, setSettingPeriod] = useState<string | null>(null)
  const [settingCycle, setSettingCycle]   = useState<BillingCycle>('end')

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [p, f, j, settings] = await Promise.all([
          getPayments(), getFreelancers(), getJobs(), getAppSettings(),
        ])
        setPayments(p)
        setFreelancers(f)
        setJobs(j)
        if (settings) {
          const cycle = settings.billingCycle ?? 'end'
          setSettingCycle(cycle)
          setSettingPeriod(buildPeriodLabel(settings.reportPeriodMonth, settings.reportPeriodYear, cycle))
          // ตั้ง filter ให้ตรงกับ setting ด้วย
          setSelectedMonth(settings.reportPeriodMonth)
          setSelectedYear(settings.reportPeriodYear)
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // รีเซ็ต selection เมื่อเปลี่ยนเดือน/ปี
  useEffect(() => {
    setSelected(new Set())
    setToast(null)
  }, [selectedMonth, selectedYear])

  // auto-dismiss toast
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const freelancerMap = useMemo(() => new Map(freelancers.map((f) => [f.id, f])), [freelancers])
  const jobsMap       = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs])

  const getJobTitle = (p: Payment) =>
    (p.jobId ? jobsMap.get(p.jobId)?.title : undefined) ?? p.workDescription ?? ''

  // กรองเฉพาะ paid payments ของเดือน/ปีที่เลือก
  const filtered = useMemo(
    () => payments.filter(
      (p) => p.status === 'paid' && paidAtMatch(p.paidAt, selectedYear, selectedMonth)
    ),
    [payments, selectedYear, selectedMonth]
  )

  // group by freelancer
  const groups = useMemo((): FreelancerGroup[] => {
    const map = new Map<string, Payment[]>()
    for (const p of filtered) {
      const list = map.get(p.freelancerId) ?? []
      list.push(p)
      map.set(p.freelancerId, list)
    }
    const result: FreelancerGroup[] = []
    for (const [fid, pmts] of map) {
      const freelancer = freelancerMap.get(fid)
      if (!freelancer) continue
      result.push({ freelancer, payments: pmts.sort((a, b) => (a.paidAt ?? '').localeCompare(b.paidAt ?? '')) })
    }
    return result.sort((a, b) => a.freelancer.name.localeCompare(b.freelancer.name, 'th'))
  }, [filtered, freelancerMap])

  const togglePayment = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleGroup = (fid: string, pmts: Payment[]) => {
    const ids = pmts.map((p) => p.id)
    const allSelected = ids.every((id) => selected.has(id))
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  const toggleCollapse = (fid: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(fid)) next.delete(fid)
      else next.add(fid)
      return next
    })
  }

  // period ที่ใช้ในอีเมล: ใช้ค่าจากหน้าตั้งค่าถ้ามี มิฉะนั้นใช้ filter ที่เลือก
  const filterPeriod = buildPeriodLabel(selectedMonth, selectedYear, settingCycle)
  const period = settingPeriod ?? filterPeriod

  const handleSend = async () => {
    if (selected.size === 0) return
    setSending(true)
    setToast(null)
    try {
      // จัดกลุ่ม selected payments ตาม freelancer
      const reportsMap = new Map<string, FreelancerReportPayload>()

      for (const p of filtered) {
        if (!selected.has(p.id)) continue
        const freelancer = freelancerMap.get(p.freelancerId)
        if (!freelancer) continue

        if (!reportsMap.has(p.freelancerId)) {
          reportsMap.set(p.freelancerId, {
            freelancerEmail: freelancer.email ?? '',
            freelancerName: freelancer.name,
            period,
            payments: [],
            totalGross: 0,
            totalTax: 0,
            totalNet: 0,
          })
        }
        const entry = reportsMap.get(p.freelancerId)!
        const { tax, net } = calcTax(p.amount)
        entry.payments.push({
          workDescription: getJobTitle(p),
          position: p.position,
          workDates: p.workDates,
          amount: p.amount,
          paidAt: p.paidAt,
        })
        entry.totalGross += p.amount
        entry.totalTax   += tax
        entry.totalNet   += net
      }

      const reports = Array.from(reportsMap.values())
      const res = await sendPaymentReport(reports) as unknown as { results?: { email: string; ok: boolean }[] }
      const raw = res?.results ?? []
      const okList   = raw.filter((r) => r.ok).map((r) => r.email)
      const failList = raw.filter((r) => !r.ok).map((r) => r.email)

      if (failList.length === 0) {
        setToast({ type: 'ok', message: `ส่งอีเมลสำเร็จ ${okList.length} คน` })
        setSelected(new Set())   // clear selection
      } else {
        const msg = failList.length === raw.length
          ? `ส่งไม่สำเร็จ: ${failList.join(', ')}`
          : `ส่งสำเร็จ ${okList.length} คน · ล้มเหลว: ${failList.join(', ')}`
        setToast({ type: 'fail', message: msg })
      }
    } catch (err) {
      console.error(err)
      setToast({ type: 'fail', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่' })
    } finally {
      setSending(false)
    }
  }

  const selectedCount = selected.size
  const monthOptions = MONTH_LABELS.map((label, i) => ({ value: String(i + 1), label }))
  const yearOptions  = Array.from({ length: 3 }, (_, i) => {
    const y = now.getFullYear() - 2 + i   // ปีปัจจุบัน - 2 → ปีปัจจุบัน
    return { value: String(y), label: String(thaiYear(y)) }
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">รายงานการจ่ายเงิน</h1>
          <p className="text-gray-500 mt-1">
            สรุปการจ่ายเงินรายเดือน
            {settingPeriod && (
              <span className="ml-2 px-2.5 py-0.5 bg-red-50 text-[#f73727] text-xs font-semibold rounded-lg">
                รอบที่ตั้งค่า: {settingPeriod}
              </span>
            )}
          </p>
        </div>

        {/* Send button */}
        {selectedCount > 0 && (
          <button
            onClick={handleSend}
            disabled={sending}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#f73727] text-white text-sm font-medium rounded-xl hover:bg-red-600 transition-colors shadow-md shadow-red-200 disabled:opacity-60"
          >
            <EnvelopeIcon className="w-4 h-4" />
            {sending ? 'กำลังส่ง...' : `ส่งอีเมลสรุป (${selectedCount} รายการ)`}
          </button>
        )}
      </div>

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-lg text-sm font-medium transition-all ${
          toast.type === 'ok'
            ? 'bg-green-500 text-white'
            : 'bg-yellow-500 text-white'
        }`}>
          {toast.type === 'ok'
            ? <CheckCircleIcon className="w-5 h-5 shrink-0" />
            : <ExclamationCircleIcon className="w-5 h-5 shrink-0" />
          }
          {toast.message}
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <FormListbox
          value={String(selectedMonth)}
          onChange={(v) => setSelectedMonth(Number(v))}
          options={monthOptions}
          buttonClassName="w-40"
        />
        <FormListbox
          value={String(selectedYear)}
          onChange={(v) => setSelectedYear(Number(v))}
          options={yearOptions}
          buttonClassName="w-28"
        />
        <span className="text-sm text-gray-400">
          {filtered.length} รายการ
        </span>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
              <Skeleton className="h-5 w-48 rounded-md" />
              <Skeleton className="h-4 w-full rounded-md" />
              <Skeleton className="h-4 w-3/4 rounded-md" />
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
          <EnvelopeIcon className="w-10 h-10 text-gray-300 mx-auto" />
          <p className="text-gray-400 text-sm mt-3">ไม่มีรายการที่จ่ายแล้วในช่วงเวลานี้</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(({ freelancer, payments: pmts }) => {
            const fid = freelancer.id
            const isCollapsed = collapsed.has(fid)
            const groupIds = pmts.map((p) => p.id)
            const selectedInGroup = groupIds.filter((id) => selected.has(id)).length
            const allGroupSelected = selectedInGroup === groupIds.length
            const groupGross = pmts.reduce((s, p) => s + p.amount, 0)
            const { tax: groupTax, net: groupNet } = calcTax(groupGross)
            const selectedGross = pmts.filter((p) => selected.has(p.id)).reduce((s, p) => s + p.amount, 0)
            const { net: selectedNet } = calcTax(selectedGross)

            return (
              <div key={fid} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Freelancer header */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-50">
                  <input
                    type="checkbox"
                    checked={allGroupSelected}
                    onChange={() => toggleGroup(fid, pmts)}
                    className="w-4 h-4 rounded accent-[#f73727] cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{freelancer.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {freelancer.email
                        ? <span className="text-blue-500">{freelancer.email}</span>
                        : <span className="text-red-400">⚠ ไม่มีอีเมล</span>
                      }
                    </p>
                  </div>
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-semibold text-gray-800">{formatCurrency(groupGross)}</p>
                    <p className="text-xs text-gray-400">สุทธิ {formatCurrency(groupNet)} · ภาษี {formatCurrency(groupTax)}</p>
                  </div>
                  {selectedInGroup > 0 && (
                    <span className="px-2 py-0.5 bg-red-100 text-[#f73727] text-xs font-medium rounded-full">
                      เลือก {selectedInGroup}
                      {selectedGross > 0 && ` · ${formatCurrency(selectedNet)}`}
                    </span>
                  )}
                  <button
                    onClick={() => toggleCollapse(fid)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    {isCollapsed
                      ? <ChevronDownIcon className="w-4 h-4" />
                      : <ChevronUpIcon className="w-4 h-4" />
                    }
                  </button>
                </div>

                {/* Payment rows — table layout */}
                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    {/* Column headers */}
                    <div className="grid grid-cols-[28px_1fr_100px_120px_100px_90px_90px] gap-x-3 px-5 py-2 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-400">
                      <span />
                      <span>งาน</span>
                      <span>ตำแหน่ง</span>
                      <span>วันที่ทำงาน</span>
                      <span>จ่ายแล้ว</span>
                      <span className="text-right">ยอดขอเบิก</span>
                      <span className="text-right">สุทธิ</span>
                    </div>
                    {pmts.map((p) => {
                      const { tax, net } = calcTax(p.amount)
                      const isSelected = selected.has(p.id)
                      return (
                        <label
                          key={p.id}
                          className={`grid grid-cols-[28px_1fr_100px_120px_100px_90px_90px] gap-x-3 items-center px-5 py-3 cursor-pointer transition-colors border-b border-gray-50 last:border-0 ${isSelected ? 'bg-red-50/40' : 'hover:bg-gray-50'}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => togglePayment(p.id)}
                            className="w-4 h-4 rounded accent-[#f73727] cursor-pointer"
                          />
                          {/* งาน */}
                          <p className="text-sm font-medium text-gray-900 truncate">{getJobTitle(p)}</p>
                          {/* ตำแหน่ง */}
                          <div>
                            {p.position
                              ? <span className="px-2 py-0.5 bg-red-50 text-[#f73727] text-xs font-medium rounded-lg">{p.position}</span>
                              : <span className="text-gray-300 text-xs">-</span>
                            }
                          </div>
                          {/* วันที่ทำงาน */}
                          <p className="text-xs text-gray-500 truncate">
                            {p.workDates && p.workDates.length > 0
                              ? p.workDates.map((d) => formatDate(d)).join(', ')
                              : '-'}
                          </p>
                          {/* จ่ายแล้ว */}
                          <p className="text-xs text-gray-400 truncate">
                            {p.paidAt ? formatDate(p.paidAt) : '-'}
                          </p>
                          {/* ยอดขอเบิก + ภาษี */}
                          <div className="text-right">
                            <p className="text-sm font-semibold text-gray-900">{formatCurrency(p.amount)}</p>
                            <p className="text-xs text-gray-400">ภาษี {formatCurrency(tax)}</p>
                          </div>
                          {/* สุทธิ */}
                          <p className="text-sm font-bold text-green-600 text-right">{formatCurrency(net)}</p>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
