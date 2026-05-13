'use client'

import { useEffect, useMemo, useState } from 'react'
import FormDatePicker from '@/components/ui/FormDatePicker'
import FormListbox from '@/components/ui/FormListbox'
import CustomerSelect from './CustomerSelect'
import DocumentItemsTable from './DocumentItemsTable'
import DocumentSummary from './DocumentSummary'
import { calcTotals } from '@/lib/accounting/calc'
import { getCompanySettings } from '@/lib/accounting/company-settings'
import { getJobs } from '@/lib/firebase-utils'
import type {
  Customer, DocumentItem, Invoice, InvoiceStatus, Job,
} from '@/lib/types'

export interface InvoiceFormValue {
  customer: Customer | null
  jobId?: string
  issueDate: string
  dueDate: string
  items: DocumentItem[]
  discountTotal: number
  vatRate: number
  whtRate?: number
  notes?: string
  status: InvoiceStatus
}

interface Props {
  defaultValues?: Partial<Invoice>
  onSubmit: (value: InvoiceFormValue) => Promise<void>
  onCancel: () => void
  isLoading?: boolean
}

const statusOptions: { value: InvoiceStatus; label: string }[] = [
  { value: 'draft', label: 'แบบร่าง' },
  { value: 'sent', label: 'ส่งแล้ว' },
  { value: 'partial_paid', label: 'ชำระบางส่วน' },
  { value: 'paid', label: 'ชำระแล้ว' },
  { value: 'overdue', label: 'เกินกำหนด' },
  { value: 'cancelled', label: 'ยกเลิก' },
]

function addDays(ymd: string, days: number): string {
  if (!ymd) return ''
  const d = new Date(ymd + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function todayYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function InvoiceForm({ defaultValues, onSubmit, onCancel, isLoading }: Props) {
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [jobId, setJobId] = useState<string>(defaultValues?.jobId ?? '')
  const [jobs, setJobs] = useState<Job[]>([])
  const [issueDate, setIssueDate] = useState<string>(defaultValues?.issueDate?.slice(0, 10) ?? todayYmd())
  const [dueDate, setDueDate] = useState<string>(defaultValues?.dueDate?.slice(0, 10) ?? addDays(todayYmd(), 30))
  const [items, setItems] = useState<DocumentItem[]>(defaultValues?.items ?? [])
  const [discountTotal, setDiscountTotal] = useState<number>(defaultValues?.discountTotal ?? 0)
  const [vatRate, setVatRate] = useState<number>(defaultValues?.vatRate ?? 7)
  const [whtRate, setWhtRate] = useState<number | undefined>(defaultValues?.whtRate)
  const [notes, setNotes] = useState<string>(defaultValues?.notes ?? '')
  const [status, setStatus] = useState<InvoiceStatus>(defaultValues?.status ?? 'draft')
  const [error, setError] = useState<string>('')

  useEffect(() => {
    if (defaultValues) return
    getCompanySettings().then((s) => setVatRate(s.vatRate ?? 7))
  }, [defaultValues])

  useEffect(() => {
    getJobs().then(setJobs).catch(() => setJobs([]))
  }, [])

  useEffect(() => {
    if (!defaultValues?.customerSnapshot) return
    const snap = defaultValues.customerSnapshot
    setCustomer({
      id: snap.customerId,
      code: snap.code,
      name: snap.name,
      type: snap.type,
      taxId: snap.taxId,
      branch: snap.branch,
      address: snap.address,
      contactPerson: snap.contactPerson,
      isActive: true,
      createdAt: '',
      updatedAt: '',
    })
  }, [defaultValues])

  const totals = useMemo(() => calcTotals({ items, discountTotal, vatRate, whtRate }), [items, discountTotal, vatRate, whtRate])

  const jobOptions = useMemo(() => [
    { value: '', label: '— ไม่อ้างอิงงาน —' },
    ...jobs.map((j) => ({ value: j.id, label: `${j.title} (${j.clientName})` })),
  ], [jobs])

  const handleSubmit = async () => {
    setError('')
    if (!customer) { setError('กรุณาเลือกลูกค้า'); return }
    if (!issueDate) { setError('กรุณาระบุวันที่ออก'); return }
    if (!dueDate) { setError('กรุณาระบุวันครบกำหนดชำระ'); return }
    if (items.length === 0) { setError('กรุณาเพิ่มรายการอย่างน้อย 1 รายการ'); return }

    await onSubmit({
      customer,
      jobId: jobId || undefined,
      issueDate,
      dueDate,
      items,
      discountTotal,
      vatRate,
      whtRate,
      notes: notes || undefined,
      status,
    })
  }

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727] transition-all'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-900 mb-4">ข้อมูลทั่วไป</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={labelCls}>ลูกค้า *</label>
            <CustomerSelect value={customer?.id ?? null} onChange={setCustomer} invalid={!!error && !customer} />
            {customer && customer.address && (
              <div className="mt-2 px-3 py-2 bg-gray-50 rounded-lg text-xs text-gray-600">
                <div className="font-medium text-gray-700">{customer.name} {customer.taxId && <span className="text-gray-500">— {customer.taxId}</span>}</div>
                <div className="text-gray-500 mt-0.5 whitespace-pre-line">{customer.address}</div>
              </div>
            )}
          </div>

          <div>
            <label className={labelCls}>วันที่ออก *</label>
            <FormDatePicker value={issueDate} onChange={setIssueDate} buttonClassName={inputCls} />
          </div>

          <div>
            <label className={labelCls}>ครบกำหนดชำระ *</label>
            <FormDatePicker value={dueDate} onChange={setDueDate} buttonClassName={inputCls} minDate={issueDate || undefined} />
          </div>

          <div className="sm:col-span-2">
            <label className={labelCls}>อ้างอิงงาน (ถ้ามี)</label>
            <FormListbox value={jobId} onChange={setJobId} options={jobOptions} buttonClassName={inputCls} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-900 mb-4">รายการ</h2>
        <DocumentItemsTable items={items} onChange={setItems} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 mb-4">หมายเหตุ / เงื่อนไข</h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={6}
            className={inputCls}
            placeholder="เงื่อนไขการชำระเงิน, ช่องทางการโอน, หมายเหตุอื่นๆ ที่จะปรากฏในเอกสาร..."
          />

          <div className="mt-4">
            <label className={labelCls}>สถานะ</label>
            <FormListbox
              value={status}
              onChange={(v) => setStatus(v as InvoiceStatus)}
              options={statusOptions}
              buttonClassName={inputCls}
            />
          </div>
        </div>

        <div className="lg:col-span-1 space-y-4">
          <DocumentSummary
            totals={totals}
            discountTotal={discountTotal}
            vatRate={vatRate}
            whtRate={whtRate}
            onDiscountChange={setDiscountTotal}
            onVatRateChange={setVatRate}
            onWhtRateChange={setWhtRate}
          />
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
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isLoading}
          className="px-6 py-2.5 text-sm font-medium text-white bg-[#f73727] rounded-xl hover:bg-red-600 transition-colors disabled:opacity-60 flex items-center gap-2"
        >
          {isLoading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          บันทึก
        </button>
      </div>
    </div>
  )
}
