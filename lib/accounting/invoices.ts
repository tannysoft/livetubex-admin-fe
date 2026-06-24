import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy, where,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { Invoice, InvoiceStatus, Quotation } from '../types'
import { nextDocNumber } from './doc-numbering'
import { setQuotationStatus } from './quotations'

const COL = 'invoices'

export async function getInvoices(): Promise<Invoice[]> {
  const q = query(collection(db, COL), orderBy('issueDate', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Invoice))
}

export async function getInvoicesByCustomer(customerId: string): Promise<Invoice[]> {
  const q = query(
    collection(db, COL),
    where('customerId', '==', customerId),
    orderBy('issueDate', 'desc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Invoice))
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const snap = await getDoc(doc(db, COL, id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Invoice
}

export type InvoiceInput = Omit<Invoice, 'id' | 'docNumber' | 'createdAt' | 'updatedAt' | 'paidAmount' | 'taxInvoiceIds' | 'receiptIds'> & {
  paidAmount?: number
  taxInvoiceIds?: string[]
  receiptIds?: string[]
}

export async function createInvoice(data: InvoiceInput): Promise<{ id: string; docNumber: string }> {
  const issueDate = data.issueDate ? new Date(data.issueDate + 'T00:00:00') : new Date()
  const docNumber = await nextDocNumber('invoice', issueDate)
  const now = new Date().toISOString()

  const payload = {
    ...data,
    paidAmount: data.paidAmount ?? 0,
    taxInvoiceIds: data.taxInvoiceIds ?? [],
    receiptIds: data.receiptIds ?? [],
    docNumber,
    createdAt: now,
    updatedAt: now,
  }

  const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined))
  const ref = await addDoc(collection(db, COL), clean)
  return { id: ref.id, docNumber }
}

export async function updateInvoice(id: string, data: Partial<InvoiceInput>): Promise<void> {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
  await updateDoc(doc(db, COL, id), {
    ...clean,
    updatedAt: new Date().toISOString(),
  })
}

export async function deleteInvoice(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id))
}

export async function setInvoiceStatus(id: string, status: InvoiceStatus): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    status,
    updatedAt: new Date().toISOString(),
  })
}

/**
 * แปลงใบเสนอราคา → ใบแจ้งหนี้
 * - ก๊อปข้อมูลทั้งหมดจาก quotation
 * - ตั้ง dueDate = issueDate + 30 วัน (default)
 * - mark quotation.status = 'converted' + เก็บ convertedToInvoiceId
 */
export async function convertQuotationToInvoice(quotation: Quotation, opts: { createdBy: string; dueDate?: string } = { createdBy: 'admin' }): Promise<{ id: string; docNumber: string }> {
  const issueDate = new Date().toISOString().slice(0, 10)

  const dueDate = opts.dueDate ?? (() => {
    const d = new Date(issueDate + 'T00:00:00')
    d.setDate(d.getDate() + 30)
    return d.toISOString().slice(0, 10)
  })()

  const result = await createInvoice({
    customerId: quotation.customerId,
    customerSnapshot: quotation.customerSnapshot,
    jobId: quotation.jobId,
    quotationId: quotation.id,
    issueDate,
    dueDate,
    items: quotation.items,
    subtotal: quotation.subtotal,
    discountTotal: quotation.discountTotal,
    vatRate: quotation.vatRate,
    vatAmount: quotation.vatAmount,
    grandTotal: quotation.grandTotal,
    whtRate: quotation.whtRate,
    whtAmount: quotation.whtAmount,
    netPayable: quotation.netPayable,
    notes: quotation.notes,
    status: 'draft',
    createdBy: opts.createdBy,
  })

  await setQuotationStatus(quotation.id, 'converted', { convertedToInvoiceId: result.id })

  return result
}
