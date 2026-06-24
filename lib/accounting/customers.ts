import {
  collection, doc, addDoc, getDoc, getDocs, query, orderBy, updateDoc, deleteDoc, where,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { Customer } from '../types'
import { nextDocNumber } from './doc-numbering'

const COL = 'customers'

export async function getCustomers(): Promise<Customer[]> {
  const q = query(collection(db, COL), orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Customer))
}

export async function getActiveCustomers(): Promise<Customer[]> {
  const q = query(collection(db, COL), where('isActive', '==', true))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Customer))
}

export async function getCustomer(id: string): Promise<Customer | null> {
  const snap = await getDoc(doc(db, COL, id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Customer
}

export type CustomerInput = Omit<Customer, 'id' | 'code' | 'createdAt' | 'updatedAt' | 'isActive'> & {
  isActive?: boolean
}

export async function createCustomer(data: CustomerInput): Promise<string> {
  const code = await nextDocNumber('customer')
  const now = new Date().toISOString()
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== ''))
  const ref = await addDoc(collection(db, COL), {
    ...clean,
    code,
    isActive: data.isActive ?? true,
    createdAt: now,
    updatedAt: now,
  })
  return ref.id
}

export async function updateCustomer(id: string, data: Partial<CustomerInput>): Promise<void> {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
  await updateDoc(doc(db, COL, id), {
    ...clean,
    updatedAt: new Date().toISOString(),
  })
}

export async function deleteCustomer(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id))
}
