'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import FormDatePicker from '@/components/ui/FormDatePicker'
import DocumentSummary from './DocumentSummary'
import { calcTotals } from '@/lib/accounting/calc'
import { issueTaxInvoice } from '@/lib/accounting/tax-invoices'
import { formatCurrency } from '@/lib/utils'
import type { Invoice } from '@/lib/types'

interface Props {
  invoice: Invoice
  isOpen: boolean
  onClose: () => void
  onIssued: (id: string, docNumber: string) => void
  createdBy: string
}

function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function IssueTaxInvoiceModal({ invoice, isOpen, onClose, onIssued, createdBy }: Props) {
  const [issueDate, setIssueDate] = useState(todayYmd())
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // ใช้ totals ของ invoice ทั้งใบ (Phase 1 — ออกเต็มจำนวน)
  const totals = calcTotals({
    items: invoice.items,
    discountTotal: invoice.discountTotal,
    vatRate: invoice.vatRate,
    whtRate: invoice.whtRate,
  })

  const handleIssue = async () => {
    if (!issueDate) { setError('กรุณาระบุวันที่ออก'); return }
    setSubmitting(true)
    setError('')
    try {
      const result = await issueTaxInvoice({
        invoice,
        issueDate,
        notes: notes || undefined,
        createdBy,
      })
      onIssued(result.id, result.docNumber)
      onClose()
    } catch (e) {
      console.error(e)
      setError('ออกใบกำกับภาษีไม่สำเร็จ — กรุณาลองใหม่')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727] transition-all'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="ออกใบกำกับภาษี" size="xl">
      <div className="space-y-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-xs text-yellow-800">
          ⚠️ <strong>ใบกำกับภาษีออกแล้วห้ามแก้ไข</strong> — หากต้องการเปลี่ยนแปลงจะต้องยกเลิกใบเดิมและออกใบใหม่
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>วันที่ส่งมอบ/รับเงิน *</label>
            <FormDatePicker value={issueDate} onChange={setIssueDate} buttonClassName={inputCls} />
            <p className="text-xs text-gray-500 mt-1">วันที่นี้ใช้เป็นฐานในการยื่น ภพ.30</p>
          </div>
          <div>
            <label className={labelCls}>เลขใบแจ้งหนี้ต้นทาง</label>
            <input value={invoice.docNumber} disabled className={`${inputCls} bg-gray-50 text-gray-500`} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>หมายเหตุ</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} placeholder="ถ้ามี" />
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-sm font-medium text-gray-700 mb-2">ลูกค้า</p>
          <div className="text-sm text-gray-900">{invoice.customerSnapshot.name}</div>
          {invoice.customerSnapshot.taxId && (
            <div className="text-xs text-gray-500 mt-0.5">เลขผู้เสียภาษี: {invoice.customerSnapshot.taxId}</div>
          )}
          <div className="text-xs text-gray-500 mt-1 whitespace-pre-line">{invoice.customerSnapshot.address}</div>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">รายการในใบกำกับภาษี ({invoice.items.length} รายการ)</p>
          <div className="rounded-xl border border-gray-200 max-h-48 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0 text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">รายการ</th>
                  <th className="px-3 py-2 text-right w-20">จำนวน</th>
                  <th className="px-3 py-2 text-right w-28">จำนวนเงิน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoice.items.map((it, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-gray-800">{it.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{it.quantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <DocumentSummary
          totals={totals}
          discountTotal={invoice.discountTotal}
          vatRate={invoice.vatRate}
          whtRate={invoice.whtRate}
          readonly
        />

        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-60"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleIssue}
            disabled={submitting}
            className="px-6 py-2.5 text-sm font-medium text-white bg-[#f73727] rounded-xl hover:bg-red-600 transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {submitting && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            ออกใบกำกับภาษี
          </button>
        </div>
      </div>
    </Modal>
  )
}
