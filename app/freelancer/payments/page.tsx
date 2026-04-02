'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeftIcon,
  BanknotesIcon,
  PlusIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import FormListbox from '@/components/ui/FormListbox'
import Badge from '@/components/ui/Badge'
import { initLiff, isLiffLoggedIn, signInFirebaseWithLiff } from '@/lib/line-liff'
import {
  getFreelancerByLineId,
  getPaymentsByLineUserId,
  getAssignmentsByFreelancer,
  createPayment,
} from '@/lib/firebase-utils'
import type { Freelancer, Payment, JobAssignment } from '@/lib/types'
import { formatCurrency, formatDateTime, paymentStatusColor, paymentStatusLabel } from '@/lib/utils'

export default function FreelancerPaymentsPage() {
  const [loading, setLoading] = useState(true)
  const [lineUserId, setLineUserId] = useState('')
  const [freelancer, setFreelancer] = useState<Freelancer | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [assignments, setAssignments] = useState<JobAssignment[]>([])
  const [requestOpen, setRequestOpen] = useState(false)

  const [selectedAssignmentId, setSelectedAssignmentId] = useState('')
  const [requestAmount, setRequestAmount] = useState('')
  const [requestNotes, setRequestNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [bootError, setBootError] = useState('')

  const load = async (freelancerId: string, luid: string) => {
    const [p, a] = await Promise.all([
      getPaymentsByLineUserId(luid),       // ← query ด้วย lineUserId เพื่อให้ rules ผ่าน
      getAssignmentsByFreelancer(freelancerId),
    ])
    setPayments(p)
    setAssignments(a)
  }

  useEffect(() => {
    async function init() {
      try {
        const liffReady = await initLiff()
        if (!liffReady) {
          setBootError('ไม่สามารถโหลด LINE LIFF ได้')
          return
        }
        const isLogin = await isLiffLoggedIn()
        if (!isLogin) {
          window.location.href = '/freelancer'
          return
        }

        // ยืนยันตัวตนกับ Firebase ก่อนเสมอ
        const profile = await signInFirebaseWithLiff()
        setLineUserId(profile.userId)

        const f = await getFreelancerByLineId(profile.userId)
        if (!f) {
          window.location.href = '/freelancer/register'
          return
        }
        setFreelancer(f)
        await load(f.id, profile.userId)
      } catch (err) {
        console.error(err)
        setBootError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  const eligibleAssignments = assignments.filter((a) => {
    const alreadyRequested = payments.some(
      (p) => p.jobAssignmentId === a.id && (p.status === 'pending' || p.status === 'approved' || p.status === 'paid')
    )
    return (a.status === 'accepted' || a.status === 'completed') && !alreadyRequested
  })

  const assignmentListboxOptions = useMemo(
    () => [
      { value: '', label: '-- เลือกงาน --' },
      ...eligibleAssignments.map((a) => ({
        value: a.id,
        label: `${a.jobTitle} (${formatCurrency(a.fee)})`,
      })),
    ],
    [eligibleAssignments]
  )

  const handleRequest = async () => {
    if (!selectedAssignmentId || !requestAmount) {
      setError('กรุณาเลือกงานและกรอกจำนวนเงิน')
      return
    }
    const amount = parseFloat(requestAmount)
    if (isNaN(amount) || amount <= 0) {
      setError('จำนวนเงินไม่ถูกต้อง')
      return
    }
    const assignment = assignments.find((a) => a.id === selectedAssignmentId)
    if (!assignment || !freelancer) return

    setSubmitting(true)
    setError('')
    try {
      await createPayment({
        freelancerId: freelancer.id,
        lineUserId,                         // ← ต้องมีเพื่อให้ rules ผ่าน
        jobAssignmentId: selectedAssignmentId,
        jobId: assignment.jobId,
        amount,
        status: 'pending',
        notes: requestNotes,
        freelancerName: freelancer.name,
        jobTitle: assignment.jobTitle ?? '',
        bankAccount: freelancer.bankAccount,
        bankName: freelancer.bankName,
      })
      setRequestOpen(false)
      setSelectedAssignmentId('')
      setRequestAmount('')
      setRequestNotes('')
      await load(freelancer.id, lineUserId)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-[#f73727] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (bootError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
        <p className="text-red-600 text-sm text-center">{bootError}</p>
        <Link href="/freelancer" className="mt-6 text-[#f73727] text-sm font-medium">
          กลับหน้าหลัก
        </Link>
      </div>
    )
  }

  const pendingAmount = payments.filter((p) => p.status === 'pending' || p.status === 'approved').reduce((s, p) => s + p.amount, 0)
  const paidAmount = payments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#f73727] text-white">
        <div className="max-w-lg mx-auto px-4 pt-4 pb-6">
          <div className="flex items-center gap-3">
            <Link href="/freelancer" className="p-2 hover:bg-white/10 rounded-xl transition-colors">
              <ArrowLeftIcon className="w-5 h-5" />
            </Link>
            <h1 className="font-semibold text-lg">การเบิกจ่ายเงิน</h1>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 space-y-5 pb-8 -mt-1">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <ClockIcon className="w-4 h-4 text-yellow-500" />
              <span className="text-xs text-gray-500">รอการจ่าย</span>
            </div>
            <p className="text-xl font-bold text-yellow-600">{formatCurrency(pendingAmount)}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <CheckCircleIcon className="w-4 h-4 text-green-500" />
              <span className="text-xs text-gray-500">ได้รับแล้ว</span>
            </div>
            <p className="text-xl font-bold text-green-600">{formatCurrency(paidAmount)}</p>
          </div>
        </div>

        {/* Bank info */}
        {freelancer && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-medium text-gray-400 mb-2">บัญชีที่ผูกไว้</p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#f73727]/10 rounded-xl flex items-center justify-center">
                <BanknotesIcon className="w-5 h-5 text-[#f73727]" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{freelancer.bankName}</p>
                <p className="text-sm text-gray-500 font-mono">{freelancer.bankAccount}</p>
              </div>
            </div>
          </div>
        )}

        {/* Request button */}
        {eligibleAssignments.length > 0 && (
          <button
            onClick={() => setRequestOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#f73727] text-white font-semibold rounded-2xl hover:bg-red-600 transition-colors shadow-md shadow-red-200"
          >
            <PlusIcon className="w-5 h-5" />
            ขอเบิกจ่ายเงิน
          </button>
        )}

        {/* Payment history */}
        <div>
          <h2 className="font-semibold text-gray-900 mb-3">ประวัติการเบิกจ่าย</h2>
          {payments.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-gray-100">
              <BanknotesIcon className="w-10 h-10 text-gray-300 mx-auto" />
              <p className="text-gray-400 text-sm mt-3">ยังไม่มีประวัติการเบิกจ่าย</p>
            </div>
          ) : (
            <div className="space-y-3">
              {payments.map((p) => (
                <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900">{p.jobTitle}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(p.requestedAt)}</p>
                    </div>
                    <div className="text-right ml-3">
                      <p className="font-bold text-gray-900">{formatCurrency(p.amount)}</p>
                      <Badge label={paymentStatusLabel(p.status)} colorClass={paymentStatusColor(p.status)} />
                    </div>
                  </div>
                  {p.adminNotes && (
                    <p className="mt-3 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                      หมายเหตุ: {p.adminNotes}
                    </p>
                  )}
                  {p.status === 'paid' && p.paidAt && (
                    <p className="mt-2 text-xs text-green-600 flex items-center gap-1">
                      <CheckCircleIcon className="w-3.5 h-3.5" />
                      โอนเงินแล้ว {formatDateTime(p.paidAt)}
                    </p>
                  )}
                  {p.status === 'rejected' && (
                    <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
                      <XCircleIcon className="w-3.5 h-3.5" />
                      ถูกปฏิเสธ
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Request Modal */}
      <Modal isOpen={requestOpen} onClose={() => setRequestOpen(false)} title="ขอเบิกจ่ายเงิน" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">เลือกงาน *</label>
            <FormListbox
              value={selectedAssignmentId}
              onChange={(id) => {
                setSelectedAssignmentId(id)
                const a = assignments.find((x) => x.id === id)
                if (a) setRequestAmount(String(a.fee))
              }}
              options={assignmentListboxOptions}
              placeholder="-- เลือกงาน --"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนเงิน (บาท) *</label>
            <input
              type="number"
              value={requestAmount}
              onChange={(e) => setRequestAmount(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727]"
              min="1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
            <textarea
              value={requestNotes}
              onChange={(e) => setRequestNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727]"
              placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setRequestOpen(false)}
              className="px-4 py-2.5 text-sm text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleRequest}
              disabled={submitting}
              className="px-5 py-2.5 bg-[#f73727] text-white text-sm font-medium rounded-xl hover:bg-red-600 disabled:opacity-60 flex items-center gap-2"
            >
              {submitting && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              ส่งคำขอ
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
