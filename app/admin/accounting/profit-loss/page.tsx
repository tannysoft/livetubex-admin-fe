'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowTrendingUpIcon, ArrowTrendingDownIcon, ScaleIcon,
  CurrencyDollarIcon, BanknotesIcon, ChartBarIcon, ArrowDownTrayIcon,
} from '@heroicons/react/24/outline'
import FormListbox from '@/components/ui/FormListbox'
import { Skeleton } from '@/components/ui/Skeleton'
import { getTaxInvoicesByPeriod } from '@/lib/accounting/tax-reports'
import { getExpensesByPeriod } from '@/lib/accounting/expenses'
import { formatCurrency } from '@/lib/utils'
import type { Expense, TaxInvoice } from '@/lib/types'

const MONTHS = [
  'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม',
]

function thaiYear(y: number) { return y + 543 }

function prevMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 }
  return { year, month: month - 1 }
}

interface PeriodData {
  taxInvoices: TaxInvoice[]
  expenses: Expense[]
  revenue: number          // sum(subtotal - discountTotal) — ก่อน VAT
  expenseTotal: number     // sum(expense.amount) — ก่อน VAT
  profit: number           // revenue - expenseTotal
  vatOut: number           // VAT รับ
  vatIn: number            // VAT จ่าย
}

interface CategoryExpense {
  categoryId: string
  categoryName: string
  amount: number
  pct: number
}

async function loadPeriod(year: number, month: number): Promise<PeriodData> {
  const [ti, exp] = await Promise.all([
    getTaxInvoicesByPeriod(year, month),
    getExpensesByPeriod(year, month),
  ])
  const validExpenses = exp.filter((e) => e.status !== 'cancelled')

  const revenue = ti.reduce((s, t) => s + (t.subtotal - t.discountTotal), 0)
  const expenseTotal = validExpenses.reduce((s, e) => s + (e.amount ?? 0), 0)
  const vatOut = ti.reduce((s, t) => s + (t.vatAmount ?? 0), 0)
  const vatIn = validExpenses.reduce((s, e) => s + (e.vatAmount ?? 0), 0)

  return {
    taxInvoices: ti,
    expenses: validExpenses,
    revenue,
    expenseTotal,
    profit: revenue - expenseTotal,
    vatOut,
    vatIn,
  }
}

function exportToCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = [
    headers.join(','),
    ...rows.map((r) => r.map((c) => {
      const s = String(c ?? '')
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
      return s
    }).join(',')),
  ].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function ProfitLossPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [current, setCurrent] = useState<PeriodData | null>(null)
  const [previous, setPrevious] = useState<PeriodData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    const prev = prevMonth(year, month)
    Promise.all([loadPeriod(year, month), loadPeriod(prev.year, prev.month)])
      .then(([cur, p]) => {
        if (!alive) return
        setCurrent(cur)
        setPrevious(p)
        setLoading(false)
      })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [year, month])

  const byCategory: CategoryExpense[] = useMemo(() => {
    if (!current) return []
    const map = new Map<string, CategoryExpense>()
    for (const e of current.expenses) {
      const key = e.categoryId || '_uncat'
      const existing = map.get(key) ?? {
        categoryId: e.categoryId,
        categoryName: e.categoryName || '(ไม่ระบุ)',
        amount: 0,
        pct: 0,
      }
      existing.amount += e.amount ?? 0
      map.set(key, existing)
    }
    const list = Array.from(map.values()).sort((a, b) => b.amount - a.amount)
    const total = current.expenseTotal
    list.forEach((c) => { c.pct = total > 0 ? (c.amount / total) * 100 : 0 })
    return list
  }, [current])

  const monthOptions = MONTHS.map((label, i) => ({ value: String(i + 1), label }))
  const yearOptions = Array.from({ length: 5 }, (_, i) => {
    const y = now.getFullYear() - 3 + i
    return { value: String(y), label: String(thaiYear(y)) }
  })

  const periodLabel = `${MONTHS[month - 1]} ${thaiYear(year)}`
  const prev = prevMonth(year, month)
  const prevLabel = `${MONTHS[prev.month - 1]} ${thaiYear(prev.year)}`

  const change = (cur: number, prev: number) => {
    if (prev === 0) return cur === 0 ? 0 : 100
    return ((cur - prev) / Math.abs(prev)) * 100
  }

  const handleExport = () => {
    if (!current) return
    exportToCsv(
      `ProfitLoss-${year}-${String(month).padStart(2, '0')}.csv`,
      ['รายการ', 'จำนวน (บาท)'],
      [
        ['รายได้รวม (ก่อน VAT)', current.revenue.toFixed(2)],
        ...byCategory.map((c) => [`รายจ่าย: ${c.categoryName}`, (-c.amount).toFixed(2)]),
        ['รวมรายจ่าย', (-current.expenseTotal).toFixed(2)],
        ['กำไรสุทธิ', current.profit.toFixed(2)],
        ['', ''],
        ['VAT รับ (Output)', current.vatOut.toFixed(2)],
        ['VAT จ่าย (Input)', current.vatIn.toFixed(2)],
        ['VAT สุทธิ (ต้องชำระ/ขอคืน)', (current.vatOut - current.vatIn).toFixed(2)],
      ]
    )
  }

  const revenueChange = current && previous ? change(current.revenue, previous.revenue) : 0
  const expenseChange = current && previous ? change(current.expenseTotal, previous.expenseTotal) : 0
  const profitChange = current && previous ? change(current.profit, previous.profit) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">งบกำไรขาดทุน</h1>
          <p className="text-gray-500 mt-1">สรุปรายได้-รายจ่าย-กำไรของบริษัทรายเดือน (ก่อน VAT)</p>
        </div>
        <button
          onClick={handleExport}
          disabled={!current}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-60"
        >
          <ArrowDownTrayIcon className="w-4 h-4" />
          ดาวน์โหลด CSV
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex gap-3 items-center flex-wrap">
        <span className="text-sm font-medium text-gray-700">งวด:</span>
        <div className="w-44"><FormListbox value={String(month)} onChange={(v) => setMonth(Number(v))} options={monthOptions} /></div>
        <div className="w-32"><FormListbox value={String(year)} onChange={(v) => setYear(Number(v))} options={yearOptions} /></div>
        <div className="flex-1 text-right text-xs text-gray-500">
          เปรียบเทียบกับ {prevLabel}
        </div>
      </div>

      {/* 3 cards: Revenue / Expense / Profit */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <KpiCard
          icon={ArrowTrendingUpIcon}
          label="รายได้"
          sublabel="จากใบกำกับภาษี (ก่อน VAT)"
          value={current?.revenue ?? 0}
          changePct={revenueChange}
          loading={loading}
          color="green"
        />
        <KpiCard
          icon={ArrowTrendingDownIcon}
          label="รายจ่าย"
          sublabel="จากรายจ่ายบริษัท (ก่อน VAT)"
          value={current?.expenseTotal ?? 0}
          changePct={expenseChange}
          loading={loading}
          color="red"
          changeInverse
        />
        <KpiCard
          icon={ScaleIcon}
          label={current && current.profit >= 0 ? 'กำไรสุทธิ' : 'ขาดทุนสุทธิ'}
          sublabel="= รายได้ − รายจ่าย"
          value={current ? Math.abs(current.profit) : 0}
          changePct={profitChange}
          loading={loading}
          color={current && current.profit >= 0 ? 'brand' : 'red'}
        />
      </div>

      {/* Income Statement breakdown */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">รายละเอียดงวด {periodLabel}</h2>
        </div>
        {loading || !current ? (
          <div className="p-5 space-y-3">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {/* Revenue */}
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <div className="font-semibold text-gray-900">รายได้</div>
                <div className="text-xs text-gray-500">{current.taxInvoices.length} ใบกำกับภาษี</div>
              </div>
              <div className="text-xl font-bold tabular-nums text-green-700">
                {formatCurrency(current.revenue)}
              </div>
            </div>

            {/* Expenses by category */}
            <div className="px-5 py-4">
              <div className="font-semibold text-gray-900 mb-3">รายจ่าย — แยกตามหมวด</div>
              {byCategory.length === 0 ? (
                <p className="text-sm text-gray-400">ไม่มีรายจ่ายในงวดนี้</p>
              ) : (
                <ul className="space-y-2">
                  {byCategory.map((c) => (
                    <li key={c.categoryId || c.categoryName} className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-700">{c.categoryName}</div>
                        <div className="h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                          <div className="h-full bg-[#f73727]" style={{ width: `${Math.min(100, c.pct)}%` }} />
                        </div>
                      </div>
                      <div className="text-right tabular-nums w-28 text-sm font-medium text-red-700">
                        -{formatCurrency(c.amount)}
                      </div>
                      <div className="w-12 text-right text-xs text-gray-500 tabular-nums">{c.pct.toFixed(1)}%</div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100">
                <div className="text-sm font-semibold text-gray-700">รวมรายจ่าย</div>
                <div className="text-base font-bold tabular-nums text-red-700">
                  -{formatCurrency(current.expenseTotal)}
                </div>
              </div>
            </div>

            {/* Profit */}
            <div className={`px-5 py-5 ${current.profit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-base font-bold text-gray-900">
                    {current.profit >= 0 ? '✓ กำไรสุทธิ' : '✗ ขาดทุนสุทธิ'}
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">งวด {periodLabel}</div>
                </div>
                <div className={`text-2xl font-bold tabular-nums ${current.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {current.profit >= 0 ? '+' : ''}{formatCurrency(current.profit)}
                </div>
              </div>
            </div>

            {/* VAT info */}
            <div className="px-5 py-4 bg-gray-50">
              <div className="flex items-center gap-2 text-xs text-gray-500 uppercase mb-3">
                <BanknotesIcon className="w-4 h-4" />
                ข้อมูล VAT (ไม่กระทบกำไร — เป็นภาษีผ่าน)
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="text-xs text-gray-500">VAT รับ (Output)</div>
                  <div className="font-medium text-gray-900 tabular-nums">{formatCurrency(current.vatOut)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">VAT จ่าย (Input)</div>
                  <div className="font-medium text-gray-900 tabular-nums">{formatCurrency(current.vatIn)}</div>
                </div>
                <div>
                  <div className={`text-xs ${current.vatOut - current.vatIn >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                    VAT {current.vatOut - current.vatIn >= 0 ? 'ต้องชำระ' : 'ขอคืน'}
                  </div>
                  <div className={`font-medium tabular-nums ${current.vatOut - current.vatIn >= 0 ? 'text-red-700' : 'text-green-700'}`}>
                    {formatCurrency(Math.abs(current.vatOut - current.vatIn))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Comparison with previous month */}
      {previous && current && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-xl">
              <ChartBarIcon className="w-5 h-5 text-[#f73727]" />
            </div>
            <h2 className="font-semibold text-gray-900">เปรียบเทียบ {prevLabel} ↔ {periodLabel}</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-5 py-2 text-left font-semibold">รายการ</th>
                <th className="px-5 py-2 text-right font-semibold">{prevLabel}</th>
                <th className="px-5 py-2 text-right font-semibold">{periodLabel}</th>
                <th className="px-5 py-2 text-right font-semibold">เปลี่ยนแปลง</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <ComparisonRow label="รายได้" prev={previous.revenue} cur={current.revenue} />
              <ComparisonRow label="รายจ่าย" prev={previous.expenseTotal} cur={current.expenseTotal} inverse />
              <ComparisonRow label="กำไรสุทธิ" prev={previous.profit} cur={current.profit} bold />
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

interface KpiCardProps {
  icon: typeof CurrencyDollarIcon
  label: string
  sublabel: string
  value: number
  changePct: number
  loading?: boolean
  color: 'green' | 'red' | 'brand'
  changeInverse?: boolean   // expense: ลด = ดี (เขียว), เพิ่ม = ไม่ดี (แดง)
}

function KpiCard({ icon: Icon, label, sublabel, value, changePct, loading, color, changeInverse }: KpiCardProps) {
  const valueColor = color === 'green' ? 'text-green-700'
    : color === 'red' ? 'text-red-700'
    : 'text-[#f73727]'
  const bgClass = color === 'green' ? 'bg-green-50 border-green-100'
    : color === 'red' ? 'bg-red-50 border-red-100'
    : 'bg-red-50 border-[#f73727]/20'

  const isPositive = changeInverse ? changePct <= 0 : changePct >= 0
  const changeColor = isPositive ? 'text-green-600' : 'text-red-600'
  const ChangeIcon = changePct >= 0 ? ArrowTrendingUpIcon : ArrowTrendingDownIcon

  return (
    <div className={`rounded-2xl border p-5 ${bgClass}`}>
      <div className="flex items-center gap-2 text-xs text-gray-600 mb-2">
        <Icon className="w-4 h-4" />
        {label}
      </div>
      {loading ? (
        <Skeleton className="h-8 w-32" />
      ) : (
        <>
          <p className={`text-2xl font-bold tabular-nums ${valueColor}`}>{formatCurrency(value)}</p>
          <p className="text-xs text-gray-500 mt-1">{sublabel}</p>
          <div className={`flex items-center gap-1 mt-2 text-xs ${changeColor}`}>
            <ChangeIcon className="w-3 h-3" />
            <span>{Math.abs(changePct).toFixed(1)}%</span>
            <span className="text-gray-400">vs เดือนก่อน</span>
          </div>
        </>
      )}
    </div>
  )
}

function ComparisonRow({ label, prev, cur, bold, inverse }: { label: string; prev: number; cur: number; bold?: boolean; inverse?: boolean }) {
  const delta = cur - prev
  const pct = prev !== 0 ? (delta / Math.abs(prev)) * 100 : (cur === 0 ? 0 : 100)
  const isGood = inverse ? delta <= 0 : delta >= 0
  const deltaColor = isGood ? 'text-green-700' : 'text-red-700'
  return (
    <tr>
      <td className={`px-5 py-2 ${bold ? 'font-semibold' : ''}`}>{label}</td>
      <td className="px-5 py-2 text-right tabular-nums">{formatCurrency(prev)}</td>
      <td className={`px-5 py-2 text-right tabular-nums ${bold ? 'font-semibold' : ''}`}>{formatCurrency(cur)}</td>
      <td className={`px-5 py-2 text-right tabular-nums ${deltaColor}`}>
        {delta >= 0 ? '+' : ''}{formatCurrency(delta)} ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)
      </td>
    </tr>
  )
}
