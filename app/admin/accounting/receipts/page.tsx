'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  MagnifyingGlassIcon, ClipboardDocumentCheckIcon, EyeIcon,
} from '@heroicons/react/24/outline'
import FormListbox from '@/components/ui/FormListbox'
import { Skeleton } from '@/components/ui/Skeleton'
import { getReceipts } from '@/lib/accounting/receipts'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { PaymentMethod, Receipt } from '@/lib/types'

const statusFilterOptions: { value: string; label: string }[] = [
  { value: '', label: 'ทุกสถานะ' },
  { value: 'issued', label: 'ใช้งาน' },
  { value: 'void', label: 'ยกเลิก' },
]

const methodLabel: Record<PaymentMethod, string> = {
  cash: 'เงินสด',
  transfer: 'โอนเงิน',
  cheque: 'เช็ค',
  credit_card: 'บัตรเครดิต',
  other: 'อื่นๆ',
}

export default function ReceiptsPage() {
  const [items, setItems] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')

  useEffect(() => {
    getReceipts().then(setItems).finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((it) => {
      if (statusFilter && it.status !== statusFilter) return false
      if (!q) return true
      return it.docNumber.toLowerCase().includes(q)
        || it.customerSnapshot?.name.toLowerCase().includes(q)
        || (it.paymentRef ?? '').toLowerCase().includes(q)
    })
  }, [items, search, statusFilter])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ใบเสร็จรับเงิน</h1>
        <p className="text-gray-500 mt-1">{items.length} รายการทั้งหมด — บันทึกการรับเงินจากหน้าใบแจ้งหนี้</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[240px]">
          <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาด้วยเลขที่, ชื่อลูกค้า, เลข ref"
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
            <ClipboardDocumentCheckIcon className="w-10 h-10 text-gray-300 mx-auto" />
            <p className="text-gray-400 text-sm mt-3">
              {search || statusFilter ? 'ไม่พบใบเสร็จที่ตรงเงื่อนไข' : 'ยังไม่มีใบเสร็จ'}
            </p>
            <p className="text-gray-400 text-xs mt-1">บันทึกการรับเงินจากหน้าใบแจ้งหนี้</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold">เลขที่</th>
                  <th className="px-5 py-3 text-left font-semibold">ลูกค้า</th>
                  <th className="px-5 py-3 text-left font-semibold">วันที่รับ</th>
                  <th className="px-5 py-3 text-left font-semibold">วิธีรับ</th>
                  <th className="px-5 py-3 text-right font-semibold">รับเงิน</th>
                  <th className="px-5 py-3 text-right font-semibold">หัก ณ ที่จ่าย</th>
                  <th className="px-5 py-3 text-center font-semibold">สถานะ</th>
                  <th className="px-5 py-3 text-right font-semibold w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((r) => (
                  <tr key={r.id} className={`hover:bg-gray-50 ${r.status === 'void' ? 'opacity-50' : ''}`}>
                    <td className="px-5 py-3 font-mono text-gray-900">{r.docNumber}</td>
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-900">{r.customerSnapshot?.name ?? '—'}</div>
                      <Link
                        href={`/admin/accounting/invoices/new?id=${r.invoiceId}`}
                        className="text-[#f73727] hover:underline text-xs"
                      >
                        ดูใบแจ้งหนี้
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-gray-700">{formatDate(r.issueDate)}</td>
                    <td className="px-5 py-3 text-gray-700">
                      {methodLabel[r.paymentMethod] ?? r.paymentMethod}
                      {r.paymentRef && <div className="text-xs text-gray-400">ref: {r.paymentRef}</div>}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">{formatCurrency(r.amount)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-600">
                      {r.whtAmount ? formatCurrency(r.whtAmount) : '-'}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium ${
                        r.status === 'void' ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'
                      }`}>
                        {r.status === 'void' ? 'ยกเลิก' : 'ใช้งาน'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/admin/accounting/receipts/view?id=${r.id}`}
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
