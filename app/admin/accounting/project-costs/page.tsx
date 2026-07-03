'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  RectangleStackIcon, UsersIcon, CreditCardIcon, BanknotesIcon,
  ScaleIcon, ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { Skeleton } from '@/components/ui/Skeleton'
import { getJobsWithBudget, getPayments } from '@/lib/firebase-utils'
import { getExpenses } from '@/lib/accounting/expenses'
import { formatCurrency, formatDate, jobStatusLabel, jobStatusColor } from '@/lib/utils'
import type { Job, Payment, Expense } from '@/lib/types'

interface ProjectCost {
  job: Job
  laborCost: number      // ค่าจ้างคน (gross + เบิกคืน) จาก payments ที่จ่ายแล้ว
  otherCost: number      // ค่าใช้จ่ายอื่น (ก่อน VAT) จาก expenses ที่ผูก jobId
  laborCount: number
  otherCount: number
  total: number
  remaining: number      // budget - total
}

export default function ProjectCostsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([getJobsWithBudget(), getPayments(), getExpenses()])
      .then(([j, p, e]) => {
        if (!alive) return
        setJobs(j)
        setPayments(p)
        setExpenses(e)
        setLoading(false)
      })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  // ค่าจ้างคน: เฉพาะ payment ที่จ่ายแล้ว — ยอด gross + ค่าใช้จ่ายเบิกคืน
  const paidPayments = useMemo(
    () => payments.filter((p) => p.status === 'paid'),
    [payments],
  )

  // ค่าใช้จ่ายอื่น: ไม่นับที่ยกเลิก + ไม่นับ freelancer_payment (กันซ้ำกับค่าจ้างด้านบน)
  const otherExpenses = useMemo(
    () => expenses.filter(
      (e) => e.status !== 'cancelled' && e.sourceType !== 'freelancer_payment',
    ),
    [expenses],
  )

  const projects = useMemo<ProjectCost[]>(() => {
    const laborByJob = new Map<string, { sum: number; count: number }>()
    for (const p of paidPayments) {
      if (!p.jobId) continue
      const cur = laborByJob.get(p.jobId) ?? { sum: 0, count: 0 }
      cur.sum += (p.amount ?? 0) + (p.expenseAmount ?? 0)
      cur.count += 1
      laborByJob.set(p.jobId, cur)
    }

    const otherByJob = new Map<string, { sum: number; count: number }>()
    for (const e of otherExpenses) {
      if (!e.jobId) continue
      const cur = otherByJob.get(e.jobId) ?? { sum: 0, count: 0 }
      cur.sum += e.amount ?? 0
      cur.count += 1
      otherByJob.set(e.jobId, cur)
    }

    return jobs
      .map((job) => {
        const labor = laborByJob.get(job.id) ?? { sum: 0, count: 0 }
        const other = otherByJob.get(job.id) ?? { sum: 0, count: 0 }
        const total = labor.sum + other.sum
        return {
          job,
          laborCost: labor.sum,
          otherCost: other.sum,
          laborCount: labor.count,
          otherCount: other.count,
          total,
          remaining: (job.budget ?? 0) - total,
        }
      })
      .sort((a, b) => b.total - a.total)
  }, [jobs, paidPayments, otherExpenses])

  // ค่าใช้จ่ายอื่นที่ยังไม่ผูกโปรเจกต์ (ส่วนกลาง) — เตือนไม่ให้เงินหาย
  const unassigned = useMemo(() => {
    const items = otherExpenses.filter((e) => !e.jobId)
    return { sum: items.reduce((s, e) => s + (e.amount ?? 0), 0), count: items.length }
  }, [otherExpenses])

  const totals = useMemo(() => {
    const labor = projects.reduce((s, p) => s + p.laborCost, 0)
    const other = projects.reduce((s, p) => s + p.otherCost, 0)
    const budget = projects.reduce((s, p) => s + (p.job.budget ?? 0), 0)
    return { labor, other, budget, total: labor + other }
  }, [projects])

  const visible = useMemo(
    () => (showAll ? projects : projects.filter((p) => p.total > 0 || (p.job.budget ?? 0) > 0)),
    [projects, showAll],
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">สรุปต้นทุนต่อโปรเจกต์</h1>
        <p className="text-gray-500 mt-1">
          ต้นทุนแต่ละงาน — ค่าจ้างทีมงาน (จ่ายแล้ว) + ค่าใช้จ่ายอื่นที่ผูกกับงาน เทียบกับงบประมาณ
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={ScaleIcon} label="งบประมาณรวม" value={totals.budget} loading={loading} />
        <StatCard icon={UsersIcon} label="ค่าจ้างทีมงานรวม" value={totals.labor} loading={loading} />
        <StatCard icon={CreditCardIcon} label="ค่าใช้จ่ายอื่นรวม" value={totals.other} loading={loading} />
        <StatCard icon={BanknotesIcon} label="ต้นทุนรวมทุกงาน" value={totals.total} loading={loading} color="brand" />
      </div>

      {/* Unassigned warning */}
      {!loading && unassigned.count > 0 && (
        <Link
          href="/admin/accounting/expenses"
          className="flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-800 hover:bg-amber-100 transition-colors"
        >
          <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
          <span>
            มีค่าใช้จ่าย <b>{unassigned.count}</b> รายการ ({formatCurrency(unassigned.sum)}) ยังไม่ได้ผูกโปรเจกต์ —
            จึงไม่ถูกนับในตารางด้านล่าง <span className="underline">ไปผูกโปรเจกต์</span>
          </span>
        </Link>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-xl">
              <RectangleStackIcon className="w-5 h-5 text-[#f73727]" />
            </div>
            <h2 className="font-semibold text-gray-900">ต้นทุนรายโปรเจกต์ ({visible.length})</h2>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-[#f73727]" />
            แสดงงานที่ยังไม่มีต้นทุน/งบ
          </label>
        </div>

        {loading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
          </div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">ยังไม่มีข้อมูลต้นทุนโปรเจกต์</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold">โปรเจกต์ / งาน</th>
                  <th className="px-5 py-3 text-right font-semibold">งบประมาณ</th>
                  <th className="px-5 py-3 text-right font-semibold">ค่าจ้างทีมงาน</th>
                  <th className="px-5 py-3 text-right font-semibold">ค่าใช้จ่ายอื่น</th>
                  <th className="px-5 py-3 text-right font-semibold">ต้นทุนรวม</th>
                  <th className="px-5 py-3 text-right font-semibold">คงเหลือ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visible.map(({ job, laborCost, otherCost, laborCount, otherCount, total, remaining }) => {
                  const laborPct = total > 0 ? (laborCost / total) * 100 : 0
                  const over = remaining < 0
                  return (
                    <tr key={job.id} className="hover:bg-gray-50 align-top">
                      <td className="px-5 py-3">
                        <Link href={`/admin/jobs`} className="font-medium text-gray-900 hover:text-[#f73727]">
                          {job.title}
                        </Link>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${jobStatusColor(job.status)}`}>
                            {jobStatusLabel(job.status)}
                          </span>
                          <span className="text-xs text-gray-400">{job.clientName || '—'} · {formatDate(job.date)}</span>
                        </div>
                        {/* labor vs other mini bar */}
                        {total > 0 && (
                          <div className="mt-2 flex h-1.5 w-40 rounded-full overflow-hidden bg-gray-100">
                            <div className="h-full bg-[#f73727]" style={{ width: `${laborPct}%` }} title="ค่าจ้าง" />
                            <div className="h-full bg-amber-400" style={{ width: `${100 - laborPct}%` }} title="อื่นๆ" />
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-gray-600">
                        {job.budget ? formatCurrency(job.budget) : '—'}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {laborCost > 0 ? formatCurrency(laborCost) : '—'}
                        {laborCount > 0 && <div className="text-[11px] text-gray-400">{laborCount} คน/ครั้ง</div>}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {otherCost > 0 ? formatCurrency(otherCost) : '—'}
                        {otherCount > 0 && <div className="text-[11px] text-gray-400">{otherCount} รายการ</div>}
                      </td>
                      <td className="px-5 py-3 text-right font-bold tabular-nums text-gray-900">
                        {formatCurrency(total)}
                      </td>
                      <td className={`px-5 py-3 text-right tabular-nums font-semibold ${over ? 'text-red-600' : 'text-green-600'}`}>
                        {job.budget ? (
                          <>
                            {over ? '-' : ''}{formatCurrency(Math.abs(remaining))}
                            {over && <div className="text-[11px] font-normal">เกินงบ</div>}
                          </>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold text-gray-900">
                <tr>
                  <td className="px-5 py-3">รวมทั้งหมด</td>
                  <td className="px-5 py-3 text-right tabular-nums">{formatCurrency(totals.budget)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{formatCurrency(totals.labor)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{formatCurrency(totals.other)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-[#f73727]">{formatCurrency(totals.total)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{formatCurrency(totals.budget - totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        * ค่าจ้างทีมงาน = ยอดที่ freelancer ขอเบิก (gross) + ค่าใช้จ่ายเบิกคืน เฉพาะรายการที่จ่ายแล้ว ·
        ค่าใช้จ่ายอื่น = ยอดก่อน VAT ของรายจ่ายที่ผูกกับงาน (ไม่รวมที่ยกเลิก)
      </p>
    </div>
  )
}

function StatCard({
  icon: Icon, label, value, loading, color = 'default',
}: {
  icon: typeof BanknotesIcon
  label: string
  value: number
  loading?: boolean
  color?: 'default' | 'brand'
}) {
  const valueColor = color === 'brand' ? 'text-[#f73727]' : 'text-gray-900'
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
        <Icon className="w-4 h-4" />
        {label}
      </div>
      {loading ? (
        <Skeleton className="h-7 w-32 rounded-md" />
      ) : (
        <p className={`text-2xl font-bold tabular-nums ${valueColor}`}>{formatCurrency(value)}</p>
      )}
    </div>
  )
}
