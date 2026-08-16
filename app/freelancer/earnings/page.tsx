'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeftIcon,
  ChartBarSquareIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline'
import { initLiff, isLiffLoggedIn, signInFirebaseWithLiff } from '@/lib/line-liff'
import { getFreelancerByLineId, getPaymentsByFreelancer, getJobs } from '@/lib/firebase-utils'
import type { Freelancer, Job, Payment } from '@/lib/types'
import {
  earningsYears,
  groupByMonth,
  sumEarnings,
  toEarningsEntries,
  type EarningsEntry,
} from '@/lib/earnings'
import { formatCurrency, formatDate, THAI_MONTHS, thaiYear } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'

export default function FreelancerEarningsPage() {
  const [loading, setLoading] = useState(true)
  const [bootError, setBootError] = useState('')
  const [freelancer, setFreelancer] = useState<Freelancer | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [jobs, setJobs] = useState<Job[]>([])

  const [year, setYear] = useState(new Date().getFullYear())
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function init() {
      try {
        const liffReady = await initLiff()
        if (!liffReady) { setBootError('ไม่สามารถโหลด LINE LIFF ได้'); return }
        const isLogin = await isLiffLoggedIn()
        if (!isLogin) { window.location.href = '/freelancer'; return }
        const profile = await signInFirebaseWithLiff()
        const f = await getFreelancerByLineId(profile.userId)
        if (!f) { window.location.href = '/freelancer/register'; return }
        setFreelancer(f)
        const [p, j] = await Promise.all([getPaymentsByFreelancer(f.id), getJobs()])
        setPayments(p)
        setJobs(j)
      } catch (err) {
        setBootError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  const jobsMap = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs])

  const allEntries = useMemo(
    () => toEarningsEntries(payments, (p) => (p.jobId ? jobsMap.get(p.jobId)?.title : undefined) ?? p.workDescription ?? 'ไม่ระบุงาน'),
    [payments, jobsMap],
  )

  const years = useMemo(() => earningsYears(allEntries), [allEntries])

  // ปีปัจจุบันยังไม่มีรายได้ → เด้งไปปีล่าสุดที่มี
  useEffect(() => {
    if (years.length > 0 && !years.includes(year)) setYear(years[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years])

  const months = useMemo(() => groupByMonth(allEntries, year), [allEntries, year])
  const yearTotal = useMemo(() => sumEarnings(months), [months])

  const toggleMonth = (key: string) => {
    setOpenMonths((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (bootError) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6 text-center">
      <ExclamationCircleIcon className="w-12 h-12 text-red-400" />
      <h2 className="mt-4 text-lg font-bold text-gray-800">เกิดข้อผิดพลาด</h2>
      <p className="mt-2 text-sm text-gray-500 max-w-xs">{bootError}</p>
      <Link href="/freelancer" className="mt-6 text-[#f73727] text-sm font-medium">กลับหน้าหลัก</Link>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#f73727] text-white">
        <div className="max-w-lg mx-auto px-4 pt-4 pb-6">
          <div className="flex items-center gap-3">
            <Link href="/freelancer" className="p-2 hover:bg-white/10 rounded-xl transition-colors">
              <ArrowLeftIcon className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="font-semibold text-lg leading-tight">รายได้รายเดือน</h1>
              <p className="text-white/70 text-xs mt-0.5">{freelancer?.name ?? '—'}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 space-y-4 pb-10 -mt-1">
        {loading ? (
          <>
            <Skeleton className="h-28 w-full rounded-2xl" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-2xl" />
            ))}
          </>
        ) : (
          <>
            {/* เลือกปี */}
            {years.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {years.map((y) => (
                  <button
                    key={y}
                    onClick={() => { setYear(y); setOpenMonths(new Set()) }}
                    className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                      y === year ? 'bg-[#f73727] text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200'
                    }`}
                  >
                    ปี {thaiYear(y)}
                  </button>
                ))}
              </div>
            )}

            {/* สรุปทั้งปี */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-sm text-gray-500">รวมทั้งปี {thaiYear(year)}</p>
                <p className="text-xs text-gray-400">{yearTotal.count} รายการ</p>
              </div>
              <p className="text-3xl font-bold text-gray-900 mt-1">{formatCurrency(yearTotal.gross)}</p>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="bg-red-50 rounded-xl px-3 py-2.5">
                  <p className="text-xs text-red-400">หักภาษี ณ ที่จ่าย 3%</p>
                  <p className="text-base font-bold text-red-500 mt-0.5">{formatCurrency(yearTotal.tax)}</p>
                </div>
                <div className="bg-green-50 rounded-xl px-3 py-2.5">
                  <p className="text-xs text-green-500">ได้รับจริง</p>
                  <p className="text-base font-bold text-green-600 mt-0.5">{formatCurrency(yearTotal.payout)}</p>
                </div>
              </div>
              {yearTotal.expense > 0 && (
                <p className="text-xs text-orange-500 mt-2">
                  รวมค่าใช้จ่ายที่เบิกคืน {formatCurrency(yearTotal.expense)} (ไม่หักภาษี)
                </p>
              )}
            </div>

            {/* รายเดือน */}
            {months.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-14 text-center">
                <ChartBarSquareIcon className="w-10 h-10 text-gray-300 mx-auto" />
                <p className="text-gray-400 text-sm mt-3">ยังไม่มีรายได้ที่โอนแล้วในปี {thaiYear(year)}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {months.map((month) => {
                  const isOpen = openMonths.has(month.key)
                  return (
                    <div key={month.key} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <button
                        onClick={() => toggleMonth(month.key)}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900">{THAI_MONTHS[month.month - 1]}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{month.count} งาน · ภาษี {formatCurrency(month.tax)}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <p className="font-bold text-gray-900">{formatCurrency(month.gross)}</p>
                            <p className="text-xs text-green-600">ได้รับ {formatCurrency(month.payout)}</p>
                          </div>
                          {isOpen
                            ? <ChevronDownIcon className="w-4 h-4 text-gray-400" />
                            : <ChevronRightIcon className="w-4 h-4 text-gray-300" />
                          }
                        </div>
                      </button>

                      {isOpen && (
                        <div className="border-t border-gray-50 divide-y divide-gray-50 bg-gray-50/50">
                          {month.entries.map((e: EarningsEntry) => (
                            <div key={e.payment.id} className="px-4 py-3 flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{e.jobTitle}</p>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  {e.payment.position && (
                                    <span className="text-xs bg-red-50 text-[#f73727] px-1.5 py-0.5 rounded-md font-medium">
                                      {e.payment.position}
                                    </span>
                                  )}
                                  <span className="text-xs text-gray-400">
                                    โอน {e.payment.paidAt ? formatDate(e.payment.paidAt) : '-'}
                                  </span>
                                </div>
                                {e.payment.workDates && e.payment.workDates.length > 0 && (
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    ทำงาน {e.payment.workDates.map((d) => formatDate(d)).join(', ')}
                                  </p>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-semibold text-gray-900">{formatCurrency(e.gross)}</p>
                                <p className="text-xs text-gray-400">ภาษี {formatCurrency(e.tax)}</p>
                                <p className="text-xs font-medium text-green-600">ได้รับ {formatCurrency(e.payout)}</p>
                                {e.expense > 0 && (
                                  <p className="text-xs text-orange-500">+ค่าใช้จ่าย {formatCurrency(e.expense)}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <p className="text-xs text-gray-400 text-center pt-1">
              นับเฉพาะรายการที่โอนเงินแล้ว ตามวันที่โอนจริง
            </p>
          </>
        )}
      </div>
    </div>
  )
}
