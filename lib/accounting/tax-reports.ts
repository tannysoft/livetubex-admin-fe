import {
  collection, getDocs, query, where, orderBy,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { Expense, TaxInvoice } from '../types'

/**
 * Fetch tax invoices ภายในงวดภาษี (issueDate ใน month-year นั้น)
 * — exclude void
 */
export async function getTaxInvoicesByPeriod(year: number, month: number): Promise<TaxInvoice[]> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const endMonth = month === 12 ? 1 : month + 1
  const endYear = month === 12 ? year + 1 : year
  const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01`

  const q = query(
    collection(db, 'taxInvoices'),
    where('issueDate', '>=', start),
    where('issueDate', '<', end),
    orderBy('issueDate', 'asc'),
  )
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as TaxInvoice))
    .filter((t) => t.status !== 'void')
}

/**
 * Fetch expenses ที่มี VAT (hasVat=true) ในงวด — สำหรับภพ.30 ฝั่งภาษีซื้อ
 */
export async function getVatExpensesByPeriod(year: number, month: number): Promise<Expense[]> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const endMonth = month === 12 ? 1 : month + 1
  const endYear = month === 12 ? year + 1 : year
  const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01`

  const q = query(
    collection(db, 'expenses'),
    where('date', '>=', start),
    where('date', '<', end),
    orderBy('date', 'asc'),
  )
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Expense))
    .filter((e) => e.hasVat && e.status !== 'cancelled')
}

/**
 * Fetch expenses ที่มี WHT (whtAmount>0) ในงวด — สำหรับภงด.3/53
 */
export async function getWhtExpensesByPeriod(year: number, month: number): Promise<Expense[]> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const endMonth = month === 12 ? 1 : month + 1
  const endYear = month === 12 ? year + 1 : year
  const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01`

  const q = query(
    collection(db, 'expenses'),
    where('date', '>=', start),
    where('date', '<', end),
    orderBy('date', 'asc'),
  )
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Expense))
    .filter((e) => (e.whtAmount ?? 0) > 0 && e.status !== 'cancelled')
}
