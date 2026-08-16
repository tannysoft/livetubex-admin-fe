import type { Payment } from './types'
import { calcTax } from './utils'

/**
 * สรุปรายได้ Freelancer รายเดือน — ใช้ร่วมกันระหว่างหน้า admin (/admin/earnings)
 * และหน้า LIFF ของ freelancer (/freelancer/earnings)
 *
 * เกณฑ์: นับเฉพาะ payment ที่ status = 'paid' และเข้าเดือนตาม **วันที่จ่ายจริง** (paidAt)
 * — ตรงกับเงินที่โอนออกจริงและตรงกับฝั่งบัญชี (Expense/ภงด.) ที่สร้างตอน mark paid
 */

export type EarningsBasis = 'gross' | 'net' | 'payout'

export const EARNINGS_BASIS_LABELS: Record<EarningsBasis, string> = {
  gross: 'ยอดขอเบิก',
  net: 'สุทธิหลังหัก 3%',
  payout: 'ยอดโอนจริง',
}

export const EARNINGS_BASIS_HINTS: Record<EarningsBasis, string> = {
  gross: 'ยอดเต็มก่อนหักภาษี ณ ที่จ่าย',
  net: 'ยอดหลังหักภาษี 3% (ไม่รวมค่าใช้จ่าย)',
  payout: 'สุทธิ + ค่าใช้จ่ายที่เบิกคืน = เงินที่โอนจริง',
}

export interface EarningsTotals {
  count: number
  gross: number
  tax: number
  net: number
  expense: number
  /** = net + expense (ค่าใช้จ่ายเบิกคืนเต็มจำนวน ไม่หัก 3%) */
  payout: number
}

export interface EarningsEntry extends EarningsTotals {
  payment: Payment
  jobTitle: string
  /** "YYYY-MM" ตาม paidAt เวลาท้องถิ่น */
  monthKey: string
  year: number
  month: number
}

export interface MonthlyEarnings extends EarningsTotals {
  year: number
  month: number
  key: string
  entries: EarningsEntry[]
}

export const EMPTY_TOTALS: EarningsTotals = { count: 0, gross: 0, tax: 0, net: 0, expense: 0, payout: 0 }

/**
 * แปลง paidAt (ISO datetime แบบ UTC) → "YYYY-MM" ตามเวลาท้องถิ่น
 * ห้ามใช้ paidAt.slice(0,7) ตรงๆ เพราะ UTC+7 ทำให้รายการที่จ่ายช่วงเช้ามืดตกไปเดือนก่อนหน้า
 */
export function paidMonthParts(paidAt?: string): { year: number; month: number; key: string } | null {
  if (!paidAt) return null
  const d = new Date(paidAt)
  if (isNaN(d.getTime())) return null
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  return { year, month, key: `${year}-${String(month).padStart(2, '0')}` }
}

/** payment ที่จ่ายแล้ว + มี paidAt → entry พร้อมยอดที่คำนวณไว้แล้ว */
export function toEarningsEntries(
  payments: Payment[],
  jobTitleOf: (p: Payment) => string,
): EarningsEntry[] {
  const entries: EarningsEntry[] = []
  for (const payment of payments) {
    if (payment.status !== 'paid') continue
    const parts = paidMonthParts(payment.paidAt)
    if (!parts) continue
    const { tax, net } = calcTax(payment.amount)
    const expense = payment.expenseAmount ?? 0
    entries.push({
      payment,
      jobTitle: jobTitleOf(payment),
      monthKey: parts.key,
      year: parts.year,
      month: parts.month,
      count: 1,
      gross: payment.amount,
      tax,
      net,
      expense,
      payout: net + expense,
    })
  }
  return entries
}

export function sumEarnings(entries: EarningsTotals[]): EarningsTotals {
  return entries.reduce<EarningsTotals>(
    (acc, e) => ({
      count: acc.count + e.count,
      gross: acc.gross + e.gross,
      tax: acc.tax + e.tax,
      net: acc.net + e.net,
      expense: acc.expense + e.expense,
      payout: acc.payout + e.payout,
    }),
    { ...EMPTY_TOTALS },
  )
}

export function basisAmount(totals: EarningsTotals, basis: EarningsBasis): number {
  return basis === 'gross' ? totals.gross : basis === 'net' ? totals.net : totals.payout
}

/** ยอดรวมแยกราย 12 เดือนของปีที่ระบุ (index 0 = มกราคม) */
export function monthlyTotals(entries: EarningsEntry[], year: number): EarningsTotals[] {
  const buckets: EarningsTotals[] = Array.from({ length: 12 }, () => ({ ...EMPTY_TOTALS }))
  for (const e of entries) {
    if (e.year !== year) continue
    const b = buckets[e.month - 1]
    b.count += 1
    b.gross += e.gross
    b.tax += e.tax
    b.net += e.net
    b.expense += e.expense
    b.payout += e.payout
  }
  return buckets
}

/** จัดกลุ่มเป็นรายเดือน เฉพาะเดือนที่มีรายการ (ใหม่ → เก่า) */
export function groupByMonth(entries: EarningsEntry[], year?: number): MonthlyEarnings[] {
  const map = new Map<string, EarningsEntry[]>()
  for (const e of entries) {
    if (year != null && e.year !== year) continue
    const list = map.get(e.monthKey) ?? []
    list.push(e)
    map.set(e.monthKey, list)
  }
  const months: MonthlyEarnings[] = []
  for (const [key, list] of map) {
    const sorted = [...list].sort((a, b) => (b.payment.paidAt ?? '').localeCompare(a.payment.paidAt ?? ''))
    months.push({
      key,
      year: sorted[0].year,
      month: sorted[0].month,
      entries: sorted,
      ...sumEarnings(sorted),
    })
  }
  return months.sort((a, b) => b.key.localeCompare(a.key))
}

/** ปีที่มีรายได้ (ใหม่ → เก่า) — ใช้ทำ dropdown เลือกปี */
export function earningsYears(entries: EarningsEntry[]): number[] {
  return Array.from(new Set(entries.map((e) => e.year))).sort((a, b) => b - a)
}
