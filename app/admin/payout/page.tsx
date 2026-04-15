'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { BanknotesIcon, CheckCircleIcon, PhotoIcon, XMarkIcon } from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import { getPayments, getJobs, getFreelancers, markPaymentPaid, sendPayoutNotification } from '@/lib/firebase-utils'
import { uploadPayoutSlip } from '@/lib/firebase-storage'
import type { Freelancer, Job, Payment } from '@/lib/types'
import { calcTax, formatCurrency, formatDate } from '@/lib/utils'
import { SkeletonCard } from '@/components/ui/Skeleton'

interface FreelancerGroup {
  freelancer: Freelancer
  payments: Payment[]
  totalNet: number
}

export default function PayoutPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [freelancers, setFreelancers] = useState<Freelancer[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmGroup, setConfirmGroup] = useState<FreelancerGroup | null>(null)
  const [paying, setPaying] = useState(false)
  const [slipFile, setSlipFile] = useState<File | null>(null)
  const [slipPreview, setSlipPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
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
      const [data, jobData, freelancerData] = await Promise.all([
        getPayments(), getJobs(), getFreelancers(),
      ])
      setPayments(data)
      setJobs(jobData)
      setFreelancers(freelancerData)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const jobsMap = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs])
  const freelancersMap = useMemo(() => new Map(freelancers.map((f) => [f.id, f])), [freelancers])

  const groups: FreelancerGroup[] = useMemo(() => {
    const approved = payments.filter((p) => p.status === 'approved')
    const map = new Map<string, Payment[]>()
    for (const p of approved) {
      const arr = map.get(p.freelancerId) ?? []
      arr.push(p)
      map.set(p.freelancerId, arr)
    }
    return Array.from(map.entries())
      .map(([fid, pmts]) => {
        const freelancer = freelancersMap.get(fid)
        if (!freelancer) return null
        const totalNet = pmts.reduce((sum, p) => sum + calcTax(p.amount).net + (p.expenseAmount ?? 0), 0)
        return { freelancer, payments: pmts, totalNet }
      })
      .filter((g): g is FreelancerGroup => g !== null)
      .sort((a, b) => b.totalNet - a.totalNet)
  }, [payments, freelancersMap])

  const grandTotal = groups.reduce((s, g) => s + g.totalNet, 0)

  const openConfirm = (group: FreelancerGroup) => {
    setConfirmGroup(group)
    setSlipFile(null)
    setSlipPreview(null)
  }

  const handleSlipFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSlipFile(file)
    setSlipPreview(URL.createObjectURL(file))
  }

  const handlePayAll = async () => {
    if (!confirmGroup) return
    setPaying(true)
    try {
      let payoutSlipPath: string | undefined
      if (slipFile) {
        payoutSlipPath = await uploadPayoutSlip(confirmGroup.freelancer.id, slipFile)
      }
      await Promise.all(
        confirmGroup.payments.map((p) =>
          markPaymentPaid(p.id, p.freelancerId, p.amount, undefined, payoutSlipPath)
        )
      )
      const freelancerId = confirmGroup.freelancer.id
      const paymentIds = confirmGroup.payments.map((p) => p.id)
      setConfirmGroup(null)
      showToast(`โอนเงินให้ ${confirmGroup.freelancer.name} แล้ว`)
      load(true)
      // ส่งอีเมลแจ้ง freelancer (ไม่ block UI ถ้า fail)
      sendPayoutNotification(freelancerId, paymentIds, payoutSlipPath).catch((e) => {
        console.warn('sendPayoutNotification failed:', e)
      })
    } finally {
      setPaying(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
        <div className={`text-white text-sm font-medium px-5 py-2.5 rounded-full shadow-lg ${lastToast.current?.type === 'success' ? 'bg-green-500' : lastToast.current?.type === 'warning' ? 'bg-yellow-500' : 'bg-red-500'}`}>
          {lastToast.current?.type === 'success' ? '✓' : lastToast.current?.type === 'warning' ? '↩' : '✕'} {lastToast.current?.msg}
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">เตรียมจ่ายเงิน</h1>
        <p className="text-gray-500 mt-1">รายการที่อนุมัติแล้วและรอโอนเงิน</p>
      </div>

      {!loading && groups.length > 0 && (
        <div className="bg-[#f73727]/5 border border-[#f73727]/20 rounded-2xl px-5 py-4 flex flex-wrap gap-6 items-center">
          <div>
            <p className="text-xs text-gray-500">รายการรอโอน</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">
              {groups.reduce((s, g) => s + g.payments.length, 0)} รายการ · {groups.length} คน
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">ยอดโอนรวม</p>
            <p className="text-xl font-bold text-[#f73727] mt-0.5">{formatCurrency(grandTotal)}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
          <CheckCircleIcon className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">ไม่มีรายการรอโอนเงิน</p>
          <p className="text-sm text-gray-400 mt-1">ทุกรายการที่อนุมัติแล้วได้รับการโอนเงินแล้ว</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(({ freelancer, payments: pmts, totalNet }) => (
            <div key={freelancer.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#f73727]/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-[#f73727] font-bold text-sm">{freelancer.name.slice(0, 1)}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{freelancer.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{freelancer.bankName} · {freelancer.bankAccount}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs text-gray-400">ยอดโอนรวม</p>
                    <p className="text-lg font-bold text-[#f73727]">{formatCurrency(totalNet)}</p>
                  </div>
                  <button
                    onClick={() => openConfirm({ freelancer, payments: pmts, totalNet })}
                    className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-xl transition-colors"
                  >
                    <BanknotesIcon className="w-4 h-4" />
                    โอนแล้ว
                  </button>
                </div>
              </div>

              <div className="divide-y divide-gray-50">
                {pmts.map((p) => {
                  const job = p.jobId ? jobsMap.get(p.jobId) : undefined
                  const { tax, net } = calcTax(p.amount)
                  const transferTotal = net + (p.expenseAmount ?? 0)
                  return (
                    <div key={p.id} className="px-5 py-3 grid grid-cols-[1fr_auto] gap-4 items-start">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{job?.title ?? '-'}</p>
                        <div className="flex flex-wrap gap-x-3 mt-0.5">
                          {p.position && (
                            <span className="text-xs text-[#f73727] bg-red-50 px-1.5 py-0.5 rounded-md font-medium">{p.position}</span>
                          )}
                          {p.workDates && p.workDates.length > 0 && (
                            <span className="text-xs text-gray-400">{p.workDates.map((d) => formatDate(d)).join(', ')}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">{formatCurrency(p.amount)}</p>
                        {p.expenseAmount && (
                          <p className="text-xs text-orange-500 font-medium">+{formatCurrency(p.expenseAmount)} ค่าใช้จ่าย</p>
                        )}
                        <p className="text-xs text-gray-400">
                          ภาษี {formatCurrency(tax)} · โอน{' '}
                          <span className="text-[#f73727] font-medium">{formatCurrency(transferTotal)}</span>
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>

              {pmts.length > 1 && (
                <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
                  <p className="text-sm text-gray-500">
                    รวมโอน <span className="font-bold text-gray-900">{formatCurrency(totalNet)}</span>
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Confirm + Slip Upload Modal */}
      <Modal
        isOpen={!!confirmGroup}
        onClose={() => setConfirmGroup(null)}
        title="ยืนยันการโอนเงิน"
        size="sm"
      >
        {confirmGroup && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Freelancer</span>
                <span className="font-medium">{confirmGroup.freelancer.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">บัญชี</span>
                <span className="font-medium text-xs">{confirmGroup.freelancer.bankName} {confirmGroup.freelancer.bankAccount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">จำนวนรายการ</span>
                <span className="font-medium">{confirmGroup.payments.length} รายการ</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-gray-200 mt-1">
                <span className="text-gray-500">ยอดโอนรวม</span>
                <span className="font-bold text-[#f73727]">{formatCurrency(confirmGroup.totalNet)}</span>
              </div>
            </div>

            {/* Slip upload */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">แนบสลิปการโอนเงิน <span className="text-gray-400 font-normal">(ถ้ามี)</span></p>
              {slipPreview ? (
                <div className="relative">
                  <img src={slipPreview} alt="slip" className="w-full max-h-52 object-contain rounded-xl border border-gray-200 bg-gray-50" />
                  <button
                    type="button"
                    onClick={() => { setSlipFile(null); setSlipPreview(null) }}
                    className="absolute top-2 right-2 w-7 h-7 bg-white rounded-full shadow flex items-center justify-center text-gray-500 hover:text-red-500"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 w-full h-24 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                  <PhotoIcon className="w-6 h-6 text-gray-400" />
                  <span className="text-xs text-gray-400">แตะเพื่อเลือกรูปสลิป</span>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleSlipFile} />
                </label>
              )}
            </div>

            <div className="flex gap-3 justify-end pt-1">
              <button
                onClick={() => setConfirmGroup(null)}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200"
              >
                ยกเลิก
              </button>
              <button
                onClick={handlePayAll}
                disabled={paying}
                className="px-5 py-2 text-sm font-medium text-white bg-green-500 hover:bg-green-600 rounded-xl transition-colors disabled:opacity-60 flex items-center gap-2"
              >
                {paying && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                ยืนยันโอนเงิน
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
