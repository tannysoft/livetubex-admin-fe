import { format, parseISO } from 'date-fns'
import { th } from 'date-fns/locale'

/** แสดงวันแบบย่อสำหรับ pill เช่น "จ. 14 เม.ย." */
export function formatDatePill(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'EEE d MMM', { locale: th })
  } catch {
    return dateStr
  }
}

export function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'd MMM yyyy', { locale: th })
  } catch {
    return dateStr
  }
}

export function formatDateTime(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'd MMM yyyy HH:mm', { locale: th })
  } catch {
    return dateStr
  }
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 0,
  }).format(amount)
}

const TAX_RATE = 0.03

/** คำนวณภาษีหัก ณ ที่จ่าย 3% */
export function calcTax(gross: number): { gross: number; tax: number; net: number } {
  const tax = Math.round(gross * TAX_RATE)
  return { gross, tax, net: gross - tax }
}

export function jobStatusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: 'ร่าง',
    published: 'เปิดรับสมัคร',
    in_progress: 'กำลังดำเนินการ',
    completed: 'เสร็จสิ้น',
    cancelled: 'ยกเลิก',
  }
  return map[status] || status
}

export function jobStatusColor(status: string): string {
  const map: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    published: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-600',
  }
  return map[status] || 'bg-gray-100 text-gray-600'
}

export function paymentStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: 'รอดำเนินการ',
    approved: 'อนุมัติแล้ว',
    paid: 'จ่ายแล้ว',
    rejected: 'ปฏิเสธ',
  }
  return map[status] || status
}

export function paymentStatusColor(status: string): string {
  const map: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-blue-100 text-blue-700',
    paid: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-600',
  }
  return map[status] || 'bg-gray-100 text-gray-600'
}

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

/** แปลง paymentCycle value → label ภาษาไทย เช่น "2026-04-mid" → "กลางเดือนเมษายน 2569" */
export function paymentCycleLabel(value: string): string {
  const [year, month, cycle] = value.split('-')
  if (!year || !month || !cycle) return value
  const monthName = THAI_MONTHS[parseInt(month) - 1] ?? month
  const buddhistYear = parseInt(year) + 543
  const prefix = cycle === 'mid' ? 'กลางเดือน' : 'สิ้นเดือน'
  return `${prefix}${monthName} ${buddhistYear}`
}

/** สร้าง option list รอบจ่ายเงิน ย้อนหลัง 2 เดือน + ปัจจุบัน + ล่วงหน้า 3 เดือน */
export function generatePaymentCycleOptions(): { value: string; label: string }[] {
  const now = new Date()
  const options: { value: string; label: string }[] = []
  for (let offset = -2; offset <= 3; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    for (const cycle of ['mid', 'end'] as const) {
      const value = `${y}-${m}-${cycle}`
      options.push({ value, label: paymentCycleLabel(value) })
    }
  }
  return options
}

export function assignmentStatusLabel(status: string): string {
  const map: Record<string, string> = {
    invited: 'เชิญแล้ว',
    accepted: 'ยอมรับ',
    declined: 'ปฏิเสธ',
    completed: 'เสร็จสิ้น',
  }
  return map[status] || status
}
