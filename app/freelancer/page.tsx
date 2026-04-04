'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BanknotesIcon,
  ArrowRightOnRectangleIcon,
  UserCircleIcon,
  ExclamationCircleIcon,
  PencilSquareIcon,
  PlusIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'
import Logo from '@/components/ui/Logo'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import FormListbox from '@/components/ui/FormListbox'
import {
  initLiff,
  liffLogin,
  liffLogout,
  isLiffLoggedIn,
  signInFirebaseWithLiff,
} from '@/lib/line-liff'
import {
  getFreelancerByLineId,
  getJobs,
  getPaymentsByLineUserId,
  createPayment,
} from '@/lib/firebase-utils'
import type { Freelancer, Job, Payment, LiffUserProfile } from '@/lib/types'
import { calcTax, formatCurrency, formatDatePill, formatDate } from '@/lib/utils'
import { Skeleton, SkeletonProfile, SkeletonPaymentCard } from '@/components/ui/Skeleton'

type PageState = 'loading' | 'not-logged-in' | 'ready' | 'error'

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

export default function FreelancerPage() {
  const router = useRouter()
  const [pageState, setPageState] = useState<PageState>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [liffProfile, setLiffProfile] = useState<LiffUserProfile | null>(null)
  const [freelancer, setFreelancer] = useState<Freelancer | null>(null)
  const [lineUserId, setLineUserId] = useState('')
  const [jobs, setJobs] = useState<Job[]>([])
  const [payments, setPayments] = useState<Payment[]>([])

  // Modal state
  const [requestOpen, setRequestOpen] = useState(false)
  const [selectedJobId, setSelectedJobId] = useState('')
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [requestAmount, setRequestAmount] = useState('')
  const [requestNotes, setRequestNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [modalError, setModalError] = useState('')

  useEffect(() => {
    async function init() {
      try {
        const liffReady = await initLiff()
        if (!liffReady) {
          setErrorMsg('ไม่สามารถโหลด LINE LIFF ในหน้านี้ได้ กรุณาเปิดจากลิงก์พอร์ทัล Freelancer')
          setPageState('error')
          return
        }
        const isLogin = await isLiffLoggedIn()
        if (!isLogin) { setPageState('not-logged-in'); return }

        const profile = await signInFirebaseWithLiff()
        setLiffProfile(profile)
        setLineUserId(profile.userId)

        const f = await getFreelancerByLineId(profile.userId)
        if (!f) { router.replace('/freelancer/register'); return }

        setFreelancer(f)
        const [j, p] = await Promise.all([getJobs(), getPaymentsByLineUserId(profile.userId)])
        setJobs(j)
        setPayments(p)
        setPageState('ready')
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
        setPageState('error')
      }
    }
    init()
  }, [router])

  // ── Modal helpers ──────────────────────────────────────────────────────────

  const jobOptions = useMemo(() => [
    { value: '', label: '-- เลือกงาน --' },
    ...jobs.map((j) => ({ value: j.id, label: j.title })),
  ], [jobs])

  const selectedJob = jobs.find((j) => j.id === selectedJobId)

  const jobDates = useMemo(() => {
    if (!selectedJob) return []
    return getDatesInRange(selectedJob.date, selectedJob.endDate)
  }, [selectedJob])

  const openModal = () => {
    setSelectedJobId('')
    setSelectedDates([])
    setRequestAmount('')
    setRequestNotes('')
    setModalError('')
    setSubmitSuccess(false)
    setRequestOpen(true)
  }

  const toggleDate = (date: string) => {
    setSelectedDates((prev) =>
      prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date]
    )
  }

  const handleRequest = async () => {
    if (!selectedJob) { setModalError('กรุณาเลือกงาน'); return }
    if (jobDates.length > 1 && selectedDates.length === 0) {
      setModalError('กรุณาเลือกวันที่ทำงานอย่างน้อย 1 วัน'); return
    }
    const amount = parseFloat(requestAmount)
    if (isNaN(amount) || amount <= 0) { setModalError('กรุณากรอกจำนวนเงินที่ถูกต้อง'); return }
    if (!freelancer) return

    const workDates = jobDates.length === 1 ? jobDates : selectedDates

    setSubmitting(true)
    setModalError('')
    try {
      await createPayment({
        freelancerId: freelancer.id,
        lineUserId,
        amount,
        status: 'pending',
        workDescription: selectedJob.title,
        workDates,
        notes: requestNotes.trim() || undefined,
        freelancerName: freelancer.name,
        bankAccount: freelancer.bankAccount,
        bankName: freelancer.bankName,
      }, freelancer.email)
      setSubmitSuccess(true)
    } catch {
      setModalError('ส่งคำขอไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const now = new Date()
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7) // "YYYY-MM"
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)

  const totalPaid = freelancer?.totalEarned ?? 0

  const lastMonthEarned = payments
    .filter((p) => p.status === 'paid' && p.paidAt && p.paidAt.startsWith(lastMonthStart))
    .reduce((s, p) => s + p.amount, 0)

  const pendingAmount = payments
    .filter((p) => p.status === 'pending' || p.status === 'approved')
    .reduce((s, p) => s + p.amount, 0)

  const lastMonthLabel = lastMonthEnd.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727]'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5'

  // ── States ─────────────────────────────────────────────────────────────────

  if (pageState === 'loading') return (
    <div className="min-h-screen bg-gray-50">
      {/* Header skeleton */}
      <div className="bg-[#f73727]">
        <div className="max-w-lg mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-28 rounded-md bg-white/30" />
            <div className="flex gap-2">
              <Skeleton className="w-9 h-9 rounded-xl bg-white/30" />
              <Skeleton className="w-9 h-9 rounded-xl bg-white/30" />
            </div>
          </div>
          <SkeletonProfile />
        </div>
      </div>
      {/* Content skeleton */}
      <div className="max-w-lg mx-auto px-4 pb-10 space-y-4 mt-4">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 space-y-2">
              <Skeleton className="h-5 w-full rounded-md" />
              <Skeleton className="h-3 w-3/4 rounded-md mx-auto" />
              <Skeleton className="h-3 w-1/2 rounded-md mx-auto" />
            </div>
          ))}
        </div>
        <Skeleton className="h-14 w-full rounded-2xl" />
        <Skeleton className="h-16 w-full rounded-2xl" />
      </div>
    </div>
  )

  if (pageState === 'error') return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6 text-center">
      <ExclamationCircleIcon className="w-12 h-12 text-red-400" />
      <h2 className="mt-4 text-lg font-bold text-gray-800">เกิดข้อผิดพลาด</h2>
      <p className="mt-2 text-sm text-gray-500 max-w-xs">{errorMsg}</p>
      <button
        onClick={() => window.location.reload()}
        className="mt-6 px-5 py-2.5 bg-[#f73727] text-white text-sm font-medium rounded-xl"
      >
        ลองใหม่
      </button>
    </div>
  )

  if (pageState === 'not-logged-in') return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-sm text-center space-y-8">
        <Logo width={200} height={30} href="/freelancer" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mt-6">Freelancer Portal</h1>
          <p className="text-gray-500 mt-2 text-sm">เข้าสู่ระบบด้วย LINE เพื่อดูงานและเบิกจ่ายเงิน</p>
        </div>
        <button
          onClick={liffLogin}
          className="w-full flex items-center justify-center gap-3 bg-[#06C755] text-white py-3.5 rounded-2xl text-sm font-semibold hover:bg-[#05b04c] transition-colors shadow-md shadow-green-200"
        >
          <LineIcon />
          เข้าสู่ระบบด้วย LINE
        </button>
      </div>
    </div>
  )

  // ── Ready ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#f73727] text-white">
        <div className="max-w-lg mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Logo white width={120} height={18} href="/freelancer" />
            <div className="flex items-center gap-1">
              <Link href="/freelancer/register" className="p-2 hover:bg-white/10 rounded-xl transition-colors" title="แก้ไขโปรไฟล์">
                <PencilSquareIcon className="w-5 h-5" />
              </Link>
              <button onClick={liffLogout} className="p-2 hover:bg-white/10 rounded-xl transition-colors" title="ออกจากระบบ">
                <ArrowRightOnRectangleIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-5 pb-5">
            {liffProfile?.pictureUrl ? (
              <img src={liffProfile.pictureUrl} alt={liffProfile.displayName} className="w-14 h-14 rounded-full border-2 border-white/50 object-cover" />
            ) : (
              <UserCircleIcon className="w-14 h-14 text-white/70" />
            )}
            <div>
              <p className="font-semibold text-lg leading-tight">{freelancer?.name}</p>
              <p className="text-white/70 text-sm">{freelancer?.phone}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pb-10 space-y-4 -mt-2">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-center">
            <p className="text-base font-bold text-[#f73727] leading-tight">{formatCurrency(totalPaid)}</p>
            <p className="text-xs text-gray-400 mt-0.5">สุทธิ {formatCurrency(calcTax(totalPaid).net)}</p>
            <p className="text-xs text-gray-500 mt-0.5">รายได้รวม</p>
          </div>
          <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-center">
            <p className="text-base font-bold text-gray-800 leading-tight">{formatCurrency(lastMonthEarned)}</p>
            <p className="text-xs text-gray-400 mt-0.5">สุทธิ {formatCurrency(calcTax(lastMonthEarned).net)}</p>
            <p className="text-xs text-gray-500 mt-0.5">เดือน{lastMonthLabel}</p>
          </div>
          <div className="bg-yellow-50 rounded-2xl p-3 shadow-sm border border-yellow-100 text-center">
            <p className="text-base font-bold text-yellow-600 leading-tight">{formatCurrency(pendingAmount)}</p>
            <p className="text-xs text-yellow-500 mt-0.5">สุทธิ {formatCurrency(calcTax(pendingAmount).net)}</p>
            <p className="text-xs text-yellow-500 mt-0.5">รอดำเนินการ</p>
          </div>
        </div>

        {/* ปุ่มขอเบิกจ่าย */}
        <button
          onClick={openModal}
          className="w-full flex items-center justify-center gap-2 py-4 bg-[#f73727] text-white font-semibold rounded-2xl hover:bg-red-600 transition-colors shadow-md shadow-red-200 text-base"
        >
          <PlusIcon className="w-5 h-5" />
          ขอเบิกจ่ายเงิน
        </button>

        {/* ลิงก์ดูประวัติ */}
        <Link
          href="/freelancer/payments"
          className="flex items-center justify-between bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-xl">
              <BanknotesIcon className="w-5 h-5 text-[#f73727]" />
            </div>
            <span className="font-medium text-gray-900 text-sm">ประวัติการเบิกจ่าย</span>
          </div>
          <span className="text-xs text-gray-400">ดูทั้งหมด →</span>
        </Link>

      </div>

      {/* Modal ขอเบิกจ่าย */}
      <Modal isOpen={requestOpen} onClose={() => setRequestOpen(false)} title="ขอเบิกจ่ายเงิน" size="sm">
        {submitSuccess ? (
          <div className="py-6 flex flex-col items-center text-center gap-3">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircleIcon className="w-8 h-8 text-green-500" />
            </div>
            <p className="font-semibold text-gray-900">ส่งคำขอสำเร็จ!</p>
            <p className="text-sm text-gray-500">Admin จะตรวจสอบและอนุมัติโดยเร็ว</p>
            <button
              onClick={() => setRequestOpen(false)}
              className="mt-2 w-full py-3 bg-[#f73727] text-white font-semibold rounded-2xl hover:bg-red-600 transition-colors"
            >
              ปิด
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* เลือกงาน */}
            <div>
              <label className={labelCls}>งาน *</label>
              <FormListbox
                value={selectedJobId}
                onChange={(id) => { setSelectedJobId(id); setSelectedDates([]); setModalError('') }}
                options={jobOptions}
                placeholder="-- เลือกงาน --"
              />
            </div>

            {/* วันที่ทำงาน — เฉพาะงานหลายวัน */}
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

            {/* งาน 1 วัน — แสดงวันเฉยๆ */}
            {jobDates.length === 1 && (
              <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-xl px-3 py-2.5">
                <CalendarDaysIcon className="w-4 h-4 text-gray-400 shrink-0" />
                <span>{formatDate(jobDates[0])}</span>
              </div>
            )}

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

            {modalError && <p className="text-sm text-red-500">{modalError}</p>}

            <div className="flex gap-3 justify-end pt-1">
              <button onClick={() => setRequestOpen(false)} className="px-4 py-2.5 text-sm text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200">
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
        )}
      </Modal>
    </div>
  )
}

function LineIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
    </svg>
  )
}
