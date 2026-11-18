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
  // มีสตางค์ = โชว์ 2 ตำแหน่งเสมอ (฿1,234.50 ไม่ใช่ ฿1,234.5) · จำนวนเต็มโชว์แบบเดิม
  const hasSatang = Math.abs(Math.round(amount * 100) % 100) !== 0
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: hasSatang ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

const TAX_RATE = 0.03

/** ทศนิยมของภาษีที่การเบิกใหม่ใช้ — createPayment ใส่ `taxDecimals` นี้ให้ทุกใบ */
export const PAYMENT_TAX_DECIMALS = 2

/**
 * คำนวณภาษีหัก ณ ที่จ่าย 3%
 * decimals 0 = ปัดเป็นบาท (การเบิกก่อน 4 พ.ย. 2569 — โอนไปตามนั้นแล้ว) · 2 = ถึงสตางค์
 */
export function calcTax(gross: number, decimals: number = PAYMENT_TAX_DECIMALS): { gross: number; tax: number; net: number } {
  const f = 10 ** decimals
  const tax = Math.round(gross * TAX_RATE * f + 1e-9) / f
  return { gross, tax, net: Math.round((gross - tax) * 100) / 100 }
}

/**
 * ทศนิยมภาษีของการเบิก 1 ใบ — ยังไม่โอน = ถึงสตางค์เสมอ (markPaymentPaid ประทับ taxDecimals: 2 ตอนโอน)
 * โอนแล้ว = ตามที่ประทับไว้ · ใบที่โอนก่อน 4 พ.ย. 2569 ไม่มี field = ปัดเป็นบาท (โอนไปตามนั้นแล้ว ห้ามคิดใหม่)
 */
export function paymentTaxDecimals(p: { status?: string; taxDecimals?: number }): number {
  return p.status === 'paid' ? (p.taxDecimals ?? 0) : PAYMENT_TAX_DECIMALS
}

/** ภาษีของการเบิก 1 ใบ */
export function paymentTax(p: { amount: number; status?: string; taxDecimals?: number }) {
  return calcTax(p.amount, paymentTaxDecimals(p))
}

/** ยอดโอนจริงของการเบิก 1 ใบ = สุทธิหลังหักภาษี + ค่าใช้จ่ายเบิกคืน (ไม่หัก 3%) */
export function paymentPayout(p: { amount: number; status?: string; taxDecimals?: number; expenseAmount?: number }) {
  return Math.round((paymentTax(p).net + (p.expenseAmount ?? 0)) * 100) / 100
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

export const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

export const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

/** ค.ศ. → พ.ศ. */
export function thaiYear(year: number): number {
  return year + 543
}

/** เช่น (2026, 8) → "สิงหาคม 2569" */
export function thaiMonthYearLabel(year: number, month: number): string {
  return `${THAI_MONTHS[month - 1] ?? month} ${thaiYear(year)}`
}

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

/**
 * งานที่ freelancer เลือกขอเบิกได้ใน LIFF — แอดมินเปิดให้แสดง + ถึงวันสุดท้ายของงานแล้ว (นับวันนี้ด้วย)
 * วันสุดท้าย = endDate (งานเว้นวันก็เป็นวันสุดท้ายจริง) ไม่มี = date · งานไม่มีวัน = เบิกไม่ได้
 */
export function isClaimableJob(job: { date?: string; endDate?: string; showInLiff?: boolean }): boolean {
  const lastDay = job.endDate || job.date
  if (job.showInLiff === false || !lastDay) return false
  // เทียบวันตามเวลาท้องถิ่น — ห้าม toISOString() (UTC เลื่อนวัน)
  return lastDay.slice(0, 10) <= format(new Date(), 'yyyy-MM-dd')
}
