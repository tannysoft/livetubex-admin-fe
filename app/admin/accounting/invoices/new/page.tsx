'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeftIcon, CheckCircleIcon, ExclamationCircleIcon,
  ReceiptPercentIcon, ClipboardDocumentCheckIcon,
} from '@heroicons/react/24/outline'
import InvoiceForm, { type InvoiceFormValue } from '@/components/admin/accounting/InvoiceForm'
import IssueTaxInvoiceModal from '@/components/admin/accounting/IssueTaxInvoiceModal'
import RecordPaymentModal from '@/components/admin/accounting/RecordPaymentModal'
import PdfButtons from '@/components/admin/accounting/PdfButtons'
import { Skeleton } from '@/components/ui/Skeleton'
import { getCompanySettingsForPdf } from '@/lib/accounting/company-settings'
import {
  createInvoice, getInvoice, updateInvoice, convertQuotationToInvoice,
} from '@/lib/accounting/invoices'
import { getQuotation, makeCustomerSnapshot } from '@/lib/accounting/quotations'
import { getTaxInvoicesByInvoice } from '@/lib/accounting/tax-invoices'
import { getReceiptsByInvoice } from '@/lib/accounting/receipts'
import { calcTotals } from '@/lib/accounting/calc'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import type { Invoice, Quotation, Receipt, TaxInvoice } from '@/lib/types'

function InvoiceEditor() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('id')
  const fromQuotationId = searchParams.get('fromQuotation')
  const { user } = useAuth()

  const [loading, setLoading] = useState(!!editId || !!fromQuotationId)
  const [saving, setSaving] = useState(false)
  const [existing, setExisting] = useState<Invoice | null>(null)
  const [quotationDraft, setQuotationDraft] = useState<Quotation | null>(null)
  const [toast, setToast] = useState<{ type: 'ok' | 'fail'; message: string } | null>(null)
  const [taxInvoices, setTaxInvoices] = useState<TaxInvoice[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [showTaxInvoiceModal, setShowTaxInvoiceModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)

  // load linked tax invoices + receipts
  useEffect(() => {
    if (!editId) return
    let alive = true
    Promise.all([
      getTaxInvoicesByInvoice(editId),
      getReceiptsByInvoice(editId),
    ]).then(([ti, r]) => {
      if (!alive) return
      setTaxInvoices(ti.sort((a, b) => b.issueDate.localeCompare(a.issueDate)))
      setReceipts(r.sort((a, b) => b.issueDate.localeCompare(a.issueDate)))
    })
    return () => { alive = false }
  }, [editId, existing])

  const reloadLinked = async () => {
    if (!editId) return
    const [ti, r] = await Promise.all([
      getTaxInvoicesByInvoice(editId),
      getReceiptsByInvoice(editId),
    ])
    setTaxInvoices(ti.sort((a, b) => b.issueDate.localeCompare(a.issueDate)))
    setReceipts(r.sort((a, b) => b.issueDate.localeCompare(a.issueDate)))
    // refresh invoice to update paidAmount/status
    const inv = await getInvoice(editId)
    if (inv) setExisting(inv)
  }

  // ─── load existing invoice (edit) OR auto-convert from quotation ───────────
  useEffect(() => {
    let alive = true

    async function run() {
      if (editId) {
        const inv = await getInvoice(editId)
        if (alive) {
          setExisting(inv)
          setLoading(false)
        }
        return
      }

      if (fromQuotationId) {
        // ดึงข้อมูล quotation แล้วแปลงเป็น invoice ทันที (สร้าง doc ใหม่ใน Firestore)
        const q = await getQuotation(fromQuotationId)
        if (!alive) return
        if (!q) {
          setLoading(false)
          return
        }
        try {
          const result = await convertQuotationToInvoice(q, { createdBy: user?.uid ?? 'admin' })
          if (!alive) return
          // redirect ไปหน้า edit ของ invoice ที่เพิ่งสร้าง
          router.replace(`/admin/accounting/invoices/new?id=${result.id}`)
        } catch (e) {
          console.error(e)
          if (alive) {
            setQuotationDraft(q)
            setLoading(false)
            setToast({ type: 'fail', message: 'แปลงเป็นใบแจ้งหนี้ไม่สำเร็จ' })
          }
        }
        return
      }
    }

    run()
    return () => { alive = false }
  }, [editId, fromQuotationId, router, user])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const handleSubmit = async (v: InvoiceFormValue) => {
    if (!v.customer) return
    setSaving(true)
    try {
      const totals = calcTotals({
        items: v.items,
        discountTotal: v.discountTotal,
        vatRate: v.vatRate,
        whtRate: v.whtRate,
      })

      const baseFields = {
        customerId: v.customer.id,
        customerSnapshot: makeCustomerSnapshot(v.customer),
        jobId: v.jobId,
        issueDate: v.issueDate,
        dueDate: v.dueDate,
        items: v.items,
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        vatRate: totals.vatRate,
        vatAmount: totals.vatAmount,
        grandTotal: totals.grandTotal,
        whtRate: totals.whtRate,
        whtAmount: totals.whtAmount,
        netPayable: totals.netPayable,
        notes: v.notes,
        status: v.status,
      }

      if (editId) {
        await updateInvoice(editId, baseFields)
        setToast({ type: 'ok', message: 'บันทึกการแก้ไขแล้ว' })
      } else {
        const { id } = await createInvoice({
          ...baseFields,
          createdBy: user?.uid ?? 'admin',
        })
        setToast({ type: 'ok', message: 'สร้างใบแจ้งหนี้เรียบร้อย' })
        router.replace(`/admin/accounting/invoices/new?id=${id}`)
      }
    } catch (e) {
      console.error(e)
      setToast({ type: 'fail', message: 'บันทึกไม่สำเร็จ กรุณาลองใหม่' })
    } finally {
      setSaving(false)
    }
  }

  // กรณีแปลงไม่สำเร็จ — fallback แสดงข้อมูลจาก quotation เป็นค่าเริ่มต้น (ยังไม่บันทึก)
  const initialFromQuotation: Partial<Invoice> | undefined = quotationDraft ? {
    customerSnapshot: quotationDraft.customerSnapshot,
    jobId: quotationDraft.jobId,
    items: quotationDraft.items,
    discountTotal: quotationDraft.discountTotal,
    vatRate: quotationDraft.vatRate,
    whtRate: quotationDraft.whtRate,
    notes: quotationDraft.notes,
    status: 'draft',
  } : undefined

  const defaultValues = existing ?? initialFromQuotation

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/accounting/invoices"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          ใบแจ้งหนี้
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {editId ? `แก้ไขใบแจ้งหนี้${existing?.docNumber ? ` — ${existing.docNumber}` : ''}` : 'สร้างใบแจ้งหนี้'}
            </h1>
            {existing?.quotationId && (
              <p className="text-xs text-gray-500 mt-1">
                แปลงมาจากใบเสนอราคา{' '}
                <Link href={`/admin/accounting/quotations/new?id=${existing.quotationId}`} className="text-[#f73727] hover:underline">
                  ดูใบเสนอราคาต้นทาง
                </Link>
              </p>
            )}
          </div>
          {existing && (
            <PdfButtons
              buildPdfElement={async () => {
                const company = await getCompanySettingsForPdf()
                const DocumentPdf = (await import('@/lib/accounting/pdf/DocumentPdf')).default
                return <DocumentPdf type="invoice" doc={existing} company={company} />
              }}
              filename={`Invoice-${existing.docNumber}`}
            />
          )}
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-lg text-sm font-medium ${
          toast.type === 'ok' ? 'bg-green-500 text-white' : 'bg-yellow-500 text-white'
        }`}>
          {toast.type === 'ok'
            ? <CheckCircleIcon className="w-5 h-5 shrink-0" />
            : <ExclamationCircleIcon className="w-5 h-5 shrink-0" />
          }
          {toast.message}
        </div>
      )}

      {/* Action panel (only when editing existing invoice) */}
      {existing && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500">ยอดรวมใบแจ้งหนี้</p>
              <p className="text-sm font-semibold tabular-nums mt-0.5">{formatCurrency(existing.grandTotal)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500">ชำระแล้ว</p>
              <p className="text-sm font-semibold tabular-nums mt-0.5 text-green-700">{formatCurrency(existing.paidAmount ?? 0)}</p>
            </div>
            <div className="bg-red-50 rounded-xl p-3 text-center">
              <p className="text-xs text-[#f73727]">คงเหลือ</p>
              <p className="text-sm font-bold text-[#f73727] tabular-nums mt-0.5">
                {formatCurrency(Math.max(0, existing.grandTotal - (existing.paidAmount ?? 0)))}
              </p>
            </div>
          </div>

          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => setShowTaxInvoiceModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-700 text-sm font-medium rounded-xl hover:bg-blue-100 transition-colors"
            >
              <ReceiptPercentIcon className="w-4 h-4" />
              ออกใบกำกับภาษี
            </button>
            <button
              onClick={() => setShowPaymentModal(true)}
              disabled={(existing.paidAmount ?? 0) >= existing.grandTotal}
              className="flex items-center gap-2 px-4 py-2.5 bg-green-50 text-green-700 text-sm font-medium rounded-xl hover:bg-green-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ClipboardDocumentCheckIcon className="w-4 h-4" />
              บันทึกการรับเงิน
            </button>
          </div>

          {/* Linked tax invoices */}
          {taxInvoices.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">ใบกำกับภาษีที่ออกแล้ว ({taxInvoices.length})</p>
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left">เลขที่</th>
                      <th className="px-3 py-2 text-left">วันที่ออก</th>
                      <th className="px-3 py-2 text-right">ยอดรวม</th>
                      <th className="px-3 py-2 text-center">สถานะ</th>
                      <th className="px-3 py-2 w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {taxInvoices.map((t) => (
                      <tr key={t.id} className={t.status === 'void' ? 'opacity-50' : ''}>
                        <td className="px-3 py-2 font-mono">{t.docNumber}</td>
                        <td className="px-3 py-2 text-gray-700">{formatDate(t.issueDate)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(t.grandTotal)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${t.status === 'void' ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                            {t.status === 'void' ? 'ยกเลิก' : 'ใช้งาน'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Link href={`/admin/accounting/tax-invoices/view?id=${t.id}`} className="text-[#f73727] hover:underline text-xs">
                            ดู
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Linked receipts */}
          {receipts.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">ใบเสร็จที่ออกแล้ว ({receipts.length})</p>
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left">เลขที่</th>
                      <th className="px-3 py-2 text-left">วันที่รับ</th>
                      <th className="px-3 py-2 text-right">รับเงิน</th>
                      <th className="px-3 py-2 text-right">หัก ณ ที่จ่าย</th>
                      <th className="px-3 py-2 text-center">สถานะ</th>
                      <th className="px-3 py-2 w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {receipts.map((r) => (
                      <tr key={r.id} className={r.status === 'void' ? 'opacity-50' : ''}>
                        <td className="px-3 py-2 font-mono">{r.docNumber}</td>
                        <td className="px-3 py-2 text-gray-700">{formatDate(r.issueDate)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatCurrency(r.amount)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                          {r.whtAmount ? formatCurrency(r.whtAmount) : '-'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === 'void' ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                            {r.status === 'void' ? 'ยกเลิก' : 'ใช้งาน'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Link href={`/admin/accounting/receipts/view?id=${r.id}`} className="text-[#f73727] hover:underline text-xs">
                            ดู
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      ) : (
        <InvoiceForm
          defaultValues={defaultValues ?? undefined}
          onSubmit={handleSubmit}
          onCancel={() => router.push('/admin/accounting/invoices')}
          isLoading={saving}
        />
      )}

      {existing && (
        <>
          <IssueTaxInvoiceModal
            invoice={existing}
            isOpen={showTaxInvoiceModal}
            onClose={() => setShowTaxInvoiceModal(false)}
            onIssued={async (_id, docNumber) => {
              setToast({ type: 'ok', message: `ออกใบกำกับภาษี ${docNumber} เรียบร้อย` })
              await reloadLinked()
            }}
            createdBy={user?.uid ?? 'admin'}
          />
          <RecordPaymentModal
            invoice={existing}
            taxInvoices={taxInvoices}
            isOpen={showPaymentModal}
            onClose={() => setShowPaymentModal(false)}
            onIssued={async (_id, docNumber) => {
              setToast({ type: 'ok', message: `ออกใบเสร็จ ${docNumber} เรียบร้อย` })
              await reloadLinked()
            }}
            createdBy={user?.uid ?? 'admin'}
          />
        </>
      )}
    </div>
  )
}

export default function InvoiceEditorPage() {
  return (
    <Suspense fallback={
      <div className="space-y-4">
        <Skeleton className="h-8 w-48 rounded-md" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    }>
      <InvoiceEditor />
    </Suspense>
  )
}
