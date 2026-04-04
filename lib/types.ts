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
  idCardImageUrl?: string   // URL รูปสำเนาบัตรประชาชน (Firebase Storage)
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
  jobId?: string              // optional
  amount: number
  status: PaymentStatus
  workDescription: string     // รายละเอียดงานที่ทำ (freelancer กรอกเอง)
  workDates?: string[]        // วันที่ทำงาน (ISO date strings) เลือกได้หลายวัน
  requestedAt: string
  approvedAt?: string
  paidAt?: string
  rejectedAt?: string
  notes?: string              // หมายเหตุจาก freelancer
  adminNotes?: string         // หมายเหตุจาก admin
  // denormalized
  freelancerName?: string
  bankAccount?: string
  bankName?: string
}

export interface DashboardStats {
  totalJobs: number
  activeJobs: number
  totalFreelancers: number
  pendingPayments: number
  totalPaidAmount: number
  pendingPaymentAmount: number
}
