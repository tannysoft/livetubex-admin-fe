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
  name: string
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
  lineUserId: string          // ← เพิ่มเพื่อให้ Firestore rules ตรวจสอบได้
  jobAssignmentId: string
  jobId: string
  amount: number
  status: PaymentStatus
  requestedAt: string
  approvedAt?: string
  paidAt?: string
  rejectedAt?: string
  notes?: string
  adminNotes?: string
  // denormalized
  freelancerName?: string
  jobTitle?: string
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
