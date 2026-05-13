import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc,
  query, orderBy, where, arrayUnion, runTransaction,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { Invoice, TaxInvoice } from '../types'
import { nextDocNumber } from './doc-numbering'

const COL = 'taxInvoices'

export async function getTaxInvoices(): Promise<TaxInvoice[]> {
  const q = query(collection(db, COL), orderBy('issueDate', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TaxInvoice))
}

export async function getTaxInvoicesByInvoice(invoiceId: string): Promise<TaxInvoice[]> {
  const q = query(collection(db, COL), where('invoiceId', '==', invoiceId))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TaxInvoice))
}

export async function getTaxInvoice(id: string): Promise<TaxInvoice | null> {
  const snap = await getDoc(doc(db, COL, id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as TaxInvoice
}

export interface IssueTaxInvoiceInput {
  invoice: Invoice
  issueDate: string         // YYYY-MM-DD (วันที่ส่งมอบ/รับเงิน — สำคัญสำหรับ VAT)
  items?: Invoice['items']  // optional override — ถ้าไม่ส่งจะใช้ทั้งหมดจาก invoice
  discountTotal?: number
  vatRate?: number
  whtRate?: number
  notes?: string
  createdBy: string
}

/**
 * ออกใบกำกับภาษีจากใบแจ้งหนี้:
 * - สร้าง taxInvoice doc ใหม่
 * - push id เข้า invoice.taxInvoiceIds (atomic)
 */
export async function issueTaxInvoice(input: IssueTaxInvoiceInput): Promise<{ id: string; docNumber: string }> {
  const { invoice } = input
  const issueDateObj = new Date(input.issueDate + 'T00:00:00')
  const docNumber = await nextDocNumber('taxInvoice', issueDateObj)
  const now = new Date().toISOString()

  // ถ้าไม่ระบุ items/totals จะใช้ทั้งหมดจาก invoice
  const items = input.items ?? invoice.items
  const discountTotal = input.discountTotal ?? invoice.discountTotal
  const vatRate = input.vatRate ?? invoice.vatRate
  const whtRate = input.whtRate ?? invoice.whtRate

  // คำนวณ totals ใหม่ (ใช้ logic เดียวกัน — กรณีแก้ items ก่อนออก)
  const { calcTotals } = await import('./calc')
  const totals = calcTotals({ items, discountTotal, vatRate, whtRate })

  const payload = {
    invoiceId: invoice.id,
    customerId: invoice.customerId,
    customerSnapshot: invoice.customerSnapshot,
    jobId: invoice.jobId,
    issueDate: input.issueDate,
    items,
    subtotal: totals.subtotal,
    discountTotal: totals.discountTotal,
    vatRate: totals.vatRate,
    vatAmount: totals.vatAmount,
    grandTotal: totals.grandTotal,
    whtRate: totals.whtRate,
    whtAmount: totals.whtAmount,
    netPayable: totals.netPayable,
    notes: input.notes,
    status: 'issued' as const,
    docNumber,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  }

  const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined))
  const ref = await addDoc(collection(db, COL), clean)

  // push id เข้า invoice.taxInvoiceIds
  await updateDoc(doc(db, 'invoices', invoice.id), {
    taxInvoiceIds: arrayUnion(ref.id),
    updatedAt: now,
  })

  return { id: ref.id, docNumber }
}

/**
 * ยกเลิกใบกำกับภาษี (void) — ห้ามแก้ ทำได้แค่ยกเลิก
 * เก็บ doc ไว้เหมือนเดิม (สำคัญสำหรับ audit) แต่ flag เป็น void
 */
export async function voidTaxInvoice(id: string, reason: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, COL, id)
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Tax invoice not found')
    const data = snap.data() as TaxInvoice
    if (data.status === 'void') throw new Error('Tax invoice already voided')
    tx.update(ref, {
      status: 'void',
      voidReason: reason,
      voidedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  })
}

/**
 * Mark ว่าใบกำกับภาษีถูกยื่นในงวด VAT แล้ว (สำหรับ ภพ.30)
 */
export async function markTaxInvoiceReported(id: string, vatPeriod: string): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    reportedInVatPeriod: vatPeriod,
    updatedAt: new Date().toISOString(),
  })
}
