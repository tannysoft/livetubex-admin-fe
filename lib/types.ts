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
  docNumber?: string // เลขที่เอกสารอ้างอิงของงาน (เช่น เลขใบเสนอราคา/PO) — พิมพ์เอง ไม่ auto
  accountingStatus?: string // สถานะทางบัญชี (id จาก settings/jobAccounting) — ลับ เก็บที่ jobFinance/{jobId} เหมือน budget
  budget?: number // ลับ — เก็บแยกที่ jobFinance/{jobId} (admin-only) ไม่เก็บใน jobs doc; ฝั่ง admin join ผ่าน getJobsWithBudget
  status: JobStatus
  paymentCycle?: string  // format: "YYYY-MM-mid" | "YYYY-MM-end"
  showInLiff?: boolean   // แสดงใน job selector ของ LIFF หน้าส่งเบิกหรือไม่ (default: true ถ้าไม่ระบุ)
  createdAt: string
  updatedAt: string
  coverImage?: string
  notes?: string
}

/**
 * ปฏิทินงาน (`calendarEntries`) — 2 แบบ:
 * - job: ดึงงานจาก jobs มาแสดง (ชื่อ/วัน/สถานที่อ่านสดจาก jobs — แก้งานแล้วปฏิทินตาม) + โน้ตของปฏิทินเอง
 * - note: โน้ตอิสระ มีวัน/ช่วงวันของตัวเอง (เช่น "ส่งของคืนร้านเช่า", "ประชุมลูกค้า")
 */
export type CalendarEntryType = 'job' | 'note'
export interface CalendarEntry {
  id: string
  type: CalendarEntryType
  jobId?: string              // type='job'
  title?: string              // type='note'
  date?: string               // type='note' — YYYY-MM-DD
  endDate?: string            // type='note' — ว่าง = วันเดียว
  note?: string
  color?: string              // type='note' — hex จาก CALENDAR_COLORS
  googleAddedAt?: string      // type='job' — กดเพิ่มลง Google Calendar แล้วเมื่อไหร่ (ป้าย "Google ✓")
  createdAt: string
  updatedAt: string
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
  position?: string         // ตำแหน่งงานหลัก (ชื่อจาก positions) — เลือกตอนสมัคร LIFF / admin แก้ได้ · เป็นค่าตั้งต้นตอนขอเบิก
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
  paymentCount: number   // จำนวน payment ที่โอนในครั้งนี้ (kind 'job' = 0)
  kind?: 'payout' | 'job' | 'job_done' // ไม่มี = payout (ข้อมูลเก่า) · job = ส่งรายละเอียดงาน · job_done = แจ้งงานเสร็จสิ้น/เบิกเงิน (sendJobDetails)
  jobId?: string
  jobTitle?: string
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
  name: string                // ชื่อนิติบุคคลเต็ม เช่น บริษัท ตัวอย่าง จำกัด
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

// ── Equipment (อุปกรณ์ OB) ───────────────────────────────────────────────────
export type EquipmentCategory =
  | 'camera' | 'lens' | 'switcher' | 'audio' | 'monitor' | 'converter' | 'wireless' | 'recorder'
  | 'intercom' | 'network' | 'cable' | 'power' | 'support' | 'lighting' | 'other'

export type EquipmentStatus = 'available' | 'repair' | 'retired'

export interface Equipment {
  id: string
  code: string                // auto: EQ-0001 (running ไม่ reset)
  name: string                // ชื่อเรียก เช่น "CAM A", "ATEM 2 M/E"
  category: EquipmentCategory
  brand?: string
  model?: string
  serialNumber?: string
  quantity: number            // ของชิ้นเดียว = 1, ของนับจำนวน (สาย, ขาตั้ง) > 1
  storageLocation?: string    // ที่เก็บประจำ เช่น "ห้องเก็บของ A / ชั้น 2", "รถ OB"
  status: EquipmentStatus
  inputs?: string[]           // ชื่อ port ขาเข้า — ใช้เป็น template ตอนวางลงผังระบบ
  outputs?: string[]          // ชื่อ port ขาออก
  ios?: string[]              // port เข้า-ออกในตัวเดียว (bidirectional) เช่น 12G-SDI, Network, Intercom
  // ของเช่า = แค็ตตาล็อกของที่เช่าได้จากข้างนอก (ไม่ใช่ทรัพย์สินบริษัท) — เลือกเข้าแผนแล้วต้นทุนเติมให้เอง
  ownership?: 'owned' | 'rental' | 'partner'  // ไม่มี field = owned (ข้อมูลเก่า) · partner = ของพาร์ทเนอร์ที่เอามาร่วมงาน (เช่น Windblue)
  partnerName?: string        // ชื่อพาร์ทเนอร์ (ownership='partner')
  rentalVendor?: string       // ผู้ให้เช่า
  rentalRate?: number         // ราคาเช่าต่อชิ้นต่อวัน (ก่อน VAT)
  price?: number              // ราคาซื้อ/มูลค่าต่อชิ้น (บาท) — ไว้ประเมินมูลค่าของที่ขนไปงาน/ประกัน ไม่เข้าต้นทุนงาน
  notes?: string
  createdAt: string
  updatedAt: string
}

/** ประเภทสัญญาณ/สาย ของเส้นในผังระบบ */
export type SignalType =
  | 'sdi' | 'hdmi' | 'fiber' | 'audio' | 'network' | 'intercom' | 'control' | 'power' | 'other'

export interface DiagramNode {
  id: string
  equipmentId?: string        // ว่าง = กล่องอิสระ (ของสถานที่/ของลูกค้า ไม่อยู่ในสต็อก)
  planItemId?: string         // แถวในรายการของแผนที่กล่องนี้มาจาก — ใช้นับว่าวางไปแล้วกี่ตัว
  label: string
  sub?: string                // บรรทัดรอง เช่น รุ่น หรือจุดติดตั้ง
  category: EquipmentCategory
  x: number
  y: number
  inputs: string[]
  outputs: string[]
  ios?: string[]              // port เข้า-ออก — วางฝั่งขวาต่อจาก outputs โยงได้ทั้งสองทาง (ไม่มี field = ข้อมูลเก่า)
  note?: string               // หมายเหตุของกล่อง — โชว์ใต้ port ในผัง (ตัดที่ NOTE_MAX_LINES บรรทัด ฉบับเต็มอยู่ในหน้า print)
  generated?: 'foh'           // กล่องที่ปุ่ม "วาดลงผังระบบ" (ส่ง FOH) สร้าง — กดซ้ำจะลบชุดเดิมแล้ววาดใหม่ (กล่องอื่นในผังไม่แตะ)
}

export type PortSide = 'in' | 'out' | 'io'

export interface DiagramPortRef {
  nodeId: string
  side: PortSide
  index: number
}

export interface DiagramEdge {
  id: string
  from: DiagramPortRef
  to: DiagramPortRef
  signal: SignalType
  label?: string              // ชื่อ/ความยาวสาย เช่น "SDI 50m #12"
  note?: string
}

export interface PlanDiagram {
  id: string
  name: string                // เช่น "Video", "Audio", "Intercom"
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}

/** 1 แถวในรายการจัดของ — snapshot ชื่อ/รหัสไว้ กันของในสต็อกถูกแก้/ลบทีหลัง */
export interface PlanItem {
  id: string
  equipmentId?: string        // ว่าง = ของนอกสต็อก (พิมพ์ชื่อเอง)
  isRental?: boolean          // @deprecated → ใช้ origin (คงไว้อ่านข้อมูลเก่า)
  origin?: 'owned' | 'rental' | 'partner'  // ที่มาของของ — ไม่มี field = ดูจาก isRental/equipmentId (ข้อมูลเก่า)
  code?: string
  name: string
  category: EquipmentCategory
  quantity: number
  fromLocation?: string       // หยิบจากไหน (default = storageLocation ของอุปกรณ์)
  toLocation?: string         // โยกไปไหน เช่น "รถ OB", "FOH", "เวทีซ้าย"
  note?: string
  attachedTo?: string         // ติดกับแถวอื่นในแผน (PlanItem.id) เช่น เลนส์ → กล้อง — แสดง/พิมพ์ใต้แถวนั้น, ไม่มีแถวแม่แล้ว = แถวปกติ
  useFrom?: string            // ใช้ไม่เต็มงาน: ช่วงวันที่ใช้จริง (YYYY-MM-DD, อยู่ในวันงาน) — ว่าง = ทั้งงาน · เช็กคิวนับเฉพาะวันนี้
  useTo?: string              //   อ่านผ่าน itemRange()/clipItemRange() เสมอ (ตัดให้อยู่ในวันงานเอง)
  packed?: boolean            // จัดขึ้นรถแล้ว
  returned?: boolean          // เก็บกลับครบแล้ว
  // ── ต้นทุนค่าเช่า (เฉพาะของนอกสต็อก) — ยอด = unitCost × quantity × rentalDays (ก่อน VAT) ──
  rentalVendor?: string       // ผู้ให้เช่า / ชื่อพาร์ทเนอร์
  unitCost?: number           // ราคาเช่าต่อชิ้นต่อวัน (พาร์ทเนอร์ปกติ 0 — กรอกเมื่อมีข้อตกลงค่าใช้จ่าย)
  rentalDays?: number         // จำนวนวันเช่า (default 1)
  expenseId?: string          // ลงบัญชีแล้ว → expenses/{id} (ล็อกช่องต้นทุน กันยอดเพี้ยนจากบัญชี)
  expenseCode?: string        // snapshot เลข EX ไว้โชว์
}

// ── ผังวางอุปกรณ์ 3D — หน่วยเป็นเมตร, x = ซ้าย-ขวา, z = ลึก (เวทีอยู่ฝั่ง -z), y = สูง ──
export type VenueShape = 'arena' | 'hall'

export interface VenueConfig {
  presetId?: string
  name: string
  shape: VenueShape           // arena = พื้น + อัฒจันทร์ขั้นบันไดล้อม, hall = ห้องโล่ง
  width: number               // พื้นที่ราบ กว้าง (x)
  depth: number               // พื้นที่ราบ ลึก (z)
  height: number              // ความสูงถึงเพดาน/โครงหลังคา
  stage: { enabled: boolean; width: number; depth: number; height: number; offset: number } // offset = ระยะจากผนังหลัง
  // เฉพาะ arena — curved = ชามวงรีล้อมรอบทุกด้าน (width/depth คือแกนของพื้นวงรี, back/sides/front ไม่มีผล)
  // aisleWidth/sectionWidth = ทางเดินขึ้นอัฒจันทร์ (แบ่งที่นั่งเป็นบล็อกกว้าง sectionWidth คั่นด้วยทางเดินกว้าง aisleWidth) — ไม่มี = ไม่แบ่ง
  // crossAisle = ขั้นที่เป็นทางเดินขวาง (นับ 1 จากขั้นล่างสุด) คั่นอัฒจันทร์ชั้นล่าง/บน — ไม่มี/0 = ไม่มี · ใช้กับอัฒจันทร์เหลี่ยมเท่านั้น
  tiers?: {
    steps: number; rise: number; run: number; back: boolean; sides: boolean; front?: boolean; curved?: boolean
    aisleWidth?: number; sectionWidth?: number; crossAisle?: number
    /** ผนังตรงใต้ขั้นแรก สูงกี่ขั้น (นั่งไม่ได้) — ที่นั่งแถวแรกเริ่มที่ความสูง rise × (wallSteps + 1) เช่น Impact Arena = 3 */
    wallSteps?: number
    /** มุมระหว่างอัฒจันทร์ข้างกับหน้า/หลังเป็นโค้ง รัศมีกี่เมตร (ที่ขอบพื้นราบ) — 0/ไม่มี = มุมเหลี่ยม เช่น Impact Arena */
    cornerRadius?: number
  }
  pitch?: { width: number; depth: number } // สนามกีฬากลาง (หญ้า) เช่น ฟุตบอล 105×68 — วาดเป็นพื้นเขียวมีเส้นขอบ
  floorImageId?: string       // → equipmentPlanAssets/{id} (รูป floor plan จริงปูพื้น)
  floorImageWidth?: number    // ความกว้างจริงของรูป (เมตร) — ใช้คุมสเกล
  floorImageOffsetX?: number
  floorImageOffsetZ?: number
}

export type LayoutObjectKind =
  | 'camera' | 'jib' | 'ob_truck' | 'desk' | 'screen' | 'speaker' | 'riser' | 'podium' | 'gimbal' | 'remote_head' | 'micro_stand' | 'action_cam' | 'ptz' | 'tele_lens' | 'box_lens' | 'mirrorless' | 'control_room' | 'rack' | 'generic'

export interface LayoutObject {
  id: string
  planItemId?: string         // ผูกกับแถวในรายการอุปกรณ์ของแผน (optional)
  kind: LayoutObjectKind
  label: string
  x: number
  z: number
  y: number                   // ความสูงของพื้นผิวที่ตั้งอยู่ (พื้น/เวที/อัฒจันทร์) — ตั้งให้ตอนลาก
  rotation: number            // องศา, 0 = หันไปทางเวที (-z), หมุนตามเข็มเมื่อมองจากด้านบน
  mountHeight?: number        // กล้อง: ความสูงเลนส์จากพื้นผิว
  fov?: number                // กล้อง: มุมรับภาพแนวนอน (องศา)
  range?: number              // กล้อง: ความยาวกรวยที่วาด (เมตร)
  tilt?: number               // กล้อง: ก้ม(+)/เงย(-) องศา — มีผลเฉพาะมุมมองจากกล้อง
  w?: number                  // ขนาดกล่อง (จอ, riser, รถ OB, โต๊ะ)
  d?: number
  h?: number
  note?: string
  /** อยู่ใต้อัฒจันทร์ (เช่น ห้องคอนโทรล) — ตั้งบนพื้นจริง y = 0 และวาดแบบมองทะลุขั้นอัฒจันทร์ */
  underTier?: boolean
}

/** แนวเดินสายในผังวาง 3D — จากวัตถุหนึ่งไปอีกวัตถุ ผ่านจุดหักเลี้ยว (วาดแนบพื้น/ขั้นอัฒจันทร์ ความยาวคิดจากแนวจริง) */
export interface LayoutCable {
  id: string
  from: string                // LayoutObject.id ต้นทาง (เช่น กล้อง)
  to: string                  // LayoutObject.id ปลายทาง (เช่น รถ OB / FOH)
  points: { x: number; z: number }[]  // จุดหักเลี้ยวระหว่างทาง (ความสูงตามผิวที่จุดนั้นเอง)
  signal: SignalType
  label?: string              // เช่น "SDI #12", "Fiber LC 2 คอร์"
  note?: string
}

export interface PlanLayout {
  id: string
  name: string
  venue: VenueConfig
  objects: LayoutObject[]
  cables?: LayoutCable[]
}

/** ค่าใช้จ่ายอื่นของงานที่ไม่ใช่อุปกรณ์ (รถตู้, ที่พัก, อาหาร…) — ไม่โผล่ในใบจัดของ */
export interface PlanCost {
  id: string
  description: string
  categoryName: string        // ชื่อหมวดใน expenseCategories (เช่น "ค่าเดินทาง") — ใช้ตอนลงบัญชี
  vendor?: string             // ผู้รับเงิน
  quantity: number
  unitCost: number            // ต่อหน่วย ก่อน VAT
  note?: string
  expenseId?: string          // ลงบัญชีแล้ว → expenses/{id}
  expenseCode?: string
}

export type EquipmentPlanStatus = 'draft' | 'ready' | 'on_site' | 'returned'

export interface EquipmentPlan {
  id: string
  title: string
  jobId?: string              // ผูกกับ jobs/{id} (optional)
  jobTitle?: string           // snapshot
  date?: string               // ISO date วันแรกของงาน
  endDate?: string            // วันสุดท้าย (ว่าง = วันเดียว) — ใช้เช็กของชนกันระหว่างแผน
  location?: string
  status: EquipmentPlanStatus
  notes?: string
  items: PlanItem[]
  diagrams: PlanDiagram[]
  extraCosts?: PlanCost[]     // ค่าใช้จ่ายอื่นของงาน (optional — แผนเก่าไม่มี field นี้)
  layouts?: PlanLayout[]      // ผังวาง 3D (optional — แผนเก่าไม่มี field นี้)
  revision?: PlanRevisionMeta // revision ล่าสุดที่เนื้อหาตรงกับแผน (ไม่มี = ยังไม่เคยบันทึก revision)
  videoFormat?: VideoFormat   // ระบบภาพของงาน (1080i50 SDR ฯลฯ) — โชว์หัวกระดาษทุกหน้า + ส่งให้ผู้ช่วย AI
  recordings?: RecordingSpec[] // format ไฟล์บันทึก (PGM / ISO …) — โชว์หัวกระดาษ + ส่งให้ผู้ช่วย AI
  fohFeeds?: FohFeed[]        // สัญญาณที่ส่งให้ทีม Visual ที่ FOH (LED / media server) — หน้าพิมพ์แยก + ส่งให้ผู้ช่วย AI
  createdAt: string
  updatedAt: string
}

// ── Revision ของแผน (จัดของ + ผังระบบ + ผังวาง) — equipmentPlans/{planId}/revisions/{id} ──
export type PlanRevisionSource = 'manual' | 'agent' | 'restore'

/** สรุป revision ที่ฝังไว้ใน plan doc — ไว้โชว์ "Rev 3" และเช็กว่าแก้หลังจากนั้นหรือยัง (hash) */
export interface PlanRevisionMeta {
  id: string
  number: number
  label?: string
  savedAt: string
  hash: string                // planContentHash() ตอนบันทึก — ไม่รวม packed/returned/บัญชี
}

export interface PlanRevision {
  id: string
  number: number              // Rev 1, 2, 3 … ต่อแผน (ไม่ reset ตอนลบ)
  label?: string              // เช่น "ส่งทีมกล้อง", "หลังคุยลูกค้า"
  note?: string
  source: PlanRevisionSource  // manual = กดบันทึกเอง · agent = อัตโนมัติก่อนใช้ร่าง AI · restore = อัตโนมัติก่อนกู้คืน
  createdAt: string
  createdBy?: string          // อีเมล admin
  hash: string
  items: PlanItem[]
  diagrams: PlanDiagram[]
  layouts: PlanLayout[]
  stats: { items: number; pieces: number; diagrams: number; nodes: number; edges: number; layouts: number }
}

// ── ระบบภาพของงาน — ดู lib/equipment/video-format.ts ──
export type VideoResolution = '720p' | '1080i' | '1080p' | '2160p'
export type VideoRange = 'SDR' | 'HLG' | 'PQ'

export interface VideoFormat {
  resolution: VideoResolution
  frameRate: number           // interlaced = field rate (1080i50) · 23.98 / 29.97 / 59.94 เก็บเป็นทศนิยม
  range: VideoRange
  note?: string               // เช่น "สตรีม YouTube 1080p25", "ส่ง OB ช่อง 1080i50"
}

// ── format ไฟล์บันทึก — ดู lib/equipment/recording-format.ts ──
export type RecordingContainer = 'MOV' | 'MP4' | 'MXF' | 'BRAW' | 'R3D' | 'ARI' | 'CRM'

export interface RecordingSpec {
  id: string
  target: string              // บันทึกอะไร: "PGM", "ISO ทุกกล้อง", "Clean feed"
  codec: string               // "ProRes 422 HQ", "H.264" … (พิมพ์เองได้)
  container: RecordingContainer
  resolution?: string         // ความละเอียด/fps ของไฟล์นี้ เช่น "4K DCI 25p" (ISO BRAW ในกล้อง) — ว่าง = ตามระบบภาพหลักของแผน
  media?: string              // SSD, SD card, CFexpress …
  note?: string               // เช่น bitrate, เครื่องที่ใช้บันทึก, ชื่อไฟล์
}

// ── ส่งภาพให้ทีม Visual (FOH) — ดู lib/equipment/foh-feeds.ts ──
export type FeedConnection = 'SDI' | 'HDMI' | 'Fiber' | 'NDI' | 'SRT' | 'Other'

export interface FohFeed {
  id: string
  source: string              // สัญญาณอะไร: "PGM", "Clean feed", "AUX 1", "CAM 1 (ISO)"
  destination: string         // ส่งเข้าอะไร: "Barco E2", "LED Processor", "Resolume" — ชื่อเดียวกัน = เครื่องเดียวกันในผัง FOH
  destInput?: string          // ช่องรับที่ปลายทาง เช่น "E2 Input 3 (SDI)", "Slot 2 HDMI" — ทีม Visual บอก
  connection: FeedConnection
  format?: VideoFormat        // ไม่มี = ตามระบบภาพหลักของแผน (LED processor มักขอ progressive แม้งานจะเป็น 1080i)
  cableLength?: string        // เช่น "80 m", "สายไฟเบอร์ 150 m"
  note?: string               // เช่น "มีกราฟิก lower third", "ขอ tally", ผู้ประสานทีม Visual
}
