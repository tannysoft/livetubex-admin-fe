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
} from 'firebase/firestore'
import { db } from './firebase'
import type { Job, Freelancer, JobAssignment, Payment, DashboardStats } from './types'

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
 * Self-registration จาก LIFF:
 * - ถ้ายังไม่มี doc → สร้างใหม่ด้วย lineUserId เป็น key
 * - ถ้ามีแล้ว → update เฉพาะ field ที่ส่งมา (ไม่แตะ totalEarned, createdAt)
 */
export async function upsertFreelancerByLineId(
  lineUserId: string,
  data: {
    lineDisplayName: string
    linePictureUrl?: string
    name: string
    phone: string
    email?: string
    bankAccount: string
    bankName: string
    idCardImageUrl?: string
  }
): Promise<string> {
  const existing = await getFreelancerByLineId(lineUserId)

  if (existing) {
    // อัปเดตเฉพาะ field ที่ Freelancer แก้ได้
    const updateData: Record<string, unknown> = {
      lineDisplayName: data.lineDisplayName,
      linePictureUrl: data.linePictureUrl ?? '',
      name: data.name,
      phone: data.phone,
      email: data.email ?? '',
      bankAccount: data.bankAccount,
      bankName: data.bankName,
    }
    if (data.idCardImageUrl) {
      updateData.idCardImageUrl = data.idCardImageUrl
    }
    await updateDoc(doc(db, 'freelancers', existing.id), updateData)
    return existing.id
  }

  // สร้างใหม่
  const docRef = await addDoc(collection(db, 'freelancers'), {
    lineUserId,
    lineDisplayName: data.lineDisplayName,
    linePictureUrl: data.linePictureUrl ?? '',
    name: data.name,
    phone: data.phone,
    email: data.email ?? '',
    bankAccount: data.bankAccount,
    bankName: data.bankName,
    idCardImageUrl: data.idCardImageUrl ?? '',
    totalEarned: 0,
    isActive: true,
    createdAt: new Date().toISOString(),
  })
  return docRef.id
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

// Freelancer ใช้ query ด้วย lineUserId (ตรงกับ request.auth.uid)
// เพื่อให้ Firestore rules: resource.data.lineUserId == request.auth.uid ผ่าน
export async function getPaymentsByLineUserId(lineUserId: string): Promise<Payment[]> {
  const q = query(
    collection(db, 'payments'),
    where('lineUserId', '==', lineUserId),
    orderBy('requestedAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Payment))
}

// Admin ใช้ function นี้ (query ด้วย freelancerId = Firestore doc ID)
export async function getPaymentsByFreelancer(freelancerId: string): Promise<Payment[]> {
  const q = query(
    collection(db, 'payments'),
    where('freelancerId', '==', freelancerId),
    orderBy('requestedAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Payment))
}

export async function createPayment(data: Omit<Payment, 'id' | 'requestedAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'payments'), {
    ...data,
    requestedAt: new Date().toISOString(),
  })
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

export async function markPaymentPaid(id: string, freelancerId: string, amount: number, adminNotes?: string): Promise<void> {
  await updateDoc(doc(db, 'payments', id), {
    status: 'paid',
    paidAt: new Date().toISOString(),
    adminNotes: adminNotes || '',
  })
  // Update freelancer totalEarned
  const freelancer = await getFreelancer(freelancerId)
  if (freelancer) {
    await updateFreelancer(freelancerId, { totalEarned: (freelancer.totalEarned || 0) + amount })
  }
}

export async function rejectPayment(id: string, adminNotes?: string): Promise<void> {
  await updateDoc(doc(db, 'payments', id), {
    status: 'rejected',
    rejectedAt: new Date().toISOString(),
    adminNotes: adminNotes || '',
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
