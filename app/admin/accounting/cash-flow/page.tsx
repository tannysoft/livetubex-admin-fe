'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowDownTrayIcon, ArrowDownIcon, ArrowUpIcon, ScaleIcon,
  BanknotesIcon, ChartBarIcon,
} from '@heroicons/react/24/outline'
import FormListbox from '@/components/ui/FormListbox'
import { Skeleton } from '@/components/ui/Skeleton'
import { getReceiptsByPeriod } from '@/lib/accounting/receipts'
import { getExpensesByPeriod } from '@/lib/accounting/expenses'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Expense, Receipt } from '@/lib/types'

const MONTHS = [
  'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม',
]

function thaiYear(y: number) { return y + 543 }

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

export default function CashFlowPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      getReceiptsByPeriod(year, month),
      getExpensesByPeriod(year, month),
    ]).then(([r, e]) => {
      if (!alive) return
      setReceipts(r)
      // เฉพาะที่จ่ายแล้วจริงๆ (paid) สำหรับ cash out
      setExpenses(e.filter((ex) => ex.status === 'paid'))
      setLoading(false)
    }).catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [year, month])

  const totals = useMemo(() => {
    // Cash in: ลูกค้าโอนเข้าจริง = amount - whtAmount (ลูกค้าหักไว้นำส่งกรมสรรพากร)
    const cashIn = receipts.reduce((s, r) => s + (r.amount - (r.whtAmount ?? 0)), 0)
    // Receipts gross (เพื่อแสดง info)
    const receiptsGross = receipts.reduce((s, r) => s + r.amount, 0)
    const customerWhtHeld = receipts.reduce((s, r) => s + (r.whtAmount ?? 0), 0)

    // Cash out: paidAmount จาก expense (= totalAmount - whtAmount = เงินที่จ่าย vendor จริง)
    const cashOut = expenses.reduce((s, e) => s + (e.paidAmount ?? 0), 0)
    // WHT ที่บริษัทหักไว้ (ค้างนำส่งกรมสรรพากร) — เงินสดที่ยังอยู่กับเรา
    const whtToRemit = expenses.reduce((s, e) => s + (e.whtAmount ?? 0), 0)

    return {
      cashIn,
      cashOut,
      net: cashIn - cashOut,
      receiptsGross,
      customerWhtHeld,
      whtToRemit,
    }
  }, [receipts, expenses])

  const monthOptions = MONTHS.map((label, i) => ({ value: String(i + 1), label }))
  const yearOptions = Array.from({ length: 5 }, (_, i) => {
    const y = now.getFullYear() - 3 + i
    return { value: String(y), label: String(thaiYear(y)) }
  })

  const periodLabel = `${MONTHS[month - 1]} ${thaiYear(year)}`

  const handleExport = () => {
    exportToCsv(
      `CashFlow-${year}-${String(month).padStart(2, '0')}.csv`,
      ['ประเภท', 'วันที่', 'เลขที่', 'รายละเอียด', 'จำนวน (บาท)'],
      [
        ...receipts.map((r) => [
          'รับเข้า',
          formatDate(r.issueDate),
          r.docNumber,
          `ลูกค้า: ${r.customerSnapshot.name}${r.whtAmount ? ` (- WHT ${r.whtAmount})` : ''}`,
          (r.amount - (r.whtAmount ?? 0)).toFixed(2),
        ]),
        ...expenses.map((e) => [
          'จ่ายออก',
          formatDate(e.date),
          e.code,
          `${e.categoryName}: ${e.vendorSnapshot?.name ?? '—'}${e.whtAmount ? ` (- WHT ${e.whtAmount})` : ''}`,
          `-${(e.paidAmount ?? 0).toFixed(2)}`,
        ]),
        ['', '', '', 'รวมเข้า', totals.cashIn.toFixed(2)],
        ['', '', '', 'รวมออก', `-${totals.cashOut.toFixed(2)}`],
        ['', '', '', 'กระแสเงินสดสุทธิ', (totals.cashIn - totals.cashOut).toFixed(2)],
      ]
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">งบกระแสเงินสด</h1>
          <p className="text-gray-500 mt-1">เงินสดเข้า-ออกจริงในงวด (cash basis) — สำหรับติดตามสภาพคล่อง</p>
        </div>
        <button
          onClick={handleExport}
          disabled={loading || (receipts.length === 0 && expenses.length === 0)}
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
      </div>

      {/* 3 KPI cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-green-50 rounded-2xl p-5 border border-green-100">
          <div className="flex items-center gap-2 text-xs text-green-700 mb-2">
            <ArrowDownIcon className="w-4 h-4" />
            กระแสเงินสดเข้า
          </div>
          {loading ? <Skeleton className="h-7 w-32" /> : (
            <>
              <p className="text-2xl font-bold tabular-nums text-green-700">{formatCurrency(totals.cashIn)}</p>
              <p className="text-xs text-green-600 mt-1">{receipts.length} ใบเสร็จ — gross {formatCurrency(totals.receiptsGross)} (หัก WHT {formatCurrency(totals.customerWhtHeld)})</p>
            </>
          )}
        </div>

        <div className="bg-red-50 rounded-2xl p-5 border border-red-100">
          <div className="flex items-center gap-2 text-xs text-red-700 mb-2">
            <ArrowUpIcon className="w-4 h-4" />
            กระแสเงินสดออก
          </div>
          {loading ? <Skeleton className="h-7 w-32" /> : (
            <>
              <p className="text-2xl font-bold tabular-nums text-red-700">{formatCurrency(totals.cashOut)}</p>
              <p className="text-xs text-red-600 mt-1">{expenses.length} รายการ paid — WHT ค้างนำส่ง {formatCurrency(totals.whtToRemit)}</p>
            </>
          )}
        </div>

        <div className={`rounded-2xl p-5 border ${totals.net >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'}`}>
          <div className={`flex items-center gap-2 text-xs mb-2 ${totals.net >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
            <ScaleIcon className="w-4 h-4" />
            กระแสเงินสดสุทธิ
          </div>
          {loading ? <Skeleton className="h-7 w-32" /> : (
            <>
              <p className={`text-2xl font-bold tabular-nums ${totals.net >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                {totals.net >= 0 ? '+' : ''}{formatCurrency(totals.net)}
              </p>
              <p className="text-xs text-gray-600 mt-1">= เข้า − ออก</p>
            </>
          )}
        </div>
      </div>

      {/* Note about WHT timing */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 text-xs text-amber-900">
        <p className="font-semibold mb-1">📌 หมายเหตุเรื่อง WHT (ภาษีหัก ณ ที่จ่าย)</p>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>ลูกค้าหักไว้ {formatCurrency(totals.customerWhtHeld)}</strong> — เราได้รับเงินสดน้อยกว่ายอด invoice แต่จะใช้เป็นเครดิตภาษีนิติบุคคลตอนสิ้นปี</li>
          <li><strong>บริษัทหักไว้ {formatCurrency(totals.whtToRemit)}</strong> — ยังอยู่ในมือเรา ต้องนำส่งกรมสรรพากรในเดือนถัดไป (ภงด.3/53)</li>
        </ul>
      </div>

      {/* Cash inflows */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="p-2 bg-green-50 rounded-xl">
            <ArrowDownIcon className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">เงินสดเข้า — งวด {periodLabel}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{receipts.length} ใบเสร็จในงวดนี้</p>
          </div>
        </div>
        {loading ? (
          <div className="p-5 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : receipts.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">ไม่มีใบเสร็จในงวดนี้</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-5 py-2 text-left font-semibold">วันที่</th>
                  <th className="px-5 py-2 text-left font-semibold">เลขที่</th>
                  <th className="px-5 py-2 text-left font-semibold">ลูกค้า</th>
                  <th className="px-5 py-2 text-left font-semibold">วิธีรับ</th>
                  <th className="px-5 py-2 text-right font-semibold">Gross</th>
                  <th className="px-5 py-2 text-right font-semibold">WHT (ลูกค้าหัก)</th>
                  <th className="px-5 py-2 text-right font-semibold">เข้าบัญชี</th>
                  <th className="px-5 py-2 text-right font-semibold w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {receipts.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-5 py-2 whitespace-nowrap">{formatDate(r.issueDate)}</td>
                    <td className="px-5 py-2 font-mono">{r.docNumber}</td>
                    <td className="px-5 py-2">{r.customerSnapshot.name}</td>
                    <td className="px-5 py-2 text-gray-600">{r.paymentMethod}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{formatCurrency(r.amount)}</td>
                    <td className="px-5 py-2 text-right tabular-nums text-red-600">{r.whtAmount ? `- ${formatCurrency(r.whtAmount)}` : '-'}</td>
                    <td className="px-5 py-2 text-right font-semibold tabular-nums text-green-700">{formatCurrency(r.amount - (r.whtAmount ?? 0))}</td>
                    <td className="px-5 py-2 text-right">
                      <Link href={`/admin/accounting/receipts/view?id=${r.id}`} className="text-[#f73727] hover:underline text-xs">ดู</Link>
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold">
                  <td colSpan={4} className="px-5 py-2 text-right">รวมเข้าบัญชี</td>
                  <td className="px-5 py-2 text-right tabular-nums">{formatCurrency(totals.receiptsGross)}</td>
                  <td className="px-5 py-2 text-right tabular-nums text-red-600">- {formatCurrency(totals.customerWhtHeld)}</td>
                  <td className="px-5 py-2 text-right tabular-nums text-green-700">{formatCurrency(totals.cashIn)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cash outflows */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="p-2 bg-red-50 rounded-xl">
            <ArrowUpIcon className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">เงินสดออก — งวด {periodLabel}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{expenses.length} รายจ่าย (status=paid)</p>
          </div>
        </div>
        {loading ? (
          <div className="p-5 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : expenses.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">ไม่มีรายจ่ายที่จ่ายแล้วในงวดนี้</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-5 py-2 text-left font-semibold">วันที่</th>
                  <th className="px-5 py-2 text-left font-semibold">เลขที่</th>
                  <th className="px-5 py-2 text-left font-semibold">รายละเอียด</th>
                  <th className="px-5 py-2 text-left font-semibold">ผู้ขาย</th>
                  <th className="px-5 py-2 text-right font-semibold">ก่อน VAT</th>
                  <th className="px-5 py-2 text-right font-semibold">WHT (เราหัก)</th>
                  <th className="px-5 py-2 text-right font-semibold">จ่ายออก</th>
                  <th className="px-5 py-2 text-right font-semibold w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-5 py-2 whitespace-nowrap">{formatDate(e.date)}</td>
                    <td className="px-5 py-2 font-mono">{e.code}</td>
                    <td className="px-5 py-2">{e.categoryName}</td>
                    <td className="px-5 py-2 text-gray-700">{e.vendorSnapshot?.name ?? '-'}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{formatCurrency(e.amount)}</td>
                    <td className="px-5 py-2 text-right tabular-nums text-red-600">{e.whtAmount ? `- ${formatCurrency(e.whtAmount)}` : '-'}</td>
                    <td className="px-5 py-2 text-right font-semibold tabular-nums text-red-700">- {formatCurrency(e.paidAmount)}</td>
                    <td className="px-5 py-2 text-right">
                      <Link href={`/admin/accounting/expenses/new?id=${e.id}`} className="text-[#f73727] hover:underline text-xs">ดู</Link>
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold">
                  <td colSpan={6} className="px-5 py-2 text-right">รวมจ่ายออก</td>
                  <td className="px-5 py-2 text-right tabular-nums text-red-700">- {formatCurrency(totals.cashOut)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
