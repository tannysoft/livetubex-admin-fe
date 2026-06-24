import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy, where,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { Customer, CustomerSnapshot, Quotation, QuotationStatus } from '../types'
import { nextDocNumber } from './doc-numbering'

const COL = 'quotations'

export function makeCustomerSnapshot(c: Customer): CustomerSnapshot {
  const snap: CustomerSnapshot = {
    customerId: c.id,
    code: c.code,
    name: c.name,
    type: c.type,
    address: c.address,
  }
  if (c.taxId) snap.taxId = c.taxId
  if (c.branch) snap.branch = c.branch
  if (c.contactPerson) snap.contactPerson = c.contactPerson
  return snap
}

export async function getQuotations(): Promise<Quotation[]> {
  const q = query(collection(db, COL), orderBy('issueDate', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Quotation))
}

export async function getQuotationsByCustomer(customerId: string): Promise<Quotation[]> {
  const q = query(
    collection(db, COL),
    where('customerId', '==', customerId),
    orderBy('issueDate', 'desc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Quotation))
}

export async function getQuotation(id: string): Promise<Quotation | null> {
  const snap = await getDoc(doc(db, COL, id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Quotation
}

export type QuotationInput = Omit<Quotation, 'id' | 'docNumber' | 'createdAt' | 'updatedAt'>

export async function createQuotation(data: QuotationInput): Promise<{ id: string; docNumber: string }> {
  const issueDate = data.issueDate ? new Date(data.issueDate + 'T00:00:00') : new Date()
  const docNumber = await nextDocNumber('quotation', issueDate)
  const now = new Date().toISOString()
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
  const ref = await addDoc(collection(db, COL), {
    ...clean,
    docNumber,
    createdAt: now,
    updatedAt: now,
  })
  return { id: ref.id, docNumber }
}

export async function updateQuotation(id: string, data: Partial<QuotationInput>): Promise<void> {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
  await updateDoc(doc(db, COL, id), {
    ...clean,
    updatedAt: new Date().toISOString(),
  })
}

export async function deleteQuotation(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id))
}

export async function setQuotationStatus(id: string, status: QuotationStatus, extra?: { convertedToInvoiceId?: string }): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    status,
    ...(extra?.convertedToInvoiceId ? { convertedToInvoiceId: extra.convertedToInvoiceId } : {}),
    updatedAt: new Date().toISOString(),
  })
}
