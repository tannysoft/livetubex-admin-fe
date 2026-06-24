'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeftIcon, CheckCircleIcon, ExclamationCircleIcon,
  PaperClipIcon, ArrowUpTrayIcon, TrashIcon, EyeIcon,
} from '@heroicons/react/24/outline'
import ExpenseForm, { type ExpenseFormValue } from '@/components/admin/accounting/ExpenseForm'
import PdfButtons from '@/components/admin/accounting/PdfButtons'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  createExpense, getExpense, updateExpense, calcExpenseTotals, makeVendorSnapshot,
} from '@/lib/accounting/expenses'
import { getCompanySettingsForPdf } from '@/lib/accounting/company-settings'
import { uploadExpenseReceipt, getStorageDownloadUrl } from '@/lib/firebase-storage'
import { useAuth } from '@/lib/auth-context'
import type { Expense } from '@/lib/types'

function ExpenseEditor() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('id')
  const { user } = useAuth()

  const [loading, setLoading] = useState(!!editId)
  const [saving, setSaving] = useState(false)
  const [existing, setExisting] = useState<Expense | null>(null)
  const [toast, setToast] = useState<{ type: 'ok' | 'fail'; message: string } | null>(null)
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [uploadingReceipt, setUploadingReceipt] = useState(false)
  const receiptInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editId) return
    let alive = true
    setLoading(true)
    getExpense(editId).then(async (e) => {
      if (!alive) return
      setExisting(e)
      setLoading(false)
      if (e?.receiptImagePath) {
        try {
          const url = await getStorageDownloadUrl(e.receiptImagePath)
          if (alive) setReceiptUrl(url)
        } catch { /* ignore */ }
      }
    })
    return () => { alive = false }
  }, [editId])

  const handleReceiptUpload = async (file: File) => {
    if (!editId) return
    setUploadingReceipt(true)
    try {
      const path = await uploadExpenseReceipt(editId, file)
      await updateExpense(editId, { receiptImagePath: path })
      const url = await getStorageDownloadUrl(path)
      setReceiptUrl(url)
      setExisting((prev) => prev ? { ...prev, receiptImagePath: path } : prev)
      setToast({ type: 'ok', message: 'อัพโหลดสลิป/ใบเสร็จเรียบร้อย' })
    } catch (e) {
      console.error(e)
      setToast({ type: 'fail', message: 'อัพโหลดไม่สำเร็จ' })
    } finally {
      setUploadingReceipt(false)
    }
  }

  const handleReceiptRemove = async () => {
    if (!editId) return
    try {
      await updateExpense(editId, { receiptImagePath: '' })
      setReceiptUrl(null)
      setExisting((prev) => prev ? { ...prev, receiptImagePath: undefined } : prev)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const handleSubmit = async (v: ExpenseFormValue) => {
    setSaving(true)
    try {
      const totals = calcExpenseTotals({
        amount: v.amount,
        hasVat: v.hasVat,
        vatRate: v.vatRate,
        whtRate: v.whtRate,
      })

      const baseFields: Partial<Expense> = {
        sourceType: existing?.sourceType ?? 'manual',
        paymentId: existing?.paymentId,
        vendorId: v.vendor?.id,
        vendorSnapshot: v.vendor ? makeVendorSnapshot(v.vendor) : undefined,
        categoryId: v.categoryId,
        categoryName: v.categoryName,
        date: v.date,
        description: v.description,
        amount: totals.amount,
        hasVat: v.hasVat,
        vatRate: v.vatRate,
        vatAmount: totals.vatAmount,
        whtRate: v.whtRate,
        whtAmount: totals.whtAmount,
        totalAmount: totals.totalAmount,
        paidAmount: totals.paidAmount,
        paymentMethod: v.paymentMethod,
        paymentRef: v.paymentRef,
        notes: v.notes,
        status: v.status,
      }

      if (editId) {
        await updateExpense(editId, baseFields)
        setToast({ type: 'ok', message: 'บันทึกการแก้ไขแล้ว' })
      } else {
        const { id } = await createExpense({
          ...baseFields,
          sourceType: 'manual',
          createdBy: user?.uid ?? 'admin',
        } as Expense)
        setToast({ type: 'ok', message: 'บันทึกค่าใช้จ่ายเรียบร้อย' })
        router.replace(`/admin/accounting/expenses/new?id=${id}`)
      }
    } catch (e) {
      console.error(e)
      setToast({ type: 'fail', message: 'บันทึกไม่สำเร็จ กรุณาลองใหม่' })
    } finally {
      setSaving(false)
    }
  }

  const lockedReason = existing?.sourceType === 'freelancer_payment'
    ? 'รายการนี้สร้างอัตโนมัติจากการจ่ายเงิน Freelancer — แก้ไขผ่านระบบ payment ในเมนู "การเบิกจ่าย" แทน'
    : undefined

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/accounting/expenses"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          รายจ่าย
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-gray-900">
            {editId ? `แก้ไขรายจ่าย${existing?.code ? ` — ${existing.code}` : ''}` : 'บันทึกค่าใช้จ่าย'}
          </h1>
          {existing && existing.whtAmount && existing.whtAmount > 0 && (
            <PdfButtons
              buildPdfElement={async () => {
                const company = await getCompanySettingsForPdf()
                const WhtCertPdf = (await import('@/lib/accounting/pdf/WhtCertPdf')).default
                return <WhtCertPdf expense={existing} company={company} />
              }}
              filename={`50TawiCert-${existing.code}`}
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
        </div>
      ) : (
        <>
          <ExpenseForm
            defaultValues={existing ?? undefined}
            onSubmit={handleSubmit}
            onCancel={() => router.push('/admin/accounting/expenses')}
            isLoading={saving}
            lockedReason={lockedReason}
          />

          {/* Receipt upload — only after expense is saved */}
          {existing && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-50 rounded-xl">
                  <PaperClipIcon className="w-5 h-5 text-[#f73727]" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">สลิป / ใบเสร็จจากผู้ขาย</h2>
                  <p className="text-xs text-gray-500 mt-0.5">แนบรูปสลิปการโอน หรือใบเสร็จที่ผู้ขายออกให้</p>
                </div>
              </div>

              {receiptUrl ? (
                <div className="space-y-3">
                  <div className="inline-block bg-gray-50 rounded-xl p-3 border border-gray-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={receiptUrl} alt="ใบเสร็จ" className="max-h-64 max-w-full object-contain" />
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors"
                    >
                      <EyeIcon className="w-4 h-4" />
                      เปิดดู
                    </a>
                    <button
                      onClick={() => receiptInputRef.current?.click()}
                      disabled={uploadingReceipt}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-60"
                    >
                      <ArrowUpTrayIcon className="w-4 h-4" />
                      เปลี่ยนรูป
                    </button>
                    <button
                      onClick={handleReceiptRemove}
                      className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 text-sm font-medium rounded-xl hover:bg-red-100 transition-colors"
                    >
                      <TrashIcon className="w-4 h-4" />
                      ลบ
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => receiptInputRef.current?.click()}
                  disabled={uploadingReceipt}
                  className="flex items-center gap-2 px-4 py-2 bg-[#f73727] text-white text-sm font-medium rounded-xl hover:bg-red-600 transition-colors disabled:opacity-60"
                >
                  {uploadingReceipt
                    ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <ArrowUpTrayIcon className="w-4 h-4" />
                  }
                  อัพโหลดสลิป/ใบเสร็จ
                </button>
              )}

              <input
                ref={receiptInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleReceiptUpload(file)
                  e.target.value = ''
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function ExpenseEditorPage() {
  return (
    <Suspense fallback={
      <div className="space-y-4">
        <Skeleton className="h-8 w-48 rounded-md" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    }>
      <ExpenseEditor />
    </Suspense>
  )
}
