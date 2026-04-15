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
  CalendarDaysIcon,
  ReceiptRefundIcon,
} from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import FormListbox from '@/components/ui/FormListbox'
import Badge from '@/components/ui/Badge'
import { initLiff, isLiffLoggedIn, signInFirebaseWithLiff } from '@/lib/line-liff'
import { getFreelancerByLineId, getPaymentsByFreelancer, createPayment, getJobs, getPositions } from '@/lib/firebase-utils'
import { uploadExpenseSlip, getStorageDownloadUrl } from '@/lib/firebase-storage'
import type { Freelancer, Job, Payment, Position } from '@/lib/types'
import { calcTax, formatCurrency, formatDate, formatDatePill, formatDateTime, paymentCycleLabel, paymentStatusColor, paymentStatusLabel } from '@/lib/utils'
import { Skeleton, SkeletonImage, SkeletonPaymentCard } from '@/components/ui/Skeleton'
import CelebrationOverlay from '@/components/ui/CelebrationOverlay'

function PayoutSlipButton({ slipPath, jobTitles, onOpen }: {
  slipPath: string
  jobTitles: string[]
  onOpen: (url: string, titles: string[]) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  return (
    <button
      onClick={async () => {
        setLoading(true)
        setError(false)
        try {
          const url = await getStorageDownloadUrl(slipPath)
          onOpen(url, jobTitles)
        } catch {
          setError(true)
          setTimeout(() => setError(false), 3000)
        } finally {
          setLoading(false)
        }
      }}
      disabled={loading}
      className={`flex items-center gap-1.5 px-3 py-1.5 border text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
        error ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-green-200 text-green-700 hover:bg-green-50'
      }`}
    >
      {loading
        ? <span className="w-3.5 h-3.5 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
        : <ReceiptRefundIcon className="w-3.5 h-3.5" />
      }
      {error ? 'โหลดไม่ได้' : 'ดูสลิป'}
    </button>
  )
}

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

export default function FreelancerPaymentsPage() {
  const [loading, setLoading] = useState(true)
  const [lineUserId, setLineUserId] = useState('')
  const [freelancer, setFreelancer] = useState<Freelancer | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [requestOpen, setRequestOpen] = useState(false)

  const [selectedJobId, setSelectedJobId] = useState('')
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [selectedPosition, setSelectedPosition] = useState('')
  const [requestAmount, setRequestAmount] = useState('')
  const [requestNotes, setRequestNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [bootError, setBootError] = useState('')
  const [payoutSlipUrl, setPayoutSlipUrl] = useState<string | null>(null)
  const [payoutSlipJobs, setPayoutSlipJobs] = useState<string[]>([])
  const [showCelebration, setShowCelebration] = useState(false)
  // expense
  const [showExpense, setShowExpense] = useState(false)
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseFile, setExpenseFile] = useState<File | null>(null)
  const [expensePreview, setExpensePreview] = useState<string | null>(null)

  const load = async (freelancerId: string) => {
    const [p, j, pos] = await Promise.all([
      getPaymentsByFreelancer(freelancerId),
      getJobs(),
      getPositions(),
    ])
    setPayments(p)
    setJobs(j)
    setPositions(pos)
  }

  useEffect(() => {
    async function init() {
      try {
        const liffReady = await initLiff()
        if (!liffReady) { setBootError('ไม่สามารถโหลด LINE LIFF ได้'); return }
        const isLogin = await isLiffLoggedIn()
        if (!isLogin) { window.location.href = '/freelancer'; return }
        const profile = await signInFirebaseWithLiff()
        setLineUserId(profile.userId)
        const f = await getFreelancerByLineId(profile.userId)
        if (!f) { window.location.href = '/freelancer/register'; return }
        setFreelancer(f)
        await load(f.id)
      } catch (err) {
        setBootError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  const jobsMap = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs])

  const jobOptions = useMemo(() => [
    { value: '', label: '-- เลือกงาน --' },
    ...jobs.map((j) => ({ value: j.id, label: j.title })),
  ], [jobs])

  const getJobTitle = (p: Payment) =>
    (p.jobId ? jobsMap.get(p.jobId)?.title : undefined) ?? p.workDescription ?? ''

  const positionOptions = useMemo(() => [
    { value: '', label: '-- เลือกตำแหน่ง --' },
    ...positions.map((p) => ({ value: p.name, label: p.name })),
  ], [positions])

  const selectedJob = jobs.find((j) => j.id === selectedJobId)

  // วันทั้งหมดของงานที่เลือก
  const jobDates = useMemo(() => {
    if (!selectedJob) return []
    return getDatesInRange(selectedJob.date, selectedJob.endDate)
  }, [selectedJob])

  const openModal = () => {
    setSelectedJobId('')
    setSelectedDates([])
    setSelectedPosition('')
    setRequestAmount('')
    setRequestNotes('')
    setError('')
    setShowExpense(false)
    setExpenseAmount('')
    setExpenseFile(null)
    setExpensePreview(null)
    setRequestOpen(true)
  }

  const handleExpenseFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setExpenseFile(file)
    setExpensePreview(URL.createObjectURL(file))
  }

  const handleSelectJob = (jobId: string) => {
    setSelectedJobId(jobId)
    setSelectedDates([]) // reset dates เมื่อเปลี่ยนงาน
    setError('')
  }

  const toggleDate = (date: string) => {
    setSelectedDates((prev) =>
      prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date]
    )
  }

  const handleRequest = async () => {
    if (!selectedJob) { setError('กรุณาเลือกงาน'); return }
    if (jobDates.length > 1 && selectedDates.length === 0) {
      setError('กรุณาเลือกวันที่ทำงานอย่างน้อย 1 วัน')
      return
    }
    if (!selectedPosition) { setError('กรุณาเลือกตำแหน่ง'); return }
    const amount = parseFloat(requestAmount)
    if (isNaN(amount) || amount <= 0) { setError('กรุณากรอกจำนวนเงินที่ถูกต้อง'); return }
    if (showExpense) {
      const expAmt = parseFloat(expenseAmount)
      if (isNaN(expAmt) || expAmt <= 0) { setError('กรุณากรอกจำนวนค่าใช้จ่ายให้ถูกต้อง'); return }
      if (!expenseFile) { setError('กรุณาแนบรูปสลิปค่าใช้จ่าย'); return }
    }
    if (!freelancer) return

    // วันที่ส่ง: ถ้างาน 1 วัน ใช้วันนั้นเลย ถ้าหลายวัน ใช้ที่เลือก
    const workDates = jobDates.length === 1 ? jobDates : selectedDates

    setSubmitting(true)
    setError('')
    try {
      let expenseSlipPath: string | undefined
      if (showExpense && expenseFile) {
        expenseSlipPath = await uploadExpenseSlip(freelancer.id, expenseFile)
      }

      await createPayment({
        freelancerId: freelancer.id,
        jobId: selectedJob.id,
        amount,
        status: 'pending',
        workDates,
        position: selectedPosition,
        notes: requestNotes.trim() || undefined,
        expenseAmount: showExpense ? parseFloat(expenseAmount) : undefined,
        expenseSlipPath,
      }, freelancer.email)
      setRequestOpen(false)
      await load(freelancer.id)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#f73727]">
        <div className="max-w-lg mx-auto px-4 pt-4 pb-6">
          <div className="flex items-center gap-3">
            <Skeleton className="w-9 h-9 rounded-xl bg-white/30" />
            <Skeleton className="h-5 w-32 rounded-md bg-white/30" />
          </div>
        </div>
      </div>
      <div className="max-w-lg mx-auto px-4 space-y-4 pb-8 mt-4">
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-2">
              <Skeleton className="h-4 w-20 rounded-md mx-auto" />
              <Skeleton className="h-7 w-24 rounded-lg mx-auto" />
              <Skeleton className="h-3 w-16 rounded-md mx-auto" />
            </div>
          ))}
        </div>
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-14 w-full rounded-2xl" />
        <div className="space-y-3">
          <Skeleton className="h-5 w-32 rounded-md" />
          {Array.from({ length: 3 }).map((_, i) => <SkeletonPaymentCard key={i} />)}
        </div>
      </div>
    </div>
  )

  if (bootError) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <p className="text-red-600 text-sm text-center">{bootError}</p>
      <Link href="/freelancer" className="mt-6 text-[#f73727] text-sm font-medium">กลับหน้าหลัก</Link>
    </div>
  )

  const pendingAmount = payments.filter(p => p.status === 'pending' || p.status === 'approved').reduce((s, p) => s + p.amount, 0)
  const paidAmount = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0)

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727]'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5'

  return (
    <div className="min-h-screen bg-gray-50">
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
              <span className="text-xs text-gray-500">รอดำเนินการ</span>
            </div>
            <p className="text-xl font-bold text-yellow-600">{formatCurrency(pendingAmount)}</p>
            <p className="text-xs text-gray-400 mt-0.5">สุทธิ {formatCurrency(calcTax(pendingAmount).net)}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <CheckCircleIcon className="w-4 h-4 text-green-500" />
              <span className="text-xs text-gray-500">ได้รับแล้ว</span>
            </div>
            <p className="text-xl font-bold text-green-600">{formatCurrency(paidAmount)}</p>
            <p className="text-xs text-gray-400 mt-0.5">หักภาษีรวม {formatCurrency(calcTax(paidAmount).tax)}</p>
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

        {/* Payment history */}
        <div>
          <h2 className="font-semibold text-gray-900 mb-3">ประวัติการเบิกจ่าย</h2>
          {payments.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-gray-100">
              <BanknotesIcon className="w-10 h-10 text-gray-300 mx-auto" />
              <p className="text-gray-400 text-sm mt-3">ยังไม่มีประวัติการเบิกจ่าย</p>
            </div>
          ) : (() => {
            // แยก: paid-with-slip (จัดกลุ่ม), paid-no-slip, non-paid
            const paidWithSlip = payments.filter((p) => p.status === 'paid' && p.payoutSlipPath)
            const paidNoSlip = payments.filter((p) => p.status === 'paid' && !p.payoutSlipPath)
            const nonPaid = payments.filter((p) => p.status !== 'paid')

            // จัดกลุ่มตาม payoutSlipPath
            const slipGroups = new Map<string, Payment[]>()
            for (const p of paidWithSlip) {
              const key = p.payoutSlipPath!
              const arr = slipGroups.get(key) ?? []
              arr.push(p)
              slipGroups.set(key, arr)
            }

            const PaymentCard = ({ p }: { p: Payment }) => (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{getJobTitle(p)}</p>
                    {p.jobId && jobsMap.get(p.jobId)?.paymentCycle && (
                      <span className="inline-block mt-1 text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md font-medium">
                        รอบ: {paymentCycleLabel(jobsMap.get(p.jobId)!.paymentCycle!)}
                      </span>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">ขอเบิก {formatDateTime(p.requestedAt)}</p>
                    {p.workDates && p.workDates.length > 0 && (
                      <div className="flex items-start gap-1 mt-1">
                        <CalendarDaysIcon className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-gray-500">{p.workDates.map((d) => formatDate(d)).join(', ')}</p>
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-gray-900">{formatCurrency(p.amount)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      ภาษี {formatCurrency(calcTax(p.amount).tax)} · สุทธิ{' '}
                      <span className="text-green-600 font-medium">{formatCurrency(calcTax(p.amount).net)}</span>
                    </p>
                    <div className="mt-1">
                      <Badge label={paymentStatusLabel(p.status)} colorClass={paymentStatusColor(p.status)} />
                    </div>
                  </div>
                </div>
                {p.notes && <p className="mt-3 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">หมายเหตุ: {p.notes}</p>}
                {p.adminNotes && <p className="mt-2 text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2">Admin: {p.adminNotes}</p>}
                {p.status === 'rejected' && (
                  <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
                    <XCircleIcon className="w-3.5 h-3.5" />ถูกปฏิเสธ
                  </p>
                )}
              </div>
            )

            return (
              <div className="space-y-3">
                {/* non-paid */}
                {nonPaid.map((p) => <PaymentCard key={p.id} p={p} />)}

                {/* paid without slip */}
                {paidNoSlip.map((p) => (
                  <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900">{getJobTitle(p)}</p>
                        {p.jobId && jobsMap.get(p.jobId)?.paymentCycle && (
                          <span className="inline-block mt-1 text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md font-medium">
                            รอบ: {paymentCycleLabel(jobsMap.get(p.jobId)!.paymentCycle!)}
                          </span>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">ขอเบิก {formatDateTime(p.requestedAt)}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-gray-900">{formatCurrency(p.amount)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          สุทธิ <span className="text-green-600 font-medium">{formatCurrency(calcTax(p.amount).net)}</span>
                        </p>
                        <div className="mt-1"><Badge label={paymentStatusLabel(p.status)} colorClass={paymentStatusColor(p.status)} /></div>
                      </div>
                    </div>
                    {p.paidAt && (
                      <p className="mt-2 text-xs text-green-600 flex items-center gap-1">
                        <CheckCircleIcon className="w-3.5 h-3.5" />โอนเงินแล้ว {formatDateTime(p.paidAt)}
                      </p>
                    )}
                  </div>
                ))}

                {/* paid with slip — grouped */}
                {Array.from(slipGroups.entries()).map(([slipPath, pmts]) => {
                  const totalNet = pmts.reduce((s, p) => s + calcTax(p.amount).net + (p.expenseAmount ?? 0), 0)
                  const paidAt = pmts[0]?.paidAt
                  const jobTitles = pmts.map((p) => getJobTitle(p)).filter(Boolean)
                  return (
                    <div key={slipPath} className="bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden">
                      {/* Group header */}
                      <div className="bg-green-50 px-4 py-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-green-700 flex items-center gap-1">
                            <CheckCircleIcon className="w-3.5 h-3.5" />
                            โอนเงินแล้ว {paidAt ? formatDateTime(paidAt) : ''}
                          </p>
                          <p className="text-xs text-green-600 mt-0.5">รวม {formatCurrency(totalNet)} · {pmts.length} รายการ</p>
                        </div>
                        <PayoutSlipButton slipPath={slipPath} jobTitles={jobTitles} onOpen={(url, titles) => { setPayoutSlipUrl(url); setPayoutSlipJobs(titles); setShowCelebration(true) }} />
                      </div>
                      {/* Payment rows */}
                      <div className="divide-y divide-gray-50">
                        {pmts.map((p) => (
                          <div key={p.id} className="px-4 py-3 flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800">{getJobTitle(p)}</p>
                              {p.jobId && jobsMap.get(p.jobId)?.paymentCycle && (
                                <span className="inline-block mt-0.5 text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md font-medium">
                                  รอบ: {paymentCycleLabel(jobsMap.get(p.jobId)!.paymentCycle!)}
                                </span>
                              )}
                              {p.workDates && p.workDates.length > 0 && (
                                <p className="text-xs text-gray-400 mt-0.5">{p.workDates.map((d) => formatDate(d)).join(', ')}</p>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-semibold text-gray-900">{formatCurrency(p.amount)}</p>
                              <p className="text-xs text-gray-400">สุทธิ <span className="text-green-600 font-medium">{formatCurrency(calcTax(p.amount).net)}</span></p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      </div>

      {/* Celebration overlay — แสดงตอน freelancer กดดูสลิปโอนเงิน */}
      {showCelebration && (
        <CelebrationOverlay onDone={() => setShowCelebration(false)} />
      )}

      {/* Payout Slip Modal */}
      <Modal isOpen={!!payoutSlipUrl} onClose={() => setPayoutSlipUrl(null)} title="สลิปการโอนเงิน" size="md">
        {payoutSlipUrl && (
          <div className="space-y-4">
            {payoutSlipJobs.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs font-medium text-gray-500 mb-2">รายการที่โอนในรอบนี้</p>
                <ul className="space-y-1">
                  {payoutSlipJobs.map((title, i) => (
                    <li key={i} className="text-sm text-gray-700 flex items-center gap-2">
                      <CheckCircleIcon className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      {title}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <SkeletonImage src={payoutSlipUrl} alt="สลิปการโอนเงิน" />
          </div>
        )}
      </Modal>

      {/* Request Modal */}
      <Modal isOpen={requestOpen} onClose={() => setRequestOpen(false)} title="ขอเบิกจ่ายเงิน" size="sm">
        <div className="space-y-4">

          {/* เลือกงาน */}
          <div>
            <label className={labelCls}>งาน *</label>
            <FormListbox
              value={selectedJobId}
              onChange={handleSelectJob}
              options={jobOptions}
              placeholder="-- เลือกงาน --"
            />
          </div>

          {/* เลือกวันที่ทำงาน — แสดงเฉพาะถ้างานมีหลายวัน */}
          {jobDates.length > 1 && (
            <div>
              <label className={labelCls}>วันที่ทำงาน * <span className="text-gray-400 font-normal">(เลือกได้หลายวัน)</span></label>
              <div className="flex flex-wrap gap-2">
                {jobDates.map((date) => {
                  const active = selectedDates.includes(date)
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => toggleDate(date)}
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

          {/* งาน 1 วัน — แสดง badge วันที่อย่างเดียว ไม่ต้องเลือก */}
          {jobDates.length === 1 && (
            <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-xl px-3 py-2.5">
              <CalendarDaysIcon className="w-4 h-4 text-gray-400 shrink-0" />
              <span>{formatDate(jobDates[0])}</span>
            </div>
          )}

          {/* ตำแหน่ง */}
          <div>
            <label className={labelCls}>ตำแหน่ง *</label>
            <FormListbox
              value={selectedPosition}
              onChange={(v) => { setSelectedPosition(v); setError('') }}
              options={positionOptions}
              placeholder="-- เลือกตำแหน่ง --"
            />
          </div>

          {/* จำนวนเงินทั้งหมด */}
          <div>
            <label className={labelCls}>จำนวนเงินทั้งหมด (บาท) *</label>
            <input
              type="number"
              value={requestAmount}
              onChange={(e) => setRequestAmount(e.target.value)}
              className={inputCls}
              min="1"
              inputMode="numeric"
              placeholder="0"
            />
          </div>

          {/* ค่าใช้จ่ายเพิ่มเติม */}
          <div>
            <div className="flex items-center justify-between">
              <label className={`text-sm font-medium ${showExpense ? 'text-orange-500' : 'text-gray-700'}`}>
                ค่าใช้จ่ายเพิ่มเติม
                {!showExpense && <span className="ml-1 text-xs font-normal text-gray-400">(ไม่หัก 3%)</span>}
              </label>
              <button
                type="button"
                onClick={() => { setShowExpense(!showExpense); setExpenseAmount(''); setExpenseFile(null); setExpensePreview(null) }}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-base font-bold transition-colors ${
                  showExpense
                    ? 'bg-orange-100 text-orange-500 hover:bg-orange-200'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {showExpense ? '−' : '+'}
              </button>
            </div>

            {showExpense && (
              <div className="mt-2 space-y-3 p-3 bg-orange-50 rounded-xl border border-orange-100">
                <div>
                  <label className={labelCls}>จำนวนค่าใช้จ่าย (บาท) *</label>
                  <input
                    type="number"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    className={inputCls}
                    min="1"
                    inputMode="numeric"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className={labelCls}>รูปสลิป / หลักฐานค่าใช้จ่าย *</label>
                  {expensePreview ? (
                    <div className="relative">
                      <img src={expensePreview} alt="slip" className="w-full max-h-48 object-contain rounded-xl border border-orange-200 bg-white" />
                      <button
                        type="button"
                        onClick={() => { setExpenseFile(null); setExpensePreview(null) }}
                        className="absolute top-2 right-2 w-7 h-7 bg-white rounded-full shadow flex items-center justify-center text-gray-500 hover:text-red-500 text-sm font-bold"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center gap-2 w-full h-28 border-2 border-dashed border-orange-200 rounded-xl cursor-pointer bg-white hover:bg-orange-50 transition-colors">
                      <span className="text-3xl">📎</span>
                      <span className="text-xs text-gray-500">แตะเพื่อเลือกรูป</span>
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleExpenseFile} />
                    </label>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* หมายเหตุ */}
          <div>
            <label className={labelCls}>หมายเหตุ</label>
            <textarea
              value={requestNotes}
              onChange={(e) => setRequestNotes(e.target.value)}
              rows={2}
              className={inputCls}
              placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3 justify-end pt-1">
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
