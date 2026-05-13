import {
  collection, doc, addDoc, getDoc, getDocs, query, orderBy, where, updateDoc, deleteDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { Vendor } from '../types'
import { nextDocNumber } from './doc-numbering'

const COL = 'vendors'

export async function getVendors(): Promise<Vendor[]> {
  const q = query(collection(db, COL), orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Vendor))
}

export async function getActiveVendors(): Promise<Vendor[]> {
  const q = query(collection(db, COL), where('isActive', '==', true))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Vendor))
}

export async function getVendor(id: string): Promise<Vendor | null> {
  const snap = await getDoc(doc(db, COL, id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Vendor
}

export async function getVendorByFreelancerId(freelancerId: string): Promise<Vendor | null> {
  const q = query(collection(db, COL), where('freelancerId', '==', freelancerId))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() } as Vendor
}

export type VendorInput = Omit<Vendor, 'id' | 'code' | 'createdAt' | 'updatedAt' | 'isActive'> & {
  isActive?: boolean
}

export async function createVendor(data: VendorInput): Promise<string> {
  const code = await nextDocNumber('vendor')
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

export async function updateVendor(id: string, data: Partial<VendorInput>): Promise<void> {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
  await updateDoc(doc(db, COL, id), {
    ...clean,
    updatedAt: new Date().toISOString(),
  })
}

export async function deleteVendor(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id))
}
