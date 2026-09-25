import {
  collection, doc, addDoc, getDoc, getDocs, query, orderBy, updateDoc, deleteDoc, writeBatch, where,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { EquipmentPlan } from '../types'

const COL = 'equipmentPlans'

/** Firestore ไม่รับ undefined — แผนมี object ซ้อนหลายชั้น (items/nodes/edges) จึงต้องล้างแบบ deep */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefined) as T
  // เข้าไปล้างเฉพาะ plain object — sentinel ของ Firestore (deleteField(), serverTimestamp()) ต้องส่งไปทั้งตัว
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, stripUndefined(v)]),
    ) as T
  }
  return value
}

function normalize(id: string, data: Record<string, unknown>): EquipmentPlan {
  const p = { id, ...data } as EquipmentPlan
  return { ...p, items: p.items ?? [], diagrams: p.diagrams ?? [] }
}

export async function getEquipmentPlans(): Promise<EquipmentPlan[]> {
  const q = query(collection(db, COL), orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => normalize(d.id, d.data()))
}

/** แผนที่ผูกกับงาน (jobId) */
export async function getPlansByJob(jobId: string): Promise<EquipmentPlan[]> {
  const snap = await getDocs(query(collection(db, COL), where('jobId', '==', jobId)))
  return snap.docs.map((d) => normalize(d.id, d.data()))
}

export async function getEquipmentPlan(id: string): Promise<EquipmentPlan | null> {
  const snap = await getDoc(doc(db, COL, id))
  if (!snap.exists()) return null
  return normalize(snap.id, snap.data())
}

export type EquipmentPlanInput = Omit<EquipmentPlan, 'id' | 'createdAt' | 'updatedAt'>

export async function createEquipmentPlan(data: EquipmentPlanInput): Promise<string> {
  const now = new Date().toISOString()
  const ref = await addDoc(collection(db, COL), { ...stripUndefined(data), createdAt: now, updatedAt: now })
  return ref.id
}

/**
 * เขียนทับทั้ง field ที่ส่งมา (items/diagrams เป็น array ทั้งก้อน)
 * field ที่ถูกล้างค่าในฟอร์มต้องส่งเป็น '' ไม่ใช่ undefined ไม่งั้นค่าเก่าจะค้าง
 */
export async function updateEquipmentPlan(id: string, data: Partial<EquipmentPlanInput>): Promise<void> {
  await updateDoc(doc(db, COL, id), { ...stripUndefined(data), updatedAt: new Date().toISOString() })
}

/** ลบแผน + revision ทั้งหมด (subcollection ไม่หายตาม doc แม่เองใน Firestore) */
export async function deleteEquipmentPlan(id: string): Promise<void> {
  const revs = await getDocs(collection(db, COL, id, 'revisions'))
  for (let i = 0; i < revs.docs.length; i += 400) {
    const batch = writeBatch(db)
    revs.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
  await deleteDoc(doc(db, COL, id))
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}
