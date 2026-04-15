import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  increment,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from './firebase'
import type { Job, Freelancer, JobAssignment, Payment, DashboardStats, Position, AppSettings, LineMessageLog } from './types'

// ─── Jobs ────────────────────────────────────────────────────────────────────

export async function getJobs(): Promise<Job[]> {
  const q = query(collection(db, 'jobs'), orderBy('date', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Job))
}

export async function getJob(id: string): Promise<Job | null> {
  const snap = await getDoc(doc(db, 'jobs', id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Job
}

export async function createJob(data: Omit<Job, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'jobs'), {
    ...data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  return ref.id
}

export async function updateJob(id: string, data: Partial<Job>): Promise<void> {
  await updateDoc(doc(db, 'jobs', id), { ...data, updatedAt: new Date().toISOString() })
}

export async function deleteJob(id: string): Promise<void> {
  await deleteDoc(doc(db, 'jobs', id))
}

// ─── Freelancers ─────────────────────────────────────────────────────────────

export async function getFreelancers(): Promise<Freelancer[]> {
  const q = query(collection(db, 'freelancers'), orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Freelancer))
}

export async function getFreelancer(id: string): Promise<Freelancer | null> {
  const snap = await getDoc(doc(db, 'freelancers', id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Freelancer
}

export async function getFreelancerByLineId(lineUserId: string): Promise<Freelancer | null> {
  const q = query(collection(db, 'freelancers'), where('lineUserId', '==', lineUserId))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() } as Freelancer
}

export async function createFreelancer(data: Omit<Freelancer, 'id' | 'createdAt' | 'totalEarned'>): Promise<string> {
  const ref = await addDoc(collection(db, 'freelancers'), {
    ...data,
    totalEarned: 0,
    createdAt: new Date().toISOString(),
  })
  return ref.id
}

export async function updateFreelancer(id: string, data: Partial<Freelancer>): Promise<void> {
  await updateDoc(doc(db, 'freelancers', id), data)
}

/**
 * Pre-generate a Firestore doc ID for a new freelancer.
 * ใช้ก่อนอัพโหลด ID card เพื่อให้ storage path ใช้ freelancerId ได้เลย
 */
export function generateFreelancerDocId(): string {
  return doc(collection(db, 'freelancers')).id
}

/**
 * Self-registration จาก LIFF:
 * - ถ้ายังไม่มี doc → สร้างใหม่ด้วย predefinedId (pre-generated ก่อน upload)
 * - ถ้ามีแล้ว → update เฉพาะ field ที่ส่งมา (ไม่แตะ totalEarned, createdAt)
 */
export async function upsertFreelancerByLineId(
  lineUserId: string,
  data: {
    lineDisplayName: string
    linePictureUrl?: string
    namePrefix: string
    firstName: string
    lastName: string
    phone: string
    email?: string
    bankAccount: string
    bankName: string
    idCardImagePath?: string  // storage path (ไม่ใช่ URL)
  },
  predefinedId?: string  // ส่งมาเฉพาะกรณีสร้างใหม่ (pre-generated ก่อน upload)
): Promise<string> {
  // ชื่อเต็ม ใช้สำหรับ denormalize ใน payments / assignments
  const fullName = `${data.namePrefix}${data.firstName} ${data.lastName}`

  const existing = await getFreelancerByLineId(lineUserId)

  if (existing) {
    const updateData: Record<string, unknown> = {
      lineDisplayName: data.lineDisplayName,
      linePictureUrl: data.linePictureUrl ?? '',
      namePrefix: data.namePrefix,
      firstName: data.firstName,
      lastName: data.lastName,
      name: fullName,
      phone: data.phone,
      email: data.email ?? '',
      bankAccount: data.bankAccount,
      bankName: data.bankName,
    }
    if (data.idCardImagePath) {
      updateData.idCardImagePath = data.idCardImagePath
    }
    await updateDoc(doc(db, 'freelancers', existing.id), updateData)
    return existing.id
  }

  // สร้างใหม่ — ใช้ predefinedId ถ้ามี (เพื่อให้ storage path ตรงกับ freelancerId)
  const newRef = predefinedId
    ? doc(db, 'freelancers', predefinedId)
    : doc(collection(db, 'freelancers'))
  await setDoc(newRef, {
    lineUserId,
    lineDisplayName: data.lineDisplayName,
    linePictureUrl: data.linePictureUrl ?? '',
    namePrefix: data.namePrefix,
    firstName: data.firstName,
    lastName: data.lastName,
    name: fullName,
    phone: data.phone,
    email: data.email ?? '',
    bankAccount: data.bankAccount,
    bankName: data.bankName,
    idCardImagePath: data.idCardImagePath ?? '',
    totalEarned: 0,
    isActive: true,
    createdAt: new Date().toISOString(),
  })
  return newRef.id
}

// ─── Job Assignments ─────────────────────────────────────────────────────────

export async function getAssignmentsByJob(jobId: string): Promise<JobAssignment[]> {
  const q = query(collection(db, 'jobAssignments'), where('jobId', '==', jobId))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as JobAssignment))
}

export async function getAssignmentsByFreelancer(freelancerId: string): Promise<JobAssignment[]> {
  const q = query(
    collection(db, 'jobAssignments'),
    where('freelancerId', '==', freelancerId),
    orderBy('assignedAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as JobAssignment))
}

export async function createAssignment(data: Omit<JobAssignment, 'id' | 'assignedAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'jobAssignments'), {
    ...data,
    assignedAt: new Date().toISOString(),
  })
  return ref.id
}

export async function updateAssignment(id: string, data: Partial<JobAssignment>): Promise<void> {
  await updateDoc(doc(db, 'jobAssignments', id), data)
}

export async function deleteAssignment(id: string): Promise<void> {
  await deleteDoc(doc(db, 'jobAssignments', id))
}

// ─── Payments ────────────────────────────────────────────────────────────────

export async function getPayments(): Promise<Payment[]> {
  const q = query(collection(db, 'payments'), orderBy('requestedAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Payment))
}

// query payments ด้วย freelancerId (Firestore doc ID) — ใช้ทั้ง Admin และ Freelancer LIFF
export async function getPaymentsByFreelancer(freelancerId: string): Promise<Payment[]> {
  const q = query(
    collection(db, 'payments'),
    where('freelancerId', '==', freelancerId),
    orderBy('requestedAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Payment))
}

export async function createPayment(
  data: Omit<Payment, 'id' | 'requestedAt'>,
  freelancerEmail?: string,
): Promise<string> {
  const requestedAt = new Date().toISOString()
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
  const ref = await addDoc(collection(db, 'payments'), { ...clean, requestedAt })

  // ส่งเมลแจ้งเตือน admin + freelancer (fire-and-forget)
  httpsCallable(functions, 'sendPaymentNotification')({
    ...clean,
    requestedAt,
    freelancerEmail: freelancerEmail ?? null,
  }).catch(() => {})

  return ref.id
}

export async function updatePayment(id: string, data: Partial<Payment>): Promise<void> {
  await updateDoc(doc(db, 'payments', id), data)
}

export async function approvePayment(id: string, adminNotes?: string): Promise<void> {
  await updateDoc(doc(db, 'payments', id), {
    status: 'approved',
    approvedAt: new Date().toISOString(),
    adminNotes: adminNotes || '',
  })
}

export async function markPaymentPaid(id: string, freelancerId: string, amount: number, adminNotes?: string, payoutSlipPath?: string): Promise<void> {
  await updateDoc(doc(db, 'payments', id), {
    status: 'paid',
    paidAt: new Date().toISOString(),
    adminNotes: adminNotes || '',
    ...(payoutSlipPath ? { payoutSlipPath } : {}),
  })
  // ใช้ increment() เพื่อหลีกเลี่ยง race condition (atomic server-side add)
  await updateDoc(doc(db, 'freelancers', freelancerId), {
    totalEarned: increment(amount),
  })
}

export async function rejectPayment(id: string, adminNotes?: string): Promise<void> {
  await updateDoc(doc(db, 'payments', id), {
    status: 'rejected',
    rejectedAt: new Date().toISOString(),
    adminNotes: adminNotes || '',
  })
}

// ─── Payment Report Email ─────────────────────────────────────────────────────

export interface FreelancerReportPayload {
  freelancerEmail: string
  freelancerName: string
  period: string
  payments: {
    workDescription: string
    position?: string
    workDates?: string[]
    amount: number
    paidAt?: string
  }[]
  totalGross: number
  totalTax: number
  totalNet: number
}

export async function sendPaymentReport(reports: FreelancerReportPayload[]): Promise<void> {
  await httpsCallable(functions, 'sendPaymentReport')({ reports })
}

export async function sendPayoutNotification(freelancerId: string, paymentIds: string[], payoutSlipPath?: string): Promise<void> {
  await httpsCallable(functions, 'sendPayoutNotification')({ freelancerId, paymentIds, payoutSlipPath })
}

// ─── Positions ───────────────────────────────────────────────────────────────

export async function getPositions(): Promise<Position[]> {
  const q = query(collection(db, 'positions'), orderBy('createdAt', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Position))
}

export async function createPosition(name: string): Promise<string> {
  const ref = await addDoc(collection(db, 'positions'), {
    name: name.trim(),
    createdAt: new Date().toISOString(),
  })
  return ref.id
}

export async function updatePosition(id: string, name: string): Promise<void> {
  await updateDoc(doc(db, 'positions', id), { name: name.trim() })
}

export async function deletePosition(id: string): Promise<void> {
  await deleteDoc(doc(db, 'positions', id))
}

// ─── App Settings ────────────────────────────────────────────────────────────

const SETTINGS_DOC = 'app'

export async function getAppSettings(): Promise<AppSettings | null> {
  const snap = await getDoc(doc(db, 'settings', SETTINGS_DOC))
  if (!snap.exists()) return null
  return snap.data() as AppSettings
}

export async function saveAppSettings(data: Omit<AppSettings, 'updatedAt'>): Promise<void> {
  await updateDoc(doc(db, 'settings', SETTINGS_DOC), {
    ...data,
    updatedAt: new Date().toISOString(),
  })
}

export async function initAppSettings(data: Omit<AppSettings, 'updatedAt'>): Promise<void> {
  // ใช้ setDoc เพื่อ create-or-update
  const { setDoc } = await import('firebase/firestore')
  await setDoc(doc(db, 'settings', SETTINGS_DOC), {
    ...data,
    updatedAt: new Date().toISOString(),
  })
}

// ─── Dashboard Stats ─────────────────────────────────────────────────────────

export async function getDashboardStats(): Promise<DashboardStats> {
  const [jobs, freelancers, payments] = await Promise.all([
    getDocs(collection(db, 'jobs')),
    getDocs(collection(db, 'freelancers')),
    getDocs(collection(db, 'payments')),
  ])

  const jobsData = jobs.docs.map((d) => d.data() as Job)
  const paymentsData = payments.docs.map((d) => d.data() as Payment)

  const activeJobs = jobsData.filter((j) => j.status === 'in_progress' || j.status === 'published').length
  const pendingPayments = paymentsData.filter((p) => p.status === 'pending' || p.status === 'approved').length
  const pendingPaymentAmount = paymentsData
    .filter((p) => p.status === 'pending' || p.status === 'approved')
    .reduce((sum, p) => sum + p.amount, 0)
  const totalPaidAmount = paymentsData
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0)

  return {
    totalJobs: jobs.size,
    activeJobs,
    totalFreelancers: freelancers.size,
    pendingPayments,
    totalPaidAmount,
    pendingPaymentAmount,
  }
}

// ─── LINE Message Logs ────────────────────────────────────────────────────────

export async function getLineMessageLogs(month: string): Promise<LineMessageLog[]> {
  const q = query(
    collection(db, 'lineMessageLogs'),
    where('month', '==', month),
    orderBy('sentAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as LineMessageLog))
}
