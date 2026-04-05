export interface LiffUserProfile {
  userId: string
  displayName: string
  pictureUrl?: string
}

export type JobStatus = 'draft' | 'published' | 'in_progress' | 'completed' | 'cancelled'

export type PaymentStatus = 'pending' | 'approved' | 'paid' | 'rejected'

export type AssignmentStatus = 'invited' | 'accepted' | 'declined' | 'completed'

export interface Job {
  id: string
  title: string
  description: string
  date: string // ISO date string
  endDate?: string
  location: string
  clientName: string
  budget: number
  status: JobStatus
  createdAt: string
  updatedAt: string
  coverImage?: string
  notes?: string
}

export interface Freelancer {
  id: string
  lineUserId: string
  lineDisplayName: string
  linePictureUrl?: string
  namePrefix: string        // คำนำหน้า: นาย / นาง / นางสาว
  firstName: string         // ชื่อ
  lastName: string          // นามสกุล
  name: string              // ชื่อเต็ม (computed: namePrefix + firstName + ' ' + lastName)
  phone: string
  email?: string
  bankAccount: string
  bankName: string
  idCardImagePath?: string  // Storage path รูปสำเนาบัตรประชาชน (เช่น idCards/{uid}/id_card.jpg)
  idCardImageUrl?: string   // @deprecated: เก็บ URL เดิม (backward compat) — ใช้ idCardImagePath แทน
  totalEarned: number
  createdAt: string
  isActive: boolean
}

export interface JobAssignment {
  id: string
  jobId: string
  freelancerId: string
  role: string
  fee: number
  status: AssignmentStatus
  assignedAt: string
  completedAt?: string
  notes?: string
  // denormalized for display
  jobTitle?: string
  freelancerName?: string
}

export interface Payment {
  id: string
  freelancerId: string
  lineUserId: string          // ← ใช้ใน Firestore rules
  jobAssignmentId?: string    // optional — ถ้าผูกกับ assignment
  jobId: string               // relation → jobs collection
  amount: number
  status: PaymentStatus
  workDates?: string[]        // วันที่ทำงาน (ISO date strings) เลือกได้หลายวัน
  requestedAt: string
  approvedAt?: string
  paidAt?: string
  rejectedAt?: string
  notes?: string              // หมายเหตุจาก freelancer
  adminNotes?: string         // หมายเหตุจาก admin
  position?: string           // ตำแหน่งงาน
  expenseAmount?: number      // ค่าใช้จ่ายเพิ่มเติม (ไม่หัก 3%)
  expenseSlipPath?: string    // Storage path รูปสลิปค่าใช้จ่าย (เช่น expenseSlips/{uid}/{ts}.jpg)
  expenseSlipUrl?: string     // @deprecated: เก็บ URL เดิม (backward compat) — ใช้ expenseSlipPath แทน
  // backward-compat only (old data may have these)
  workDescription?: string
  freelancerName?: string
  bankAccount?: string
  bankName?: string
}

export interface Position {
  id: string
  name: string
  createdAt: string
}

export interface DashboardStats {
  totalJobs: number
  activeJobs: number
  totalFreelancers: number
  pendingPayments: number
  totalPaidAmount: number
  pendingPaymentAmount: number
}

export type BillingCycle = 'mid' | 'end'  // กลางเดือน (1–15) หรือ ปลายเดือน (16–สิ้นเดือน)

export interface AppSettings {
  reportPeriodMonth: number   // 1–12
  reportPeriodYear: number    // เช่น 2026
  billingCycle: BillingCycle  // กลางเดือน หรือ ปลายเดือน
  updatedAt?: string
}
