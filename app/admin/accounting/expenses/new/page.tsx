'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeftIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline'
import ExpenseForm, { type ExpenseFormValue } from '@/components/admin/accounting/ExpenseForm'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  createExpense, getExpense, updateExpense, calcExpenseTotals, makeVendorSnapshot,
} from '@/lib/accounting/expenses'
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

  useEffect(() => {
    if (!editId) return
    let alive = true
    setLoading(true)
    getExpense(editId).then((e) => {
      if (alive) {
        setExisting(e)
        setLoading(false)
      }
    })
    return () => { alive = false }
  }, [editId])

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
        <h1 className="text-2xl font-bold text-gray-900">
          {editId ? `แก้ไขรายจ่าย${existing?.code ? ` — ${existing.code}` : ''}` : 'บันทึกค่าใช้จ่าย'}
        </h1>
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
        <ExpenseForm
          defaultValues={existing ?? undefined}
          onSubmit={handleSubmit}
          onCancel={() => router.push('/admin/accounting/expenses')}
          isLoading={saving}
          lockedReason={lockedReason}
        />
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
