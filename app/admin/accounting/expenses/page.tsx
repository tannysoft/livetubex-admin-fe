'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  PlusIcon, PencilIcon, TrashIcon, MagnifyingGlassIcon, BanknotesIcon, XMarkIcon,
  ArrowPathIcon, CheckCircleIcon,
} from '@heroicons/react/24/outline'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import FormListbox from '@/components/ui/FormListbox'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  getExpenses, deleteExpense, expenseStatusColor, expenseStatusLabel,
} from '@/lib/accounting/expenses'
import { getExpenseCategories } from '@/lib/accounting/expense-categories'
import { syncAllPaidPaymentsToExpenses } from '@/lib/accounting/payment-expense-bridge'
import { getJobs } from '@/lib/firebase-utils'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Expense, ExpenseCategory, Job } from '@/lib/types'

// sentinel สำหรับ filter ค่าใช้จ่ายที่ไม่ผูกโปรเจกต์
const NO_PROJECT = '__none__'

function ExpensesPageInner() {
  const searchParams = useSearchParams()
  const paymentIdFilter = searchParams.get('paymentId')
  const [items, setItems] = useState<Expense[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [projectFilter, setProjectFilter] = useState<string>('')
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null)
  const [deleting, setDeleting] = useState(false)
  // migration: sync ค่าจ้าง freelancer ที่จ่ายแล้วเข้า expenses
  const [syncOpen, setSyncOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null)
  const [syncResult, setSyncResult] = useState<{ total: number; ok: number; failed: number } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [exp, cats, jbs] = await Promise.all([getExpenses(), getExpenseCategories(), getJobs()])
      setItems(exp)
      setCategories(cats)
      setJobs(jbs)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  // ยอดรวม: ก่อนหัก ณ ที่จ่าย (totalAmount) และ จ่ายจริงหลังหัก (paidAmount)
  const totals = useMemo(() => {
    const active = items.filter((e) => e.status !== 'cancelled')
    return {
      beforeWht: active.reduce((s, e) => s + (e.totalAmount ?? 0), 0),
      paid: active.reduce((s, e) => s + (e.paidAmount ?? 0), 0),
    }
  }, [items])

  // ดึงชื่อหมวดจาก relation (expense-categories) แบบ live — fallback ไป snapshot ถ้าหมวดถูกลบ
  const categoryNameById = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  )

  // ดึงชื่อโปรเจกต์จาก relation (jobs) แบบ live — fallback ไป snapshot ถ้างานถูกลบ
  const jobTitleById = useMemo(
    () => new Map(jobs.map((j) => [j.id, j.title])),
    [jobs]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((it) => {
      if (paymentIdFilter && it.paymentId !== paymentIdFilter) return false
      if (statusFilter && it.status !== statusFilter) return false
      if (categoryFilter && it.categoryId !== categoryFilter) return false
      if (projectFilter === NO_PROJECT && it.jobId) return false
      if (projectFilter && projectFilter !== NO_PROJECT && it.jobId !== projectFilter) return false
      if (!q) return true
      return it.code.toLowerCase().includes(q)
        || it.description.toLowerCase().includes(q)
        || (it.vendorSnapshot?.name ?? '').toLowerCase().includes(q)
    })
  }, [items, search, statusFilter, categoryFilter, projectFilter, paymentIdFilter])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteExpense(deleteTarget.id)
      setDeleteTarget(null)
      await load()
    } finally { setDeleting(false) }
  }

  const handleSync = async () => {
    setSyncOpen(false)
    setSyncing(true)
    setSyncResult(null)
    setSyncProgress({ done: 0, total: 0 })
    try {
      const result = await syncAllPaidPaymentsToExpenses((done, total) => setSyncProgress({ done, total }))
      setSyncResult(result)
      await load()
    } catch (err) {
      console.error('sync all failed:', err)
      setSyncResult({ total: 0, ok: 0, failed: -1 })
    } finally {
      setSyncing(false)
      setSyncProgress(null)
    }
  }

  const statusOpts = [
    { value: '', label: 'ทุกสถานะ' },
    { value: 'draft', label: 'แบบร่าง' },
    { value: 'recorded', label: 'บันทึกแล้ว' },
    { value: 'paid', label: 'จ่ายแล้ว' },
    { value: 'cancelled', label: 'ยกเลิก' },
  ]
  const categoryOpts = [
    { value: '', label: 'ทุกหมวด' },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ]
  const projectOpts = [
    { value: '', label: 'ทุกโปรเจกต์' },
    { value: NO_PROJECT, label: '— ไม่ผูกโปรเจกต์ —' },
    ...jobs.map((j) => ({ value: j.id, label: j.title })),
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">รายจ่าย</h1>
          <p className="text-gray-500 mt-1">
            {items.length} รายการ — ยอดรวม (ไม่หัก ณ ที่จ่าย){' '}
            <span className="font-semibold text-gray-900">{formatCurrency(totals.beforeWht)}</span>
            {' · '}จ่ายจริง (หัก ณ ที่จ่ายแล้ว){' '}
            <span className="font-semibold text-[#f73727]">{formatCurrency(totals.paid)}</span>
          </p>
        </div>
        {paymentIdFilter && (
          <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 text-purple-700 text-xs rounded-xl">
            <span>🔗 กรองด้วย paymentId: <code className="font-mono">{paymentIdFilter.slice(0, 8)}…</code></span>
            <Link href="/admin/accounting/expenses" className="hover:bg-purple-100 rounded-md p-1">
              <XMarkIcon className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSyncOpen(true)}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-60"
            title="สร้าง/อัปเดตรายจ่ายค่าจ้างจาก payment freelancer ที่จ่ายแล้วทั้งหมด"
          >
            <ArrowPathIcon className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing
              ? `กำลังซิงค์${syncProgress ? ` ${syncProgress.done}/${syncProgress.total}` : ''}…`
              : 'ซิงค์ค่าจ้าง freelancer'}
          </button>
          <Link
            href="/admin/accounting/expenses/new"
            className="flex items-center gap-2 px-5 py-2.5 bg-[#f73727] text-white text-sm font-medium rounded-xl hover:bg-red-600 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            บันทึกค่าใช้จ่าย
          </Link>
        </div>
      </div>

      {syncResult && (
        <div className={`flex items-center justify-between gap-3 px-5 py-3.5 rounded-2xl text-sm ${
          syncResult.failed > 0 || syncResult.failed < 0
            ? 'bg-amber-50 border border-amber-200 text-amber-800'
            : 'bg-green-50 border border-green-200 text-green-800'
        }`}>
          <span className="flex items-center gap-2">
            <CheckCircleIcon className="w-5 h-5 shrink-0" />
            {syncResult.failed < 0
              ? 'ซิงค์ไม่สำเร็จ กรุณาลองใหม่'
              : `ซิงค์เสร็จ: ${syncResult.ok}/${syncResult.total} รายการ${syncResult.failed > 0 ? ` (ล้มเหลว ${syncResult.failed})` : ''}`}
          </span>
          <button onClick={() => setSyncResult(null)} className="p-1 hover:bg-black/5 rounded-md">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[240px]">
          <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาด้วยเลขที่, รายละเอียด, ผู้ขาย"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727]"
          />
        </div>
        <div className="w-48">
          <FormListbox value={statusFilter} onChange={setStatusFilter} options={statusOpts} />
        </div>
        <div className="w-48">
          <FormListbox value={categoryFilter} onChange={setCategoryFilter} options={categoryOpts} />
        </div>
        <div className="w-52">
          <FormListbox value={projectFilter} onChange={setProjectFilter} options={projectOpts} />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <ul className="divide-y divide-gray-50">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 px-5 py-4">
                <Skeleton className="flex-1 h-10 rounded-md" />
              </li>
            ))}
          </ul>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <BanknotesIcon className="w-10 h-10 text-gray-300 mx-auto" />
            <p className="text-gray-400 text-sm mt-3">
              {search || statusFilter || categoryFilter || projectFilter ? 'ไม่พบรายการที่ตรงเงื่อนไข' : 'ยังไม่มีรายจ่าย'}
            </p>
            {!search && !statusFilter && !categoryFilter && !projectFilter && (
              <Link href="/admin/accounting/expenses/new" className="inline-block text-[#f73727] hover:underline text-sm mt-2">
                บันทึกค่าใช้จ่ายรายการแรก
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold">เลขที่</th>
                  <th className="px-5 py-3 text-left font-semibold">วันที่</th>
                  <th className="px-5 py-3 text-left font-semibold">หมวด / รายละเอียด</th>
                  <th className="px-5 py-3 text-left font-semibold">ผู้ขาย</th>
                  <th className="px-5 py-3 text-right font-semibold">ก่อน VAT</th>
                  <th className="px-5 py-3 text-right font-semibold">หัก ณ ที่จ่าย</th>
                  <th className="px-5 py-3 text-right font-semibold">จ่ายจริง</th>
                  <th className="px-5 py-3 text-center font-semibold">สถานะ</th>
                  <th className="px-5 py-3 text-right font-semibold w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-mono text-gray-900">{e.code}</td>
                    <td className="px-5 py-3 text-gray-700">{formatDate(e.date)}</td>
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-900">{categoryNameById.get(e.categoryId) ?? e.categoryName}</div>
                      <div className="text-xs text-gray-500 truncate max-w-md">{e.description}</div>
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        {e.jobId && (
                          <span className="inline-block text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded-full">
                            📁 {jobTitleById.get(e.jobId) ?? e.jobTitle ?? 'โปรเจกต์'}
                          </span>
                        )}
                        {e.sourceType === 'freelancer_payment' && (
                          <span className="inline-block text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded-full">
                            จาก Payment Freelancer
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-gray-700">{e.vendorSnapshot?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{formatCurrency(e.amount)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-red-600">
                      {e.whtAmount ? formatCurrency(e.whtAmount) : '-'}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">{formatCurrency(e.paidAmount)}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium ${expenseStatusColor[e.status]}`}>
                        {expenseStatusLabel[e.status]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/admin/accounting/expenses/new?id=${e.id}`}
                          className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => setDeleteTarget(e)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          disabled={e.sourceType === 'freelancer_payment'}
                          title={e.sourceType === 'freelancer_payment' ? 'รายการนี้สร้างจาก Payment Freelancer ลบจากระบบเดิม' : 'ลบ'}
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="ลบรายจ่าย"
        message={`ต้องการลบรายจ่าย ${deleteTarget?.code} ใช่หรือไม่?`}
        confirmLabel={deleting ? 'กำลังลบ...' : 'ลบ'}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
        danger
      />

      <ConfirmDialog
        isOpen={syncOpen}
        title="ซิงค์ค่าจ้าง freelancer เข้ารายจ่าย"
        message="สร้าง/อัปเดตรายจ่ายค่าจ้างทีมงานจาก payment ทุกรายการที่จ่ายเงินแล้ว และผูกโปรเจกต์ให้ถูกต้อง — ทำซ้ำได้ปลอดภัย ไม่สร้างรายการซ้ำ"
        confirmLabel="เริ่มซิงค์"
        onConfirm={handleSync}
        onClose={() => setSyncOpen(false)}
      />
    </div>
  )
}

export default function ExpensesPage() {
  return (
    <Suspense fallback={
      <div className="space-y-4">
        <Skeleton className="h-8 w-48 rounded-md" />
        <Skeleton className="h-12 w-full rounded-2xl" />
      </div>
    }>
      <ExpensesPageInner />
    </Suspense>
  )
}
