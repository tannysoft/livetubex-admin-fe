import { doc, getDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../firebase'
import { resolveLiffId } from '../line-config'
import type { EquipmentPlan, PlanItem, PlanLayout } from '../types'

/**
 * แชร์แผนให้ทีมงานดูบนมือถือ — ลิงก์ /share/plan?s={shareId} + รหัสผ่าน
 * `planShares/{planId}` เขียนผ่าน function setPlanShare เท่านั้น (hash รหัสผ่านฝั่ง server)
 */

export interface PlanShareStatus {
  shareId: string
  enabled: boolean
  updatedAt?: string
}

/** แผนที่หน้าแชร์ได้รับ — ตัดต้นทุน/ผู้ให้เช่า/บัญชีออกแล้ว ⚠️ ฝาแฝดของ sanitizePlan() ใน functions/src/plan-share.ts */
export type SharedPlanItem = Pick<PlanItem,
  'id' | 'code' | 'name' | 'category' | 'quantity' | 'fromLocation' | 'toLocation' | 'note' | 'attachedTo' | 'origin' | 'packed' | 'returned' | 'useFrom' | 'useTo'>

export interface SharedPlan extends Pick<EquipmentPlan,
  'title' | 'jobTitle' | 'date' | 'endDate' | 'location' | 'notes' | 'status' | 'videoFormat' | 'recordings' | 'fohFeeds' | 'diagrams'> {
  items: SharedPlanItem[]
  layouts: PlanLayout[]
  updatedAt?: string
  revision?: { number: number; label?: string; savedAt?: string }
}

export async function getPlanShareStatus(planId: string): Promise<PlanShareStatus | null> {
  const snap = await getDoc(doc(db, 'planShares', planId))
  if (!snap.exists()) return null
  const d = snap.data() as PlanShareStatus
  return { shareId: d.shareId, enabled: d.enabled, updatedAt: d.updatedAt }
}

export async function setPlanShare(args: { planId: string; enabled?: boolean; password?: string; regenerate?: boolean }): Promise<PlanShareStatus> {
  const call = httpsCallable<typeof args, PlanShareStatus>(functions, 'setPlanShare')
  return (await call(args)).data
}

export async function fetchSharedPlan(shareId: string, password: string): Promise<SharedPlan> {
  const call = httpsCallable<{ shareId: string; password: string }, SharedPlan>(functions, 'getSharedPlan')
  return (await call({ shareId, password })).data // password '' = ขอดูแบบ login แล้ว (LINE freelancer / admin)
}

export function planShareUrl(shareId: string): string {
  return `${window.location.origin}/share/plan?s=${encodeURIComponent(shareId)}`
}

/**
 * ลิงก์เปิดใน LINE (LIFF) — endpoint ของ LIFF คือ /freelancer จึงได้หน้า /freelancer/plan
 * freelancer ที่ลงทะเบียนแล้วดูได้เลยไม่ต้องใส่รหัส · ไม่ได้ตั้ง LIFF ID = ''
 */
export async function liffPlanUrl(shareId: string): Promise<string> {
  const id = await resolveLiffId()
  return id ? `https://liff.line.me/${id}/plan?s=${encodeURIComponent(shareId)}` : ''
}

/** error ของ callable → ข้อความภาษาคน */
export function shareErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string }
  if (e?.code === 'functions/not-found' && /deploy|internal/i.test(e.message ?? '')) return 'ยังไม่ได้ deploy ฟังก์ชันแชร์แผน'
  if (e?.code === 'functions/unavailable' || e?.code === 'functions/internal') return 'เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง'
  return e?.message || 'ทำรายการไม่สำเร็จ'
}
