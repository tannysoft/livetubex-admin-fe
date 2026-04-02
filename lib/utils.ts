import { format, parseISO } from 'date-fns'
import { th } from 'date-fns/locale'

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

export function assignmentStatusLabel(status: string): string {
  const map: Record<string, string> = {
    invited: 'เชิญแล้ว',
    accepted: 'ยอมรับ',
    declined: 'ปฏิเสธ',
    completed: 'เสร็จสิ้น',
  }
  return map[status] || status
}
