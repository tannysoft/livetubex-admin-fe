'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeftIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline'
import QuotationForm, { type QuotationFormValue } from '@/components/admin/accounting/QuotationForm'
import PdfButtons from '@/components/admin/accounting/PdfButtons'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  createQuotation, getQuotation, updateQuotation, makeCustomerSnapshot,
} from '@/lib/accounting/quotations'
import { getCompanySettingsForPdf } from '@/lib/accounting/company-settings'
import { calcTotals } from '@/lib/accounting/calc'
import { useAuth } from '@/lib/auth-context'
import type { Quotation } from '@/lib/types'

function QuotationEditor() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('id')
  const { user } = useAuth()

  const [loading, setLoading] = useState(!!editId)
  const [saving, setSaving] = useState(false)
  const [existing, setExisting] = useState<Quotation | null>(null)
  const [toast, setToast] = useState<{ type: 'ok' | 'fail'; message: string } | null>(null)

  useEffect(() => {
    if (!editId) return
    let alive = true
    setLoading(true)
    getQuotation(editId).then((q) => {
      if (!alive) return
      setExisting(q)
      setLoading(false)
    })
    return () => { alive = false }
  }, [editId])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const handleSubmit = async (v: QuotationFormValue) => {
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
        validUntil: v.validUntil,
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
        await updateQuotation(editId, baseFields)
        setToast({ type: 'ok', message: 'บันทึกการแก้ไขแล้ว' })
      } else {
        const { id } = await createQuotation({
          ...baseFields,
          createdBy: user?.uid ?? 'admin',
        })
        setToast({ type: 'ok', message: 'สร้างใบเสนอราคาเรียบร้อย' })
        // redirect to edit mode of newly-created doc
        router.replace(`/admin/accounting/quotations/new?id=${id}`)
      }
    } catch (e) {
      console.error(e)
      setToast({ type: 'fail', message: 'บันทึกไม่สำเร็จ กรุณาลองใหม่' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/accounting/quotations"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          ใบเสนอราคา
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-gray-900">
            {editId ? `แก้ไขใบเสนอราคา${existing?.docNumber ? ` — ${existing.docNumber}` : ''}` : 'สร้างใบเสนอราคา'}
          </h1>
          {existing && (
            <PdfButtons
              buildPdfElement={async () => {
                const company = await getCompanySettingsForPdf()
                const DocumentPdf = (await import('@/lib/accounting/pdf/DocumentPdf')).default
                return <DocumentPdf type="quotation" doc={existing} company={company} />
              }}
              filename={`Quotation-${existing.docNumber}`}
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

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      ) : (
        <QuotationForm
          defaultValues={existing ?? undefined}
          onSubmit={handleSubmit}
          onCancel={() => router.push('/admin/accounting/quotations')}
          isLoading={saving}
        />
      )}
    </div>
  )
}

export default function QuotationEditorPage() {
  return (
    <Suspense fallback={
      <div className="space-y-4">
        <Skeleton className="h-8 w-48 rounded-md" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    }>
      <QuotationEditor />
    </Suspense>
  )
}
