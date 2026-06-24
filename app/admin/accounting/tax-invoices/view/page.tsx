'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeftIcon, ExclamationTriangleIcon, NoSymbolIcon,
} from '@heroicons/react/24/outline'
import DocumentItemsTable from '@/components/admin/accounting/DocumentItemsTable'
import DocumentSummary from '@/components/admin/accounting/DocumentSummary'
import PdfButtons from '@/components/admin/accounting/PdfButtons'
import { Skeleton } from '@/components/ui/Skeleton'
import { getTaxInvoice, voidTaxInvoice } from '@/lib/accounting/tax-invoices'
import { getCompanySettingsForPdf } from '@/lib/accounting/company-settings'
import { calcTotals } from '@/lib/accounting/calc'
import { formatDate, formatDateTime } from '@/lib/utils'
import type { TaxInvoice } from '@/lib/types'

function TaxInvoiceViewer() {
  const searchParams = useSearchParams()
  const id = searchParams.get('id')

  const [doc, setDoc] = useState<TaxInvoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [showVoidConfirm, setShowVoidConfirm] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voiding, setVoiding] = useState(false)

  const load = async () => {
    if (!id) return
    setLoading(true)
    try { setDoc(await getTaxInvoice(id)) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleVoid = async () => {
    if (!doc || !voidReason.trim()) return
    setVoiding(true)
    try {
      await voidTaxInvoice(doc.id, voidReason.trim())
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
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">ไม่พบใบกำกับภาษี</p>
        <Link href="/admin/accounting/tax-invoices" className="text-[#f73727] hover:underline text-sm mt-2 inline-block">
          กลับไปที่รายการ
        </Link>
      </div>
    )
  }

  const totals = calcTotals({
    items: doc.items,
    discountTotal: doc.discountTotal,
    vatRate: doc.vatRate,
    whtRate: doc.whtRate,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link
            href="/admin/accounting/tax-invoices"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            ใบกำกับภาษี
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
              const company = await getCompanySettingsForPdf()
              const DocumentPdf = (await import('@/lib/accounting/pdf/DocumentPdf')).default
              return <DocumentPdf type="taxInvoice" doc={doc} company={company} isVoid={doc.status === 'void'} />
            }}
            filename={`TaxInvoice-${doc.docNumber}`}
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
            <p className="font-semibold text-red-700">ใบกำกับภาษีนี้ถูกยกเลิกแล้ว</p>
            {doc.voidReason && <p className="text-red-700 mt-1">เหตุผล: {doc.voidReason}</p>}
            {doc.voidedAt && <p className="text-red-600 text-xs mt-1">ยกเลิกเมื่อ: {formatDateTime(doc.voidedAt)}</p>}
          </div>
        </div>
      )}

      {/* Header info */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
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
              <span className="text-gray-500">วันที่ออก:</span>
              <span className="font-medium">{formatDate(doc.issueDate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">ใบแจ้งหนี้:</span>
              <Link href={`/admin/accounting/invoices/new?id=${doc.invoiceId}`} className="text-[#f73727] hover:underline font-mono text-xs">
                ดูใบแจ้งหนี้ ↗
              </Link>
            </div>
            {doc.reportedInVatPeriod && (
              <div className="flex justify-between">
                <span className="text-gray-500">ยื่น ภพ.30 งวด:</span>
                <span className="font-medium">{doc.reportedInVatPeriod}</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-gray-400 pt-1">
              <span>สร้างเมื่อ:</span>
              <span>{formatDateTime(doc.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-900 mb-4">รายการ</h2>
        <DocumentItemsTable items={doc.items} onChange={() => {}} readonly />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 mb-2">หมายเหตุ</h2>
          <p className="text-sm text-gray-700 whitespace-pre-line">{doc.notes || '—'}</p>
        </div>

        <div className="lg:col-span-1">
          <DocumentSummary
            totals={totals}
            discountTotal={doc.discountTotal}
            vatRate={doc.vatRate}
            whtRate={doc.whtRate}
            readonly
          />
        </div>
      </div>

      {/* Void modal — custom (need reason input) */}
      {showVoidConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-base font-semibold text-gray-900">ยกเลิกใบกำกับภาษี</h3>
            <p className="text-sm text-gray-500 mt-1">
              ใบกำกับภาษีที่ยกเลิกแล้วจะยังเก็บไว้ในระบบเพื่อ audit แต่จะไม่ถูกใช้ในการยื่น VAT
            </p>
            <label className="block text-sm font-medium text-gray-700 mt-4 mb-1">เหตุผลในการยกเลิก *</label>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727]"
              placeholder="เช่น ออกผิดจำนวน, ลูกค้าขอแก้ไข"
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

export default function TaxInvoiceViewPage() {
  return (
    <Suspense fallback={
      <div className="space-y-4">
        <Skeleton className="h-8 w-48 rounded-md" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    }>
      <TaxInvoiceViewer />
    </Suspense>
  )
}
