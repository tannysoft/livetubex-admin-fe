'use client'

import { useMemo, useState } from 'react'
import Modal from '@/components/ui/Modal'
import FormDatePicker from '@/components/ui/FormDatePicker'
import FormListbox from '@/components/ui/FormListbox'
import { issueReceipt } from '@/lib/accounting/receipts'
import { formatCurrency } from '@/lib/utils'
import { round2 } from '@/lib/accounting/calc'
import type { Invoice, PaymentMethod, TaxInvoice } from '@/lib/types'

interface Props {
  invoice: Invoice
  taxInvoices?: TaxInvoice[]
  isOpen: boolean
  onClose: () => void
  onIssued: (id: string, docNumber: string) => void
  createdBy: string
}

function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const methodOptions: { value: PaymentMethod; label: string }[] = [
  { value: 'transfer', label: 'โอนเงิน' },
  { value: 'cash', label: 'เงินสด' },
  { value: 'cheque', label: 'เช็ค' },
  { value: 'credit_card', label: 'บัตรเครดิต' },
  { value: 'other', label: 'อื่นๆ' },
]

export default function RecordPaymentModal({ invoice, taxInvoices = [], isOpen, onClose, onIssued, createdBy }: Props) {
  const remaining = round2(invoice.grandTotal - (invoice.paidAmount ?? 0))

  const [issueDate, setIssueDate] = useState(todayYmd())
  const [amount, setAmount] = useState<number>(remaining > 0 ? remaining : invoice.grandTotal)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('transfer')
  const [paymentRef, setPaymentRef] = useState('')
  const [hasWht, setHasWht] = useState(!!invoice.whtRate && invoice.whtRate > 0)
  const [whtAmount, setWhtAmount] = useState<number>(invoice.whtAmount ?? 0)
  const [whtCertReceived, setWhtCertReceived] = useState(false)
  const [bankAccountReceived, setBankAccountReceived] = useState('')
  const [taxInvoiceId, setTaxInvoiceId] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const validTaxInvoices = useMemo(() => taxInvoices.filter((t) => t.status === 'issued'), [taxInvoices])
  const taxInvoiceOptions = useMemo(() => [
    { value: '', label: '— ไม่อ้างอิงใบกำกับภาษี —' },
    ...validTaxInvoices.map((t) => ({ value: t.id, label: t.docNumber })),
  ], [validTaxInvoices])

  const handleSubmit = async () => {
    setError('')
    if (!issueDate) { setError('กรุณาระบุวันที่รับเงิน'); return }
    if (!amount || amount <= 0) { setError('กรุณาระบุจำนวนเงินที่รับ'); return }

    setSubmitting(true)
    try {
      const result = await issueReceipt({
        invoice,
        taxInvoiceId: taxInvoiceId || undefined,
        issueDate,
        amount,
        paymentMethod,
        paymentRef: paymentRef || undefined,
        whtAmount: hasWht && whtAmount > 0 ? whtAmount : undefined,
        whtCertReceived: hasWht ? whtCertReceived : undefined,
        bankAccountReceived: bankAccountReceived || undefined,
        notes: notes || undefined,
        createdBy,
      })
      onIssued(result.id, result.docNumber)
      onClose()
    } catch (e) {
      console.error(e)
      setError('บันทึกการรับเงินไม่สำเร็จ — กรุณาลองใหม่')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727] transition-all'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
  const netReceived = round2(amount - (hasWht && whtAmount > 0 ? whtAmount : 0))

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="บันทึกการรับเงิน / ออกใบเสร็จ" size="xl">
      <div className="space-y-4">
        {/* Summary bar */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-500">ยอดรวมใบแจ้งหนี้</p>
            <p className="text-sm font-semibold tabular-nums mt-0.5">{formatCurrency(invoice.grandTotal)}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-500">ชำระแล้ว</p>
            <p className="text-sm font-semibold tabular-nums mt-0.5">{formatCurrency(invoice.paidAmount ?? 0)}</p>
          </div>
          <div className="bg-red-50 rounded-xl p-3 text-center">
            <p className="text-xs text-[#f73727]">คงเหลือ</p>
            <p className="text-sm font-bold text-[#f73727] tabular-nums mt-0.5">{formatCurrency(remaining)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>วันที่รับเงิน *</label>
            <FormDatePicker value={issueDate} onChange={setIssueDate} buttonClassName={inputCls} />
          </div>
          <div>
            <label className={labelCls}>จำนวนที่รับ (gross) *</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
              className={`${inputCls} text-right tabular-nums`}
              min={0}
              step="any"
            />
          </div>
          <div>
            <label className={labelCls}>วิธีรับชำระ *</label>
            <FormListbox
              value={paymentMethod}
              onChange={(v) => setPaymentMethod(v as PaymentMethod)}
              options={methodOptions}
              buttonClassName={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>เลขอ้างอิง</label>
            <input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} className={inputCls} placeholder="เลขเช็ค / ref โอน" />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>บัญชีที่รับเงิน</label>
            <input value={bankAccountReceived} onChange={(e) => setBankAccountReceived(e.target.value)} className={inputCls} placeholder="ชื่อธนาคาร / เลขบัญชี" />
          </div>

          {validTaxInvoices.length > 0 && (
            <div className="sm:col-span-2">
              <label className={labelCls}>อ้างอิงใบกำกับภาษี (ถ้ามี)</label>
              <FormListbox value={taxInvoiceId} onChange={setTaxInvoiceId} options={taxInvoiceOptions} buttonClassName={inputCls} />
            </div>
          )}

          {/* WHT section */}
          <div className="sm:col-span-2">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={hasWht}
                onChange={(e) => setHasWht(e.target.checked)}
                className="w-4 h-4 rounded text-[#f73727]"
              />
              ลูกค้าหัก ณ ที่จ่าย
            </label>
          </div>

          {hasWht && (
            <>
              <div>
                <label className={labelCls}>จำนวนหัก ณ ที่จ่าย</label>
                <input
                  type="number"
                  value={whtAmount}
                  onChange={(e) => setWhtAmount(Number(e.target.value) || 0)}
                  className={`${inputCls} text-right tabular-nums`}
                  min={0}
                  step="any"
                />
              </div>
              <div className="flex items-end">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 pb-2.5">
                  <input
                    type="checkbox"
                    checked={whtCertReceived}
                    onChange={(e) => setWhtCertReceived(e.target.checked)}
                    className="w-4 h-4 rounded text-[#f73727]"
                  />
                  ได้รับหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)
                </label>
              </div>
            </>
          )}

          <div className="sm:col-span-2">
            <label className={labelCls}>หมายเหตุ</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} />
          </div>
        </div>

        {/* Net amount preview */}
        {hasWht && whtAmount > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm flex justify-between">
            <span className="text-blue-900">เงินสุทธิที่รับเข้าบัญชี (gross - WHT):</span>
            <span className="font-bold text-blue-900 tabular-nums">{formatCurrency(netReceived)}</span>
          </div>
        )}

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
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-2.5 text-sm font-medium text-white bg-[#f73727] rounded-xl hover:bg-red-600 transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {submitting && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            ออกใบเสร็จ
          </button>
        </div>
      </div>
    </Modal>
  )
}
