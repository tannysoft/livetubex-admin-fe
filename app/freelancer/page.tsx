'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  VideoCameraIcon,
  BanknotesIcon,
  ArrowRightOnRectangleIcon,
  UserCircleIcon,
  ExclamationCircleIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline'
import Logo from '@/components/ui/Logo'
import Badge from '@/components/ui/Badge'
import {
  initLiff,
  liffLogin,
  liffLogout,
  isLiffLoggedIn,
  signInFirebaseWithLiff,
} from '@/lib/line-liff'
import { getFreelancerByLineId, getAssignmentsByFreelancer } from '@/lib/firebase-utils'
import type { Freelancer, JobAssignment, LiffUserProfile } from '@/lib/types'
import { formatCurrency, formatDate, assignmentStatusLabel } from '@/lib/utils'

type PageState = 'loading' | 'not-logged-in' | 'ready' | 'error'

export default function FreelancerPage() {
  const router = useRouter()
  const [pageState, setPageState] = useState<PageState>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [liffProfile, setLiffProfile] = useState<LiffUserProfile | null>(null)
  const [freelancer, setFreelancer] = useState<Freelancer | null>(null)
  const [assignments, setAssignments] = useState<JobAssignment[]>([])

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

        if (!isLogin) {
          setPageState('not-logged-in')
          return
        }

        // แปลง LINE token → Firebase Custom Token → signIn
        const profile = await signInFirebaseWithLiff()
        setLiffProfile(profile)

        // ยังไม่ลงทะเบียน → ไปลงทะเบียนก่อน แล้วค่อยกลับมาหน้าหลัก (/freelancer) หลังบันทึกสำเร็จ
        const f = await getFreelancerByLineId(profile.userId)
        if (!f) {
          router.replace('/freelancer/register')
          return
        }

        setFreelancer(f)
        const a = await getAssignmentsByFreelancer(f.id)
        setAssignments(a)
        setPageState('ready')
      } catch (err: unknown) {
        console.error(err)
        setErrorMsg(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
        setPageState('error')
      }
    }
    init()
  }, [router])

  // ── Loading ──────────────────────────────────────────────────────────────
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-[#f73727] border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-gray-400 text-sm">กำลังยืนยันตัวตน...</p>
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (pageState === 'error') {
    return (
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
  }

  // ── Not logged in ────────────────────────────────────────────────────────
  if (pageState === 'not-logged-in') {
    return (
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
  }

  // ── Ready ────────────────────────────────────────────────────────────────
  const pendingCount = assignments.filter((a) => a.status === 'invited' || a.status === 'accepted').length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#f73727] text-white">
        <div className="max-w-lg mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Logo white width={120} height={18} href="/freelancer" />
            <div className="flex items-center gap-1">
              <Link
                href="/freelancer/register"
                className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                title="แก้ไขโปรไฟล์"
              >
                <PencilSquareIcon className="w-5 h-5" />
              </Link>
              <button
                onClick={liffLogout}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                title="ออกจากระบบ"
              >
                <ArrowRightOnRectangleIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-5 pb-5">
            {liffProfile?.pictureUrl ? (
              <img
                src={liffProfile.pictureUrl}
                alt={liffProfile.displayName}
                className="w-14 h-14 rounded-full border-2 border-white/50 object-cover"
              />
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

      {/* Stats */}
      <div className="max-w-lg mx-auto px-4 -mt-2 pb-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
            <p className="text-2xl font-bold text-gray-900">{assignments.length}</p>
            <p className="text-xs text-gray-500 mt-1">งานทั้งหมด</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
            <p className="text-xl font-bold text-[#f73727]">{formatCurrency(freelancer?.totalEarned ?? 0)}</p>
            <p className="text-xs text-gray-500 mt-1">รายได้รวม</p>
          </div>
        </div>
      </div>

      {/* Quick nav */}
      <div className="max-w-lg mx-auto px-4 mt-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 bg-blue-50 rounded-xl">
                <VideoCameraIcon className="w-5 h-5 text-blue-600" />
              </div>
              <span className="font-semibold text-gray-900 text-sm">งานของฉัน</span>
            </div>
            <p className="text-xs text-gray-500 pl-1">{pendingCount} งานที่กำลังดำเนินการ</p>
          </div>
          <Link
            href="/freelancer/payments"
            className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow block"
          >
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 bg-red-50 rounded-xl">
                <BanknotesIcon className="w-5 h-5 text-[#f73727]" />
              </div>
              <span className="font-semibold text-gray-900 text-sm">เบิกจ่าย</span>
            </div>
            <p className="text-xs text-gray-500 pl-1">ดูและขอเบิกจ่ายเงิน →</p>
          </Link>
        </div>
      </div>

      {/* Assignment list */}
      <div className="max-w-lg mx-auto px-4 mt-6 pb-10 space-y-3">
        <h2 className="font-semibold text-gray-900">งานที่ได้รับมอบหมาย</h2>

        {assignments.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-gray-100">
            <VideoCameraIcon className="w-10 h-10 text-gray-300 mx-auto" />
            <p className="text-gray-400 text-sm mt-3">ยังไม่มีงานที่ได้รับมอบหมาย</p>
          </div>
        ) : (
          assignments.map((a) => (
            <div key={a.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 leading-snug">{a.jobTitle}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{a.role}</p>
                </div>
                <Badge
                  label={assignmentStatusLabel(a.status)}
                  colorClass={
                    a.status === 'accepted'  ? 'bg-blue-100 text-blue-700' :
                    a.status === 'completed' ? 'bg-green-100 text-green-700' :
                    a.status === 'declined'  ? 'bg-red-100 text-red-600' :
                                               'bg-yellow-100 text-yellow-700'
                  }
                />
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400">{formatDate(a.assignedAt)}</span>
                <span className="font-semibold text-[#f73727]">{formatCurrency(a.fee)}</span>
              </div>
            </div>
          ))
        )}
      </div>
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
