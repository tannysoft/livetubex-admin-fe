'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleIcon,
  XCircleIcon,
  BanknotesIcon,
  MagnifyingGlassIcon,
  ListBulletIcon,
  RectangleGroupIcon,
  ReceiptRefundIcon,
  ArrowUturnLeftIcon,
  PlusIcon,
  CalendarDaysIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import FormListbox from '@/components/ui/FormListbox'
import { getPayments, getJobs, getFreelancers, getPositions, createPayment, updatePayment, approvePayment, markPaymentPaid, rejectPayment } from '@/lib/firebase-utils'
import { deleteField } from 'firebase/firestore'
import { getStorageDownloadUrl, uploadExpenseSlip } from '@/lib/firebase-storage'
import type { Freelancer, Job, Payment, PaymentStatus, Position } from '@/lib/types'
import { calcTax, formatCurrency, formatDate, formatDatePill, formatDateTime, paymentStatusColor, paymentStatusLabel } from '@/lib/utils'
import { Skeleton, SkeletonImage, SkeletonTableRow } from '@/components/ui/Skeleton'
import CelebrationOverlay from '@/components/ui/CelebrationOverlay'

type ViewMode = 'list' | 'grouped'

/** สร้าง array ของวันระหว่าง start → end (inclusive) */
function getDatesInRange(start: string, end?: string): string[] {
  const dates: string[] = []
  const cur = new Date(start + 'T00:00:00')
  const last = new Date((end || start) + 'T00:00:00')
  while (cur <= last) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    const d = String(cur.getDate()).padStart(2, '0')
    dates.push(`${y}-${m}-${d}`)
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [freelancers, setFreelancers] = useState<Freelancer[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)

  // ── Create form state ─────────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false)
  const [newFreelancerId, setNewFreelancerId] = useState('')
  const [newJobId, setNewJobId] = useState('')
  const [newPosition, setNewPosition] = useState('')
  const [newWorkDates, setNewWorkDates] = useState<string[]>([])
  const [newAmount, setNewAmount] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [newStatus, setNewStatus] = useState<'pending' | 'approved' | 'paid'>('pending')
  const [newShowExpense, setNewShowExpense] = useState(false)
  const [newExpenseAmount, setNewExpenseAmount] = useState('')
  const [newExpenseFile, setNewExpenseFile] = useState<File | null>(null)
  const [newExpensePreview, setNewExpensePreview] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // ── Edit form state ───────────────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false)
  const [editPayment, setEditPayment] = useState<Payment | null>(null)
  const [editJobId, setEditJobId] = useState('')
  const [editPosition, setEditPosition] = useState('')
  const [editWorkDates, setEditWorkDates] = useState<string[]>([])
  const [editAmountVal, setEditAmountVal] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editShowExpense, setEditShowExpense] = useState(false)
  const [editExpenseAmount, setEditExpenseAmount] = useState('')
  const [editExpenseFile, setEditExpenseFile] = useState<File | null>(null)
  const [editExpensePreview, setEditExpensePreview] = useState<string | null>(null)
  const [editExpenseExistingPath, setEditExpenseExistingPath] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<PaymentStatus | 'all'>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [actionType, setActionType] = useState<'approve' | 'paid' | 'reject' | 'unapprove' | null>(null)
  const [saving, setSaving] = useState(false)
  const [slipUrl, setSlipUrl] = useState<string | null>(null)
  const [showCelebration, setShowCelebration] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'warning' | 'error' } | null>(null)
  const lastToast = useRef(toast)
  if (toast) lastToast.current = toast

  const showToast = (msg: string, type: 'success' | 'warning' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [data, jobData, freelancerData, positionData] = await Promise.all([
        getPayments(), getJobs(), getFreelancers(), getPositions(),
      ])
      setPayments(data)
      setJobs(jobData)
      setFreelancers(freelancerData)
      setPositions(positionData)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const jobsMap = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs])
  const freelancersMap = useMemo(() => new Map(freelancers.map((f) => [f.id, f])), [freelancers])

  // วันทั้งหมดของงานที่เลือกใน create form
  const newJobDates = useMemo(() => {
    const job = jobsMap.get(newJobId)
    if (!job) return []
    return getDatesInRange(job.date, job.endDate)
  }, [newJobId, jobsMap])

  // วันทั้งหมดของงานที่เลือกใน edit form
  const editJobDates = useMemo(() => {
    const job = jobsMap.get(editJobId)
    if (!job) return []
    return getDatesInRange(job.date, job.endDate)
  }, [editJobId, jobsMap])

  const getJobTitle = (p: Payment) =>
    (p.jobId ? jobsMap.get(p.jobId)?.title : undefined) ?? p.workDescription ?? ''

  // ดึงข้อมูล freelancer จาก relation — fallback ไปยัง denormalized field เผื่อ backward compat
  const getFreelancerName = (p: Payment) =>
    freelancersMap.get(p.freelancerId)?.name ?? p.freelancerName ?? '-'
  const getBankName = (p: Payment) =>
    freelancersMap.get(p.freelancerId)?.bankName ?? p.bankName ?? '-'
  const getBankAccount = (p: Payment) =>
    freelancersMap.get(p.freelancerId)?.bankAccount ?? p.bankAccount ?? '-'

  useEffect(() => { load() }, [])

  const openAction = (payment: Payment, type: 'approve' | 'paid' | 'reject' | 'unapprove') => {
    setSelectedPayment(payment)
    setAdminNotes('')
    setEditAmount(String(payment.amount))
    setActionType(type)
  }

  const handleAction = async () => {
    if (!selectedPayment || !actionType) return
    const finalAmount = parseFloat(editAmount)
    if (isNaN(finalAmount) || finalAmount <= 0) return
    setSaving(true)
    try {
      if (actionType === 'approve') {
        // อัปเดต amount ถ้า admin แก้ไข
        if (finalAmount !== selectedPayment.amount) {
          await updatePayment(selectedPayment.id, { amount: finalAmount })
        }
        await approvePayment(selectedPayment.id, adminNotes)
      } else if (actionType === 'paid') {
        // อัปเดต amount ใน payments doc ก่อน ถ้า admin แก้ไข
        if (finalAmount !== selectedPayment.amount) {
          await updatePayment(selectedPayment.id, { amount: finalAmount })
        }
        await markPaymentPaid(selectedPayment.id, selectedPayment.freelancerId, finalAmount, adminNotes)
      } else if (actionType === 'unapprove') {
        await updatePayment(selectedPayment.id, { status: 'pending', approvedAt: deleteField() as unknown as string })
      } else {
        await rejectPayment(selectedPayment.id, adminNotes)
      }
      setSelectedPayment(null)
      setActionType(null)
      const label = actionType === 'approve' ? 'อนุมัติแล้ว' : actionType === 'paid' ? 'บันทึกการโอนแล้ว' : actionType === 'unapprove' ? 'ยกเลิกอนุมัติแล้ว' : 'ปฏิเสธแล้ว'
      const toastType = actionType === 'reject' ? 'error' : actionType === 'unapprove' ? 'warning' : 'success'
      if (actionType === 'paid') setShowCelebration(true)
      else showToast(label, toastType)
      load(true)
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (payment: Payment) => {
    setEditPayment(payment)
    setEditJobId(payment.jobId ?? '')
    setEditPosition(payment.position ?? '')
    setEditWorkDates(payment.workDates ?? [])
    setEditAmountVal(String(payment.amount))
    setEditNotes(payment.notes ?? '')
    const hasExpense = !!(payment.expenseAmount && payment.expenseAmount > 0)
    setEditShowExpense(hasExpense)
    setEditExpenseAmount(hasExpense ? String(payment.expenseAmount) : '')
    setEditExpenseFile(null)
    setEditExpensePreview(null)
    setEditExpenseExistingPath(payment.expenseSlipPath ?? '')
    setEditError('')
    setEditOpen(true)
  }

  const handleEdit = async () => {
    if (!editPayment) return
    const amount = parseFloat(editAmountVal)
    if (!amount || amount <= 0) return setEditError('กรุณากรอกจำนวนเงิน')
    if (editShowExpense) {
      const expAmt = parseFloat(editExpenseAmount)
      if (!expAmt || expAmt <= 0) return setEditError('กรุณากรอกจำนวนค่าใช้จ่าย')
    }
    setEditSaving(true)
    setEditError('')
    try {
      let expenseSlipPath: string | undefined = editExpenseExistingPath || undefined
      if (editShowExpense && editExpenseFile) {
        expenseSlipPath = await uploadExpenseSlip(editPayment.freelancerId, editExpenseFile)
      }

      // สร้าง update object — กรอง undefined ออก
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: Record<string, any> = {
        jobId: editJobId || editPayment.jobId,
        position: editPosition || deleteField(),
        workDates: editWorkDates.length > 0 ? editWorkDates : deleteField(),
        amount,
        notes: editNotes.trim() || deleteField(),
      }
      if (editShowExpense) {
        data.expenseAmount = parseFloat(editExpenseAmount)
        data.expenseSlipPath = expenseSlipPath ?? deleteField()
      } else {
        data.expenseAmount = deleteField()
        data.expenseSlipPath = deleteField()
      }

      await updatePayment(editPayment.id, data as Partial<Payment>)
      setEditOpen(false)
      showToast('แก้ไขการเบิกจ่ายแล้ว')
      load(true)
    } catch {
      setEditError('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setEditSaving(false)
    }
  }

  const resetCreateForm = () => {
    setNewFreelancerId('')
    setNewJobId('')
    setNewPosition('')
    setNewWorkDates([])
    setNewAmount('')
    setNewNotes('')
    setNewStatus('pending')
    setNewShowExpense(false)
    setNewExpenseAmount('')
    setNewExpenseFile(null)
    setNewExpensePreview(null)
    setCreateError('')
  }

  const handleNewExpenseFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setNewExpenseFile(file)
    setNewExpensePreview(URL.createObjectURL(file))
  }

  const handleCreate = async () => {
    const amount = parseFloat(newAmount)
    if (!newFreelancerId) return setCreateError('กรุณาเลือก Freelancer')
    if (!newJobId) return setCreateError('กรุณาเลือกงาน')
    if (!amount || amount <= 0) return setCreateError('กรุณากรอกจำนวนเงิน')
    const expAmt = newShowExpense ? parseFloat(newExpenseAmount) : undefined
    if (newShowExpense && (!expAmt || expAmt <= 0)) return setCreateError('กรุณากรอกจำนวนค่าใช้จ่าย')
    if (newShowExpense && !newExpenseFile) return setCreateError('กรุณาแนบรูปสลิปค่าใช้จ่าย')
    setCreating(true)
    setCreateError('')
    try {
      let expenseSlipPath: string | undefined
      if (newShowExpense && newExpenseFile) {
        expenseSlipPath = await uploadExpenseSlip(newFreelancerId, newExpenseFile)
      }
      const freelancer = freelancersMap.get(newFreelancerId)
      const workDates = newJobDates.length === 1 ? newJobDates : newWorkDates.length > 0 ? newWorkDates : undefined
      const paymentId = await createPayment(
        Object.fromEntries(Object.entries({
          freelancerId: newFreelancerId,
          jobId: newJobId,
          amount,
          status: 'pending' as const,
          position: newPosition || undefined,
          workDates,
          expenseAmount: expAmt,
          expenseSlipPath,
          notes: newNotes || undefined,
        }).filter(([, v]) => v !== undefined)) as Omit<Payment, 'id' | 'requestedAt'>,
        freelancer?.email,
      )
      if (newStatus === 'approved' || newStatus === 'paid') {
        await approvePayment(paymentId)
      }
      if (newStatus === 'paid') {
        await markPaymentPaid(paymentId, newFreelancerId, amount)
      }
      setCreateOpen(false)
      resetCreateForm()
      showToast('สร้างการเบิกจ่ายแล้ว')
      load(true)
    } catch {
      setCreateError('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setCreating(false)
    }
  }

  const filtered = payments.filter((p) => {
    const matchSearch =
      getFreelancerName(p).toLowerCase().includes(search.toLowerCase()) ||
      getJobTitle(p).toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'all' || p.status === filterStatus
    return matchSearch && matchStatus
  })

  const statusOptions: { value: PaymentStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'ทั้งหมด' },
    { value: 'pending', label: 'รอดำเนินการ' },
    { value: 'approved', label: 'อนุมัติแล้ว' },
    { value: 'paid', label: 'จ่ายแล้ว' },
    { value: 'rejected', label: 'ปฏิเสธ' },
  ]

  const totalPending = payments.filter((p) => p.status === 'pending').reduce((s, p) => s + p.amount, 0)
  const totalApproved = payments.filter((p) => p.status === 'approved').reduce((s, p) => s + p.amount, 0)
  const totalPaid = payments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0)

  const actionTitle = actionType === 'approve' ? 'อนุมัติการเบิกจ่าย' : actionType === 'paid' ? 'ยืนยันการโอนเงิน' : actionType === 'unapprove' ? 'ยกเลิกอนุมัติ' : 'ปฏิเสธการเบิกจ่าย'

  // Group by workDescription (job title)
  const grouped = filtered.reduce<Record<string, Payment[]>>((acc, p) => {
    const key = getJobTitle(p) || 'ไม่ระบุงาน'
    if (!acc[key]) acc[key] = []
    acc[key].push(p)
    return acc
  }, {})

  // SlipButton จัดการ loading state ของตัวเองแยกต่อ instance
  // เรียก getStorageDownloadUrl เพื่อขอ URL พร้อม token อัตโนมัติ (ต้อง login อยู่)
  const SlipButton = ({ payment }: { payment: Payment }) => {
    const [loading, setLoading] = useState(false)
    const hasSlip = !!(payment.expenseSlipPath || payment.expenseSlipUrl)
    if (!hasSlip) return null

    const handleClick = async () => {
      if (payment.expenseSlipPath) {
        setLoading(true)
        try {
          const url = await getStorageDownloadUrl(payment.expenseSlipPath)
          setSlipUrl(url)
        } catch {
          // ไม่สามารถโหลดรูปได้
        } finally {
          setLoading(false)
        }
      } else if (payment.expenseSlipUrl) {
        // backward compat: ข้อมูลเก่าที่เก็บ URL โดยตรง
        setSlipUrl(payment.expenseSlipUrl)
      }
    }

    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        title="ดูสลิปค่าใช้จ่าย"
        className="p-1.5 text-orange-400 hover:bg-orange-50 rounded-lg transition-colors disabled:opacity-40"
      >
        {loading
          ? <span className="w-4 h-4 border-2 border-orange-300 border-t-transparent rounded-full animate-spin inline-block" />
          : <ReceiptRefundIcon className="w-4 h-4" />
        }
      </button>
    )
  }

  const ActionButtons = ({ payment }: { payment: Payment }) => (
    <div className="flex items-center gap-1 flex-nowrap">
      {payment.status === 'pending' && (
        <>
          <button
            onClick={() => openEdit(payment)}
            className="p-1.5 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
            title="แก้ไข"
          >
            <PencilSquareIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => openAction(payment, 'approve')}
            className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
            title="อนุมัติ"
          >
            <CheckCircleIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => openAction(payment, 'reject')}
            className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
            title="ปฏิเสธ"
          >
            <XCircleIcon className="w-4 h-4" />
          </button>
        </>
      )}
      {payment.status === 'approved' && (
        <button
          onClick={() => openAction(payment, 'unapprove')}
          className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
          title="ยกเลิกอนุมัติ"
        >
          <ArrowUturnLeftIcon className="w-4 h-4" />
        </button>
      )}
      {(payment.status === 'paid' || payment.status === 'rejected') && !payment.expenseSlipPath && !payment.expenseSlipUrl && (
        <span className="text-xs text-gray-300">-</span>
      )}
      <SlipButton payment={payment} />
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Toast */}
      <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
        <div className={`text-white text-sm font-medium px-5 py-2.5 rounded-full shadow-lg ${lastToast.current?.type === 'success' ? 'bg-green-500' : lastToast.current?.type === 'warning' ? 'bg-yellow-500' : 'bg-red-500'}`}>
          {lastToast.current?.type === 'success' ? '✓' : lastToast.current?.type === 'warning' ? '↩' : '✕'} {lastToast.current?.msg}
        </div>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">จัดการการเบิกจ่าย</h1>
          <p className="text-gray-500 mt-1">อนุมัติและติดตามการจ่ายเงิน Freelancer</p>
        </div>
        <button
          onClick={() => { resetCreateForm(); setCreateOpen(true) }}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#f73727] text-white text-sm font-medium rounded-xl hover:bg-red-600 transition-colors shrink-0"
        >
          <PlusIcon className="w-4 h-4" />
          สร้างการเบิกจ่าย
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-yellow-50 rounded-2xl p-4 border border-yellow-100">
          <p className="text-xs font-medium text-yellow-600">รอดำเนินการ</p>
          <p className="text-xl font-bold text-yellow-700 mt-1">{formatCurrency(totalPending)}</p>
          <p className="text-xs text-yellow-500 mt-1">โอนสุทธิ {formatCurrency(calcTax(totalPending).net)}</p>
        </div>
        <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
          <p className="text-xs font-medium text-blue-600">อนุมัติแล้ว (รอโอน)</p>
          <p className="text-xl font-bold text-blue-700 mt-1">{formatCurrency(totalApproved)}</p>
          <p className="text-xs text-blue-500 mt-1">โอนสุทธิ {formatCurrency(calcTax(totalApproved).net)}</p>
        </div>
        <div className="bg-green-50 rounded-2xl p-4 border border-green-100">
          <p className="text-xs font-medium text-green-600">จ่ายแล้วทั้งหมด</p>
          <p className="text-xl font-bold text-green-700 mt-1">{formatCurrency(totalPaid)}</p>
          <p className="text-xs text-green-500 mt-1">หักภาษีรวม {formatCurrency(calcTax(totalPaid).tax)}</p>
        </div>
      </div>

      {/* Filter row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ Freelancer หรืองาน..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727] bg-white"
          />
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {statusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilterStatus(opt.value)}
              className={`px-3 py-2 text-xs font-medium rounded-xl transition-colors ${
                filterStatus === opt.value
                  ? 'bg-[#f73727] text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
          {/* View toggle */}
          <div className="flex rounded-xl border border-gray-200 overflow-hidden ml-1">
            <button
              onClick={() => setViewMode('list')}
              title="แสดงเป็นรายการ"
              className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-[#f73727] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >
              <ListBulletIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grouped')}
              title="แสดงตามงาน"
              className={`p-2 transition-colors ${viewMode === 'grouped' ? 'bg-[#f73727] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >
              <RectangleGroupIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          {/* Summary skeleton */}
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-2xl p-4 border bg-gray-50 border-gray-100 space-y-2">
                <Skeleton className="h-3.5 w-24 rounded-md" />
                <Skeleton className="h-7 w-28 rounded-lg" />
                <Skeleton className="h-3 w-20 rounded-md" />
              </div>
            ))}
          </div>
          {/* Table skeleton */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Freelancer','รายละเอียด','ตำแหน่ง','บัญชี','จำนวน','สถานะ','วันที่','จัดการ'].map((h) => (
                    <th key={h} className="px-5 py-3 text-left">
                      <Skeleton className="h-3.5 w-16 rounded-md" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {Array.from({ length: 5 }).map((_, i) => <SkeletonTableRow key={i} cols={8} />)}
              </tbody>
            </table>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-gray-400 py-16 text-sm">ไม่พบรายการ</p>
      ) : viewMode === 'list' ? (
        /* ── List view ── */
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Freelancer</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">รายละเอียดงาน</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">ตำแหน่ง</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">บัญชีธนาคาร</th>
                  <th className="text-center px-5 py-3 font-medium text-gray-500">สถานะ</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">วันที่ขอ</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-500">จำนวน</th>
                  <th className="text-center px-5 py-3 font-medium text-gray-500 w-[140px]">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((payment) => (
                  <tr key={payment.id} className={`transition-colors ${payment.status === 'paid' ? 'bg-green-50 hover:bg-green-100/60' : 'hover:bg-gray-50'}`}>
                    <td className="px-5 py-4">
                      <p className="font-medium text-gray-900">{getFreelancerName(payment)}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-gray-700">{getJobTitle(payment)}</p>
                      {payment.workDates && payment.workDates.length > 0 && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {payment.workDates.map((d) => formatDate(d)).join(', ')}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {payment.position
                        ? <span className="px-2 py-0.5 bg-red-50 text-[#f73727] text-xs font-medium rounded-lg whitespace-nowrap">{payment.position}</span>
                        : <span className="text-gray-300 text-xs">-</span>
                      }
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-gray-600 text-xs">{getBankName(payment)}</p>
                      <p className="text-gray-900 font-mono text-xs">{getBankAccount(payment)}</p>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <Badge label={paymentStatusLabel(payment.status)} colorClass={paymentStatusColor(payment.status)} />
                    </td>
                    <td className="px-5 py-4 text-gray-400 text-xs">
                      {formatDateTime(payment.requestedAt)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <p className="font-semibold text-gray-900 text-sm">{formatCurrency(payment.amount)}</p>
                      {payment.expenseAmount && (
                        <p className="text-xs text-orange-500 font-medium mt-0.5">+{formatCurrency(payment.expenseAmount)} ค่าใช้จ่าย</p>
                      )}
                      <p className="text-xs text-gray-400">ภาษี {formatCurrency(calcTax(payment.amount).tax)} · โอน <span className="text-[#f73727] font-medium">{formatCurrency(calcTax(payment.amount).net + (payment.expenseAmount ?? 0))}</span></p>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap w-[140px]">
                      <div className="flex items-center justify-center">
                        <ActionButtons payment={payment} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── Grouped view ── */
        <div className="space-y-4">
          {Object.entries(grouped).map(([jobTitle, items]) => {
            const jobPaid = items.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0)
            const jobPending = items.filter((p) => p.status === 'pending' || p.status === 'approved').reduce((s, p) => s + p.amount, 0)
            const jobTotal = jobPaid + jobPending  // ไม่นับ rejected
            const jobNetTotal = calcTax(jobTotal).net
            const jobId = items[0]?.jobId
            const job = jobId ? jobsMap.get(jobId) : undefined
            const jobDateLabel = job
              ? job.endDate && job.endDate !== job.date
                ? `${formatDate(job.date)} – ${formatDate(job.endDate)}`
                : formatDate(job.date)
              : undefined

            return (
              <div key={jobTitle} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Job header */}
                <div className="px-5 py-4 bg-gray-50 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">{jobTitle}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {jobDateLabel && <><span>{jobDateLabel}</span><span className="mx-1.5 text-gray-300">·</span></>}
                      {items.length} รายการ
                    </p>
                  </div>
                  <div className="flex gap-4 text-xs">
                    {jobPaid > 0 && (
                      <span className="text-green-600 font-medium">จ่ายแล้ว {formatCurrency(jobPaid)}</span>
                    )}
                    {jobPending > 0 && (
                      <span className="text-yellow-600 font-medium">รอดำเนินการ {formatCurrency(jobPending)}</span>
                    )}
                    <span className="text-gray-600 font-semibold">รวม {formatCurrency(jobTotal)}</span>
                    <span className="text-gray-400">(สุทธิ {formatCurrency(jobNetTotal)})</span>
                  </div>
                </div>

                {/* Column headers */}
                <div className="grid grid-cols-[1fr_150px_160px_130px_140px_140px] gap-x-4 px-5 py-2 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-400">
                  <span>Freelancer / วันที่ทำงาน</span>
                  <span>ตำแหน่ง</span>
                  <span>บัญชีธนาคาร</span>
                  <span>วันที่ขอ</span>
                  <span className="text-right">จำนวน</span>
                  <span className="text-center">จัดการ</span>
                </div>

                {/* Payments in this job */}
                <div className="divide-y divide-gray-50">
                  {items.map((payment) => (
                    <div key={payment.id} className={`grid grid-cols-[1fr_150px_160px_130px_140px_140px] gap-x-4 items-center px-5 py-3 transition-colors ${payment.status === 'paid' ? 'bg-green-50 hover:bg-green-100/60' : 'hover:bg-gray-50'}`}>
                      {/* col 1: name + badge + work dates */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-gray-900 text-sm">{getFreelancerName(payment)}</p>
                          <Badge label={paymentStatusLabel(payment.status)} colorClass={paymentStatusColor(payment.status)} />
                        </div>
                        {payment.workDates && payment.workDates.length > 0 && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {payment.workDates.map((d) => formatDate(d)).join(', ')}
                          </p>
                        )}
                      </div>
                      {/* col 2: position */}
                      <div>
                        {payment.position
                          ? <span className="px-2 py-0.5 bg-red-50 text-[#f73727] text-xs font-medium rounded-lg whitespace-nowrap">{payment.position}</span>
                          : <span className="text-gray-300 text-xs">-</span>
                        }
                      </div>
                      {/* col 3: bank */}
                      <div className="min-w-0">
                        <p className="text-xs text-gray-500 truncate">{getBankName(payment)}</p>
                        <p className="text-xs font-mono text-gray-700">{getBankAccount(payment)}</p>
                      </div>
                      {/* col 4: requested date */}
                      <div>
                        <p className="text-xs text-gray-400">{formatDateTime(payment.requestedAt)}</p>
                      </div>
                      {/* col 5: amount + tax */}
                      <div className="text-right">
                        <p className="font-semibold text-gray-900 text-sm">{formatCurrency(payment.amount)}</p>
                        {payment.expenseAmount && (
                          <p className="text-xs text-orange-500 font-medium mt-0.5">+{formatCurrency(payment.expenseAmount)} ค่าใช้จ่าย</p>
                        )}
                        <p className="text-xs text-gray-400">ภาษี {formatCurrency(calcTax(payment.amount).tax)} · โอน <span className="text-[#f73727] font-medium">{formatCurrency(calcTax(payment.amount).net + (payment.expenseAmount ?? 0))}</span></p>
                      </div>
                      {/* col 6: actions */}
                      <div className="flex items-center justify-center">
                        <ActionButtons payment={payment} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Action Modal */}
      <Modal
        isOpen={!!selectedPayment && !!actionType}
        onClose={() => { setSelectedPayment(null); setActionType(null) }}
        title={actionTitle}
        size="sm"
      >
        {selectedPayment && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Freelancer</span>
                <span className="font-medium">{getFreelancerName(selectedPayment)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">รายละเอียด</span>
                <span className="font-medium text-right max-w-[60%]">{getJobTitle(selectedPayment)}</span>
              </div>
              {selectedPayment.position && (
                <div className="flex justify-between">
                  <span className="text-gray-500">ตำแหน่ง</span>
                  <span className="text-gray-900">{selectedPayment.position}</span>
                </div>
              )}
              {selectedPayment.workDates && selectedPayment.workDates.length > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500 shrink-0">วันที่ทำงาน</span>
                  <span className="font-medium text-right">
                    {selectedPayment.workDates.map((d) => formatDate(d)).join(', ')}
                  </span>
                </div>
              )}
              {selectedPayment.notes && (
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500 shrink-0">หมายเหตุ</span>
                  <span className="text-gray-700 text-right">{selectedPayment.notes}</span>
                </div>
              )}
              {selectedPayment.expenseAmount && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">ค่าใช้จ่ายเพิ่มเติม <span className="text-xs text-gray-400">(ไม่หัก 3%)</span></span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-orange-600">{formatCurrency(selectedPayment.expenseAmount)}</span>
                    <SlipButton payment={selectedPayment} />
                  </div>
                </div>
              )}
              {actionType === 'paid' && (
                <div className="flex justify-between">
                  <span className="text-gray-500">บัญชี</span>
                  <span className="font-medium text-xs">{getBankName(selectedPayment)} {getBankAccount(selectedPayment)}</span>
                </div>
              )}
            </div>
            {/* Amount editor */}
            {actionType !== 'unapprove' && (() => {
              const amt = parseFloat(editAmount) || 0
              const { tax, net } = calcTax(amt)
              const isEdited = amt !== selectedPayment.amount
              return (
                <div className={`rounded-xl border px-4 py-3 transition-colors ${isEdited ? 'border-orange-300 bg-orange-50' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">จำนวนเงิน</span>
                      {isEdited && (
                        <>
                          <span className="text-xs text-gray-400 line-through">{formatCurrency(selectedPayment.amount)}</span>
                          <button type="button" onClick={() => setEditAmount(String(selectedPayment.amount))} className="text-xs text-orange-500 hover:text-orange-600">รีเซ็ต</button>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-400">฿</span>
                      <input
                        type="number"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        min="1"
                        inputMode="numeric"
                        className="w-28 text-right text-base font-bold text-gray-900 bg-transparent border-b border-gray-300 focus:border-[#f73727] focus:outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  </div>
                  <div className="flex justify-between mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500">
                    <span>ภาษี 3% −{formatCurrency(tax)}</span>
                    <span className={`font-semibold ${isEdited ? 'text-orange-600' : 'text-[#f73727]'}`}>
                      โอนรวม {formatCurrency(net + (selectedPayment.expenseAmount ?? 0))}
                    </span>
                  </div>
                </div>
              )
            })()}

            {actionType === 'unapprove' && (
              <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
                รายการนี้จะกลับสู่สถานะ <span className="font-semibold">รอดำเนินการ</span> เหมือนตอนที่ freelancer ขอเบิกเข้ามา
              </p>
            )}

            {actionType !== 'unapprove' && <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ Admin</label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727]"
                placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
              />
            </div>}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setSelectedPayment(null); setActionType(null) }}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleAction}
                disabled={saving}
                className={`px-5 py-2 text-sm font-medium text-white rounded-xl transition-colors disabled:opacity-60 flex items-center gap-2 ${
                  actionType === 'reject' ? 'bg-red-500 hover:bg-red-600' : actionType === 'unapprove' ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-[#f73727] hover:bg-red-600'
                }`}
              >
                {saving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {actionType === 'approve' ? 'อนุมัติ' : actionType === 'paid' ? 'ยืนยันโอนเงิน' : actionType === 'unapprove' ? 'ยืนยัน' : 'ปฏิเสธ'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Payment Modal */}
      <Modal
        isOpen={createOpen}
        onClose={() => { setCreateOpen(false); resetCreateForm() }}
        title="สร้างการเบิกจ่าย"
        size="md"
      >
        <div className="space-y-4">
          {/* Freelancer */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Freelancer <span className="text-red-500">*</span></label>
            <FormListbox
              value={newFreelancerId}
              onChange={setNewFreelancerId}
              options={freelancers.map((f) => ({ value: f.id, label: f.name }))}
              placeholder="เลือก Freelancer…"
            />
          </div>

          {/* Job */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">งาน <span className="text-red-500">*</span></label>
            <FormListbox
              value={newJobId}
              onChange={(v) => { setNewJobId(v); setNewWorkDates([]) }}
              options={jobs.map((j) => ({ value: j.id, label: j.title }))}
              placeholder="เลือกงาน…"
            />
          </div>

          {/* Work dates — แสดงเมื่อเลือกงานแล้ว */}
          {newJobDates.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                วันที่ทำงาน <span className="text-gray-400 font-normal">(เลือกได้หลายวัน)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {newJobDates.map((date) => {
                  const active = newWorkDates.includes(date)
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setNewWorkDates((prev) =>
                        active ? prev.filter((d) => d !== date) : [...prev, date]
                      )}
                      className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                        active
                          ? 'bg-[#f73727] text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {formatDatePill(date)}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {newJobDates.length === 1 && (
            <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-xl px-3 py-2.5">
              <CalendarDaysIcon className="w-4 h-4 text-gray-400 shrink-0" />
              <span>{formatDate(newJobDates[0])}</span>
            </div>
          )}

          {/* Position */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ตำแหน่ง</label>
            <FormListbox
              value={newPosition}
              onChange={setNewPosition}
              options={[{ value: '', label: 'ไม่ระบุ' }, ...positions.map((p) => ({ value: p.name, label: p.name }))]}
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนเงิน (บาท) <span className="text-red-500">*</span></label>
            <input
              type="number"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              min="1"
              inputMode="numeric"
              placeholder="0"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            {newAmount && parseFloat(newAmount) > 0 && (() => {
              const { tax, net } = calcTax(parseFloat(newAmount))
              return (
                <p className="text-xs text-gray-400 mt-1">ภาษี 3% {formatCurrency(tax)} · โอนสุทธิ <span className="text-[#f73727] font-medium">{formatCurrency(net)}</span></p>
              )
            })()}
          </div>

          {/* Expense */}
          <div>
            <div className="flex items-center justify-between">
              <label className={`text-sm font-medium ${newShowExpense ? 'text-orange-500' : 'text-gray-700'}`}>
                ค่าใช้จ่ายเพิ่มเติม
                {!newShowExpense && <span className="ml-1 text-xs font-normal text-gray-400">(ไม่หัก 3%)</span>}
              </label>
              <button
                type="button"
                onClick={() => { setNewShowExpense(!newShowExpense); setNewExpenseAmount(''); setNewExpenseFile(null); setNewExpensePreview(null) }}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-base font-bold transition-colors ${
                  newShowExpense ? 'bg-orange-100 text-orange-500 hover:bg-orange-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {newShowExpense ? '−' : '+'}
              </button>
            </div>
            {newShowExpense && (
              <div className="mt-2 space-y-3 p-3 bg-orange-50 rounded-xl border border-orange-100">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนค่าใช้จ่าย (บาท)</label>
                  <input
                    type="number"
                    value={newExpenseAmount}
                    onChange={(e) => setNewExpenseAmount(e.target.value)}
                    min="1"
                    inputMode="numeric"
                    placeholder="0"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">รูปสลิป / หลักฐานค่าใช้จ่าย</label>
                  {newExpensePreview ? (
                    <div className="relative">
                      <img src={newExpensePreview} alt="slip" className="w-full max-h-48 object-contain rounded-xl border border-orange-200 bg-white" />
                      <button
                        type="button"
                        onClick={() => { setNewExpenseFile(null); setNewExpensePreview(null) }}
                        className="absolute top-2 right-2 w-7 h-7 bg-white rounded-full shadow flex items-center justify-center text-gray-500 hover:text-red-500 text-sm font-bold"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center gap-2 w-full h-28 border-2 border-dashed border-orange-200 rounded-xl cursor-pointer bg-white hover:bg-orange-50 transition-colors">
                      <span className="text-3xl">📎</span>
                      <span className="text-xs text-gray-500">คลิกเพื่อเลือกรูป</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleNewExpenseFile} />
                    </label>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
            <textarea
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              rows={2}
              placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727] resize-none"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">สร้างเป็นสถานะ</label>
            <div className="flex gap-2">
              {([
                { value: 'pending', label: 'รอดำเนินการ' },
                { value: 'approved', label: 'อนุมัติแล้ว' },
                { value: 'paid', label: 'จ่ายแล้ว' },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setNewStatus(opt.value)}
                  className={`flex-1 py-2 text-xs font-medium rounded-xl border transition-colors ${
                    newStatus === opt.value
                      ? 'bg-[#f73727] text-white border-[#f73727]'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {createError && <p className="text-xs text-red-500">{createError}</p>}

          <div className="flex gap-3 justify-end pt-1">
            <button
              onClick={() => { setCreateOpen(false); resetCreateForm() }}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-5 py-2 text-sm font-medium text-white bg-[#f73727] rounded-xl hover:bg-red-600 disabled:opacity-60 flex items-center gap-2"
            >
              {creating && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              สร้างการเบิกจ่าย
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Payment Modal */}
      <Modal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        title="แก้ไขการเบิกจ่าย"
        size="md"
      >
        {editPayment && (
          <div className="space-y-4">
            {/* Freelancer — readonly */}
            <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
              <div className="w-8 h-8 rounded-full bg-[#f73727]/10 flex items-center justify-center text-[#f73727] font-bold text-sm shrink-0">
                {getFreelancerName(editPayment).slice(0, 1)}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{getFreelancerName(editPayment)}</p>
                <p className="text-xs text-gray-400">{getBankName(editPayment)} · {getBankAccount(editPayment)}</p>
              </div>
            </div>

            {/* Job */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">งาน <span className="text-red-500">*</span></label>
              <FormListbox
                value={editJobId}
                onChange={(v) => { setEditJobId(v); setEditWorkDates([]) }}
                options={jobs.map((j) => ({ value: j.id, label: j.title }))}
                placeholder="เลือกงาน…"
              />
            </div>

            {/* Work dates */}
            {editJobDates.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  วันที่ทำงาน <span className="text-gray-400 font-normal">(เลือกได้หลายวัน)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {editJobDates.map((date) => {
                    const active = editWorkDates.includes(date)
                    return (
                      <button
                        key={date}
                        type="button"
                        onClick={() => setEditWorkDates((prev) =>
                          active ? prev.filter((d) => d !== date) : [...prev, date]
                        )}
                        className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                          active ? 'bg-[#f73727] text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {formatDatePill(date)}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {editJobDates.length === 1 && (
              <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-xl px-3 py-2.5">
                <CalendarDaysIcon className="w-4 h-4 text-gray-400 shrink-0" />
                <span>{formatDate(editJobDates[0])}</span>
              </div>
            )}

            {/* Position */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ตำแหน่ง</label>
              <FormListbox
                value={editPosition}
                onChange={setEditPosition}
                options={[{ value: '', label: 'ไม่ระบุ' }, ...positions.map((p) => ({ value: p.name, label: p.name }))]}
              />
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนเงิน (บาท) <span className="text-red-500">*</span></label>
              <input
                type="number"
                value={editAmountVal}
                onChange={(e) => setEditAmountVal(e.target.value)}
                min="1"
                inputMode="numeric"
                placeholder="0"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              {editAmountVal && parseFloat(editAmountVal) > 0 && (() => {
                const { tax, net } = calcTax(parseFloat(editAmountVal))
                return (
                  <p className="text-xs text-gray-400 mt-1">ภาษี 3% {formatCurrency(tax)} · โอนสุทธิ <span className="text-[#f73727] font-medium">{formatCurrency(net)}</span></p>
                )
              })()}
            </div>

            {/* Expense */}
            <div>
              <div className="flex items-center justify-between">
                <label className={`text-sm font-medium ${editShowExpense ? 'text-orange-500' : 'text-gray-700'}`}>
                  ค่าใช้จ่ายเพิ่มเติม
                  {!editShowExpense && <span className="ml-1 text-xs font-normal text-gray-400">(ไม่หัก 3%)</span>}
                </label>
                <button
                  type="button"
                  onClick={() => { setEditShowExpense(!editShowExpense); setEditExpenseAmount(''); setEditExpenseFile(null); setEditExpensePreview(null) }}
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-base font-bold transition-colors ${
                    editShowExpense ? 'bg-orange-100 text-orange-500 hover:bg-orange-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {editShowExpense ? '−' : '+'}
                </button>
              </div>
              {editShowExpense && (
                <div className="mt-2 space-y-3 p-3 bg-orange-50 rounded-xl border border-orange-100">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนค่าใช้จ่าย (บาท)</label>
                    <input
                      type="number"
                      value={editExpenseAmount}
                      onChange={(e) => setEditExpenseAmount(e.target.value)}
                      min="1"
                      inputMode="numeric"
                      placeholder="0"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">รูปสลิป / หลักฐาน</label>
                    {editExpensePreview ? (
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={editExpensePreview} alt="slip" className="w-full max-h-48 object-contain rounded-xl border border-orange-200 bg-white" />
                        <button
                          type="button"
                          onClick={() => { setEditExpenseFile(null); setEditExpensePreview(null) }}
                          className="absolute top-2 right-2 w-7 h-7 bg-white rounded-full shadow flex items-center justify-center text-gray-500 hover:text-red-500 text-sm font-bold"
                        >×</button>
                      </div>
                    ) : editExpenseExistingPath ? (
                      <div className="flex items-center gap-3 bg-white rounded-xl border border-orange-200 px-3 py-2.5">
                        <ReceiptRefundIcon className="w-4 h-4 text-orange-400 shrink-0" />
                        <span className="text-xs text-gray-600 flex-1">มีสลิปเดิมอยู่แล้ว</span>
                        <label className="text-xs text-[#f73727] font-medium cursor-pointer hover:underline">
                          เปลี่ยนรูป
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            setEditExpenseFile(file)
                            setEditExpensePreview(URL.createObjectURL(file))
                          }} />
                        </label>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center gap-2 w-full h-28 border-2 border-dashed border-orange-200 rounded-xl cursor-pointer bg-white hover:bg-orange-50 transition-colors">
                        <span className="text-3xl">📎</span>
                        <span className="text-xs text-gray-500">คลิกเพื่อเลือกรูป</span>
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          setEditExpenseFile(file)
                          setEditExpensePreview(URL.createObjectURL(file))
                        }} />
                      </label>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ (จาก Freelancer)</label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={2}
                placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727] resize-none"
              />
            </div>

            {editError && <p className="text-xs text-red-500">{editError}</p>}

            <div className="flex gap-3 justify-end pt-1">
              <button
                onClick={() => setEditOpen(false)}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleEdit}
                disabled={editSaving}
                className="px-5 py-2 text-sm font-medium text-white bg-indigo-500 rounded-xl hover:bg-indigo-600 disabled:opacity-60 flex items-center gap-2"
              >
                {editSaving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                บันทึกการแก้ไข
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Celebration overlay — แสดงเมื่อโอนเงินสำเร็จ */}
      {showCelebration && (
        <CelebrationOverlay onDone={() => { setShowCelebration(false); showToast('บันทึกการโอนแล้ว') }} />
      )}

      {/* Slip image modal */}
      <Modal isOpen={!!slipUrl} onClose={() => setSlipUrl(null)} title="สลิปค่าใช้จ่าย" size="md">
        {slipUrl && (
          <div className="flex flex-col items-center gap-4">
            <SkeletonImage src={slipUrl} alt="สลิปค่าใช้จ่าย" />
            <a
              href={slipUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              เปิดในแท็บใหม่
            </a>
          </div>
        )}
      </Modal>
    </div>
  )
}
