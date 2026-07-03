export interface LiffUserProfile {
  userId: string
  displayName: string
  pictureUrl?: string
}

// ── Admin users & roles ──────────────────────────────────────────────────────
export type AdminRole = 'owner' | 'admin' | 'accountant'

export interface AdminUser {
  uid: string
  email: string
  name?: string
  role: AdminRole
  disabled: boolean
  createdAt?: string
  updatedAt?: string
  createdBy?: string
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
  budget?: number // ลับ — เก็บแยกที่ jobFinance/{jobId} (admin-only) ไม่เก็บใน jobs doc; ฝั่ง admin join ผ่าน getJobsWithBudget
  status: JobStatus
  paymentCycle?: string  // format: "YYYY-MM-mid" | "YYYY-MM-end"
  showInLiff?: boolean   // แสดงใน job selector ของ LIFF หน้าส่งเบิกหรือไม่ (default: true ถ้าไม่ระบุ)
  createdAt: string
  updatedAt: string
  coverImage?: string
  notes?: string
}

export interface Freelancer {
  id: string
  lineUserId: string
  lineDisplayName: string
  linePictureUrl?: string   // URL ดิบจาก LINE (ใช้ตรวจว่าเปลี่ยนรูปแล้วต้อง resync)
  profileImagePath?: string // Storage path สำเนารูป profile ที่ sync จาก LINE (เช่น profilePictures/{uid}/profile.jpg)
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
  payoutSlipPath?: string     // Storage path สลิปการโอนเงิน (เช่น payoutSlips/{freelancerId}/{ts}.jpg)
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

export interface LineMessageLog {
  id: string
  sentAt: string         // ISO datetime
  month: string          // YYYY-MM (Bangkok timezone)
  freelancerId: string
  freelancerName: string
  lineUserId: string
  paymentCount: number   // จำนวน payment ที่โอนในครั้งนี้
}

export interface AppSettings {
  reportPeriodMonth: number   // 1–12
  reportPeriodYear: number    // เช่น 2026
  billingCycle: BillingCycle  // กลางเดือน หรือ ปลายเดือน
  updatedAt?: string
}

// ─── Accounting (Phase 1) ────────────────────────────────────────────────────

export interface BankAccount {
  bankName: string
  accountNo: string
  accountName: string
  branch?: string
}

export interface CompanySettings {
  name: string                // บริษัท ไลฟ์ทูป เอ็กซ์ จำกัด
  nameEn?: string
  taxId: string               // เลขทะเบียนนิติบุคคล 13 หลัก
  branch: string              // "สำนักงานใหญ่" หรือ "สาขา 00001"
  address: string             // ที่อยู่เต็ม (รวมแขวง/เขต/จังหวัด/รหัสไปรษณีย์)
  phone?: string
  email?: string
  website?: string
  logoPath?: string           // Storage path (optional — ใช้ /icons/logo สำหรับ default)
  signaturePath?: string      // ลายเซ็นผู้มีอำนาจ (Storage path)
  bankAccounts: BankAccount[]
  vatRate: number             // default 7
  updatedAt?: string
}

export type CustomerType = 'company' | 'individual'

export interface Customer {
  id: string
  code: string                // CUS-0001
  name: string                // ชื่อบริษัท/บุคคล
  type: CustomerType
  taxId?: string              // เลขผู้เสียภาษี 13 หลัก
  branch?: string             // "สำนักงานใหญ่" | "สาขา 00001"
  address: string             // ที่อยู่เต็ม
  phone?: string
  email?: string
  contactPerson?: string
  notes?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

// ─── Documents (Quotation / Invoice / TaxInvoice / Receipt) ──────────────────

export type DocumentType = 'quotation' | 'invoice' | 'taxInvoice' | 'receipt'

export interface DocumentItem {
  description: string
  quantity: number
  unitPrice: number
  discount?: number   // ส่วนลดเป็นจำนวนเงิน (per line)
  amount: number      // = round2(qty * unitPrice - discount)
}

// freeze ข้อมูลลูกค้า ณ วันที่ออกเอกสาร (ห้าม join live)
export interface CustomerSnapshot {
  customerId: string
  code: string
  name: string
  type: CustomerType
  taxId?: string
  branch?: string
  address: string
  contactPerson?: string
}

export type QuotationStatus =
  | 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted'

export interface Quotation {
  id: string
  docNumber: string            // QO6805-0001
  customerId: string
  customerSnapshot: CustomerSnapshot
  jobId?: string               // optional link
  issueDate: string            // ISO date
  validUntil: string           // ISO date
  items: DocumentItem[]
  subtotal: number             // sum(items.amount)
  discountTotal: number        // ส่วนลดรวม (เพิ่มเติมท้ายเอกสาร)
  vatRate: number              // 7 หรือ 0
  vatAmount: number
  grandTotal: number           // subtotal - discountTotal + vatAmount
  whtRate?: number             // 3, 5, 1, ...
  whtAmount?: number
  netPayable?: number          // grandTotal - whtAmount
  notes?: string
  status: QuotationStatus
  convertedToInvoiceId?: string
  createdBy: string            // admin uid
  createdAt: string
  updatedAt: string
}

export type InvoiceStatus =
  | 'draft' | 'sent' | 'partial_paid' | 'paid' | 'overdue' | 'cancelled' | 'void'

export interface Invoice {
  id: string
  docNumber: string            // IV6805-0001
  customerId: string
  customerSnapshot: CustomerSnapshot
  jobId?: string
  quotationId?: string         // ถ้ามาจาก quotation
  issueDate: string
  dueDate: string
  items: DocumentItem[]
  subtotal: number
  discountTotal: number
  vatRate: number
  vatAmount: number
  grandTotal: number
  whtRate?: number
  whtAmount?: number
  netPayable?: number
  notes?: string
  status: InvoiceStatus
  paidAmount: number           // running total จาก receipts
  taxInvoiceIds: string[]
  receiptIds: string[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type TaxInvoiceStatus = 'issued' | 'void'

export interface TaxInvoice {
  id: string
  docNumber: string            // TX6805-0001
  invoiceId: string            // ต้นทาง
  customerId: string
  customerSnapshot: CustomerSnapshot
  jobId?: string
  issueDate: string            // วันที่ส่งมอบ/รับเงิน (สำคัญ — ฐานในการยื่น VAT)
  items: DocumentItem[]
  subtotal: number
  discountTotal: number
  vatRate: number
  vatAmount: number
  grandTotal: number
  whtRate?: number
  whtAmount?: number
  netPayable?: number
  notes?: string
  status: TaxInvoiceStatus
  voidReason?: string
  voidedAt?: string
  reportedInVatPeriod?: string // "2026-05" — ติด flag เมื่อยื่น ภพ.30 แล้ว
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type ReceiptStatus = 'issued' | 'void'
export type PaymentMethod = 'cash' | 'transfer' | 'cheque' | 'credit_card' | 'other'

export interface Receipt {
  id: string
  docNumber: string            // RC6805-0001
  invoiceId: string
  taxInvoiceId?: string
  customerId: string
  customerSnapshot: CustomerSnapshot
  issueDate: string            // วันที่รับเงินจริง
  amount: number               // จำนวนที่รับ (gross)
  paymentMethod: PaymentMethod
  paymentRef?: string          // เลขเช็ค / ref โอน
  whtAmount?: number
  whtCertReceived?: boolean
  bankAccountReceived?: string // ชื่อธนาคาร / เลขบัญชี
  notes?: string
  status: ReceiptStatus
  voidReason?: string
  voidedAt?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

// counter doc structure (path: documentCounters/{YYYY-MM})
export interface DocumentCounter {
  quotation: number
  invoice: number
  taxInvoice: number
  receipt: number
  customer: number
  expense: number
  vendor: number
  updatedAt: string
}

// ─── Accounting Phase 2 — Vendors + Expenses ─────────────────────────────────

export type VendorType = 'company' | 'individual' | 'freelancer'

export interface Vendor {
  id: string
  code: string                // VEN-0001
  name: string
  type: VendorType            // freelancer = ผูกกับ freelancerId
  taxId?: string
  branch?: string
  address?: string
  phone?: string
  email?: string
  contactPerson?: string
  bankAccount?: string
  bankName?: string
  freelancerId?: string       // ถ้า type='freelancer' — ผูกกับ freelancers/{id}
  notes?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface ExpenseCategory {
  id: string
  name: string                // "ค่าจ้างทำของ", "ค่าเช่า", "ค่าน้ำ-ไฟ", "อุปกรณ์", ฯลฯ
  defaultWhtRate?: number     // default WHT % สำหรับ category นี้ (เช่น "ค่าจ้างทำของ" = 3%)
  isFixed?: boolean           // category พื้นฐาน (ห้ามลบ) เช่น "ค่าจ้างทำของ" สำหรับ freelancer
  order?: number              // sort order
  createdAt: string
}

export type ExpenseStatus = 'draft' | 'recorded' | 'paid' | 'cancelled'

export type ExpenseSourceType = 'manual' | 'freelancer_payment'

/**
 * รายจ่ายของบริษัท — ใช้บันทึก expense ทุกรายการที่ส่งผลต่องบกำไรขาดทุน
 *
 * ที่มา:
 *   manual:              admin บันทึกเอง (ค่าเช่า อุปกรณ์ ฯลฯ)
 *   freelancer_payment:  สร้างอัตโนมัติเมื่อ admin mark payment ของ freelancer เป็น "paid"
 */
export interface Expense {
  id: string
  code: string                // EX-0001
  sourceType: ExpenseSourceType
  paymentId?: string          // ถ้า sourceType='freelancer_payment' — ref ไปยัง payments/{id}
  jobId?: string              // โปรเจกต์/งานที่ผูกค่าใช้จ่ายนี้ (optional) → jobs/{id}
  jobTitle?: string           // snapshot ชื่องาน ณ ตอนบันทึก (กัน join live)
  vendorId?: string           // ถ้าซื้อจาก vendor (manual)
  vendorSnapshot?: {
    code: string
    name: string
    taxId?: string
  }
  categoryId: string
  categoryName: string        // snapshot ตอนสร้าง
  date: string                // ISO date (วันที่เกิดค่าใช้จ่ายจริง)
  description: string
  amount: number              // ยอดก่อน VAT (gross expense ที่ไม่หัก WHT)
  hasVat: boolean
  vatRate: number             // default 7 ถ้า hasVat
  vatAmount: number           // amount * vatRate / 100 ถ้า hasVat else 0
  whtRate?: number            // 3, 5, 1, ...
  whtAmount?: number          // amount * whtRate / 100
  totalAmount: number         // amount + vatAmount (รวม VAT) - WHT ที่บริษัทหักจ่ายให้
  paidAmount: number          // เงินที่จ่ายจริง (default = totalAmount)
  paymentMethod?: 'cash' | 'transfer' | 'cheque' | 'credit_card' | 'other'
  paymentRef?: string
  receiptImagePath?: string   // สลิป/ใบเสร็จที่ vendor ออกให้
  status: ExpenseStatus
  notes?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}
