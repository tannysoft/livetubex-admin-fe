import {
  collection, doc, addDoc, getDocs, query, orderBy, updateDoc, deleteDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { Equipment } from '../types'
import { nextDocNumber } from '../accounting/doc-numbering'

const COL = 'equipment'

export async function getEquipmentList(): Promise<Equipment[]> {
  const q = query(collection(db, COL), orderBy('code', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Equipment))
}

export type EquipmentInput = Omit<Equipment, 'id' | 'code' | 'createdAt' | 'updatedAt'>

export async function createEquipment(data: EquipmentInput): Promise<string> {
  const code = await nextDocNumber('equipment')
  const now = new Date().toISOString()
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== ''))
  const ref = await addDoc(collection(db, COL), { ...clean, code, createdAt: now, updatedAt: now })
  return ref.id
}

export async function updateEquipment(id: string, data: Partial<EquipmentInput>): Promise<void> {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
  await updateDoc(doc(db, COL, id), { ...clean, updatedAt: new Date().toISOString() })
}

export async function deleteEquipment(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id))
}
