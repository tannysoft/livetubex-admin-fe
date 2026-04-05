'use client'

import { useEffect, useState } from 'react'
import {
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline'
import FormListbox from '@/components/ui/FormListbox'
import { getAppSettings, initAppSettings } from '@/lib/firebase-utils'
import type { BillingCycle } from '@/lib/types'
import { Skeleton } from '@/components/ui/Skeleton'

const MONTH_LABELS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
  'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
  'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

function thaiYear(y: number) { return y + 543 }

/** วันสุดท้ายของเดือน: new Date(year, month, 0) = วันสุดท้ายของ month-1 */
function lastDayOfMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

/** วันที่จ่ายจริง: กลางเดือน = 15, สิ้นเดือน = วันสุดท้ายของเดือน */
function paymentDay(year: number, month: number, cycle: BillingCycle) {
  return cycle === 'mid' ? 15 : lastDayOfMonth(year, month)
}

function buildPeriodLabel(month: number, year: number, cycle: BillingCycle) {
  const prefix = cycle === 'mid' ? 'กลางเดือน' : 'สิ้นเดือน'
  return `${prefix}${MONTH_LABELS[month - 1]} ${thaiYear(year)}`
}

export default function SettingsPage() {
  const now = new Date()
  const currentYear = now.getFullYear()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear]   = useState(currentYear)
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('end')
  const [saved, setSaved] = useState<{ month: number; year: number; cycle: BillingCycle } | null>(null)
  const [toast, setToast] = useState<{ type: 'ok' | 'fail'; message: string } | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const settings = await getAppSettings()
        if (settings) {
          setMonth(settings.reportPeriodMonth)
          setYear(settings.reportPeriodYear)
          setBillingCycle(settings.billingCycle ?? 'end')
          setSaved({
            month: settings.reportPeriodMonth,
            year: settings.reportPeriodYear,
            cycle: settings.billingCycle ?? 'end',
          })
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // auto-dismiss toast
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const handleSave = async () => {
    setSaving(true)
    setToast(null)
    try {
      await initAppSettings({ reportPeriodMonth: month, reportPeriodYear: year, billingCycle })
      setSaved({ month, year, cycle: billingCycle })
      setToast({ type: 'ok', message: 'บันทึกการตั้งค่าเรียบร้อย' })
    } catch {
      setToast({ type: 'fail', message: 'บันทึกไม่สำเร็จ กรุณาลองใหม่' })
    } finally {
      setSaving(false)
    }
  }

  const isDirty = month !== saved?.month || year !== saved?.year || billingCycle !== saved?.cycle


  const monthOptions = MONTH_LABELS.map((label, i) => ({ value: String(i + 1), label }))
  const yearOptions  = Array.from({ length: 3 }, (_, i) => {
    const y = currentYear - 2 + i
    return { value: String(y), label: String(thaiYear(y)) }
  })

  const previewPeriod = buildPeriodLabel(month, year, billingCycle)
  const savedPeriod   = saved ? buildPeriodLabel(saved.month, saved.year, saved.cycle) : null

  // วันที่จ่ายจริงตาม month/year ที่เลือกอยู่ (แสดงในปุ่ม)
  const midDay = 15
  const endDay = lastDayOfMonth(year, month)

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ตั้งค่าระบบ</h1>
        <p className="text-gray-500 mt-1">กำหนดค่าการทำงานของระบบ</p>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-lg text-sm font-medium ${
          toast.type === 'ok' ? 'bg-green-500 text-white' : 'bg-yellow-500 text-white'
        }`}>
          {toast.type === 'ok'
            ? <CheckCircleIcon className="w-5 h-5 shrink-0" />
            : <ExclamationCircleIcon className="w-5 h-5 shrink-0" />
          }
          {toast.message}
        </div>
      )}

      {/* Card: Report Period */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <div className="p-2 bg-red-50 rounded-xl">
            <CalendarDaysIcon className="w-5 h-5 text-[#f73727]" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">รอบการจ่ายเงิน</h2>
            <p className="text-xs text-gray-500 mt-0.5">กำหนดรอบที่แสดงในอีเมลสรุปการจ่ายเงินที่ส่งให้ Freelancer</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-48 rounded-xl" />
              <Skeleton className="h-10 w-64 rounded-xl" />
              <Skeleton className="h-4 w-64 rounded-md" />
            </div>
          ) : (
            <>
              {/* Current saved period */}
              {savedPeriod && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">รอบปัจจุบัน:</span>
                  <span className="px-3 py-1 bg-red-50 text-[#f73727] font-semibold rounded-xl text-sm">
                    {savedPeriod}
                  </span>
                </div>
              )}

              {/* Dropdowns */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">เดือน / ปี</label>
                <div className="flex items-center gap-3 flex-wrap">
                  <FormListbox
                    value={String(month)}
                    onChange={(v) => setMonth(Number(v))}
                    options={monthOptions}
                    buttonClassName="w-44"
                  />
                  <FormListbox
                    value={String(year)}
                    onChange={(v) => setYear(Number(v))}
                    options={yearOptions}
                    buttonClassName="w-28"
                  />
                </div>
              </div>

              {/* Billing cycle */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">รอบการจ่าย</label>
                <div className="flex gap-3">
                  {([
                    { value: 'mid' as BillingCycle, label: 'กลางเดือน', day: midDay },
                    { value: 'end' as BillingCycle, label: 'สิ้นเดือน',  day: endDay },
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setBillingCycle(opt.value)}
                      className={`flex-1 flex flex-col items-center px-4 py-3 rounded-xl border-2 font-medium transition-colors ${
                        billingCycle === opt.value
                          ? 'border-[#f73727] bg-red-50 text-[#f73727]'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <span className="text-sm font-semibold">{opt.label}</span>
                      <span className={`text-xl font-bold mt-1 ${billingCycle === opt.value ? 'text-[#f73727]' : 'text-gray-400'}`}>
                        {opt.day}
                      </span>
                      <span className="text-xs mt-0.5 opacity-60">{MONTH_LABELS[month - 1]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-600">
                <span className="font-medium text-gray-700">ตัวอย่างหัวเรื่องอีเมล: </span>
                สรุปรายได้ของคุณประจำ<span className="font-semibold text-[#f73727]">{previewPeriod}</span>
              </div>

              {/* Save button */}
              <div className="flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={saving || !isDirty}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#f73727] text-white text-sm font-medium rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {saving && (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  <ArrowDownTrayIcon className="w-4 h-4" />
                  บันทึกการตั้งค่า
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
