'use client'

import { useEffect, useState } from 'react'
import {
  VideoCameraIcon,
  UsersIcon,
  BanknotesIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline'
import StatCard from '@/components/admin/StatCard'
import { getDashboardStats, getJobs, getPayments } from '@/lib/firebase-utils'
import type { DashboardStats, Job, Payment } from '@/lib/types'
import { formatCurrency, formatDate, jobStatusColor, jobStatusLabel, paymentStatusColor, paymentStatusLabel } from '@/lib/utils'
import Badge from '@/components/ui/Badge'
import { Skeleton, SkeletonCard, SkeletonStat } from '@/components/ui/Skeleton'
import Link from 'next/link'

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentJobs, setRecentJobs] = useState<Job[]>([])
  const [recentPayments, setRecentPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [s, jobs, payments] = await Promise.all([
          getDashboardStats(),
          getJobs(),
          getPayments(),
        ])
        setStats(s)
        setRecentJobs(jobs.slice(0, 5))
        setRecentPayments(payments.slice(0, 5))
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <Skeleton className="h-8 w-40 rounded-lg" />
          <Skeleton className="h-4 w-72 rounded-md mt-2" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonStat key={i} />)}
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <Skeleton className="h-6 w-32 rounded-lg" />
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
          <div className="space-y-3">
            <Skeleton className="h-6 w-40 rounded-lg" />
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">ภาพรวมระบบจัดการงานถ่ายทอดสด LiveTubeX</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="งานทั้งหมด"
          value={stats?.totalJobs ?? 0}
          icon={<VideoCameraIcon className="w-5 h-5 text-blue-600" />}
          color="bg-blue-50"
        />
        <StatCard
          title="งานที่ดำเนินอยู่"
          value={stats?.activeJobs ?? 0}
          icon={<ClockIcon className="w-5 h-5 text-yellow-600" />}
          color="bg-yellow-50"
        />
        <StatCard
          title="Freelancer"
          value={stats?.totalFreelancers ?? 0}
          icon={<UsersIcon className="w-5 h-5 text-purple-600" />}
          color="bg-purple-50"
        />
        <StatCard
          title="รอการเบิกจ่าย"
          value={stats?.pendingPayments ?? 0}
          icon={<ExclamationCircleIcon className="w-5 h-5 text-orange-600" />}
          color="bg-orange-50"
        />
        <StatCard
          title="ยอดรอจ่าย"
          value={formatCurrency(stats?.pendingPaymentAmount ?? 0)}
          icon={<BanknotesIcon className="w-5 h-5 text-red-600" />}
          color="bg-red-50"
        />
        <StatCard
          title="ยอดจ่ายแล้ว"
          value={formatCurrency(stats?.totalPaidAmount ?? 0)}
          icon={<CheckCircleIcon className="w-5 h-5 text-green-600" />}
          color="bg-green-50"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Jobs */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">งานล่าสุด</h2>
            <Link href="/admin/jobs" className="text-sm text-[#f73727] hover:underline font-medium">ดูทั้งหมด</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentJobs.length === 0 ? (
              <p className="text-center text-gray-400 py-10 text-sm">ยังไม่มีงาน</p>
            ) : (
              recentJobs.map((job) => (
                <div key={job.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{job.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDate(job.date)} · {job.location}</p>
                  </div>
                  <Badge label={jobStatusLabel(job.status)} colorClass={jobStatusColor(job.status)} />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Payments */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">การเบิกจ่ายล่าสุด</h2>
            <Link href="/admin/payments" className="text-sm text-[#f73727] hover:underline font-medium">ดูทั้งหมด</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentPayments.length === 0 ? (
              <p className="text-center text-gray-400 py-10 text-sm">ยังไม่มีการเบิกจ่าย</p>
            ) : (
              recentPayments.map((payment) => (
                <div key={payment.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{payment.freelancerName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{payment.workDescription}</p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-sm font-semibold text-gray-900">{formatCurrency(payment.amount)}</p>
                    <Badge label={paymentStatusLabel(payment.status)} colorClass={paymentStatusColor(payment.status)} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
