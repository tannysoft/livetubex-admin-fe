'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  MagnifyingGlassIcon, ReceiptPercentIcon, EyeIcon,
} from '@heroicons/react/24/outline'
import FormListbox from '@/components/ui/FormListbox'
import { Skeleton } from '@/components/ui/Skeleton'
import { getTaxInvoices } from '@/lib/accounting/tax-invoices'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { TaxInvoice } from '@/lib/types'

const statusFilterOptions: { value: string; label: string }[] = [
  { value: '', label: 'ทุกสถานะ' },
  { value: 'issued', label: 'ใช้งาน' },
  { value: 'void', label: 'ยกเลิก' },
]

export default function TaxInvoicesPage() {
  const [items, setItems] = useState<TaxInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')

  useEffect(() => {
    getTaxInvoices().then(setItems).finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((it) => {
      if (statusFilter && it.status !== statusFilter) return false
      if (!q) return true
      return it.docNumber.toLowerCase().includes(q)
        || it.customerSnapshot?.name.toLowerCase().includes(q)
    })
  }, [items, search, statusFilter])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ใบกำกับภาษี</h1>
        <p className="text-gray-500 mt-1">{items.length} รายการทั้งหมด — ออกใบกำกับภาษีใหม่จากหน้าใบแจ้งหนี้</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[240px]">
          <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาด้วยเลขที่, ชื่อลูกค้า"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727]"
          />
        </div>
        <div className="w-44">
          <FormListbox value={statusFilter} onChange={setStatusFilter} options={statusFilterOptions} />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <ul className="divide-y divide-gray-50">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 px-5 py-4">
                <Skeleton className="w-10 h-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48 rounded-md" />
                  <Skeleton className="h-3 w-32 rounded-md" />
                </div>
                <Skeleton className="w-24 h-7 rounded-lg" />
              </li>
            ))}
          </ul>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <ReceiptPercentIcon className="w-10 h-10 text-gray-300 mx-auto" />
            <p className="text-gray-400 text-sm mt-3">
              {search || statusFilter ? 'ไม่พบใบกำกับภาษีที่ตรงเงื่อนไข' : 'ยังไม่มีใบกำกับภาษี'}
            </p>
            <p className="text-gray-400 text-xs mt-1">ออกใบกำกับภาษีใหม่จากหน้าใบแจ้งหนี้</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold">เลขที่</th>
                  <th className="px-5 py-3 text-left font-semibold">ลูกค้า</th>
                  <th className="px-5 py-3 text-left font-semibold">วันที่ออก</th>
                  <th className="px-5 py-3 text-left font-semibold">ใบแจ้งหนี้</th>
                  <th className="px-5 py-3 text-right font-semibold">ก่อน VAT</th>
                  <th className="px-5 py-3 text-right font-semibold">VAT</th>
                  <th className="px-5 py-3 text-right font-semibold">รวม</th>
                  <th className="px-5 py-3 text-center font-semibold">สถานะ</th>
                  <th className="px-5 py-3 text-right font-semibold w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((t) => (
                  <tr key={t.id} className={`hover:bg-gray-50 ${t.status === 'void' ? 'opacity-50' : ''}`}>
                    <td className="px-5 py-3 font-mono text-gray-900">{t.docNumber}</td>
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-900">{t.customerSnapshot?.name ?? '—'}</div>
                      {t.customerSnapshot?.taxId && (
                        <div className="text-xs text-gray-400">{t.customerSnapshot.taxId}</div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-700">{formatDate(t.issueDate)}</td>
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/accounting/invoices/new?id=${t.invoiceId}`}
                        className="text-[#f73727] hover:underline text-xs font-mono"
                      >
                        ดูใบแจ้งหนี้
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-700">{formatCurrency(t.subtotal - t.discountTotal)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-700">{formatCurrency(t.vatAmount)}</td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">{formatCurrency(t.grandTotal)}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium ${
                        t.status === 'void' ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'
                      }`}>
                        {t.status === 'void' ? 'ยกเลิก' : 'ใช้งาน'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/admin/accounting/tax-invoices/view?id=${t.id}`}
                        className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors inline-block"
                      >
                        <EyeIcon className="w-4 h-4" />
                      </Link>
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
