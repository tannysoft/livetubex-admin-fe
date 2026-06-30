'use client'

import { useEffect, useMemo, useState } from 'react'
import FormDatePicker from '@/components/ui/FormDatePicker'
import FormListbox from '@/components/ui/FormListbox'
import FormCheckbox from '@/components/ui/FormCheckbox'
import VendorSelect from './VendorSelect'
import { calcExpenseTotals } from '@/lib/accounting/expenses'
import { getExpenseCategories } from '@/lib/accounting/expense-categories'
import { getJobs } from '@/lib/firebase-utils'
import { formatCurrency } from '@/lib/utils'
import type {
  Expense, ExpenseCategory, ExpenseStatus, Job, Vendor,
} from '@/lib/types'

export interface ExpenseFormValue {
  vendor: Vendor | null
  jobId?: string
  jobTitle?: string
  categoryId: string
  categoryName: string
  date: string
  description: string
  amount: number
  hasVat: boolean
  vatRate: number
  whtRate?: number
  paymentMethod?: 'cash' | 'transfer' | 'cheque' | 'credit_card' | 'other'
  paymentRef?: string
  status: ExpenseStatus
  notes?: string
}

interface Props {
  defaultValues?: Partial<Expense>
  onSubmit: (value: ExpenseFormValue) => Promise<void>
  onCancel: () => void
  isLoading?: boolean
  /** ถ้า lock — แสดงเป็น readonly สำหรับ expense ที่มาจาก freelancer_payment */
  lockedReason?: string
}

const statusOptions: { value: ExpenseStatus; label: string }[] = [
  { value: 'draft', label: 'แบบร่าง' },
  { value: 'recorded', label: 'บันทึกแล้ว' },
  { value: 'paid', label: 'จ่ายแล้ว' },
  { value: 'cancelled', label: 'ยกเลิก' },
]

const methodOptions = [
  { value: '', label: '— ยังไม่ระบุ —' },
  { value: 'transfer', label: 'โอนเงิน' },
  { value: 'cash', label: 'เงินสด' },
  { value: 'cheque', label: 'เช็ค' },
  { value: 'credit_card', label: 'บัตรเครดิต' },
  { value: 'other', label: 'อื่นๆ' },
]

function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function ExpenseForm({ defaultValues, onSubmit, onCancel, isLoading, lockedReason }: Props) {
  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobId, setJobId] = useState<string>(defaultValues?.jobId ?? '')
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [categoryId, setCategoryId] = useState<string>(defaultValues?.categoryId ?? '')
  const [date, setDate] = useState<string>(defaultValues?.date?.slice(0, 10) ?? todayYmd())
  const [description, setDescription] = useState(defaultValues?.description ?? '')
  const [amount, setAmount] = useState<number>(defaultValues?.amount ?? 0)
  const [hasVat, setHasVat] = useState<boolean>(defaultValues?.hasVat ?? false)
  const [vatRate, setVatRate] = useState<number>(defaultValues?.vatRate ?? 7)
  const [whtRate, setWhtRate] = useState<number | undefined>(defaultValues?.whtRate)
  const [paymentMethod, setPaymentMethod] = useState<string>(defaultValues?.paymentMethod ?? '')
  const [paymentRef, setPaymentRef] = useState(defaultValues?.paymentRef ?? '')
  const [status, setStatus] = useState<ExpenseStatus>(defaultValues?.status ?? 'recorded')
  const [notes, setNotes] = useState(defaultValues?.notes ?? '')
  const [error, setError] = useState('')

  // load categories + jobs
  useEffect(() => {
    getExpenseCategories().then(setCategories)
    getJobs().then(setJobs).catch(() => {})
  }, [])

  // load default vendor from snapshot (สำหรับ edit)
  useEffect(() => {
    if (!defaultValues?.vendorId || !defaultValues?.vendorSnapshot) return
    const snap = defaultValues.vendorSnapshot
    setVendor({
      id: defaultValues.vendorId,
      code: snap.code,
      name: snap.name,
      type: 'company',
      taxId: snap.taxId,
      isActive: true,
      createdAt: '',
      updatedAt: '',
    })
  }, [defaultValues])

  // auto-fill whtRate จาก category (ครั้งแรกเลือก ถ้ายังไม่ได้ตั้งเอง)
  const selectedCategory = useMemo(() => categories.find((c) => c.id === categoryId), [categories, categoryId])

  const totals = useMemo(() => calcExpenseTotals({ amount, hasVat, vatRate, whtRate }), [amount, hasVat, vatRate, whtRate])

  const categoryOptions = useMemo(() => [
    { value: '', label: '— เลือกหมวด —' },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ], [categories])

  const jobOptions = useMemo(() => [
    { value: '', label: '— ไม่ผูกโปรเจกต์ (ค่าใช้จ่ายส่วนกลาง) —' },
    ...jobs.map((j) => ({ value: j.id, label: j.title })),
  ], [jobs])

  const handleCategoryChange = (id: string) => {
    setCategoryId(id)
    // auto-suggest WHT จาก category default (เฉพาะตอนเปลี่ยน category และยังไม่ได้ตั้ง)
    const cat = categories.find((c) => c.id === id)
    if (cat?.defaultWhtRate && !whtRate) {
      setWhtRate(cat.defaultWhtRate)
    }
  }

  const handleSubmit = async () => {
    setError('')
    if (!categoryId) { setError('กรุณาเลือกหมวดค่าใช้จ่าย'); return }
    if (!description.trim()) { setError('กรุณากรอกรายละเอียด'); return }
    if (!amount || amount <= 0) { setError('กรุณาระบุจำนวนเงิน'); return }

    const cat = categories.find((c) => c.id === categoryId)
    if (!cat) { setError('หมวดที่เลือกไม่ถูกต้อง'); return }

    await onSubmit({
      vendor,
      jobId: jobId || undefined,
      jobTitle: jobId ? (jobs.find((j) => j.id === jobId)?.title || undefined) : undefined,
      categoryId,
      categoryName: cat.name,
      date,
      description: description.trim(),
      amount,
      hasVat,
      vatRate,
      whtRate,
      paymentMethod: (paymentMethod || undefined) as ExpenseFormValue['paymentMethod'],
      paymentRef: paymentRef || undefined,
      status,
      notes: notes || undefined,
    })
  }

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727] transition-all'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

  const locked = !!lockedReason

  return (
    <div className="space-y-6">
      {locked && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
          ⚠️ {lockedReason}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-900 mb-4">ข้อมูลค่าใช้จ่าย</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>วันที่ *</label>
            <FormDatePicker value={date} onChange={setDate} buttonClassName={inputCls} disabled={locked} />
          </div>
          <div>
            <label className={labelCls}>หมวดค่าใช้จ่าย *</label>
            <FormListbox
              value={categoryId}
              onChange={handleCategoryChange}
              options={categoryOptions}
              buttonClassName={inputCls}
              disabled={locked}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>โปรเจกต์ / งาน (ถ้ามี)</label>
            <FormListbox
              value={jobId}
              onChange={setJobId}
              options={jobOptions}
              buttonClassName={inputCls}
              disabled={locked}
            />
            <p className="text-xs text-gray-400 mt-1">ผูกค่าใช้จ่ายกับงาน เพื่อให้สรุปต้นทุนต่อโปรเจกต์ได้</p>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>ผู้ขาย / ผู้รับเงิน {selectedCategory?.isFixed ? '' : '(ถ้ามี)'}</label>
            <VendorSelect value={vendor?.id ?? null} onChange={setVendor} allowEmpty />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>รายละเอียด *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={inputCls}
              placeholder="ค่าอะไร / จ่ายเพื่ออะไร"
              disabled={locked}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-900 mb-4">จำนวนเงิน</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>จำนวนเงิน (ก่อน VAT) *</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
              className={`${inputCls} text-right tabular-nums`}
              min={0}
              step="any"
              disabled={locked}
            />
          </div>
          <div className="flex items-end gap-3 pb-1">
            <FormCheckbox
              checked={hasVat}
              onChange={setHasVat}
              label="มี VAT (ผู้ขายจดทะเบียน VAT)"
              disabled={locked}
            />
            {hasVat && (
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  value={vatRate}
                  onChange={(e) => setVatRate(Number(e.target.value) || 0)}
                  min={0}
                  max={100}
                  className={`${inputCls} w-16 text-right text-xs`}
                  disabled={locked}
                />
                <span className="text-xs">%</span>
              </span>
            )}
          </div>

          <div>
            <label className={labelCls}>หัก ณ ที่จ่าย (%)</label>
            <input
              type="number"
              value={whtRate ?? ''}
              onChange={(e) => {
                const v = e.target.value === '' ? undefined : Number(e.target.value)
                setWhtRate(v && v > 0 ? v : undefined)
              }}
              className={`${inputCls} text-right tabular-nums`}
              min={0}
              max={100}
              step="any"
              placeholder={selectedCategory?.defaultWhtRate ? `default ${selectedCategory.defaultWhtRate}%` : '0'}
              disabled={locked}
            />
          </div>
          <div>
            <label className={labelCls}>วิธีจ่าย</label>
            <FormListbox
              value={paymentMethod}
              onChange={setPaymentMethod}
              options={methodOptions}
              buttonClassName={inputCls}
              disabled={locked}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>เลขอ้างอิงการจ่าย</label>
            <input
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              className={inputCls}
              placeholder="เลข ref / เลขเช็ค"
              disabled={locked}
            />
          </div>
        </div>

        {/* Summary */}
        <div className="mt-5 bg-gray-50 rounded-xl p-4">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-600">ยอดก่อน VAT</dt>
              <dd className="tabular-nums">{formatCurrency(totals.amount)}</dd>
            </div>
            {hasVat && (
              <div className="flex justify-between">
                <dt className="text-gray-600">VAT {vatRate}%</dt>
                <dd className="tabular-nums">{formatCurrency(totals.vatAmount)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-200 pt-2 font-medium">
              <dt className="text-gray-700">รวม (ราคา + VAT)</dt>
              <dd className="tabular-nums">{formatCurrency(totals.totalAmount)}</dd>
            </div>
            {totals.whtAmount && (
              <div className="flex justify-between text-red-600">
                <dt>หัก ณ ที่จ่าย {whtRate}%</dt>
                <dd className="tabular-nums">- {formatCurrency(totals.whtAmount)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-300 pt-2 text-base font-bold text-[#f73727]">
              <dt>เงินที่จ่ายจริง</dt>
              <dd className="tabular-nums">{formatCurrency(totals.paidAmount)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-900 mb-4">สถานะ + หมายเหตุ</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>สถานะ</label>
            <FormListbox
              value={status}
              onChange={(v) => setStatus(v as ExpenseStatus)}
              options={statusOptions}
              buttonClassName={inputCls}
              disabled={locked}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>หมายเหตุ</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} disabled={locked} />
          </div>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
        >
          {locked ? 'ปิด' : 'ยกเลิก'}
        </button>
        {!locked && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading}
            className="px-6 py-2.5 text-sm font-medium text-white bg-[#f73727] rounded-xl hover:bg-red-600 transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {isLoading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            บันทึก
          </button>
        )}
      </div>
    </div>
  )
}
