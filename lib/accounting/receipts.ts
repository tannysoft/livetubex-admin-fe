import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc,
  query, orderBy, where, arrayUnion, runTransaction, increment,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { Invoice, InvoiceStatus, PaymentMethod, Receipt } from '../types'
import { nextDocNumber } from './doc-numbering'
import { round2 } from './calc'

const COL = 'receipts'

export async function getReceipts(): Promise<Receipt[]> {
  const q = query(collection(db, COL), orderBy('issueDate', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Receipt))
}

export async function getReceiptsByInvoice(invoiceId: string): Promise<Receipt[]> {
  const q = query(collection(db, COL), where('invoiceId', '==', invoiceId))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Receipt))
}

export async function getReceipt(id: string): Promise<Receipt | null> {
  const snap = await getDoc(doc(db, COL, id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Receipt
}

export interface IssueReceiptInput {
  invoice: Invoice
  taxInvoiceId?: string
  issueDate: string            // วันที่รับเงินจริง
  amount: number               // จำนวนที่รับครั้งนี้ (gross, ก่อน whtAmount)
  paymentMethod: PaymentMethod
  paymentRef?: string
  whtAmount?: number           // ลูกค้าหัก ณ ที่จ่ายเท่าไหร่
  whtCertReceived?: boolean
  bankAccountReceived?: string
  notes?: string
  createdBy: string
}

/**
 * ออกใบเสร็จรับเงิน + update invoice.paidAmount และ status:
 *   paidAmount + amount >= grandTotal → status = 'paid'
 *   paidAmount + amount > 0          → status = 'partial_paid'
 *   else                             → ไม่เปลี่ยน status
 *
 * ใช้ Firestore transaction ป้องกัน race (เช่นออก receipt 2 ใบพร้อมกัน)
 */
export async function issueReceipt(input: IssueReceiptInput): Promise<{ id: string; docNumber: string }> {
  const { invoice } = input
  const issueDateObj = new Date(input.issueDate + 'T00:00:00')
  const docNumber = await nextDocNumber('receipt', issueDateObj)
  const now = new Date().toISOString()
  const amount = round2(input.amount)

  // สร้าง receipt doc + update invoice ใน transaction เดียว
  const receiptRef = doc(collection(db, COL))

  await runTransaction(db, async (tx) => {
    const invoiceRef = doc(db, 'invoices', invoice.id)
    const invoiceSnap = await tx.get(invoiceRef)
    if (!invoiceSnap.exists()) throw new Error('Invoice not found')
    const invoiceData = invoiceSnap.data() as Invoice

    const currentPaid = invoiceData.paidAmount ?? 0
    const newPaid = round2(currentPaid + amount)

    // determine new status
    let newStatus: InvoiceStatus = invoiceData.status
    if (newPaid >= invoiceData.grandTotal) {
      newStatus = 'paid'
    } else if (newPaid > 0) {
      newStatus = 'partial_paid'
    }

    const payload = {
      docNumber,
      invoiceId: invoice.id,
      taxInvoiceId: input.taxInvoiceId,
      customerId: invoice.customerId,
      customerSnapshot: invoice.customerSnapshot,
      issueDate: input.issueDate,
      amount,
      paymentMethod: input.paymentMethod,
      paymentRef: input.paymentRef,
      whtAmount: input.whtAmount,
      whtCertReceived: input.whtCertReceived,
      bankAccountReceived: input.bankAccountReceived,
      notes: input.notes,
      status: 'issued' as const,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    }
    const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined))

    tx.set(receiptRef, clean)
    tx.update(invoiceRef, {
      receiptIds: arrayUnion(receiptRef.id),
      paidAmount: increment(amount),
      status: newStatus,
      updatedAt: now,
    })
  })

  return { id: receiptRef.id, docNumber }
}

/**
 * void ใบเสร็จ — เก็บ doc แต่ flag void + คืน paidAmount ของ invoice
 */
export async function voidReceipt(id: string, reason: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, COL, id)
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Receipt not found')
    const data = snap.data() as Receipt
    if (data.status === 'void') throw new Error('Receipt already voided')

    const invoiceRef = doc(db, 'invoices', data.invoiceId)
    const invoiceSnap = await tx.get(invoiceRef)
    if (!invoiceSnap.exists()) throw new Error('Invoice not found')
    const invoiceData = invoiceSnap.data() as Invoice

    const currentPaid = invoiceData.paidAmount ?? 0
    const newPaid = round2(Math.max(0, currentPaid - data.amount))

    let newStatus: InvoiceStatus = invoiceData.status
    if (newPaid >= invoiceData.grandTotal) {
      newStatus = 'paid'
    } else if (newPaid > 0) {
      newStatus = 'partial_paid'
    } else {
      // กลับเป็น sent (ถ้าเคย sent) หรือ draft
      newStatus = invoiceData.status === 'paid' || invoiceData.status === 'partial_paid' ? 'sent' : invoiceData.status
    }

    const now = new Date().toISOString()
    tx.update(ref, {
      status: 'void',
      voidReason: reason,
      voidedAt: now,
      updatedAt: now,
    })
    tx.update(invoiceRef, {
      paidAmount: increment(-data.amount),
      status: newStatus,
      updatedAt: now,
    })
  })
}
