import { collection, doc, addDoc, getDocs, setDoc, updateDoc, deleteDoc, deleteField } from 'firebase/firestore'
import { db } from './firebase'
import type { CalendarEntry, Job } from './types'

const COL = 'calendarEntries'

/** สีโน้ต — hex คงที่ได้ (เป็นความหมายของข้อมูล ไม่ใช่สีแบรนด์) งานใช้สีแบรนด์ */
export const CALENDAR_COLORS = [
  { value: '#f59e0b', label: 'เหลือง' },
  { value: '#0ea5e9', label: 'ฟ้า' },
  { value: '#22c55e', label: 'เขียว' },
  { value: '#f43f5e', label: 'ชมพู' },
  { value: '#8b5cf6', label: 'ม่วง' },
  { value: '#64748b', label: 'เทา' },
]

export async function getCalendarEntries(): Promise<CalendarEntry[]> {
  const snap = await getDocs(collection(db, COL))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CalendarEntry))
}

export type CalendarEntryInput = Omit<CalendarEntry, 'id' | 'createdAt' | 'updatedAt'>

export async function addCalendarEntry(data: CalendarEntryInput): Promise<CalendarEntry> {
  const now = new Date().toISOString()
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== '')) as CalendarEntryInput
  const ref = await addDoc(collection(db, COL), { ...clean, createdAt: now, updatedAt: now })
  return { id: ref.id, ...clean, createdAt: now, updatedAt: now }
}

/** วางงานลงปฏิทิน — doc id = job-{jobId} กดซ้ำ/สร้างซ้ำก็ไม่เกิดรายการซ้ำ */
export async function addJobToCalendar(jobId: string): Promise<CalendarEntry> {
  const now = new Date().toISOString()
  const entry = { type: 'job' as const, jobId, createdAt: now, updatedAt: now }
  await setDoc(doc(db, COL, `job-${jobId}`), entry)
  return { id: `job-${jobId}`, ...entry }
}

/**
 * ป้าย "ลง Google Calendar แล้ว" — ลิงก์ของ Google ไม่บอกกลับว่าผู้ใช้กดบันทึกจริงไหม
 * จึงจดตอนกดปุ่ม (ผิดก็เอาป้ายออกเองได้) · งานที่ยังไม่อยู่บนปฏิทินงาน = สร้าง entry ให้ด้วย
 */
export async function setGoogleAdded(jobId: string, added: boolean): Promise<string | undefined> {
  const now = new Date().toISOString()
  const ref = doc(db, COL, `job-${jobId}`)
  try {
    await updateDoc(ref, { googleAddedAt: added ? now : deleteField(), updatedAt: now })
  } catch (e) {
    if (!added) throw e
    await setDoc(ref, { type: 'job', jobId, googleAddedAt: now, createdAt: now, updatedAt: now })
  }
  return added ? now : undefined
}

/**
 * ลิงก์ "เพิ่มลง Google Calendar" — เปิดหน้าสร้างนัดของ Google ที่กรอกให้แล้ว ผู้ใช้กดบันทึกเองในบัญชีตัวเอง
 * (ไม่ต้องใช้ API/สิทธิ์ใดๆ) · งานทั้งวัน: วันสิ้นสุดของ Google เป็นแบบไม่รวม จึง +1 วัน
 */
export function googleCalendarUrl(job: Pick<Job, 'title' | 'date' | 'endDate' | 'location' | 'clientName' | 'description'>): string {
  const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const start = new Date(job.date + 'T00:00:00')
  const end = new Date((job.endDate && job.endDate > job.date ? job.endDate : job.date) + 'T00:00:00')
  end.setDate(end.getDate() + 1)
  const details = [job.clientName && `ลูกค้า: ${job.clientName}`, job.description].filter(Boolean).join('\n\n')
  const q = new URLSearchParams({ action: 'TEMPLATE', text: job.title, dates: `${ymd(start)}/${ymd(end)}` })
  if (job.location) q.set('location', job.location)
  if (details) q.set('details', details)
  return `https://calendar.google.com/calendar/render?${q.toString().replace("%2F", "/")}`
}

/** ค่าว่าง = ลบ field (เช่น ล้างวันสิ้นสุด/โน้ต) */
export async function updateCalendarEntry(id: string, patch: Partial<CalendarEntryInput>): Promise<void> {
  const data = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === undefined || v === '' ? deleteField() : v]))
  await updateDoc(doc(db, COL, id), { ...data, updatedAt: new Date().toISOString() })
}

export async function deleteCalendarEntry(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id))
}
