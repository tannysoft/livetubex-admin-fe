import {
  collection, doc, addDoc, getDoc, getDocs, query, orderBy, where, updateDoc, deleteDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { Expense, ExpenseCategory, ExpenseStatus, Vendor } from '../types'
import { nextDocNumber } from './doc-numbering'
import { round2 } from './calc'

const COL = 'expenses'

export async function getExpenses(): Promise<Expense[]> {
  const q = query(collection(db, COL), orderBy('date', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense))
}

export async function getExpensesByPeriod(year: number, month: number): Promise<Expense[]> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const endMonth = month === 12 ? 1 : month + 1
  const endYear = month === 12 ? year + 1 : year
  const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01`
  const q = query(
    collection(db, COL),
    where('date', '>=', start),
    where('date', '<', end),
    orderBy('date', 'desc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense))
}

export async function getExpense(id: string): Promise<Expense | null> {
  const snap = await getDoc(doc(db, COL, id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Expense
}

export async function getExpenseByPaymentId(paymentId: string): Promise<Expense | null> {
  const q = query(collection(db, COL), where('paymentId', '==', paymentId))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() } as Expense
}

/**
 * คำนวณ totalAmount, vatAmount, whtAmount จาก base
 *   - amount = base ก่อน VAT (gross expense)
 *   - vatAmount = amount * vatRate% (ถ้า hasVat)
 *   - whtAmount = amount * whtRate% (ถ้ามี)
 *   - totalAmount = amount + vatAmount (ราคาเต็มที่ต้องจ่าย ก่อนหัก WHT)
 *   - paidAmount (default) = totalAmount - whtAmount (เงินที่จ่ายจริง)
 */
export function calcExpenseTotals(input: { amount: number; hasVat: boolean; vatRate?: number; whtRate?: number }): {
  amount: number
  vatAmount: number
  whtAmount?: number
  totalAmount: number
  paidAmount: number
} {
  const amount = round2(input.amount)
  const vatAmount = input.hasVat ? round2(amount * (input.vatRate ?? 7) / 100) : 0
  const totalAmount = round2(amount + vatAmount)
  const whtAmount = input.whtRate && input.whtRate > 0 ? round2(amount * input.whtRate / 100) : undefined
  const paidAmount = round2(totalAmount - (whtAmount ?? 0))
  return { amount, vatAmount, whtAmount, totalAmount, paidAmount }
}

export type ExpenseInput = Omit<Expense, 'id' | 'code' | 'createdAt' | 'updatedAt'>

export async function createExpense(data: ExpenseInput): Promise<{ id: string; code: string }> {
  const code = await nextDocNumber('expense', new Date(data.date + 'T00:00:00'))
  const now = new Date().toISOString()
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
  const ref = await addDoc(collection(db, COL), {
    ...clean,
    code,
    createdAt: now,
    updatedAt: now,
  })
  return { id: ref.id, code }
}

export async function updateExpense(id: string, data: Partial<ExpenseInput>): Promise<void> {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
  await updateDoc(doc(db, COL, id), {
    ...clean,
    updatedAt: new Date().toISOString(),
  })
}

export async function setExpenseStatus(id: string, status: ExpenseStatus): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    status,
    updatedAt: new Date().toISOString(),
  })
}

export async function deleteExpense(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id))
}

export function makeVendorSnapshot(v: Vendor): { code: string; name: string; taxId?: string } {
  const snap: { code: string; name: string; taxId?: string } = {
    code: v.code,
    name: v.name,
  }
  if (v.taxId) snap.taxId = v.taxId
  return snap
}

export const expenseStatusLabel: Record<ExpenseStatus, string> = {
  draft: 'แบบร่าง',
  recorded: 'บันทึกแล้ว',
  paid: 'จ่ายแล้ว',
  cancelled: 'ยกเลิก',
}

export const expenseStatusColor: Record<ExpenseStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  recorded: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

export function categoryLabel(category: ExpenseCategory | undefined, fallback?: string): string {
  return category?.name ?? fallback ?? '—'
}
