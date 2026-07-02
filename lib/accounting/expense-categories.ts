import {
  collection, doc, addDoc, getDocs, query, orderBy, where, updateDoc, deleteDoc, setDoc, getDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { ExpenseCategory } from '../types'

const COL = 'expenseCategories'

// ชื่อหมวดสำหรับค่าจ้าง freelancer (ระบุหมวดจริงด้วย isFixed ไม่ใช่ชื่อ)
export const FREELANCER_PAYMENT_CATEGORY = 'ค่าจ้างทีมงาน'

/**
 * default categories ที่จะ seed ครั้งแรก
 * "ค่าจ้างทีมงาน" คือ fixed — เกี่ยวกับ freelancer payments
 */
export const DEFAULT_CATEGORIES: Omit<ExpenseCategory, 'id' | 'createdAt'>[] = [
  { name: FREELANCER_PAYMENT_CATEGORY, defaultWhtRate: 3, isFixed: true, order: 10 },
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
 * Get or create หมวดค่าจ้าง freelancer ("ค่าจ้างทีมงาน")
 *   - ระบุหมวดด้วย isFixed (ไม่ผูกชื่อ) → rename ได้โดยไม่หลุด
 *   - ถ้าหมวด fixed เดิมยังชื่อเก่า ("ค่าจ้างทำของ") จะ rename ให้เป็น "ค่าจ้างทีมงาน"
 */
export async function getOrCreateFreelancerPaymentCategory(): Promise<ExpenseCategory> {
  const all = await getExpenseCategories()
  // หาโดย isFixed ก่อน, ไม่งั้น fallback หาโดยชื่อ (กันสร้างซ้ำถ้า fixed flag หลุด)
  const found = all.find((c) => c.isFixed) ?? all.find((c) => c.name.trim() === FREELANCER_PAYMENT_CATEGORY)
  if (found) {
    const patch: Partial<Omit<ExpenseCategory, 'id' | 'createdAt'>> = {}
    if (!found.isFixed) patch.isFixed = true
    if (found.name !== FREELANCER_PAYMENT_CATEGORY) patch.name = FREELANCER_PAYMENT_CATEGORY
    if (Object.keys(patch).length > 0) {
      await updateExpenseCategory(found.id, patch)
      return { ...found, ...patch }
    }
    return found
  }

  // สร้างใหม่ถ้าหายไป (เผื่อ admin ลบโดยไม่ตั้งใจ)
  const now = new Date().toISOString()
  const docRef = doc(collection(db, COL))
  await setDoc(docRef, {
    name: FREELANCER_PAYMENT_CATEGORY,
    defaultWhtRate: 3,
    isFixed: true,
    order: 10,
    createdAt: now,
  })
  return { id: docRef.id, name: FREELANCER_PAYMENT_CATEGORY, defaultWhtRate: 3, isFixed: true, order: 10, createdAt: now }
}

/**
 * รวมหมวดที่ชื่อซ้ำกัน — เก็บตัวหลัก (isFixed ก่อน, ไม่งั้นเก่าสุด) แล้ว
 * ย้าย expenses จากตัวซ้ำ → ตัวหลัก (อัปเดต categoryId + categoryName) จากนั้นลบตัวซ้ำ
 * ปลอดภัย/idempotent — รันซ้ำได้
 */
export async function mergeDuplicateCategories(): Promise<{ groups: number; deleted: number; reassigned: number }> {
  const cats = await getExpenseCategories()
  const byName = new Map<string, ExpenseCategory[]>()
  for (const c of cats) {
    const key = c.name.trim()
    if (!byName.has(key)) byName.set(key, [])
    byName.get(key)!.push(c)
  }

  let groups = 0, deleted = 0, reassigned = 0
  for (const group of byName.values()) {
    if (group.length < 2) continue
    groups++
    // ตัวหลัก: isFixed ก่อน, ไม่งั้นเก่าสุดตาม createdAt
    const canonical = [...group].sort((a, b) => {
      const fx = (b.isFixed ? 1 : 0) - (a.isFixed ? 1 : 0)
      if (fx !== 0) return fx
      return (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
    })[0]

    for (const dup of group) {
      if (dup.id === canonical.id) continue
      // ย้าย expenses ที่ผูก dup → canonical
      const snap = await getDocs(query(collection(db, 'expenses'), where('categoryId', '==', dup.id)))
      for (const d of snap.docs) {
        await updateDoc(d.ref, { categoryId: canonical.id, categoryName: canonical.name })
        reassigned++
      }
      await deleteDoc(doc(db, COL, dup.id))
      deleted++
    }
  }
  return { groups, deleted, reassigned }
}

/** จำนวนหมวดที่ชื่อซ้ำกัน (สำหรับแสดงเตือน) */
export function countDuplicateCategories(cats: ExpenseCategory[]): number {
  const seen = new Map<string, number>()
  for (const c of cats) seen.set(c.name.trim(), (seen.get(c.name.trim()) ?? 0) + 1)
  let dups = 0
  for (const n of seen.values()) if (n > 1) dups += n - 1
  return dups
}
