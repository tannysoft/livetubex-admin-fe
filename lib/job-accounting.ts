import { doc, getDoc, setDoc, deleteField } from 'firebase/firestore'
import { db } from './firebase'

/**
 * สถานะทางบัญชีของงาน (วางบิล/รับเงิน ฯลฯ) — แก้ชื่อ/สี/ลำดับ/เพิ่ม/ลบได้ที่หน้างานถ่ายทอดสด
 * รายการเก็บที่ settings/jobAccounting · สถานะของแต่ละงานเก็บที่ jobFinance/{jobId}.accountingStatus (admin-only
 * เหมือน budget — ห้ามลง jobs doc เพราะ LIFF อ่าน jobs ได้)
 * สีเป็น hex ของข้อมูล (ผู้ใช้เลือกเอง) ไม่ใช่สีแบรนด์
 */
export interface AccountingStatusDef {
  id: string
  label: string
  color: string
}

export const DEFAULT_ACCOUNTING_STATUSES: AccountingStatusDef[] = [
  { id: 'unbilled', label: 'ยังไม่วางบิล', color: '#64748b' },
  { id: 'quoted', label: 'ส่งใบเสนอราคาแล้ว', color: '#0ea5e9' },
  { id: 'billed', label: 'วางบิลแล้ว', color: '#f59e0b' },
  { id: 'paid', label: 'รับเงินแล้ว', color: '#16a34a' },
]

export const ACCOUNTING_COLOR_PRESETS = [
  '#64748b', '#0ea5e9', '#2563eb', '#8b5cf6', '#db2777', '#dc2626', '#f59e0b', '#16a34a', '#0d9488',
]

const SETTINGS = doc(db, 'settings', 'jobAccounting')

export async function getAccountingStatuses(): Promise<AccountingStatusDef[]> {
  const snap = await getDoc(SETTINGS)
  const list = snap.exists() ? (snap.data().statuses as AccountingStatusDef[] | undefined) : undefined
  return list?.length ? list : DEFAULT_ACCOUNTING_STATUSES
}

export async function saveAccountingStatuses(statuses: AccountingStatusDef[]): Promise<void> {
  await setDoc(SETTINGS, { statuses, updatedAt: new Date().toISOString() })
}

/** '' = ไม่ระบุ (ลบ field) · merge ไม่ทับ budget */
export async function setJobAccountingStatus(jobId: string, statusId: string): Promise<void> {
  await setDoc(doc(db, 'jobFinance', jobId), { accountingStatus: statusId || deleteField() }, { merge: true })
}

/** สีพื้นอ่อน + ตัวอักษรสีเข้มจาก hex เดียว */
export function accountingPillStyle(color: string): { background: string; color: string } {
  return { background: `color-mix(in srgb, ${color} 14%, white)`, color: `color-mix(in srgb, ${color} 80%, black)` }
}
