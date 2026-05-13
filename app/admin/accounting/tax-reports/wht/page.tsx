'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowDownTrayIcon, UserIcon, BuildingOffice2Icon,
} from '@heroicons/react/24/outline'
import FormListbox from '@/components/ui/FormListbox'
import { Skeleton } from '@/components/ui/Skeleton'
import { getWhtExpensesByPeriod } from '@/lib/accounting/tax-reports'
import { getVendors } from '@/lib/accounting/vendors'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Expense, Vendor } from '@/lib/types'

const MONTHS = [
  'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม',
]

function thaiYear(y: number) { return y + 543 }

/**
 * แยก expense → ภงด.3 (บุคคลธรรมดา) หรือ ภงด.53 (นิติบุคคล)
 *
 *   - sourceType='freelancer_payment'    → ภงด.3 (freelancer = บุคคลธรรมดา)
 *   - vendor.type='company'              → ภงด.53
 *   - vendor.type='individual'           → ภงด.3
 *   - vendor.type='freelancer'           → ภงด.3
 *   - ไม่ระบุ vendor                       → ภงด.3 (default)
 */
function classifyExpense(e: Expense, vendorMap: Map<string, Vendor>): 'pnd3' | 'pnd53' {
  if (e.sourceType === 'freelancer_payment') return 'pnd3'
  if (e.vendorId) {
    const v = vendorMap.get(e.vendorId)
    if (v?.type === 'company') return 'pnd53'
  }
  return 'pnd3'
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

export default function WhtReportPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [vendorMap, setVendorMap] = useState<Map<string, Vendor>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      getWhtExpensesByPeriod(year, month),
      getVendors(),
    ]).then(([exps, vendors]) => {
      if (!alive) return
      setExpenses(exps)
      setVendorMap(new Map(vendors.map((v) => [v.id, v])))
      setLoading(false)
    }).catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [year, month])

  const { pnd3, pnd53, totals } = useMemo(() => {
    const pnd3List: Expense[] = []
    const pnd53List: Expense[] = []
    for (const e of expenses) {
      if (classifyExpense(e, vendorMap) === 'pnd3') pnd3List.push(e)
      else pnd53List.push(e)
    }
    const sumWht = (list: Expense[]) => list.reduce((s, e) => s + (e.whtAmount ?? 0), 0)
    const sumBase = (list: Expense[]) => list.reduce((s, e) => s + (e.amount ?? 0), 0)
    return {
      pnd3: pnd3List,
      pnd53: pnd53List,
      totals: {
        pnd3Wht: sumWht(pnd3List),
        pnd3Base: sumBase(pnd3List),
        pnd53Wht: sumWht(pnd53List),
        pnd53Base: sumBase(pnd53List),
        totalWht: sumWht(expenses),
        totalBase: sumBase(expenses),
      },
    }
  }, [expenses, vendorMap])

  const monthOptions = MONTHS.map((label, i) => ({ value: String(i + 1), label }))
  const yearOptions = Array.from({ length: 5 }, (_, i) => {
    const y = now.getFullYear() - 3 + i
    return { value: String(y), label: String(thaiYear(y)) }
  })

  const periodLabel = `${MONTHS[month - 1]} ${thaiYear(year)}`

  const exportList = (kind: 'pnd3' | 'pnd53') => {
    const list = kind === 'pnd3' ? pnd3 : pnd53
    exportToCsv(
      `${kind.toUpperCase()}-${year}-${String(month).padStart(2, '0')}.csv`,
      ['เลขที่', 'วันที่จ่าย', 'ชื่อผู้ถูกหัก', 'เลขผู้เสียภาษี', 'ประเภทเงินได้', 'จำนวนเงินที่จ่าย', 'อัตรา%', 'ภาษีที่หัก'],
      list.map((e) => [
        e.code,
        formatDate(e.date),
        e.vendorSnapshot?.name ?? '(ไม่ระบุ)',
        e.vendorSnapshot?.taxId ?? '',
        e.categoryName,
        e.amount.toFixed(2),
        e.whtRate ?? '',
        (e.whtAmount ?? 0).toFixed(2),
      ])
    )
  }

  const renderTable = (list: Expense[], kind: 'pnd3' | 'pnd53') => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
          <tr>
            <th className="px-5 py-2 text-left font-semibold">เลขที่</th>
            <th className="px-5 py-2 text-left font-semibold">วันที่จ่าย</th>
            <th className="px-5 py-2 text-left font-semibold">ผู้ถูกหัก</th>
            <th className="px-5 py-2 text-left font-semibold">เลขผู้เสียภาษี</th>
            <th className="px-5 py-2 text-left font-semibold">ประเภทเงินได้</th>
            <th className="px-5 py-2 text-right font-semibold">จำนวนเงิน</th>
            <th className="px-5 py-2 text-right font-semibold">อัตรา</th>
            <th className="px-5 py-2 text-right font-semibold">ภาษีที่หัก</th>
            <th className="px-5 py-2 text-right font-semibold w-16"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {list.map((e) => (
            <tr key={e.id} className="hover:bg-gray-50">
              <td className="px-5 py-2 font-mono">{e.code}</td>
              <td className="px-5 py-2 whitespace-nowrap">{formatDate(e.date)}</td>
              <td className="px-5 py-2">
                <div>{e.vendorSnapshot?.name ?? '(ไม่ระบุ)'}</div>
                {e.sourceType === 'freelancer_payment' && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded-full">Freelancer</span>
                )}
              </td>
              <td className="px-5 py-2 text-gray-600">{e.vendorSnapshot?.taxId ?? '-'}</td>
              <td className="px-5 py-2 text-gray-700">{e.categoryName}</td>
              <td className="px-5 py-2 text-right tabular-nums">{formatCurrency(e.amount)}</td>
              <td className="px-5 py-2 text-right text-gray-600">{e.whtRate}%</td>
              <td className="px-5 py-2 text-right font-semibold tabular-nums text-red-600">{formatCurrency(e.whtAmount ?? 0)}</td>
              <td className="px-5 py-2 text-right">
                <Link href={`/admin/accounting/expenses/new?id=${e.id}`} className="text-[#f73727] hover:underline text-xs">ดู / 50 ทวิ</Link>
              </td>
            </tr>
          ))}
          <tr className="bg-gray-50 font-semibold">
            <td colSpan={5} className="px-5 py-2 text-right">รวม</td>
            <td className="px-5 py-2 text-right tabular-nums">
              {formatCurrency(kind === 'pnd3' ? totals.pnd3Base : totals.pnd53Base)}
            </td>
            <td></td>
            <td className="px-5 py-2 text-right tabular-nums text-red-600">
              {formatCurrency(kind === 'pnd3' ? totals.pnd3Wht : totals.pnd53Wht)}
            </td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">รายงานภาษีหัก ณ ที่จ่าย (ภงด.3/53)</h1>
        <p className="text-gray-500 mt-1">รายการที่ต้องหัก ณ ที่จ่ายและนำส่งสรรพากร — แยกตามประเภทผู้ถูกหัก</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex gap-3 items-center flex-wrap">
        <span className="text-sm font-medium text-gray-700">งวด:</span>
        <div className="w-44"><FormListbox value={String(month)} onChange={(v) => setMonth(Number(v))} options={monthOptions} /></div>
        <div className="w-32"><FormListbox value={String(year)} onChange={(v) => setYear(Number(v))} options={yearOptions} /></div>
        <div className="flex-1 text-right text-xs text-gray-500">
          📅 ยื่นแบบ ภงด.3/53 ภายในวันที่ 7 ของเดือนถัดไป
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
            <UserIcon className="w-4 h-4" />
            ภงด.3 (บุคคลธรรมดา)
          </div>
          {loading ? <Skeleton className="h-7 w-32" /> : (
            <>
              <p className="text-2xl font-bold tabular-nums text-red-600">{formatCurrency(totals.pnd3Wht)}</p>
              <p className="text-xs text-gray-500 mt-1">{pnd3.length} รายการ — ฐาน {formatCurrency(totals.pnd3Base)}</p>
            </>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
            <BuildingOffice2Icon className="w-4 h-4" />
            ภงด.53 (นิติบุคคล)
          </div>
          {loading ? <Skeleton className="h-7 w-32" /> : (
            <>
              <p className="text-2xl font-bold tabular-nums text-red-600">{formatCurrency(totals.pnd53Wht)}</p>
              <p className="text-xs text-gray-500 mt-1">{pnd53.length} รายการ — ฐาน {formatCurrency(totals.pnd53Base)}</p>
            </>
          )}
        </div>
        <div className="bg-[#f73727]/5 rounded-2xl border border-[#f73727]/20 p-5">
          <div className="text-xs text-[#f73727] mb-2">รวมที่ต้องนำส่ง</div>
          {loading ? <Skeleton className="h-7 w-32" /> : (
            <>
              <p className="text-2xl font-bold tabular-nums text-[#f73727]">{formatCurrency(totals.totalWht)}</p>
              <p className="text-xs text-gray-500 mt-1">{expenses.length} รายการ — งวด {periodLabel}</p>
            </>
          )}
        </div>
      </div>

      {/* ภงด.3 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-50 rounded-xl">
              <UserIcon className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">ภงด.3 — บุคคลธรรมดา</h2>
              <p className="text-xs text-gray-500 mt-0.5">{pnd3.length} รายการ</p>
            </div>
          </div>
          {pnd3.length > 0 && (
            <button
              onClick={() => exportList('pnd3')}
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
        ) : pnd3.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">ไม่มีรายการในงวดนี้</p>
        ) : renderTable(pnd3, 'pnd3')}
      </div>

      {/* ภงด.53 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-xl">
              <BuildingOffice2Icon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">ภงด.53 — นิติบุคคล</h2>
              <p className="text-xs text-gray-500 mt-0.5">{pnd53.length} รายการ</p>
            </div>
          </div>
          {pnd53.length > 0 && (
            <button
              onClick={() => exportList('pnd53')}
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
        ) : pnd53.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">ไม่มีรายการในงวดนี้</p>
        ) : renderTable(pnd53, 'pnd53')}
      </div>
    </div>
  )
}
