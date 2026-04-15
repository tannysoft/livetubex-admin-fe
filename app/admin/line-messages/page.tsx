'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChatBubbleLeftRightIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { getLineMessageLogs } from '@/lib/firebase-utils'
import type { LineMessageLog } from '@/lib/types'
import { formatDateTime } from '@/lib/utils'
import { SkeletonCard } from '@/components/ui/Skeleton'
import FormListbox from '@/components/ui/FormListbox'

const FREE_LIMIT = 300

function getMonthOptions(): { value: string; label: string }[] {
  const options = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const thaiYear = d.getFullYear() + 543
    const monthName = d.toLocaleDateString('th-TH', { month: 'long' })
    options.push({ value, label: `${monthName} ${thaiYear}` })
  }
  return options
}

function currentMonthValue(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default function LineMessagesPage() {
  const monthOptions = useMemo(() => getMonthOptions(), [])
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue)
  const [logs, setLogs] = useState<LineMessageLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getLineMessageLogs(selectedMonth)
      .then(setLogs)
      .finally(() => setLoading(false))
  }, [selectedMonth])

  const count = logs.length
  const pct = Math.min((count / FREE_LIMIT) * 100, 100)
  const barColor = count >= 280 ? 'bg-red-500' : count >= 200 ? 'bg-yellow-400' : 'bg-green-500'
  const textColor = count >= 280 ? 'text-red-600' : count >= 200 ? 'text-yellow-600' : 'text-green-600'
  const selectedLabel = monthOptions.find((o) => o.value === selectedMonth)?.label ?? selectedMonth

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">LINE Message Report</h1>
          <p className="text-gray-500 mt-1">ติดตามการใช้งาน LINE Messaging API</p>
        </div>
        <div className="w-48">
          <FormListbox
            value={selectedMonth}
            onChange={setSelectedMonth}
            options={monthOptions}
          />
        </div>
      </div>

      {/* Stats card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="text-sm text-gray-500 font-medium">{selectedLabel}</p>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className={`text-4xl font-bold ${textColor}`}>{count}</span>
              <span className="text-xl text-gray-400 font-medium">/ {FREE_LIMIT}</span>
              <span className="text-sm text-gray-400 ml-1">ครั้ง</span>
            </div>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-[#06C755]/10 flex items-center justify-center flex-shrink-0">
            <ChatBubbleLeftRightIcon className="w-7 h-7 text-[#06C755]" />
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>ใช้ไป {pct.toFixed(1)}%</span>
            <span className={count >= FREE_LIMIT ? 'text-red-500 font-medium' : ''}>
              {count >= FREE_LIMIT ? 'ถึง limit แล้ว' : `คงเหลือ ${FREE_LIMIT - count} ครั้ง`}
            </span>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex flex-wrap gap-2 mt-4">
          <span className="text-xs px-2.5 py-1 rounded-full bg-green-50 text-green-700 font-medium">
            ฟรี 0–{FREE_LIMIT} ครั้ง/เดือน
          </span>
          {count >= 280 && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-600 font-medium">
              ใกล้ถึง limit
            </span>
          )}
        </div>
      </div>

      {/* Log list */}
      <div>
        <h2 className="font-semibold text-gray-900 mb-3">
          รายการที่ส่ง{' '}
          {!loading && <span className="text-gray-400 font-normal text-sm">({count} รายการ)</span>}
        </h2>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : logs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
            <CheckCircleIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">ยังไม่มีการส่ง LINE ในเดือนนี้</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">#</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">วันเวลา</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Freelancer</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">งาน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map((log, idx) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 text-gray-400 text-xs">{count - idx}</td>
                    <td className="px-5 py-3 text-gray-600">{formatDateTime(log.sentAt)}</td>
                    <td className="px-5 py-3 font-medium text-gray-900">{log.freelancerName}</td>
                    <td className="px-5 py-3 text-right text-gray-500">{log.paymentCount} งาน</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
