import {
  collection, deleteDoc, deleteField, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import type {
  EquipmentPlan, PlanDiagram, PlanItem, PlanLayout, PlanRevision, PlanRevisionMeta, PlanRevisionSource,
} from '../types'
import { newId, stripUndefined } from './plans'

/**
 * Revision ของแผน — snapshot ของ รายการจัดของ + ผังระบบ + ผังวาง 3D
 * เก็บที่ equipmentPlans/{planId}/revisions/{id} (doc แยก ไม่ให้ plan doc โตจนชนเพดาน 1MB)
 * plan.revision = meta ของ revision ที่เนื้อหาตรงกับแผนล่าสุด (ไว้โชว์ Rev + เช็ก "แก้หลังจากนั้นแล้ว")
 *
 * ⚠️ ไม่ snapshot extraCosts และไม่ย้อน expenseId — ต้นทุนผูกกับบัญชี ย้อนแล้วยอดจะนับซ้ำ/หาย
 */

const revCol = (planId: string) => collection(db, 'equipmentPlans', planId, 'revisions')

type Content = Pick<EquipmentPlan, 'items' | 'diagrams' | 'layouts'>

// field ที่เป็น "ความคืบหน้าหน้างาน" หรือ "สถานะบัญชี" — ไม่นับเป็นการแก้แผน
const PROGRESS_FIELDS = new Set(['packed', 'returned', 'expenseId', 'expenseCode'])

/** JSON ที่เรียง key คงที่ — Firestore ไม่รับประกันลำดับ key ตอนอ่านกลับ */
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`).join(',')}}`
  }
  return JSON.stringify(v ?? null)
}

/** FNV-1a 32-bit — พอสำหรับเช็กว่าเนื้อหาเปลี่ยนไหม (ไม่ได้ใช้เพื่อความปลอดภัย) */
function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** ลายนิ้วมือของเนื้อหาแผน — ติ๊กจัดแล้ว/เก็บกลับ และการลงบัญชี ไม่ทำให้ hash เปลี่ยน */
export function planContentHash(p: Content): string {
  const items = p.items.map((it) => Object.fromEntries(Object.entries(it).filter(([k]) => !PROGRESS_FIELDS.has(k))))
  return fnv1a(stableStringify({ items, diagrams: p.diagrams, layouts: p.layouts ?? [] }))
}

/** แผนถูกแก้หลัง revision ล่าสุดหรือยัง (ยังไม่มี revision = ถือว่ายังไม่ได้บันทึก) */
export function isModifiedSinceRevision(p: EquipmentPlan): boolean {
  return !p.revision || p.revision.hash !== planContentHash(p)
}

export function revisionLabel(meta: Pick<PlanRevisionMeta, 'number' | 'label'>): string {
  return `Rev ${meta.number}${meta.label ? ` — ${meta.label}` : ''}`
}

function toMeta(r: PlanRevision): PlanRevisionMeta {
  return { id: r.id, number: r.number, ...(r.label ? { label: r.label } : {}), savedAt: r.createdAt, hash: r.hash }
}

export async function listRevisions(planId: string): Promise<PlanRevision[]> {
  const snap = await getDocs(query(revCol(planId), orderBy('number', 'desc')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PlanRevision))
}

export async function getRevision(planId: string, revId: string): Promise<PlanRevision | null> {
  const snap = await getDoc(doc(revCol(planId), revId))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as PlanRevision) : null
}

async function nextNumber(planId: string): Promise<number> {
  const snap = await getDocs(query(revCol(planId), orderBy('number', 'desc'), limit(1)))
  return (snap.docs[0]?.data().number ?? 0) + 1
}

/**
 * บันทึก revision ใหม่จากเนื้อหาปัจจุบัน แล้วตั้งเป็น plan.revision
 * เลขรันจากเลขสูงสุดที่มี +1 (แอดมินกดพร้อมกันแทบไม่เกิด — ยอมรับได้ ไม่ใช้ transaction)
 */
export async function createRevision(
  plan: EquipmentPlan,
  opts: { label?: string; note?: string; source: PlanRevisionSource; createdBy?: string },
): Promise<PlanRevisionMeta> {
  const number = await nextNumber(plan.id)
  const layouts = plan.layouts ?? []
  const rev: PlanRevision = {
    id: newId(),
    number,
    ...(opts.label?.trim() ? { label: opts.label.trim() } : {}),
    ...(opts.note?.trim() ? { note: opts.note.trim() } : {}),
    source: opts.source,
    createdAt: new Date().toISOString(),
    ...(opts.createdBy ? { createdBy: opts.createdBy } : {}),
    hash: planContentHash(plan),
    items: plan.items,
    diagrams: plan.diagrams,
    layouts,
    stats: {
      items: plan.items.length,
      pieces: plan.items.reduce((s, i) => s + (i.quantity || 0), 0),
      diagrams: plan.diagrams.length,
      nodes: plan.diagrams.reduce((s, d) => s + d.nodes.length, 0),
      edges: plan.diagrams.reduce((s, d) => s + d.edges.length, 0),
      layouts: layouts.length,
    },
  }
  const { id, ...data } = rev
  await setDoc(doc(revCol(plan.id), id), stripUndefined(data))
  const meta = toMeta(rev)
  await setPlanRevision(plan.id, meta)
  return meta
}

/** ตั้ง/ล้าง plan.revision — เขียนตรงเข้า doc ไม่ผ่าน autosave (autosave ไม่เขียน field นี้ จึงไม่ทับกัน) */
export async function setPlanRevision(planId: string, meta: PlanRevisionMeta | null): Promise<void> {
  await updateDoc(doc(db, 'equipmentPlans', planId), { revision: meta ? stripUndefined(meta) : deleteField() })
}

export async function deleteRevision(plan: EquipmentPlan, revId: string): Promise<void> {
  await deleteDoc(doc(revCol(plan.id), revId))
  if (plan.revision?.id === revId) await setPlanRevision(plan.id, null)
}

export function revisionMeta(r: PlanRevision): PlanRevisionMeta {
  return toMeta(r)
}

export interface RestoreResult {
  items: PlanItem[]
  diagrams: PlanDiagram[]
  layouts: PlanLayout[]
  /** แถวที่ลงบัญชีแล้วแต่ไม่มีใน revision — เก็บไว้ในแผนต่อ */
  keptLocked: PlanItem[]
}

/**
 * เนื้อหาหลังกู้คืน revision:
 * - แถวที่ยังมีอยู่ตอนนี้ คงสถานะจัดแล้ว/เก็บกลับ และการลงบัญชีของปัจจุบันไว้ (ไม่ย้อนความคืบหน้าหน้างาน)
 * - แถวที่ลงบัญชีแล้ว (expenseId) ห้ามหาย — ไม่มีใน revision ก็ต่อท้ายไว้ ไม่งั้นต้นทุนงานเพี้ยน
 */
export function restoreContent(current: EquipmentPlan, rev: PlanRevision): RestoreResult {
  const now = new Map(current.items.map((i) => [i.id, i]))
  // การลงบัญชีดูจากแผนปัจจุบันเท่านั้น — expenseId ใน snapshot อาจถูกยกเลิก/ถอดไปแล้ว
  const withoutAccounting = ({ expenseId: _e, expenseCode: _c, ...rest }: PlanItem): PlanItem => { void _e; void _c; return rest }
  const items: PlanItem[] = rev.items.map((it) => {
    const cur = now.get(it.id)
    // แถวที่ไม่มีแล้ว — เริ่มสถานะจัดของใหม่
    if (!cur) return { ...withoutAccounting(it), packed: false, returned: false }
    // ลงบัญชีแล้ว → จำนวน/ต้นทุนต้องตรงกับ Expense ใช้ของปัจจุบันทั้งแถว
    if (cur.expenseId) return cur
    // ไม่ย้อนความคืบหน้าหน้างาน (จัดแล้ว/เก็บกลับ)
    return { ...withoutAccounting(it), packed: cur.packed, returned: cur.returned }
  })
  const inRev = new Set(rev.items.map((i) => i.id))
  const keptLocked = current.items.filter((i) => i.expenseId && !inRev.has(i.id))
  return { items: [...items, ...keptLocked], diagrams: rev.diagrams, layouts: rev.layouts ?? [], keptLocked }
}
