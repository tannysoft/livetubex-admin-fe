import { collection, deleteDoc, deleteField, doc, getDocs, query, updateDoc, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from './firebase'
import type { LineMessageLog } from './types'

/**
 * กลุ่ม LINE ที่บอทอยู่ — function `lineWebhook` จดให้เอง (join / ข้อความในกลุ่ม / leave)
 * ใช้เลือกปลายทางตอนส่งแผนจัดอุปกรณ์/ผังระบบ (`sendPlanToLine`)
 */
export interface LineGroup {
  id: string
  groupId: string
  name: string
  pictureUrl?: string
  active: boolean
  joinedAt?: string
  leftAt?: string
  lastEventAt: string
  label?: string
  hidden?: boolean
}

export const lineGroupName = (g: LineGroup) => g.label?.trim() || g.name || 'กลุ่ม LINE'

export async function getLineGroups(): Promise<LineGroup[]> {
  const snap = await getDocs(collection(db, 'lineGroups'))
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as LineGroup))
    .sort((a, b) => Number(b.active) - Number(a.active) || lineGroupName(a).localeCompare(lineGroupName(b), 'th'))
}

/** ชื่อเรียกในระบบ (ว่าง = ใช้ชื่อกลุ่มใน LINE) / ซ่อนจากตัวเลือกตอนส่ง */
export async function updateLineGroup(id: string, patch: { label?: string; hidden?: boolean }): Promise<void> {
  const data: Record<string, unknown> = {}
  if (patch.label !== undefined) data.label = patch.label.trim() ? patch.label.trim().slice(0, 80) : deleteField()
  if (patch.hidden !== undefined) data.hidden = patch.hidden
  await updateDoc(doc(db, 'lineGroups', id), data)
}

/** เอาออกจากรายการ — ถ้าบอทยังอยู่ในกลุ่ม มีข้อความใหม่เมื่อไหร่จะกลับมาเอง */
export async function deleteLineGroup(id: string): Promise<void> {
  await deleteDoc(doc(db, 'lineGroups', id))
}

/** URL ของ webhook ที่ต้องไปใส่ใน LINE Developers (Messaging API) */
export function lineWebhookUrl(): string {
  const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? ''
  return project ? `https://asia-southeast1-${project}.cloudfunctions.net/lineWebhook` : ''
}

export interface SendPlanResult {
  sent: string[]
  failed: { id: string; name: string; reason: string }[]
}

export async function sendPlanToLine(args: { planId: string; groupIds: string[]; freelancerIds: string[]; message?: string }): Promise<SendPlanResult> {
  const call = httpsCallable<typeof args, SendPlanResult>(functions, 'sendPlanToLine')
  return (await call(args)).data
}

export async function getPlanSendLogs(planId: string): Promise<LineMessageLog[]> {
  const snap = await getDocs(query(collection(db, 'lineMessageLogs'), where('planId', '==', planId)))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as LineMessageLog))
}
