'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircleIcon,
  XCircleIcon,
  BanknotesIcon,
  MagnifyingGlassIcon,
  ListBulletIcon,
  RectangleGroupIcon,
  ReceiptRefundIcon,
} from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { getPayments, getJobs, getFreelancers, updatePayment, approvePayment, markPaymentPaid, rejectPayment } from '@/lib/firebase-utils'
import { getStorageDownloadUrl } from '@/lib/firebase-storage'
import type { Freelancer, Job, Payment, PaymentStatus } from '@/lib/types'
import { calcTax, formatCurrency, formatDate, formatDateTime, paymentStatusColor, paymentStatusLabel } from '@/lib/utils'
import { Skeleton, SkeletonImage, SkeletonTableRow } from '@/components/ui/Skeleton'

type ViewMode = 'list' | 'grouped'

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [freelancers, setFreelancers] = useState<Freelancer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<PaymentStatus | 'all'>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [actionType, setActionType] = useState<'approve' | 'paid' | 'reject' | null>(null)
  const [saving, setSaving] = useState(false)
  const [slipUrl, setSlipUrl] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [data, jobData, freelancerData] = await Promise.all([getPayments(), getJobs(), getFreelancers()])
      setPayments(data)
      setJobs(jobData)
      setFreelancers(freelancerData)
    } finally {
      setLoading(false)
    }
  }

  const jobsMap = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs])
  const freelancersMap = useMemo(() => new Map(freelancers.map((f) => [f.id, f])), [freelancers])

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

  const openAction = (payment: Payment, type: 'approve' | 'paid' | 'reject') => {
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
      } else {
        await rejectPayment(selectedPayment.id, adminNotes)
      }
      setSelectedPayment(null)
      setActionType(null)
      load()
    } finally {
      setSaving(false)
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

  const actionTitle = actionType === 'approve' ? 'อนุมัติการเบิกจ่าย' : actionType === 'paid' ? 'ยืนยันการโอนเงิน' : 'ปฏิเสธการเบิกจ่าย'

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
    <div className="flex items-center gap-1">
      {payment.status === 'pending' && (
        <>
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
          onClick={() => openAction(payment, 'paid')}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
        >
          <BanknotesIcon className="w-3.5 h-3.5" />
          โอนแล้ว
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">จัดการการเบิกจ่าย</h1>
        <p className="text-gray-500 mt-1">อนุมัติและติดตามการจ่ายเงิน Freelancer</p>
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
                  <th className="text-center px-5 py-3 font-medium text-gray-500">จัดการ</th>
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
                        ? <span className="px-2 py-0.5 bg-red-50 text-[#f73727] text-xs font-medium rounded-lg">{payment.position}</span>
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
                    <td className="px-5 py-4">
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

            return (
              <div key={jobTitle} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Job header */}
                <div className="px-5 py-4 bg-gray-50 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">{jobTitle}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{items.length} รายการ</p>
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
                <div className="grid grid-cols-[1fr_100px_140px_110px_120px_90px] gap-x-4 px-5 py-2 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-400">
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
                    <div key={payment.id} className={`grid grid-cols-[1fr_100px_140px_110px_120px_90px] gap-x-4 items-center px-5 py-3 transition-colors ${payment.status === 'paid' ? 'bg-green-50 hover:bg-green-100/60' : 'hover:bg-gray-50'}`}>
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
                          ? <span className="px-2 py-0.5 bg-red-50 text-[#f73727] text-xs font-medium rounded-lg">{payment.position}</span>
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
                  <span className="px-2 py-0.5 bg-red-50 text-[#f73727] text-xs font-medium rounded-lg">{selectedPayment.position}</span>
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
            {(() => {
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ Admin</label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727]"
                placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
              />
            </div>
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
                  actionType === 'reject' ? 'bg-red-500 hover:bg-red-600' : 'bg-[#f73727] hover:bg-red-600'
                }`}
              >
                {saving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {actionType === 'approve' ? 'อนุมัติ' : actionType === 'paid' ? 'ยืนยันโอนเงิน' : 'ปฏิเสธ'}
              </button>
            </div>
          </div>
        )}
      </Modal>

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
