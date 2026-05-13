import type { DocumentItem } from '../types'

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * คำนวณ amount ของแต่ละ line item
 *   amount = round2(quantity * unitPrice - (discount ?? 0))
 */
export function calcLineAmount(quantity: number, unitPrice: number, discount?: number): number {
  return round2(quantity * unitPrice - (discount ?? 0))
}

export interface DocumentTotals {
  subtotal: number       // ก่อนหักส่วนลดท้ายเอกสาร + ก่อน VAT
  discountTotal: number  // ส่วนลดท้ายเอกสาร (overall)
  baseBeforeVat: number  // subtotal - discountTotal
  vatRate: number
  vatAmount: number
  grandTotal: number     // baseBeforeVat + vatAmount
  whtRate?: number
  whtAmount?: number     // WHT คำนวณจากฐานก่อน VAT (baseBeforeVat)
  netPayable?: number    // grandTotal - whtAmount (ถ้ามี)
}

export interface CalcTotalsInput {
  items: DocumentItem[]
  discountTotal?: number
  vatRate?: number       // default 7
  whtRate?: number
}

export function calcTotals({ items, discountTotal = 0, vatRate = 7, whtRate }: CalcTotalsInput): DocumentTotals {
  const subtotal = round2(items.reduce((s, it) => s + (it.amount ?? 0), 0))
  const baseBeforeVat = round2(subtotal - discountTotal)
  const vatAmount = round2(baseBeforeVat * vatRate / 100)
  const grandTotal = round2(baseBeforeVat + vatAmount)

  let whtAmount: number | undefined
  let netPayable: number | undefined
  if (typeof whtRate === 'number' && whtRate > 0) {
    whtAmount = round2(baseBeforeVat * whtRate / 100)
    netPayable = round2(grandTotal - whtAmount)
  }

  return {
    subtotal,
    discountTotal: round2(discountTotal),
    baseBeforeVat,
    vatRate,
    vatAmount,
    grandTotal,
    whtRate,
    whtAmount,
    netPayable,
  }
}

/**
 * แปลงตัวเลขเป็นข้อความภาษาไทย (สำหรับใบเสร็จ/ใบกำกับภาษี)
 * เช่น 1234.56 → "หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบหกสตางค์"
 */
export function bahtText(amount: number): string {
  const numbers = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
  const units = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน']

  function convertGroup(numStr: string): string {
    let result = ''
    const len = numStr.length
    for (let i = 0; i < len; i++) {
      const digit = parseInt(numStr[i], 10)
      const unitIdx = len - i - 1
      if (digit === 0) continue
      if (unitIdx === 1 && digit === 1) {
        result += 'สิบ'
      } else if (unitIdx === 1 && digit === 2) {
        result += 'ยี่สิบ'
      } else if (unitIdx === 0 && digit === 1 && len > 1) {
        result += 'เอ็ด'
      } else {
        result += numbers[digit] + units[unitIdx]
      }
    }
    return result
  }

  const isNegative = amount < 0
  const abs = Math.abs(amount)
  const fixed = abs.toFixed(2)
  const [bahtStr, satangStr] = fixed.split('.')

  let bahtPart = ''
  // แบ่งกลุ่มทุก 6 หลัก (ล้าน)
  let remaining = bahtStr
  while (remaining.length > 6) {
    const group = remaining.slice(0, remaining.length - 6)
    bahtPart += convertGroup(group) + 'ล้าน'
    remaining = remaining.slice(remaining.length - 6)
  }
  bahtPart += convertGroup(remaining)
  if (!bahtPart) bahtPart = 'ศูนย์'

  const satangNum = parseInt(satangStr, 10)
  const satangPart = satangNum > 0 ? convertGroup(satangStr.replace(/^0+/, '') || '0') + 'สตางค์' : 'ถ้วน'

  return (isNegative ? 'ลบ' : '') + bahtPart + 'บาท' + satangPart
}

// status labels (Thai)

export function quotationStatusLabel(status: string): string {
  return { draft:'แบบร่าง', sent:'ส่งแล้ว', accepted:'ตอบรับ', rejected:'ปฏิเสธ', expired:'หมดอายุ', converted:'แปลงเป็นใบแจ้งหนี้' }[status] ?? status
}

export function quotationStatusColor(status: string): string {
  return {
    draft: 'bg-gray-100 text-gray-700',
    sent: 'bg-blue-100 text-blue-700',
    accepted: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    expired: 'bg-orange-100 text-orange-700',
    converted: 'bg-purple-100 text-purple-700',
  }[status] ?? 'bg-gray-100 text-gray-700'
}

export function invoiceStatusLabel(status: string): string {
  return { draft:'แบบร่าง', sent:'ส่งแล้ว', partial_paid:'ชำระบางส่วน', paid:'ชำระแล้ว', overdue:'เกินกำหนด', cancelled:'ยกเลิก', void:'ยกเลิก' }[status] ?? status
}

export function invoiceStatusColor(status: string): string {
  return {
    draft: 'bg-gray-100 text-gray-700',
    sent: 'bg-blue-100 text-blue-700',
    partial_paid: 'bg-yellow-100 text-yellow-700',
    paid: 'bg-green-100 text-green-700',
    overdue: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-500',
    void: 'bg-gray-100 text-gray-500',
  }[status] ?? 'bg-gray-100 text-gray-700'
}
