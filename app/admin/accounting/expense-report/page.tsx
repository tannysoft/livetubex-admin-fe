'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ChartBarIcon, TagIcon, TruckIcon, BanknotesIcon,
} from '@heroicons/react/24/outline'
import FormListbox from '@/components/ui/FormListbox'
import { Skeleton } from '@/components/ui/Skeleton'
import { getExpensesByPeriod, expenseStatusLabel } from '@/lib/accounting/expenses'
import { getExpenseCategories } from '@/lib/accounting/expense-categories'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Expense, ExpenseCategory } from '@/lib/types'

const MONTHS = [
  'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม',
]

function thaiYear(y: number) { return y + 543 }

interface CategorySummary {
  categoryId: string
  categoryName: string
  count: number
  totalAmount: number
  totalPaidAmount: number
  totalWht: number
  totalVat: number
}

interface VendorSummary {
  vendorName: string
  count: number
  totalPaidAmount: number
}

export default function ExpenseReportPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [items, setItems] = useState<Expense[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      getExpensesByPeriod(year, month),
      getExpenseCategories(),
    ]).then(([exp, cats]) => {
      if (!alive) return
      // exclude cancelled
      setItems(exp.filter((e) => e.status !== 'cancelled'))
      setCategories(cats)
      setLoading(false)
    }).catch(() => {
      if (alive) setLoading(false)
    })
    return () => { alive = false }
  }, [year, month])

  const totals = useMemo(() => {
    const totalAmount = items.reduce((s, e) => s + (e.amount ?? 0), 0)
    const totalVat = items.reduce((s, e) => s + (e.vatAmount ?? 0), 0)
    const totalWht = items.reduce((s, e) => s + (e.whtAmount ?? 0), 0)
    const totalPaid = items.reduce((s, e) => s + (e.paidAmount ?? 0), 0)
    return { totalAmount, totalVat, totalWht, totalPaid }
  }, [items])

  const byCategory = useMemo<CategorySummary[]>(() => {
    const map = new Map<string, CategorySummary>()
    for (const e of items) {
      const key = e.categoryId || '_uncategorized'
      const existing = map.get(key) ?? {
        categoryId: e.categoryId,
        categoryName: e.categoryName || '(ไม่ระบุหมวด)',
        count: 0,
        totalAmount: 0,
        totalPaidAmount: 0,
        totalWht: 0,
        totalVat: 0,
      }
      existing.count += 1
      existing.totalAmount += e.amount ?? 0
      existing.totalPaidAmount += e.paidAmount ?? 0
      existing.totalWht += e.whtAmount ?? 0
      existing.totalVat += e.vatAmount ?? 0
      map.set(key, existing)
    }
    return Array.from(map.values()).sort((a, b) => b.totalPaidAmount - a.totalPaidAmount)
  }, [items])

  const byVendor = useMemo<VendorSummary[]>(() => {
    const map = new Map<string, VendorSummary>()
    for (const e of items) {
      const name = e.vendorSnapshot?.name ?? '(ไม่ระบุผู้ขาย)'
      const existing = map.get(name) ?? { vendorName: name, count: 0, totalPaidAmount: 0 }
      existing.count += 1
      existing.totalPaidAmount += e.paidAmount ?? 0
      map.set(name, existing)
    }
    return Array.from(map.values()).sort((a, b) => b.totalPaidAmount - a.totalPaidAmount)
  }, [items])

  const monthOptions = MONTHS.map((label, i) => ({ value: String(i + 1), label }))
  const yearOptions = Array.from({ length: 5 }, (_, i) => {
    const y = now.getFullYear() - 3 + i
    return { value: String(y), label: String(thaiYear(y)) }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">รายงานรายจ่าย</h1>
        <p className="text-gray-500 mt-1">สรุปรายจ่ายของบริษัทรายเดือน แยกตามหมวด/ผู้ขาย</p>
      </div>

      {/* Period selector */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex gap-3 items-center flex-wrap">
        <span className="text-sm font-medium text-gray-700">งวด:</span>
        <div className="w-44">
          <FormListbox value={String(month)} onChange={(v) => setMonth(Number(v))} options={monthOptions} />
        </div>
        <div className="w-32">
          <FormListbox value={String(year)} onChange={(v) => setYear(Number(v))} options={yearOptions} />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={BanknotesIcon} label="ยอดก่อน VAT" value={totals.totalAmount} loading={loading} />
        <StatCard icon={ChartBarIcon} label="VAT รวม" value={totals.totalVat} loading={loading} />
        <StatCard icon={ChartBarIcon} label="หัก ณ ที่จ่ายรวม" value={totals.totalWht} loading={loading} color="red" />
        <StatCard icon={BanknotesIcon} label="ยอดจ่ายจริงรวม" value={totals.totalPaid} loading={loading} color="brand" />
      </div>

      {/* By Category */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="p-2 bg-red-50 rounded-xl">
            <TagIcon className="w-5 h-5 text-[#f73727]" />
          </div>
          <h2 className="font-semibold text-gray-900">สรุปตามหมวดค่าใช้จ่าย</h2>
        </div>
        {loading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
          </div>
        ) : byCategory.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">ไม่มีรายจ่ายในงวดนี้</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold">หมวด</th>
                  <th className="px-5 py-3 text-right font-semibold">จำนวน</th>
                  <th className="px-5 py-3 text-right font-semibold">ก่อน VAT</th>
                  <th className="px-5 py-3 text-right font-semibold">VAT</th>
                  <th className="px-5 py-3 text-right font-semibold">หัก ณ ที่จ่าย</th>
                  <th className="px-5 py-3 text-right font-semibold">จ่ายจริง</th>
                  <th className="px-5 py-3 text-right font-semibold">% สัดส่วน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {byCategory.map((c) => {
                  const pct = totals.totalPaid > 0 ? (c.totalPaidAmount / totals.totalPaid) * 100 : 0
                  return (
                    <tr key={c.categoryId || c.categoryName} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">{c.categoryName}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{c.count}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{formatCurrency(c.totalAmount)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-gray-600">{c.totalVat > 0 ? formatCurrency(c.totalVat) : '-'}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-red-600">{c.totalWht > 0 ? formatCurrency(c.totalWht) : '-'}</td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums">{formatCurrency(c.totalPaidAmount)}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-[#f73727]" style={{ width: `${Math.min(100, pct)}%` }} />
                          </div>
                          <span className="text-xs text-gray-500 tabular-nums w-10 text-right">{pct.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* By Vendor */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="p-2 bg-red-50 rounded-xl">
            <TruckIcon className="w-5 h-5 text-[#f73727]" />
          </div>
          <h2 className="font-semibold text-gray-900">สรุปตามผู้ขาย (Top 10)</h2>
        </div>
        {loading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
          </div>
        ) : byVendor.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">ไม่มีรายจ่ายในงวดนี้</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {byVendor.slice(0, 10).map((v) => {
              const pct = totals.totalPaid > 0 ? (v.totalPaidAmount / totals.totalPaid) * 100 : 0
              return (
                <li key={v.vendorName} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{v.vendorName}</div>
                    <div className="text-xs text-gray-500">{v.count} รายการ</div>
                  </div>
                  <div className="w-32 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#f73727]" style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                  <div className="font-semibold text-sm tabular-nums w-28 text-right">{formatCurrency(v.totalPaidAmount)}</div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Detail list */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">รายการทั้งหมดในงวด ({items.length})</h2>
        </div>
        {loading ? (
          <div className="p-5 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">ไม่มีรายจ่ายในงวดนี้</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-5 py-2 text-left font-semibold">วันที่</th>
                  <th className="px-5 py-2 text-left font-semibold">เลขที่</th>
                  <th className="px-5 py-2 text-left font-semibold">รายละเอียด</th>
                  <th className="px-5 py-2 text-left font-semibold">ผู้ขาย</th>
                  <th className="px-5 py-2 text-right font-semibold">จ่ายจริง</th>
                  <th className="px-5 py-2 text-center font-semibold">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((e) => (
                  <tr key={e.id}>
                    <td className="px-5 py-2 text-gray-700 whitespace-nowrap">{formatDate(e.date)}</td>
                    <td className="px-5 py-2 font-mono">{e.code}</td>
                    <td className="px-5 py-2">
                      <div className="text-gray-900">{e.categoryName}</div>
                      <div className="text-xs text-gray-500 truncate max-w-md">{e.description}</div>
                    </td>
                    <td className="px-5 py-2 text-gray-700">{e.vendorSnapshot?.name ?? '—'}</td>
                    <td className="px-5 py-2 text-right font-semibold tabular-nums">{formatCurrency(e.paidAmount)}</td>
                    <td className="px-5 py-2 text-center">
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full">
                        {expenseStatusLabel[e.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
  color?: 'default' | 'red' | 'brand'
}) {
  const valueColor = color === 'red' ? 'text-red-600' : color === 'brand' ? 'text-[#f73727]' : 'text-gray-900'
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
