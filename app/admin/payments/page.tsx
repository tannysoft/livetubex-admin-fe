'use client'

import { useEffect, useState } from 'react'
import {
  CheckCircleIcon,
  XCircleIcon,
  BanknotesIcon,
  MagnifyingGlassIcon,
  ListBulletIcon,
  RectangleGroupIcon,
} from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { getPayments, approvePayment, markPaymentPaid, rejectPayment } from '@/lib/firebase-utils'
import type { Payment, PaymentStatus } from '@/lib/types'
import { calcTax, formatCurrency, formatDate, formatDateTime, paymentStatusColor, paymentStatusLabel } from '@/lib/utils'
import { Skeleton, SkeletonTableRow } from '@/components/ui/Skeleton'

type ViewMode = 'list' | 'grouped'

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<PaymentStatus | 'all'>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [actionType, setActionType] = useState<'approve' | 'paid' | 'reject' | null>(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await getPayments()
      setPayments(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openAction = (payment: Payment, type: 'approve' | 'paid' | 'reject') => {
    setSelectedPayment(payment)
    setAdminNotes('')
    setActionType(type)
  }

  const handleAction = async () => {
    if (!selectedPayment || !actionType) return
    setSaving(true)
    try {
      if (actionType === 'approve') {
        await approvePayment(selectedPayment.id, adminNotes)
      } else if (actionType === 'paid') {
        await markPaymentPaid(selectedPayment.id, selectedPayment.freelancerId, selectedPayment.amount, adminNotes)
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
      (p.freelancerName ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (p.workDescription ?? '').toLowerCase().includes(search.toLowerCase())
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
    const key = p.workDescription || 'ไม่ระบุงาน'
    if (!acc[key]) acc[key] = []
    acc[key].push(p)
    return acc
  }, {})

  const ActionButtons = ({ payment }: { payment: Payment }) => (
    <div className="flex items-center gap-2">
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
      {(payment.status === 'paid' || payment.status === 'rejected') && (
        <span className="text-xs text-gray-300">-</span>
      )}
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
                  {['Freelancer','รายละเอียด','บัญชี','จำนวน','สถานะ','วันที่','จัดการ'].map((h) => (
                    <th key={h} className="px-5 py-3 text-left">
                      <Skeleton className="h-3.5 w-16 rounded-md" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {Array.from({ length: 5 }).map((_, i) => <SkeletonTableRow key={i} cols={7} />)}
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
                  <th className="text-left px-5 py-3 font-medium text-gray-500">บัญชีธนาคาร</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-500">จำนวน</th>
                  <th className="text-center px-5 py-3 font-medium text-gray-500">สถานะ</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">วันที่ขอ</th>
                  <th className="text-center px-5 py-3 font-medium text-gray-500">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-medium text-gray-900">{payment.freelancerName}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-gray-700">{payment.workDescription}</p>
                      {payment.workDates && payment.workDates.length > 0 && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {payment.workDates.map((d) => formatDate(d)).join(', ')}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-gray-600 text-xs">{payment.bankName}</p>
                      <p className="text-gray-900 font-mono text-xs">{payment.bankAccount}</p>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <p className="font-semibold text-gray-900">{formatCurrency(payment.amount)}</p>
                      <p className="text-xs text-gray-400">ภาษี {formatCurrency(calcTax(payment.amount).tax)}</p>
                      <p className="text-xs text-[#f73727] font-medium">โอน {formatCurrency(calcTax(payment.amount).net)}</p>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <Badge label={paymentStatusLabel(payment.status)} colorClass={paymentStatusColor(payment.status)} />
                    </td>
                    <td className="px-5 py-4 text-gray-400 text-xs">
                      {formatDateTime(payment.requestedAt)}
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
                <div className="grid grid-cols-[1fr_140px_120px_90px] gap-x-4 px-5 py-2 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-400">
                  <span>Freelancer / วันที่ทำงาน</span>
                  <span>บัญชีธนาคาร</span>
                  <span className="text-right">จำนวน / วันที่ขอ</span>
                  <span className="text-center">จัดการ</span>
                </div>

                {/* Payments in this job */}
                <div className="divide-y divide-gray-50">
                  {items.map((payment) => (
                    <div key={payment.id} className="grid grid-cols-[1fr_140px_120px_90px] gap-x-4 items-center px-5 py-3 hover:bg-gray-50 transition-colors">
                      {/* col 1: name + badge + dates */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-gray-900 text-sm">{payment.freelancerName}</p>
                          <Badge label={paymentStatusLabel(payment.status)} colorClass={paymentStatusColor(payment.status)} />
                        </div>
                        {payment.workDates && payment.workDates.length > 0 && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {payment.workDates.map((d) => formatDate(d)).join(', ')}
                          </p>
                        )}
                      </div>
                      {/* col 2: bank */}
                      <div className="min-w-0">
                        <p className="text-xs text-gray-500 truncate">{payment.bankName}</p>
                        <p className="text-xs font-mono text-gray-700">{payment.bankAccount}</p>
                      </div>
                      {/* col 3: amount + tax + date */}
                      <div className="text-right">
                        <p className="font-semibold text-gray-900 text-sm">{formatCurrency(payment.amount)}</p>
                        <p className="text-xs text-gray-400">ภาษี {formatCurrency(calcTax(payment.amount).tax)} · โอน <span className="text-[#f73727] font-medium">{formatCurrency(calcTax(payment.amount).net)}</span></p>
                        <p className="text-xs text-gray-400">{formatDateTime(payment.requestedAt)}</p>
                      </div>
                      {/* col 4: actions */}
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
                <span className="font-medium">{selectedPayment.freelancerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">รายละเอียด</span>
                <span className="font-medium text-right max-w-[60%]">{selectedPayment.workDescription}</span>
              </div>
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
              <div className="flex justify-between">
                <span className="text-gray-500">จำนวนขอเบิก</span>
                <span className="font-semibold text-gray-900">{formatCurrency(selectedPayment.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">ภาษีหัก ณ ที่จ่าย 3%</span>
                <span className="text-gray-500">−{formatCurrency(calcTax(selectedPayment.amount).tax)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-1.5 mt-0.5">
                <span className="text-gray-700 font-medium">ยอดโอนสุทธิ</span>
                <span className="font-bold text-[#f73727]">{formatCurrency(calcTax(selectedPayment.amount).net)}</span>
              </div>
              {actionType === 'paid' && (
                <div className="flex justify-between">
                  <span className="text-gray-500">บัญชี</span>
                  <span className="font-medium text-xs">{selectedPayment.bankName} {selectedPayment.bankAccount}</span>
                </div>
              )}
            </div>
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
    </div>
  )
}
