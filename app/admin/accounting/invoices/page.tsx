'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  PlusIcon, PencilIcon, TrashIcon, MagnifyingGlassIcon, DocumentDuplicateIcon,
} from '@heroicons/react/24/outline'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import FormListbox from '@/components/ui/FormListbox'
import { Skeleton } from '@/components/ui/Skeleton'
import { getInvoices, deleteInvoice } from '@/lib/accounting/invoices'
import { invoiceStatusColor, invoiceStatusLabel } from '@/lib/accounting/calc'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Invoice, InvoiceStatus } from '@/lib/types'

const statusFilterOptions: { value: string; label: string }[] = [
  { value: '', label: 'ทุกสถานะ' },
  { value: 'draft', label: 'แบบร่าง' },
  { value: 'sent', label: 'ส่งแล้ว' },
  { value: 'partial_paid', label: 'ชำระบางส่วน' },
  { value: 'paid', label: 'ชำระแล้ว' },
  { value: 'overdue', label: 'เกินกำหนด' },
  { value: 'cancelled', label: 'ยกเลิก' },
]

function isOverdue(inv: Invoice): boolean {
  if (inv.status === 'paid' || inv.status === 'cancelled' || inv.status === 'void') return false
  if (!inv.dueDate) return false
  const due = new Date(inv.dueDate + 'T23:59:59')
  return due.getTime() < Date.now()
}

export default function InvoicesPage() {
  const [items, setItems] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = async () => {
    setLoading(true)
    try { setItems(await getInvoices()) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((it) => {
      if (statusFilter && it.status !== statusFilter) return false
      if (!q) return true
      return it.docNumber.toLowerCase().includes(q)
        || it.customerSnapshot?.name.toLowerCase().includes(q)
        || (it.notes ?? '').toLowerCase().includes(q)
    })
  }, [items, search, statusFilter])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteInvoice(deleteTarget.id)
      setDeleteTarget(null)
      await load()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ใบแจ้งหนี้</h1>
          <p className="text-gray-500 mt-1">{items.length} รายการทั้งหมด</p>
        </div>
        <Link
          href="/admin/accounting/invoices/new"
          className="flex items-center gap-2 px-5 py-2.5 bg-[#f73727] text-white text-sm font-medium rounded-xl hover:bg-red-600 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          สร้างใบแจ้งหนี้
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[240px]">
          <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาด้วยเลขที่, ชื่อลูกค้า, หมายเหตุ"
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
            <DocumentDuplicateIcon className="w-10 h-10 text-gray-300 mx-auto" />
            <p className="text-gray-400 text-sm mt-3">
              {search || statusFilter ? 'ไม่พบใบแจ้งหนี้ที่ตรงเงื่อนไข' : 'ยังไม่มีใบแจ้งหนี้'}
            </p>
            {!search && !statusFilter && (
              <Link href="/admin/accounting/invoices/new" className="inline-block text-[#f73727] hover:underline text-sm mt-2">
                สร้างใบแจ้งหนี้ฉบับแรก
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold">เลขที่</th>
                  <th className="px-5 py-3 text-left font-semibold">ลูกค้า</th>
                  <th className="px-5 py-3 text-left font-semibold">วันที่ออก</th>
                  <th className="px-5 py-3 text-left font-semibold">ครบกำหนด</th>
                  <th className="px-5 py-3 text-right font-semibold">ยอดรวม</th>
                  <th className="px-5 py-3 text-right font-semibold">ชำระแล้ว</th>
                  <th className="px-5 py-3 text-center font-semibold">สถานะ</th>
                  <th className="px-5 py-3 text-right font-semibold w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((inv) => {
                  const overdue = isOverdue(inv)
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-mono text-gray-900">{inv.docNumber}</td>
                      <td className="px-5 py-3">
                        <div className="font-medium text-gray-900">{inv.customerSnapshot?.name ?? '—'}</div>
                        {inv.customerSnapshot?.code && (
                          <div className="text-xs text-gray-400 font-mono">{inv.customerSnapshot.code}</div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-gray-700">{formatDate(inv.issueDate)}</td>
                      <td className={`px-5 py-3 ${overdue ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
                        {formatDate(inv.dueDate)}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums">{formatCurrency(inv.grandTotal)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-gray-600">
                        {inv.paidAmount > 0 ? formatCurrency(inv.paidAmount) : '-'}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium ${invoiceStatusColor(overdue && inv.status !== 'paid' ? 'overdue' : inv.status as InvoiceStatus)}`}>
                          {invoiceStatusLabel(overdue && inv.status !== 'paid' && inv.status !== 'cancelled' ? 'overdue' : inv.status)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/admin/accounting/invoices/new?id=${inv.id}`}
                            className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <PencilIcon className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => setDeleteTarget(inv)}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
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

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="ลบใบแจ้งหนี้"
        message={`ต้องการลบใบแจ้งหนี้ ${deleteTarget?.docNumber} ใช่หรือไม่? หากมีใบกำกับภาษีหรือใบเสร็จที่ออกแล้ว ควรใช้สถานะ "ยกเลิก" แทน`}
        confirmLabel={deleting ? 'กำลังลบ...' : 'ลบ'}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
        danger
      />
    </div>
  )
}
