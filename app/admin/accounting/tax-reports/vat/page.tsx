'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ReceiptPercentIcon, ArrowDownTrayIcon, BanknotesIcon,
  ArrowTrendingUpIcon, ArrowTrendingDownIcon, ScaleIcon,
} from '@heroicons/react/24/outline'
import FormListbox from '@/components/ui/FormListbox'
import { Skeleton } from '@/components/ui/Skeleton'
import { getTaxInvoicesByPeriod, getVatExpensesByPeriod } from '@/lib/accounting/tax-reports'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Expense, TaxInvoice } from '@/lib/types'

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

export default function VatReportPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [taxInvoices, setTaxInvoices] = useState<TaxInvoice[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      getTaxInvoicesByPeriod(year, month),
      getVatExpensesByPeriod(year, month),
    ]).then(([t, e]) => {
      if (!alive) return
      setTaxInvoices(t)
      setExpenses(e)
      setLoading(false)
    }).catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [year, month])

  const totals = useMemo(() => {
    const salesBase = taxInvoices.reduce((s, t) => s + (t.subtotal - t.discountTotal), 0)
    const salesVat = taxInvoices.reduce((s, t) => s + (t.vatAmount ?? 0), 0)
    const purchaseBase = expenses.reduce((s, e) => s + (e.amount ?? 0), 0)
    const purchaseVat = expenses.reduce((s, e) => s + (e.vatAmount ?? 0), 0)
    const netVat = salesVat - purchaseVat
    return { salesBase, salesVat, purchaseBase, purchaseVat, netVat }
  }, [taxInvoices, expenses])

  const monthOptions = MONTHS.map((label, i) => ({ value: String(i + 1), label }))
  const yearOptions = Array.from({ length: 5 }, (_, i) => {
    const y = now.getFullYear() - 3 + i
    return { value: String(y), label: String(thaiYear(y)) }
  })

  const periodLabel = `${MONTHS[month - 1]} ${thaiYear(year)}`

  const handleExportSales = () => {
    exportToCsv(
      `VAT-Sales-${year}-${String(month).padStart(2, '0')}.csv`,
      ['เลขที่', 'วันที่', 'ลูกค้า', 'เลขผู้เสียภาษี', 'มูลค่าก่อน VAT', 'VAT', 'รวม'],
      taxInvoices.map((t) => [
        t.docNumber,
        formatDate(t.issueDate),
        t.customerSnapshot.name,
        t.customerSnapshot.taxId ?? '',
        (t.subtotal - t.discountTotal).toFixed(2),
        t.vatAmount.toFixed(2),
        t.grandTotal.toFixed(2),
      ])
    )
  }

  const handleExportPurchases = () => {
    exportToCsv(
      `VAT-Purchases-${year}-${String(month).padStart(2, '0')}.csv`,
      ['เลขที่', 'วันที่', 'รายละเอียด', 'ผู้ขาย', 'เลขผู้เสียภาษี', 'ก่อน VAT', 'VAT', 'รวม'],
      expenses.map((e) => [
        e.code,
        formatDate(e.date),
        e.description.replace(/\n/g, ' '),
        e.vendorSnapshot?.name ?? '',
        e.vendorSnapshot?.taxId ?? '',
        e.amount.toFixed(2),
        e.vatAmount.toFixed(2),
        (e.amount + e.vatAmount).toFixed(2),
      ])
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">รายงานภาษีมูลค่าเพิ่ม (ภพ.30)</h1>
        <p className="text-gray-500 mt-1">สรุปภาษีขาย-ภาษีซื้อสำหรับยื่นแบบประจำเดือน</p>
      </div>

      {/* Period */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex gap-3 items-center flex-wrap">
        <span className="text-sm font-medium text-gray-700">งวด:</span>
        <div className="w-44"><FormListbox value={String(month)} onChange={(v) => setMonth(Number(v))} options={monthOptions} /></div>
        <div className="w-32"><FormListbox value={String(year)} onChange={(v) => setYear(Number(v))} options={yearOptions} /></div>
        <div className="flex-1 text-right text-xs text-gray-500">
          📅 ยื่นแบบ ภพ.30 ภายในวันที่ 15 ของเดือนถัดไป
        </div>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="bg-gray-50 px-5 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">สรุป งวด {periodLabel}</h2>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Sales VAT */}
          <div className="bg-green-50 rounded-2xl p-5 border border-green-100">
            <div className="flex items-center gap-2 text-xs text-green-700 mb-2">
              <ArrowTrendingUpIcon className="w-4 h-4" />
              ภาษีขาย
            </div>
            {loading ? <Skeleton className="h-7 w-32" /> : (
              <>
                <p className="text-2xl font-bold text-green-700 tabular-nums">{formatCurrency(totals.salesVat)}</p>
                <p className="text-xs text-green-600 mt-1">ฐาน: {formatCurrency(totals.salesBase)}</p>
                <p className="text-xs text-green-600">จำนวน {taxInvoices.length} ใบกำกับ</p>
              </>
            )}
          </div>

          {/* Purchase VAT */}
          <div className="bg-blue-50 rounded-2xl p-5 border border-blue-100">
            <div className="flex items-center gap-2 text-xs text-blue-700 mb-2">
              <ArrowTrendingDownIcon className="w-4 h-4" />
              ภาษีซื้อ
            </div>
            {loading ? <Skeleton className="h-7 w-32" /> : (
              <>
                <p className="text-2xl font-bold text-blue-700 tabular-nums">{formatCurrency(totals.purchaseVat)}</p>
                <p className="text-xs text-blue-600 mt-1">ฐาน: {formatCurrency(totals.purchaseBase)}</p>
                <p className="text-xs text-blue-600">จำนวน {expenses.length} รายการ</p>
              </>
            )}
          </div>

          {/* Net */}
          <div className={`rounded-2xl p-5 border ${totals.netVat >= 0 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
            <div className={`flex items-center gap-2 text-xs mb-2 ${totals.netVat >= 0 ? 'text-red-700' : 'text-green-700'}`}>
              <ScaleIcon className="w-4 h-4" />
              {totals.netVat >= 0 ? 'ภาษีต้องชำระ' : 'ภาษีขอคืน'}
            </div>
            {loading ? <Skeleton className="h-7 w-32" /> : (
              <>
                <p className={`text-2xl font-bold tabular-nums ${totals.netVat >= 0 ? 'text-red-700' : 'text-green-700'}`}>
                  {formatCurrency(Math.abs(totals.netVat))}
                </p>
                <p className="text-xs text-gray-600 mt-1">= ภาษีขาย − ภาษีซื้อ</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Sales (Output VAT) */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-xl">
              <ReceiptPercentIcon className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">ภาษีขาย (Output VAT)</h2>
              <p className="text-xs text-gray-500 mt-0.5">{taxInvoices.length} ใบกำกับภาษีในงวด</p>
            </div>
          </div>
          {taxInvoices.length > 0 && (
            <button
              onClick={handleExportSales}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors"
            >
              <ArrowDownTrayIcon className="w-4 h-4" />
              ดาวน์โหลด CSV
            </button>
          )}
        </div>
        {loading ? (
          <div className="p-5 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : taxInvoices.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">ไม่มีใบกำกับภาษีในงวดนี้</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-5 py-2 text-left font-semibold">เลขที่</th>
                  <th className="px-5 py-2 text-left font-semibold">วันที่</th>
                  <th className="px-5 py-2 text-left font-semibold">ลูกค้า</th>
                  <th className="px-5 py-2 text-left font-semibold">เลขผู้เสียภาษี</th>
                  <th className="px-5 py-2 text-right font-semibold">ก่อน VAT</th>
                  <th className="px-5 py-2 text-right font-semibold">VAT</th>
                  <th className="px-5 py-2 text-right font-semibold">รวม</th>
                  <th className="px-5 py-2 text-right font-semibold w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {taxInvoices.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-5 py-2 font-mono">{t.docNumber}</td>
                    <td className="px-5 py-2 whitespace-nowrap">{formatDate(t.issueDate)}</td>
                    <td className="px-5 py-2">{t.customerSnapshot.name}</td>
                    <td className="px-5 py-2 text-gray-600">{t.customerSnapshot.taxId ?? '-'}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{formatCurrency(t.subtotal - t.discountTotal)}</td>
                    <td className="px-5 py-2 text-right tabular-nums text-green-700">{formatCurrency(t.vatAmount)}</td>
                    <td className="px-5 py-2 text-right font-semibold tabular-nums">{formatCurrency(t.grandTotal)}</td>
                    <td className="px-5 py-2 text-right">
                      <Link href={`/admin/accounting/tax-invoices/view?id=${t.id}`} className="text-[#f73727] hover:underline text-xs">ดู</Link>
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold">
                  <td colSpan={4} className="px-5 py-2 text-right">รวม</td>
                  <td className="px-5 py-2 text-right tabular-nums">{formatCurrency(totals.salesBase)}</td>
                  <td className="px-5 py-2 text-right tabular-nums text-green-700">{formatCurrency(totals.salesVat)}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{formatCurrency(totals.salesBase + totals.salesVat)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Purchases (Input VAT) */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-xl">
              <BanknotesIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">ภาษีซื้อ (Input VAT)</h2>
              <p className="text-xs text-gray-500 mt-0.5">{expenses.length} รายการที่มี VAT</p>
            </div>
          </div>
          {expenses.length > 0 && (
            <button
              onClick={handleExportPurchases}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors"
            >
              <ArrowDownTrayIcon className="w-4 h-4" />
              ดาวน์โหลด CSV
            </button>
          )}
        </div>
        {loading ? (
          <div className="p-5 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : expenses.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">ไม่มีรายจ่ายที่มี VAT ในงวดนี้</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-5 py-2 text-left font-semibold">เลขที่</th>
                  <th className="px-5 py-2 text-left font-semibold">วันที่</th>
                  <th className="px-5 py-2 text-left font-semibold">รายละเอียด</th>
                  <th className="px-5 py-2 text-left font-semibold">ผู้ขาย</th>
                  <th className="px-5 py-2 text-left font-semibold">เลขผู้เสียภาษี</th>
                  <th className="px-5 py-2 text-right font-semibold">ก่อน VAT</th>
                  <th className="px-5 py-2 text-right font-semibold">VAT</th>
                  <th className="px-5 py-2 text-right font-semibold w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-5 py-2 font-mono">{e.code}</td>
                    <td className="px-5 py-2 whitespace-nowrap">{formatDate(e.date)}</td>
                    <td className="px-5 py-2">
                      <div className="text-gray-900">{e.categoryName}</div>
                      <div className="text-xs text-gray-500 truncate max-w-xs">{e.description.split('\n')[0]}</div>
                    </td>
                    <td className="px-5 py-2 text-gray-700">{e.vendorSnapshot?.name ?? '-'}</td>
                    <td className="px-5 py-2 text-gray-600">{e.vendorSnapshot?.taxId ?? '-'}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{formatCurrency(e.amount)}</td>
                    <td className="px-5 py-2 text-right tabular-nums text-blue-700">{formatCurrency(e.vatAmount)}</td>
                    <td className="px-5 py-2 text-right">
                      <Link href={`/admin/accounting/expenses/new?id=${e.id}`} className="text-[#f73727] hover:underline text-xs">ดู</Link>
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold">
                  <td colSpan={5} className="px-5 py-2 text-right">รวม</td>
                  <td className="px-5 py-2 text-right tabular-nums">{formatCurrency(totals.purchaseBase)}</td>
                  <td className="px-5 py-2 text-right tabular-nums text-blue-700">{formatCurrency(totals.purchaseVat)}</td>
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
