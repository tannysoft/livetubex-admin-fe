'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownTrayIcon,
  ChartBarSquareIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import FormListbox from '@/components/ui/FormListbox'
import { Skeleton } from '@/components/ui/Skeleton'
import { getPayments, getFreelancers, getJobs } from '@/lib/firebase-utils'
import type { Freelancer, Job, Payment } from '@/lib/types'
import {
  basisAmount,
  earningsYears,
  groupByMonth,
  monthlyTotals,
  sumEarnings,
  toEarningsEntries,
  EARNINGS_BASIS_HINTS,
  EARNINGS_BASIS_LABELS,
  EMPTY_TOTALS,
  type EarningsBasis,
  type EarningsEntry,
  type EarningsTotals,
} from '@/lib/earnings'
import {
  formatCurrency,
  formatDate,
  THAI_MONTHS_SHORT,
  thaiMonthYearLabel,
  thaiYear,
} from '@/lib/utils'

const BASIS_OPTIONS: EarningsBasis[] = ['gross', 'net', 'payout']

interface FreelancerRow {
  freelancer: Freelancer
  entries: EarningsEntry[]
  months: EarningsTotals[]   // index 0 = ม.ค.
  total: EarningsTotals
}

/** ตัวเลขในตาราง — 0 แสดงเป็นขีดจางๆ ให้อ่านง่าย */
function Cell({ value }: { value: number }) {
  if (value === 0) return <span className="text-gray-200">–</span>
  return <span>{new Intl.NumberFormat('th-TH').format(Math.round(value))}</span>
}

export default function AdminEarningsPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [freelancers, setFreelancers] = useState<Freelancer[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  const [year, setYear] = useState(new Date().getFullYear())
  const [basis, setBasis] = useState<EarningsBasis>('gross')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [p, f, j] = await Promise.all([getPayments(), getFreelancers(), getJobs()])
        setPayments(p)
        setFreelancers(f)
        setJobs(j)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const jobsMap = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs])

  const allEntries = useMemo(
    () => toEarningsEntries(payments, (p) => (p.jobId ? jobsMap.get(p.jobId)?.title : undefined) ?? p.workDescription ?? 'ไม่ระบุงาน'),
    [payments, jobsMap],
  )

  const availableYears = useMemo(() => earningsYears(allEntries), [allEntries])

  // ถ้าปีปัจจุบันยังไม่มีข้อมูล ให้เด้งไปปีล่าสุดที่มี
  useEffect(() => {
    if (availableYears.length === 0) return
    if (!availableYears.includes(year)) setYear(availableYears[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableYears])

  const rows = useMemo((): FreelancerRow[] => {
    const byFreelancer = new Map<string, EarningsEntry[]>()
    for (const e of allEntries) {
      if (e.year !== year) continue
      const list = byFreelancer.get(e.payment.freelancerId) ?? []
      list.push(e)
      byFreelancer.set(e.payment.freelancerId, list)
    }

    const result: FreelancerRow[] = []
    for (const [fid, entries] of byFreelancer) {
      const freelancer = freelancers.find((f) => f.id === fid)
      if (!freelancer) continue   // freelancer ถูกลบ — ข้าม (ยังนับใน "รวมทุกคน" ด้านล่างไม่ได้เช่นกัน)
      result.push({
        freelancer,
        entries,
        months: monthlyTotals(entries, year),
        total: sumEarnings(entries),
      })
    }
    return result.sort((a, b) => basisAmount(b.total, basis) - basisAmount(a.total, basis))
  }, [allEntries, freelancers, year, basis])

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => r.freelancer.name.toLowerCase().includes(q))
  }, [rows, search])

  // แถวรวมท้ายตาราง — รวมจากแถวที่แสดงอยู่ (สอดคล้องกับที่ตาเห็น)
  const footerMonths = useMemo(() => {
    const buckets: EarningsTotals[] = Array.from({ length: 12 }, () => ({ ...EMPTY_TOTALS }))
    for (const row of visibleRows) {
      row.months.forEach((m, i) => {
        buckets[i] = sumEarnings([buckets[i], m])
      })
    }
    return buckets
  }, [visibleRows])

  const footerTotal = useMemo(() => sumEarnings(visibleRows.map((r) => r.total)), [visibleRows])

  const toggleRow = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleExportCsv = () => {
    const header = ['Freelancer', ...THAI_MONTHS_SHORT, 'รวมทั้งปี', 'จำนวนรายการ']
    const lines = [header.join(',')]
    for (const row of visibleRows) {
      lines.push([
        `"${row.freelancer.name.replace(/"/g, '""')}"`,
        ...row.months.map((m) => Math.round(basisAmount(m, basis))),
        Math.round(basisAmount(row.total, basis)),
        row.total.count,
      ].join(','))
    }
    lines.push([
      '"รวมทุกคน"',
      ...footerMonths.map((m) => Math.round(basisAmount(m, basis))),
      Math.round(basisAmount(footerTotal, basis)),
      footerTotal.count,
    ].join(','))

    // UTF-8 BOM เพื่อให้ Excel เปิดภาษาไทยไม่เพี้ยน
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `freelancer-earnings-${thaiYear(year)}-${basis}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const yearOptions = (availableYears.length > 0 ? availableYears : [year]).map((y) => ({
    value: String(y),
    label: String(thaiYear(y)),
  }))

  const gridCols = 'grid-cols-[minmax(180px,1fr)_repeat(12,minmax(72px,1fr))_minmax(110px,1fr)]'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">รายได้ Freelancer รายเดือน</h1>
          <p className="text-gray-500 mt-1 text-sm">
            สรุปเฉพาะรายการที่จ่ายแล้ว เข้าเดือนตามวันที่โอนจริง (paidAt)
          </p>
        </div>
        <button
          onClick={handleExportCsv}
          disabled={visibleRows.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <ArrowDownTrayIcon className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <FormListbox
          value={String(year)}
          onChange={(v) => { setYear(Number(v)); setExpanded(new Set()) }}
          options={yearOptions}
          buttonClassName="w-28"
        />

        {/* Basis toggle */}
        <div className="inline-flex rounded-xl border border-gray-200 overflow-hidden bg-white">
          {BASIS_OPTIONS.map((b) => (
            <button
              key={b}
              onClick={() => setBasis(b)}
              title={EARNINGS_BASIS_HINTS[b]}
              className={`px-3.5 py-2.5 text-sm font-medium transition-colors ${
                basis === b ? 'bg-[#f73727] text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {EARNINGS_BASIS_LABELS[b]}
            </button>
          ))}
        </div>

        <div className="relative">
          <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ freelancer"
            className="w-56 pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727]"
          />
        </div>

        <span className="text-sm text-gray-400">
          {visibleRows.length} คน · {footerTotal.count} รายการ
        </span>
      </div>

      {/* Summary cards */}
      {!loading && visibleRows.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: `ยอดขอเบิกรวม ${thaiYear(year)}`, value: footerTotal.gross, cls: 'text-gray-900' },
            { label: 'ภาษีหัก ณ ที่จ่าย 3%', value: footerTotal.tax, cls: 'text-red-500' },
            { label: 'สุทธิหลังหักภาษี', value: footerTotal.net, cls: 'text-green-600' },
            { label: 'ยอดโอนจริง (รวมค่าใช้จ่าย)', value: footerTotal.payout, cls: 'text-blue-600' },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5">
              <p className="text-xs text-gray-500">{card.label}</p>
              <p className={`text-lg font-bold mt-1 ${card.cls}`}>{formatCurrency(card.value)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-lg" />
          ))}
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
          <ChartBarSquareIcon className="w-10 h-10 text-gray-300 mx-auto" />
          <p className="text-gray-400 text-sm mt-3">
            {rows.length === 0 ? `ยังไม่มีรายการที่จ่ายแล้วในปี ${thaiYear(year)}` : 'ไม่พบ freelancer ที่ค้นหา'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[1100px]">
              {/* Column headers */}
              <div className={`grid ${gridCols} gap-x-2 px-5 py-2.5 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-400`}>
                <span>Freelancer</span>
                {THAI_MONTHS_SHORT.map((m) => (
                  <span key={m} className="text-right">{m}</span>
                ))}
                <span className="text-right">รวมทั้งปี</span>
              </div>

              {/* Rows */}
              <div className="divide-y divide-gray-50">
                {visibleRows.map((row) => {
                  const fid = row.freelancer.id
                  const isOpen = expanded.has(fid)
                  return (
                    <div key={fid}>
                      <button
                        onClick={() => toggleRow(fid)}
                        className={`w-full grid ${gridCols} gap-x-2 items-center px-5 py-3 text-left transition-colors ${isOpen ? 'bg-red-50/40' : 'hover:bg-gray-50'}`}
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          {isOpen
                            ? <ChevronDownIcon className="w-4 h-4 text-gray-400 shrink-0" />
                            : <ChevronRightIcon className="w-4 h-4 text-gray-300 shrink-0" />
                          }
                          <span className="text-sm font-medium text-gray-900 truncate">{row.freelancer.name}</span>
                          <span className="text-xs text-gray-400 shrink-0">({row.total.count})</span>
                        </span>
                        {row.months.map((m, i) => (
                          <span key={i} className="text-sm text-gray-700 text-right tabular-nums">
                            <Cell value={basisAmount(m, basis)} />
                          </span>
                        ))}
                        <span className="text-sm font-bold text-gray-900 text-right tabular-nums">
                          {formatCurrency(basisAmount(row.total, basis))}
                        </span>
                      </button>

                      {/* รายการย่อยรายเดือน */}
                      {isOpen && (
                        <div className="bg-gray-50/70 border-t border-gray-100 px-5 py-3 space-y-3">
                          {groupByMonth(row.entries, year).map((month) => (
                            <div key={month.key} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                              <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                                <p className="text-sm font-semibold text-gray-800">
                                  {thaiMonthYearLabel(month.year, month.month)}
                                  <span className="ml-2 text-xs font-normal text-gray-400">{month.count} รายการ</span>
                                </p>
                                <p className="text-xs text-gray-500">
                                  ยอดเบิก <span className="font-semibold text-gray-800">{formatCurrency(month.gross)}</span>
                                  <span className="mx-1.5 text-gray-300">·</span>
                                  ภาษี <span className="text-red-500">{formatCurrency(month.tax)}</span>
                                  <span className="mx-1.5 text-gray-300">·</span>
                                  โอนจริง <span className="font-semibold text-green-600">{formatCurrency(month.payout)}</span>
                                </p>
                              </div>
                              <div className="divide-y divide-gray-50">
                                {month.entries.map((e) => (
                                  <div key={e.payment.id} className="grid grid-cols-[1fr_120px_120px_110px_110px] gap-x-3 items-center px-4 py-2.5">
                                    <div className="min-w-0">
                                      <p className="text-sm text-gray-800 truncate">{e.jobTitle}</p>
                                      {e.payment.workDates && e.payment.workDates.length > 0 && (
                                        <p className="text-xs text-gray-400 truncate">
                                          {e.payment.workDates.map((d) => formatDate(d)).join(', ')}
                                        </p>
                                      )}
                                    </div>
                                    <div>
                                      {e.payment.position
                                        ? <span className="px-2 py-0.5 bg-red-50 text-[#f73727] text-xs font-medium rounded-lg">{e.payment.position}</span>
                                        : <span className="text-gray-300 text-xs">-</span>
                                      }
                                    </div>
                                    <p className="text-xs text-gray-400">
                                      จ่าย {e.payment.paidAt ? formatDate(e.payment.paidAt) : '-'}
                                    </p>
                                    <p className="text-sm text-gray-900 text-right tabular-nums">
                                      {formatCurrency(e.gross)}
                                      <span className="block text-xs text-gray-400">ภาษี {formatCurrency(e.tax)}</span>
                                    </p>
                                    <p className="text-sm font-semibold text-green-600 text-right tabular-nums">
                                      {formatCurrency(e.payout)}
                                      {e.expense > 0 && (
                                        <span className="block text-xs font-normal text-orange-500">
                                          +ค่าใช้จ่าย {formatCurrency(e.expense)}
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Footer totals */}
              <div className={`grid ${gridCols} gap-x-2 items-center px-5 py-3 bg-gray-50 border-t border-gray-100`}>
                <span className="text-sm font-semibold text-gray-700">รวมทุกคน</span>
                {footerMonths.map((m, i) => (
                  <span key={i} className="text-sm font-semibold text-gray-700 text-right tabular-nums">
                    <Cell value={basisAmount(m, basis)} />
                  </span>
                ))}
                <span className="text-sm font-bold text-[#f73727] text-right tabular-nums">
                  {formatCurrency(basisAmount(footerTotal, basis))}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
