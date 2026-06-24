import {
  collection, doc, addDoc, getDocs, query, orderBy, updateDoc, deleteDoc, setDoc, getDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { ExpenseCategory } from '../types'

const COL = 'expenseCategories'

/**
 * default categories ที่จะ seed ครั้งแรก
 * "ค่าจ้างทำของ" คือ fixed — เกี่ยวกับ freelancer payments
 */
export const DEFAULT_CATEGORIES: Omit<ExpenseCategory, 'id' | 'createdAt'>[] = [
  { name: 'ค่าจ้างทำของ',     defaultWhtRate: 3, isFixed: true, order: 10 },
  { name: 'ค่าบริการ',         defaultWhtRate: 3, order: 20 },
  { name: 'ค่าเช่า',           defaultWhtRate: 5, order: 30 },
  { name: 'ค่าน้ำ-ไฟ-อินเทอร์เน็ต', order: 40 },
  { name: 'ค่าอุปกรณ์/วัสดุ',  order: 50 },
  { name: 'ค่าเดินทาง',        order: 60 },
  { name: 'ค่าโฆษณา/การตลาด', defaultWhtRate: 2, order: 70 },
  { name: 'ค่าธรรมเนียม',      order: 80 },
  { name: 'อื่นๆ',              order: 999 },
]

export async function getExpenseCategories(): Promise<ExpenseCategory[]> {
  const q = query(collection(db, COL), orderBy('order', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ExpenseCategory))
}

export async function getExpenseCategory(id: string): Promise<ExpenseCategory | null> {
  const snap = await getDoc(doc(db, COL, id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as ExpenseCategory
}

/**
 * seed default categories ถ้า collection ยังว่าง — เรียกครั้งเดียวจากหน้า expense categories
 */
export async function seedDefaultCategoriesIfEmpty(): Promise<void> {
  const existing = await getExpenseCategories()
  if (existing.length > 0) return

  const now = new Date().toISOString()
  await Promise.all(
    DEFAULT_CATEGORIES.map((c) =>
      addDoc(collection(db, COL), { ...c, createdAt: now })
    )
  )
}

export async function createExpenseCategory(data: Omit<ExpenseCategory, 'id' | 'createdAt'>): Promise<string> {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
  const ref = await addDoc(collection(db, COL), {
    ...clean,
    createdAt: new Date().toISOString(),
  })
  return ref.id
}

export async function updateExpenseCategory(id: string, data: Partial<Omit<ExpenseCategory, 'id' | 'createdAt'>>): Promise<void> {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
  await updateDoc(doc(db, COL, id), clean)
}

export async function deleteExpenseCategory(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id))
}

/**
 * Get or create "ค่าจ้างทำของ" — ใช้สำหรับ link freelancer payments
 */
export async function getOrCreateFreelancerPaymentCategory(): Promise<ExpenseCategory> {
  const all = await getExpenseCategories()
  const found = all.find((c) => c.name === 'ค่าจ้างทำของ' && c.isFixed)
  if (found) return found

  // สร้างใหม่ถ้าหายไป (เผื่อ admin ลบโดยไม่ตั้งใจ)
  const now = new Date().toISOString()
  const docRef = doc(collection(db, COL))
  await setDoc(docRef, {
    name: 'ค่าจ้างทำของ',
    defaultWhtRate: 3,
    isFixed: true,
    order: 10,
    createdAt: now,
  })
  return { id: docRef.id, name: 'ค่าจ้างทำของ', defaultWhtRate: 3, isFixed: true, order: 10, createdAt: now }
}
