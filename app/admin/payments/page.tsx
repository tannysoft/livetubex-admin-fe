'use client'

import { useEffect, useState } from 'react'
import {
  CheckCircleIcon,
  XCircleIcon,
  BanknotesIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline'
import { Menu, Transition } from '@headlessui/react'
import { Fragment } from 'react'
import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { getPayments, approvePayment, markPaymentPaid, rejectPayment } from '@/lib/firebase-utils'
import type { Payment, PaymentStatus } from '@/lib/types'
import { formatCurrency, formatDateTime, paymentStatusColor, paymentStatusLabel } from '@/lib/utils'

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<PaymentStatus | 'all'>('all')
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
      (p.jobTitle ?? '').toLowerCase().includes(search.toLowerCase())
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
        </div>
        <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
          <p className="text-xs font-medium text-blue-600">อนุมัติแล้ว (รอโอน)</p>
          <p className="text-xl font-bold text-blue-700 mt-1">{formatCurrency(totalApproved)}</p>
        </div>
        <div className="bg-green-50 rounded-2xl p-4 border border-green-100">
          <p className="text-xs font-medium text-green-600">จ่ายแล้วทั้งหมด</p>
          <p className="text-xl font-bold text-green-700 mt-1">{formatCurrency(totalPaid)}</p>
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
        <div className="flex gap-2 flex-wrap">
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
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-[#f73727] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {filtered.length === 0 ? (
            <p className="text-center text-gray-400 py-16 text-sm">ไม่พบรายการ</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-5 py-3 font-medium text-gray-500">Freelancer</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-500">งาน</th>
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
                        <p className="text-gray-700">{payment.jobTitle}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-gray-600 text-xs">{payment.bankName}</p>
                        <p className="text-gray-900 font-mono text-xs">{payment.bankAccount}</p>
                      </td>
                      <td className="px-5 py-4 text-right font-semibold text-gray-900">
                        {formatCurrency(payment.amount)}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <Badge label={paymentStatusLabel(payment.status)} colorClass={paymentStatusColor(payment.status)} />
                      </td>
                      <td className="px-5 py-4 text-gray-400 text-xs">
                        {formatDateTime(payment.requestedAt)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-center gap-2">
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
                <span className="text-gray-500">งาน</span>
                <span className="font-medium">{selectedPayment.jobTitle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">จำนวน</span>
                <span className="font-semibold text-[#f73727]">{formatCurrency(selectedPayment.amount)}</span>
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
