'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeftIcon, ExclamationTriangleIcon, NoSymbolIcon,
} from '@heroicons/react/24/outline'
import PdfButtons from '@/components/admin/accounting/PdfButtons'
import { Skeleton } from '@/components/ui/Skeleton'
import { getReceipt, voidReceipt } from '@/lib/accounting/receipts'
import { getInvoice } from '@/lib/accounting/invoices'
import { getTaxInvoice } from '@/lib/accounting/tax-invoices'
import { getCompanySettingsForPdf } from '@/lib/accounting/company-settings'
import { bahtText } from '@/lib/accounting/calc'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import type { PaymentMethod, Receipt } from '@/lib/types'

const methodLabel: Record<PaymentMethod, string> = {
  cash: 'เงินสด',
  transfer: 'โอนเงิน',
  cheque: 'เช็ค',
  credit_card: 'บัตรเครดิต',
  other: 'อื่นๆ',
}

function ReceiptViewer() {
  const searchParams = useSearchParams()
  const id = searchParams.get('id')

  const [doc, setDoc] = useState<Receipt | null>(null)
  const [loading, setLoading] = useState(true)
  const [showVoidConfirm, setShowVoidConfirm] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voiding, setVoiding] = useState(false)

  const load = async () => {
    if (!id) return
    setLoading(true)
    try { setDoc(await getReceipt(id)) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleVoid = async () => {
    if (!doc || !voidReason.trim()) return
    setVoiding(true)
    try {
      await voidReceipt(doc.id, voidReason.trim())
      setShowVoidConfirm(false)
      setVoidReason('')
      await load()
    } finally {
      setVoiding(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48 rounded-md" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">ไม่พบใบเสร็จ</p>
        <Link href="/admin/accounting/receipts" className="text-[#f73727] hover:underline text-sm mt-2 inline-block">
          กลับไปที่รายการ
        </Link>
      </div>
    )
  }

  const netReceived = doc.amount - (doc.whtAmount ?? 0)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link
            href="/admin/accounting/receipts"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            ใบเสร็จ
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{doc.docNumber}</h1>
            <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium ${
              doc.status === 'void' ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'
            }`}>
              {doc.status === 'void' ? 'ยกเลิก' : 'ใช้งาน'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <PdfButtons
            buildPdfElement={async () => {
              const [company, invoice, taxInvoice] = await Promise.all([
                getCompanySettingsForPdf(),
                getInvoice(doc.invoiceId),
                doc.taxInvoiceId ? getTaxInvoice(doc.taxInvoiceId) : Promise.resolve(null),
              ])
              const ReceiptPdf = (await import('@/lib/accounting/pdf/ReceiptPdf')).default
              return (
                <ReceiptPdf
                  receipt={doc}
                  company={company}
                  invoiceDocNumber={invoice?.docNumber}
                  taxInvoiceDocNumber={taxInvoice?.docNumber}
                />
              )
            }}
            filename={`Receipt-${doc.docNumber}`}
          />
          {doc.status === 'issued' && (
            <button
              onClick={() => setShowVoidConfirm(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 text-sm font-medium rounded-xl hover:bg-red-100 transition-colors"
            >
              <NoSymbolIcon className="w-4 h-4" />
              ยกเลิก
            </button>
          )}
        </div>
      </div>

      {doc.status === 'void' && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex items-start gap-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-red-700">ใบเสร็จนี้ถูกยกเลิกแล้ว</p>
            {doc.voidReason && <p className="text-red-700 mt-1">เหตุผล: {doc.voidReason}</p>}
            {doc.voidedAt && <p className="text-red-600 text-xs mt-1">ยกเลิกเมื่อ: {formatDateTime(doc.voidedAt)}</p>}
            <p className="text-red-600 text-xs mt-1">ยอดได้ถูกหักจาก paidAmount ของใบแจ้งหนี้แล้ว</p>
          </div>
        </div>
      )}

      {/* Main info */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 uppercase">ลูกค้า</p>
            <p className="text-sm font-semibold text-gray-900 mt-1">{doc.customerSnapshot.name}</p>
            {doc.customerSnapshot.taxId && (
              <p className="text-xs text-gray-500">เลขผู้เสียภาษี: {doc.customerSnapshot.taxId}</p>
            )}
            <p className="text-xs text-gray-500 mt-1 whitespace-pre-line">{doc.customerSnapshot.address}</p>
          </div>
          <div className="text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">วันที่รับเงิน:</span>
              <span className="font-medium">{formatDate(doc.issueDate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">วิธีรับชำระ:</span>
              <span className="font-medium">{methodLabel[doc.paymentMethod] ?? doc.paymentMethod}</span>
            </div>
            {doc.paymentRef && (
              <div className="flex justify-between">
                <span className="text-gray-500">เลขอ้างอิง:</span>
                <span className="font-medium">{doc.paymentRef}</span>
              </div>
            )}
            {doc.bankAccountReceived && (
              <div className="flex justify-between">
                <span className="text-gray-500">บัญชีที่รับ:</span>
                <span className="font-medium">{doc.bankAccountReceived}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">ใบแจ้งหนี้:</span>
              <Link href={`/admin/accounting/invoices/new?id=${doc.invoiceId}`} className="text-[#f73727] hover:underline text-xs">
                ดูใบแจ้งหนี้ ↗
              </Link>
            </div>
            {doc.taxInvoiceId && (
              <div className="flex justify-between">
                <span className="text-gray-500">ใบกำกับภาษี:</span>
                <Link href={`/admin/accounting/tax-invoices/view?id=${doc.taxInvoiceId}`} className="text-[#f73727] hover:underline text-xs">
                  ดูใบกำกับ ↗
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Amount table */}
        <div className="bg-gray-50 rounded-xl p-4">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-600">จำนวนที่รับ (gross)</dt>
              <dd className="font-medium tabular-nums">{formatCurrency(doc.amount)}</dd>
            </div>
            {doc.whtAmount && doc.whtAmount > 0 && (
              <div className="flex justify-between text-red-700">
                <dt>หัก ณ ที่จ่าย {doc.whtCertReceived && <span className="text-xs ml-1">(ได้รับ 50 ทวิ)</span>}</dt>
                <dd className="font-medium tabular-nums">- {formatCurrency(doc.whtAmount)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-200 pt-2 text-base">
              <dt className="font-semibold text-gray-800">เงินสุทธิที่รับเข้าบัญชี</dt>
              <dd className="font-bold text-green-700 tabular-nums">{formatCurrency(netReceived)}</dd>
            </div>
            <div className="text-xs text-gray-500 italic pt-1">
              ({bahtText(netReceived)})
            </div>
          </dl>
        </div>

        {doc.notes && (
          <div>
            <p className="text-xs text-gray-500 uppercase mb-1">หมายเหตุ</p>
            <p className="text-sm text-gray-700 whitespace-pre-line">{doc.notes}</p>
          </div>
        )}

        <div className="text-xs text-gray-400 pt-2 border-t border-gray-100">
          สร้างเมื่อ: {formatDateTime(doc.createdAt)}
        </div>
      </div>

      {showVoidConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-base font-semibold text-gray-900">ยกเลิกใบเสร็จ</h3>
            <p className="text-sm text-gray-500 mt-1">
              ยอดที่รับจะถูกหักออกจาก paidAmount ของใบแจ้งหนี้อัตโนมัติ
            </p>
            <label className="block text-sm font-medium text-gray-700 mt-4 mb-1">เหตุผลในการยกเลิก *</label>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727]"
              placeholder="เช่น ลูกค้าโอนผิด, บันทึกผิดจำนวน"
            />
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => { setShowVoidConfirm(false); setVoidReason('') }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleVoid}
                disabled={!voidReason.trim() || voiding}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60"
              >
                {voiding ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ReceiptViewPage() {
  return (
    <Suspense fallback={
      <div className="space-y-4">
        <Skeleton className="h-8 w-48 rounded-md" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    }>
      <ReceiptViewer />
    </Suspense>
  )
}
