@AGENTS.md

# LiveTubeX Admin — โครงสร้างแอปพลิเคชัน

## ภาพรวม
ระบบจัดการงานถ่ายทอดสดของ **บริษัท ไลฟ์ทูป เอ็กซ์ จำกัด** (เลขนิติฯ 0105566147487) แบ่งเป็น 3 ส่วนใหญ่:
- **Admin Panel** (`/admin/*`) — จัดการงาน, freelancer, อนุมัติการเบิกจ่าย
- **Admin Accounting** (`/admin/accounting/*`) — ระบบบัญชี SME เต็มรูปแบบ:
  - **ขาย**: ลูกค้า, ใบเสนอราคา, ใบแจ้งหนี้, ใบกำกับภาษี, ใบเสร็จ + PDF (Sarabun)
  - **รายจ่าย**: ผู้ขาย, รายจ่าย, หมวดค่าใช้จ่าย, รายงานรายจ่าย
  - **ภาษี**: รายงาน ภพ.30 (VAT) + ภงด.3/53 (WHT) + Export CSV
  - **งบการเงิน**: P&L รายเดือน เปรียบเทียบเดือนก่อนหน้า
  - **Auto-link**: Freelancer payment ที่ paid → สร้าง Expense (ค่าจ้างทำของ) อัตโนมัติ
- **Freelancer LIFF** (`/freelancer/*`) — Freelancer ดูข้อมูล ขอเบิกเงิน ผ่าน LINE LIFF

## Stack
| Layer | Tech |
|---|---|
| Framework | Next.js 16 App Router, `output: 'export'` (static) |
| Styling | Tailwind CSS v4 |
| UI | HeadlessUI, HeroIcons, react-day-picker |
| Forms | react-hook-form + zod |
| Auth | Firebase Auth (email/password สำหรับ Admin, Custom Token สำหรับ Freelancer) |
| Database | Cloud Firestore |
| Storage | Firebase Storage (รูปบัตรประชาชน, สลิปค่าใช้จ่าย) |
| Functions | Firebase Cloud Functions v2 (Node 20, region: asia-southeast1) |
| Email | Resend API |
| LINE | @line/liff v2 |
| Date | date-fns v4 + Thai locale |
| PDF | @react-pdf/renderer + Sarabun font (woff ใน `public/fonts/`) |

## Authentication Flow
```
Admin:      Email/Password → Firebase Auth (sign_in_provider = 'password')
Freelancer: LINE LIFF → accessToken → Cloud Function lineAuth()
            → verify กับ LINE API → Firebase Custom Token
            → signInWithCustomToken (sign_in_provider = 'custom', claim lineUser = true)
            → auth.uid = LINE userId
```

## โครงสร้าง Firebase Collections

### `jobs`
| Field | Type | หมายเหตุ |
|---|---|---|
| title | string | |
| description | string | |
| date | string | ISO date (YYYY-MM-DD) |
| endDate | string? | ถ้าเป็นงานหลายวัน |
| location | string | |
| clientName | string | |
| budget | number | **ลับ — ไม่แสดงใน LIFF** |
| status | 'draft' \| 'published' \| 'in_progress' \| 'completed' \| 'cancelled' | |
| createdAt / updatedAt | string | ISO datetime |

### `freelancers`
| Field | Type | หมายเหตุ |
|---|---|---|
| lineUserId | string | = Firebase auth.uid |
| lineDisplayName | string | |
| linePictureUrl | string? | |
| namePrefix | string | นาย/นาง/นางสาว |
| firstName / lastName | string | |
| name | string | computed full name |
| phone | string | |
| email | string? | ถ้ามี จะรับเมลยืนยัน |
| bankAccount / bankName | string | |
| idCardImagePath | string? | **Storage path** (ไม่มี token) เช่น `idCards/{uid}/id_card.jpg` |
| totalEarned | number | update ด้วย `increment()` เท่านั้น |
| isActive | boolean | |
| createdAt | string | |

> ⚠️ `idCardImageUrl` (field เก่า) deprecated แล้ว — ข้อมูลเก่าที่ยังมีจะถูก handle ด้วย backward compat

### `payments`
| Field | Type | หมายเหตุ |
|---|---|---|
| freelancerId | string | Firestore doc ID → join `freelancers` |
| lineUserId | string | LINE userId (ใช้ใน Firestore rules) |
| jobId | string | **required** → join `jobs` collection |
| amount | number | ยอดขอเบิก (gross) |
| status | 'pending' \| 'approved' \| 'paid' \| 'rejected' | |
| position | string? | ตำแหน่งงาน |
| workDates | string[]? | วันที่ทำงาน (ISO date) |
| expenseAmount | number? | ค่าใช้จ่ายเพิ่มเติม (ไม่หัก 3%) |
| expenseSlipPath | string? | **Storage path** สลิปค่าใช้จ่าย (ไม่มี token) |
| notes | string? | หมายเหตุจาก freelancer |
| adminNotes | string? | หมายเหตุจาก admin |
| requestedAt | string | ISO datetime |
| approvedAt / paidAt / rejectedAt | string? | |

> ⚠️ ไม่เก็บ `freelancerName`, `bankAccount`, `bankName`, `workDescription` ใน payments อีกต่อไป
> — ให้ join จาก `freelancers` และ `jobs` collections แทน
> — `expenseSlipUrl` (field เก่า) deprecated — backward compat เท่านั้น

### `positions`
| Field | Type |
|---|---|
| name | string |
| createdAt | string |

### `settings/app`
| Field | Type | หมายเหตุ |
|---|---|---|
| reportPeriodMonth | number | 1–12 |
| reportPeriodYear | number | เช่น 2026 |
| billingCycle | 'mid' \| 'end' | กลางเดือน (15) หรือ สิ้นเดือน (วันสุดท้าย) |
| updatedAt | string | |

### `jobAssignments`
| Field | Type |
|---|---|
| jobId / freelancerId | string |
| role / fee | string / number |
| status | 'invited' \| 'accepted' \| 'declined' \| 'completed' |
| assignedAt | string |

## โครงสร้างไฟล์

### `app/`
```
app/
├── page.tsx                    # Landing — redirect admin/freelancer
├── layout.tsx                  # Root layout (font, globals)
├── login/page.tsx              # Admin login (email/password)
├── admin/
│   ├── layout.tsx              # Admin layout + AuthGuard
│   ├── page.tsx                # Dashboard: stats, recent jobs/payments (join freelancers+jobs)
│   ├── jobs/page.tsx           # CRUD งาน
│   ├── freelancers/page.tsx    # CRUD freelancer + ปุ่มดูบัตรประชาชน (IdCardButton)
│   ├── payments/page.tsx       # อนุมัติ/ปฏิเสธ payment (list + grouped view)
│   ├── positions/page.tsx      # จัดการตำแหน่งงาน (CRUD)
│   ├── report/page.tsx         # รายงานสรุปรายได้ + ส่งอีเมล
│   └── settings/page.tsx       # ตั้งค่าระบบ (รอบการจ่ายเงิน)
└── freelancer/
    ├── layout.tsx              # Freelancer layout
    ├── page.tsx                # หน้าหลัก LIFF: stats, ปุ่มขอเบิก, modal
    ├── register/page.tsx       # สมัคร/แก้ไขโปรไฟล์ + อัพโหลดบัตร
    └── payments/page.tsx       # ประวัติการเบิกจ่าย + ขอเบิกใหม่
```

### `components/`
```
components/
├── ui/
│   ├── Badge.tsx               # Status pill
│   ├── Modal.tsx               # Generic modal (size: sm/md/lg/xl)
│   ├── ConfirmDialog.tsx       # Confirm destructive action
│   ├── Logo.tsx                # SVG logo (prop: white=true → all white)
│   ├── FormListbox.tsx         # HeadlessUI dropdown
│   ├── FormDatePicker.tsx      # Date picker (react-day-picker)
│   └── Skeleton.tsx            # Facebook-style shimmer loading
│       # exports: Skeleton, SkeletonCard, SkeletonStat,
│       #          SkeletonTableRow, SkeletonPaymentCard, SkeletonProfile
│       #          SkeletonImage  ← รูปภาพพร้อม shimmer ขณะโหลด
├── admin/
│   ├── StatCard.tsx            # Dashboard stat card
│   ├── AdminSidebar.tsx        # Sidebar navigation
│   ├── AuthGuard.tsx           # Redirect ถ้า admin ไม่ได้ login
│   ├── JobForm.tsx             # สร้าง/แก้ไขงาน
│   ├── FreelancerForm.tsx      # สร้าง/แก้ไข freelancer (ส่ง idCardImagePath ไม่ใช่ URL)
│   └── AssignmentModal.tsx     # (ยังมีอยู่แต่ไม่ใช้แล้ว)
└── landing/
    └── HomeEntry.tsx           # Entry point routing
```

### `lib/`
```
lib/
├── firebase.ts                 # init app, export: db, auth, storage, functions
├── firebase-utils.ts           # Firestore CRUD + httpsCallable
├── firebase-storage.ts         # upload/storage helpers (ดูด้านล่าง)
├── line-liff.ts                # initLiff, liffLogin, liffLogout, signInFirebaseWithLiff
├── types.ts                    # TS interfaces: Job, Freelancer, Payment, etc.
├── utils.ts                    # formatDate, formatCurrency, calcTax, status labels/colors
└── auth-context/               # Admin auth context
```

### `functions/src/index.ts`
```typescript
lineAuth(onCall)
// รับ: { accessToken: string }
// verify กับ LINE API → สร้าง Firebase Custom Token
// คืน: { firebaseToken, lineUserId, displayName, pictureUrl }

sendPaymentNotification(onCall)
// รับ: payment data (freelancerId, jobId, amount, ...)
// lookup freelancerName/bank จาก Firestore (ไม่พึ่ง client ส่งมา)
// lookup job title จาก jobId
// ส่งเมลหา admin เสมอ + freelancer ถ้ามี email
// Secrets: RESEND_API_KEY, MAIL_FROM, MAIL_TO

sendPaymentReport(onCall)
// Admin only — ส่งสรุปรายได้ให้ freelancer แต่ละคน
// รับ: { reports: FreelancerReportPayload[] }
// Secrets: RESEND_API_KEY, MAIL_FROM
```

## lib/firebase-storage.ts — Functions ทั้งหมด

```typescript
// อัพโหลดรูปบัตรประชาชน → คืน storage PATH (ไม่ใช่ URL)
uploadIdCardImage(lineUserId, file): Promise<string>

// อัพโหลดสลิปค่าใช้จ่าย → คืน storage PATH (ไม่ใช่ URL)
uploadExpenseSlip(lineUserId, file): Promise<string>

// ขอ download URL พร้อม token (ต้อง login อยู่)
// เรียกเฉพาะตอนจะแสดงรูป — ไม่เก็บ URL ลง DB
getStorageDownloadUrl(path): Promise<string>

// ลบรูปบัตร (ใช้ตอน replace)
deleteIdCardImage(lineUserId): Promise<void>
```

> **หลักการ Storage URL**: ไม่เก็บ URL ที่มี token ใน Firestore
> — เก็บแค่ storage path เช่น `idCards/Uxxx/id_card.jpg`
> — เวลาแสดงรูปค่อยเรียก `getStorageDownloadUrl(path)` เพื่อ gen token ใหม่
> — Storage rules บังคับให้ต้อง login ก่อนอ่านรูป

## lib/firebase-utils.ts — Functions ทั้งหมด

```typescript
// Jobs
getJobs(): Promise<Job[]>
getJob(id): Promise<Job | null>
createJob(data), updateJob(id, data), deleteJob(id)

// Freelancers
getFreelancers(): Promise<Freelancer[]>
getFreelancer(id), getFreelancerByLineId(lineUserId)
createFreelancer(data), updateFreelancer(id, data)
upsertFreelancerByLineId(lineUserId, data)
  // data รับ idCardImagePath (path ไม่ใช่ URL)

// Payments
getPayments(): Promise<Payment[]>                          // Admin ใช้
getPaymentsByLineUserId(lineUserId): Promise<Payment[]>    // Freelancer ใช้
getPaymentsByFreelancer(freelancerId): Promise<Payment[]>  // Admin ใช้
createPayment(data, freelancerEmail?): Promise<string>     // trigger email อัตโนมัติ
updatePayment(id, data)
approvePayment(id, adminNotes?)
markPaymentPaid(id, freelancerId, amount, adminNotes?)     // atomic increment totalEarned
rejectPayment(id, adminNotes?)

// Positions
getPositions(): Promise<Position[]>
createPosition(name), updatePosition(id, name), deletePosition(id)

// App Settings
getAppSettings(): Promise<AppSettings | null>
saveAppSettings(data): Promise<void>
initAppSettings(data): Promise<void>   // setDoc (create or update)

// Report
sendPaymentReport(reports): Promise<void>   // เรียก Cloud Function

// Dashboard
getDashboardStats(): Promise<DashboardStats>

// Assignments (ยังมีแต่ไม่ได้ใช้ใน UI แล้ว)
getAssignmentsByJob(jobId), getAssignmentsByFreelancer(freelancerId)
createAssignment(data), updateAssignment(id, data), deleteAssignment(id)
```

## lib/utils.ts — Functions ทั้งหมด

```typescript
formatDatePill(dateStr): string    // "จ. 3 เม.ย." (สำหรับ toggle pill)
formatDate(dateStr): string        // "3 เม.ย. 2569"
formatDateTime(dateStr): string    // "3 เม.ย. 2569 17:00"
formatCurrency(amount): string     // "฿10,000"
calcTax(gross): { gross, tax, net } // ภาษี 3% — tax = round(gross * 0.03)
jobStatusLabel(status): string
jobStatusColor(status): string     // Tailwind classes
paymentStatusLabel(status): string
paymentStatusColor(status): string
assignmentStatusLabel(status): string
```

## Admin Payments Page — Feature สำคัญ

```
- 2 view modes: List (ตาราง) / Grouped (จัดกลุ่มตามงาน)
- join freelancersMap + jobsMap เพื่อ resolve ชื่อ/บัญชี/ชื่องาน
- แก้ไขยอดเงินก่อน approve/paid ได้ (editAmount state)
- ยอดโอนรวม = calcTax(amount).net + (expenseAmount ?? 0)
- SlipButton component: manage loading state ตัวเอง, เรียก getStorageDownloadUrl เมื่อกด
- SkeletonImage ใน slip modal และ ID card modal
```

## Admin Freelancers Page — Feature สำคัญ

```
- IdCardButton component: manage loading state ตัวเอง, เรียก getStorageDownloadUrl เมื่อกด
- Modal แสดง ID card พร้อม SkeletonImage shimmer ขณะโหลด
```

## Admin Settings Page

```
- รอบการจ่ายเงิน: กลางเดือน (วันที่ 15) หรือ สิ้นเดือน (วันสุดท้ายของเดือน)
- เลือกเดือน/ปี สำหรับ report period
- บันทึกลง settings/app ใน Firestore
```

## Admin Report Page

```
- กรองตาม period (month/year) + billing cycle จาก settings
- สรุปรายได้ต่อ freelancer
- ส่งอีเมลสรุปผ่าน sendPaymentReport Cloud Function
- buildPeriodLabel(month, year, cycle) → "กลางเดือนมีนาคม 2568" / "สิ้นเดือนมีนาคม 2568"
```

## LIFF Payment Modal — Expense Feature

```
- ปุ่ม + เล็กกลม (w-7 h-7 rounded-full) เปิด/ปิดส่วนค่าใช้จ่ายเพิ่มเติม
- เมื่อเปิด: กรอกจำนวนเงิน + แนบรูปสลิป
- อัพโหลดสลิปด้วย uploadExpenseSlip() → ได้ storage path (ไม่มี token)
- บันทึก expenseSlipPath ใน payment (ไม่มี URL)
- ค่าใช้จ่ายไม่หัก 3%
- ลำดับ field ใน modal: งาน → วันที่ → ตำแหน่ง → จำนวนเงิน → ค่าใช้จ่าย → หมายเหตุ
```

## Firestore Security Rules — สรุป

```
isAdmin()      = sign_in_provider == 'password'
isFreelancer() = sign_in_provider == 'custom' && lineUser == true

jobs:           read: authenticated, write: admin
freelancers:    admin: all | freelancer: read/create/update ของตัวเอง
                  create: ต้องมี totalEarned=0, isActive=true
                  update: ห้ามแก้ totalEarned, createdAt, isActive
jobAssignments: admin: all | freelancer: read เฉพาะที่ตัวเองถูก assign
payments:       admin: all | freelancer: read เฉพาะของตัวเอง
                  create: status=pending, amount>0
                  required fields: freelancerId, lineUserId, amount, status,
                                   requestedAt, jobId
settings:       admin: read/write เท่านั้น
```

## Storage Rules — สรุป

```
idCards/{lineUserId}/{fileName}:
  read:  admin (password) หรือ freelancer เจ้าของ (auth.uid == lineUserId)
  write: freelancer เจ้าของเท่านั้น, ≤10MB, image/* เท่านั้น

expenseSlips/{lineUserId}/{fileName}:
  read:  admin (password) หรือ freelancer เจ้าของ (auth.uid == lineUserId)
  write: freelancer เจ้าของเท่านั้น, ≤10MB, image/* เท่านั้น
```

## Environment Variables

```bash
# .env.local (frontend)
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_LINE_LIFF_ID

# Firebase Secrets (Cloud Functions — ตั้งด้วย firebase functions:secrets:set)
RESEND_API_KEY   # API key จาก resend.com
MAIL_FROM        # อีเมลที่ใช้ส่ง (ต้อง verify domain ใน Resend)
MAIL_TO          # อีเมล admin ที่รับแจ้งเตือน
```

## Deploy Commands

```bash
export PATH="/Users/tannysoft/.nvm/versions/node/v22.20.0/bin:$PATH"
cd /Users/tannysoft/Documents/tan/livetubex/livetubex-admin-fe

# Build & typecheck
npx tsc --noEmit
npm run build

# Deploy hosting + rules
firebase deploy --only hosting,firestore:rules,storage

# Deploy functions
cd functions && npm run build && cd ..
firebase deploy --only functions

# Deploy ทุกอย่าง
firebase deploy --only hosting,firestore:rules,storage,functions

# ดู function logs
firebase functions:log --only sendPaymentNotification
firebase functions:log --only lineAuth
```

## Accounting — โครงสร้างระบบบัญชี SME (Phase 1-4)

### Collections ใหม่

#### `companySettings/main`
| Field | Type | หมายเหตุ |
|---|---|---|
| name / nameEn | string | ชื่อบริษัทไทย/อังกฤษ |
| taxId | string | เลขนิติบุคคล 13 หลัก |
| branch | string | "สำนักงานใหญ่" / "สาขา 00001" |
| address | string | ที่อยู่เต็ม |
| phone / email / website | string? | |
| signaturePath | string? | Storage path ของลายเซ็น (resolve ผ่าน `getCompanySettingsForPdf()`) |
| bankAccounts | `BankAccount[]` | บัญชีบริษัท สำหรับลูกค้าโอนเข้า |
| vatRate | number | default 7 |

#### `customers`
| Field | Type | หมายเหตุ |
|---|---|---|
| code | string | auto: CUS-0001 (running ต่อเนื่อง ไม่ reset) |
| name | string | ชื่อบริษัท/บุคคล |
| type | 'company' \| 'individual' | |
| taxId / branch | string? | เลขผู้เสียภาษี + สาขา |
| address | string | required |
| phone / email / contactPerson | string? | |
| isActive | boolean | |

#### `quotations`, `invoices`, `taxInvoices`, `receipts`
- ทุก doc มี `docNumber` (auto-generated, transactional), `customerSnapshot` (frozen ณ วันที่ออก), `customerId`, `issueDate`, `items[]`, totals
- **เลขรันเอกสาร** format PEAK: `{Prefix}{YY-พ.ศ.}{MM}-{NNNN}` reset รายเดือน — `QO6805-0001`, `IV6805-0001`, `TX6805-0001`, `RC6805-0001`
- counter เก็บที่ `documentCounters/{YYYY-MM}` (และ `documentCounters/all` สำหรับ customer code)
- ใช้ `runTransaction` กัน race condition

#### `quotations` (เพิ่มเติม)
- `validUntil`, `status: draft|sent|accepted|rejected|expired|converted`
- `convertedToInvoiceId` เมื่อแปลงเป็นใบแจ้งหนี้

#### `invoices` (เพิ่มเติม)
- `dueDate`, `paidAmount` (running จาก receipts), `taxInvoiceIds[]`, `receiptIds[]`
- `status: draft|sent|partial_paid|paid|overdue|cancelled|void`
- `quotationId?` ถ้ามาจากใบเสนอราคา

#### `taxInvoices` (immutable — แก้ไม่ได้)
- `invoiceId` ต้นทาง
- `issueDate` = วันที่ส่งมอบ/รับเงิน (สำคัญ — ฐานในการยื่น ภพ.30)
- `status: issued|void` — void เก็บไว้พร้อม `voidReason` + `voidedAt`
- `reportedInVatPeriod?` flag เมื่อยื่น ภพ.30 แล้ว

#### `receipts` (immutable — แก้ไม่ได้)
- `invoiceId`, `taxInvoiceId?`
- `amount` (gross), `whtAmount?` (ที่ลูกค้าหัก), `whtCertReceived?` (ได้ 50 ทวิ)
- `paymentMethod: cash|transfer|cheque|credit_card|other`, `paymentRef?`, `bankAccountReceived?`
- ออกใบเสร็จ → atomic increment `invoices.paidAmount` + auto-update `invoices.status`
- void → คืน paidAmount + revert status

#### `vendors` (ผู้ขาย/คู่ค้า — Phase 2)
| Field | Type | หมายเหตุ |
|---|---|---|
| code | string | auto: VEN-0001 (running) |
| name | string | |
| type | 'company' \| 'individual' \| 'freelancer' | สำคัญ — ใช้แยก ภงด.3 vs 53 |
| taxId / branch | string? | |
| address / phone / email / contactPerson | string? | |
| bankAccount / bankName | string? | สำหรับโอนจ่าย |
| freelancerId | string? | ถ้า type='freelancer' → ผูกกับ freelancers/{id} |
| isActive | boolean | |

#### `expenseCategories` (หมวดค่าใช้จ่าย — Phase 2)
| Field | Type | หมายเหตุ |
|---|---|---|
| name | string | "ค่าจ้างทำของ", "ค่าเช่า", ฯลฯ |
| defaultWhtRate | number? | default WHT % สำหรับ category นี้ |
| isFixed | boolean? | category พื้นฐาน (ห้ามลบ) เช่น "ค่าจ้างทำของ" |
| order | number? | sort order |

> Seed default 9 หมวด: ค่าจ้างทำของ (WHT 3% fixed), ค่าบริการ (3%), ค่าเช่า (5%), ค่าน้ำ-ไฟ, ค่าอุปกรณ์, ค่าเดินทาง, ค่าโฆษณา (2%), ค่าธรรมเนียม, อื่นๆ

#### `expenses` (รายจ่ายบริษัท — Phase 2)
| Field | Type | หมายเหตุ |
|---|---|---|
| code | string | auto: EX{YY}{MM}-{NNNN} (reset รายเดือน) |
| sourceType | 'manual' \| 'freelancer_payment' | |
| paymentId | string? | ถ้า sourceType='freelancer_payment' |
| vendorId / vendorSnapshot | string / `{code,name,taxId}` | freeze ข้อมูล ณ วันที่ออก |
| categoryId / categoryName | string | snapshot ตอนสร้าง |
| date | string | ISO date วันที่เกิดค่าใช้จ่าย |
| description | string | required |
| amount | number | ก่อน VAT (gross fee — ฐาน WHT) |
| hasVat | boolean | |
| vatRate / vatAmount | number | 7% ถ้า hasVat else 0 |
| whtRate / whtAmount | number? | คำนวณจาก amount × whtRate% |
| totalAmount | number | = amount + vatAmount (ก่อนหัก WHT) |
| paidAmount | number | = totalAmount - whtAmount (เงินจ่ายจริง) |
| paymentMethod / paymentRef | string? | |
| receiptImagePath | string? | Storage path สลิป/ใบเสร็จ |
| status | 'draft' \| 'recorded' \| 'paid' \| 'cancelled' | |

> **Bridge: Freelancer payment → Expense (auto)**
> เมื่อ `markPaymentPaid()` ที่ payments page หรือ payout page → `syncExpenseFromPayment()` สร้าง/update Expense:
> - หมวด "ค่าจ้างทำของ" (get-or-create)
> - amount = payment.amount (gross), whtRate=3%, hasVat=false
> - paidAmount = amount - WHT + expenseAmount (เบิกคืนเต็มจำนวน)
> - sourceType='freelancer_payment' + paymentId — idempotent (check before create)
> - Fire-and-forget (.catch) ไม่ block flow การจ่ายเงิน
> - Expense ที่มาจาก freelancer_payment เป็น **lock mode** ในฟอร์ม — แก้ผ่าน payment ต้นทาง

### lib/accounting/

```
lib/accounting/
├── calc.ts                       # round2, calcLineAmount, calcTotals, bahtText, status labels
├── doc-numbering.ts              # nextDocNumber (transactional) — QO/IV/TX/RC/EX (monthly), CUS/VEN (running)
├── company-settings.ts           # CRUD + getCompanySettingsForPdf (resolve sig URL)
├── customers.ts                  # CRUD
├── quotations.ts                 # CRUD + makeCustomerSnapshot
├── invoices.ts                   # CRUD + convertQuotationToInvoice
├── tax-invoices.ts               # issue/void (immutable)
├── receipts.ts                   # issue/void (atomic update invoice)
├── vendors.ts                    # CRUD (Phase 2)
├── expense-categories.ts         # CRUD + seedDefaultCategoriesIfEmpty + getOrCreateFreelancerPaymentCategory
├── expenses.ts                   # CRUD + calcExpenseTotals + makeVendorSnapshot
├── payment-expense-bridge.ts     # syncExpenseFromPayment (freelancer payment → expense auto)
├── tax-reports.ts                # getTaxInvoicesByPeriod, getVatExpensesByPeriod, getWhtExpensesByPeriod (Phase 3)
└── pdf/
    ├── setup.ts                  # Font.register Sarabun (woff)
    ├── LogoSvg.tsx               # SVG logo สำหรับ PDF (port ตรงๆ ไม่ต้อง PNG)
    ├── styles.ts                 # StyleSheet กลาง
    ├── DocumentPdf.tsx           # generic template (quotation/invoice/taxInvoice)
    ├── ReceiptPdf.tsx            # template แยกสำหรับใบเสร็จ (amount big + bahtText)
    └── generate.ts               # downloadPdf, openPdfInNewTab (lazy import)
```

### Pages

```
app/admin/accounting/
├── customers/page.tsx                # CRUD ลูกค้า
├── company-settings/page.tsx         # ข้อมูลบริษัท + อัพโหลดลายเซ็น
│
│  ── Phase 1: เอกสารขาย ────────────────────────────────────────────────
├── quotations/
│   ├── page.tsx                      # list + filter + ปุ่ม "แปลงเป็นใบแจ้งหนี้"
│   └── new/page.tsx                  # create/edit (?id=xxx) + PDF buttons
├── invoices/
│   ├── page.tsx                      # list + auto-detect overdue
│   └── new/page.tsx                  # create/edit (?id=xxx, ?fromQuotation=xxx)
│                                     # + action panel: ออกใบกำกับภาษี / รับเงิน
│                                     # + linked tax invoices + receipts
├── tax-invoices/
│   ├── page.tsx                      # list (read-only)
│   └── view/page.tsx                 # view + void (?id=xxx) + PDF
├── receipts/
│   ├── page.tsx                      # list (read-only)
│   └── view/page.tsx                 # view + void + PDF
│
│  ── Phase 2: ฝั่งรายจ่าย ──────────────────────────────────────────────
├── vendors/page.tsx                  # CRUD ผู้ขาย (3 ประเภท: company/individual/freelancer)
├── expense-categories/page.tsx       # CRUD หมวด + ปุ่ม seed default 9 หมวด
├── expenses/
│   ├── page.tsx                      # list + filter หมวด/สถานะ
│   └── new/page.tsx                  # create/edit (?id=xxx) + upload สลิป
│                                     # + lock mode สำหรับ sourceType='freelancer_payment'
├── expense-report/page.tsx           # รายงานรายจ่าย: stat cards + by category + top vendors
│
│  ── Phase 3: รายงานภาษี ───────────────────────────────────────────────
├── tax-reports/
│   ├── vat/page.tsx                  # ภพ.30 (VAT) — ภาษีขาย/ซื้อ + Export CSV
│   └── wht/page.tsx                  # ภงด.3/53 (WHT) — แยกบุคคล/นิติบุคคล + Export CSV
│
│  ── Phase 4: งบการเงิน ────────────────────────────────────────────────
└── profit-loss/page.tsx              # งบกำไรขาดทุนรายเดือน + เปรียบเทียบเดือนก่อนหน้า
```

### Flow รวมระบบบัญชี

```
ฝั่งขาย:
  Quotation → [แปลงเป็นใบแจ้งหนี้] → Invoice
  Invoice → [ออกใบกำกับภาษี] → TaxInvoice (immutable)
  Invoice → [บันทึกการรับเงิน] → Receipt (immutable)
     → atomic update: invoices.paidAmount + receiptIds[] + auto-status

ฝั่งรายจ่าย:
  Vendor + ExpenseCategory → Expense (manual)
  หรือ
  Payment(Freelancer) → markPaymentPaid() → Expense (sourceType='freelancer_payment', auto)

รายงานภาษี:
  TaxInvoices (ในงวด) → ภพ.30 ฝั่งภาษีขาย
  Expenses ที่มี hasVat=true → ภพ.30 ฝั่งภาษีซื้อ
  Expenses ที่มี whtAmount>0 → ภงด.3 (บุคคล) / ภงด.53 (นิติบุคคล)

งบกำไรขาดทุน:
  รายได้ = sum(taxInvoice.subtotal - discountTotal) — ก่อน VAT
  รายจ่าย = sum(expense.amount where status≠cancelled) — ก่อน VAT
  กำไร = รายได้ − รายจ่าย
  VAT เป็น pass-through ไม่กระทบกำไร
```

### Components Accounting

```
components/admin/accounting/
├── CustomerForm.tsx           # บริษัท/บุคคล + validate taxId 13 หลัก
├── CustomerSelect.tsx         # Combobox + ปุ่ม "เพิ่มลูกค้าใหม่"
├── DocumentItemsTable.tsx     # ตารางรายการ — auto-calc + readonly mode
├── DocumentSummary.tsx        # subtotal / discount / VAT / WHT / netPayable
├── QuotationForm.tsx          # ฟอร์มใบเสนอราคา (full page)
├── InvoiceForm.tsx            # ฟอร์มใบแจ้งหนี้ (full page)
├── IssueTaxInvoiceModal.tsx   # modal ออกใบกำกับ (warning "ออกแล้วห้ามแก้")
├── RecordPaymentModal.tsx     # modal บันทึกรับเงิน + WHT + ใบเสร็จ
├── PdfButtons.tsx             # ปุ่ม "ดู PDF" + "ดาวน์โหลด" (lazy import)
│  ── Phase 2 ──────────────────────────────────────────────────────────
├── VendorForm.tsx             # 3 ประเภท: company/individual/freelancer
├── VendorSelect.tsx           # Combobox + allowEmpty + ปุ่ม "เพิ่มผู้ขายใหม่"
└── ExpenseForm.tsx            # full form + auto-calc total/paid + lockedReason mode
```

### กฎสำคัญด้านบัญชี

1. **CustomerSnapshot** — ทุก document collection (`quotation/invoice/taxInvoice/receipt`) freeze ข้อมูลลูกค้า ณ วันที่ออก ห้าม join live เพราะข้อมูลลูกค้าอาจเปลี่ยน
2. **calcTotals** — WHT คำนวณจาก **ฐานก่อน VAT** (`baseBeforeVat`) ไม่ใช่ grandTotal
3. **Document numbering** — ใช้ `runTransaction` เสมอ ป้องกันเลขซ้ำเมื่อมี admin หลายคน
4. **TaxInvoice + Receipt = immutable** — ออกแล้วห้ามแก้ ทำได้แค่ void (เก็บ doc + reason + timestamp)
5. **Receipt issue/void = atomic** — update invoice.paidAmount + status ใน transaction เดียว
6. **PDF lazy load** — import dynamic เฉพาะตอนกดปุ่ม (react-pdf ใหญ่ ~600 packages)
7. **PDF signaturePath** — ต้อง resolve เป็น URL ก่อน render ผ่าน `getCompanySettingsForPdf()`
8. **bahtText** — แปลงตัวเลขเป็นข้อความไทย ใช้ในใบเสร็จ/ใบกำกับภาษี

### Firestore Rules (สรุป)

```
Phase 1: companySettings, customers, documentCounters, quotations,
         invoices, taxInvoices, receipts
Phase 2: vendors, expenseCategories, expenses
ทั้งหมด: admin-only (isAdmin)
```

### Storage Paths

```
companyAssets/{fileName}                     # ลายเซ็น/โลโก้ (admin write, auth read) ≤5MB
expenseReceipts/{expenseId}/{fileName}       # สลิป/ใบเสร็จจากผู้ขาย (admin only) ≤10MB
```

### Doc Number Format (PEAK style)

```
QO6805-0001    # ใบเสนอราคา (reset รายเดือน)
IV6805-0001    # ใบแจ้งหนี้
TX6805-0001    # ใบกำกับภาษี
RC6805-0001    # ใบเสร็จรับเงิน
EX6805-0001    # รายจ่าย (Phase 2)
CUS-0001       # ลูกค้า (running ไม่ reset)
VEN-0001       # ผู้ขาย (running ไม่ reset)
```

> YY = พ.ศ. 2 หลัก, MM = เดือน 2 หลัก, NNNN = running 4 หลัก
> ใช้ `runTransaction` กัน race — `lib/accounting/doc-numbering.ts`

---

## ข้อควรระวัง / Gotchas

1. **Timezone**: ใช้ `new Date(str + 'T00:00:00')` แล้วอ่าน `getFullYear/getMonth/getDate` เสมอ — ห้ามใช้ `toISOString().split('T')[0]` เพราะ convert เป็น UTC แล้วได้วันผิด (UTC+7 ทำให้ shift -1 วัน)

2. **Firestore undefined**: ก่อน `addDoc` ต้อง filter `undefined` ออกก่อน — Firestore SDK ไม่รองรับ `undefined` → ใช้ `Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))`

3. **totalEarned**: ต้อง update ด้วย `increment(amount)` เสมอ ห้ามทำ read-then-write

4. **budget ลับ**: ไม่แสดง job.budget ใน LIFF ไม่ว่าจะที่ใดก็ตาม

5. **Firestore Trigger v2 ไม่ได้**: Firestore database อยู่ที่ region `asia-southeast3` ซึ่ง Eventarc ไม่รองรับ → ใช้ HTTPS Callable แทน และเรียกจาก frontend

6. **Payment flow**: Freelancer ไม่ต้องมี JobAssignment — เลือก Job จาก dropdown แล้วขอเบิกได้เลย ชื่องานดึงจาก `jobId` → `jobs` collection

7. **Logo white mode**: ใน header สีแดง ต้องส่ง `white` prop → SVG ทุก path เป็น `fill="white"`

8. **Skeleton**: ใช้ class `.skeleton` จาก `globals.css` (shimmer animation) — อย่าใช้ `animate-pulse` ของ Tailwind. ใช้ `SkeletonImage` สำหรับรูปภาพที่โหลดจาก Storage

9. **calcTax**: `tax = Math.round(gross * 0.03)` ใช้ทั้ง frontend และ function (เขียนซ้ำในแต่ละที่)

10. **Firebase Functions region**: `asia-southeast1` สำหรับทุก function — ตั้งไว้ใน `setGlobalOptions`

11. **Storage URL ห้ามเก็บ token**: ไม่เก็บ download URL ที่มี token ใน Firestore เด็ดขาด — เก็บแค่ storage path แล้วเรียก `getStorageDownloadUrl(path)` เมื่อต้องการแสดงรูป (ต้อง login ก่อนเสมอ)

12. **Payment relation**: ไม่เก็บ `freelancerName`, `bankAccount`, `bankName` ใน payments — ต้อง join จาก `freelancersMap` เสมอ ทั้งใน payments page, dashboard, report page

13. **SlipButton / IdCardButton pattern**: component เหล่านี้ manage `loading` state ของตัวเอง (ไม่ใช้ global state) เพื่อป้องกัน disable ปุ่มอื่นพร้อมกัน

14. **billingCycle ใน email**: ปุ่มในหน้า settings แสดงวันจริง (15 หรือวันสุดท้ายของเดือน) แต่ใน email label ใช้ `buildPeriodLabel()` → "กลางเดือนมีนาคม 2568" / "สิ้นเดือนมีนาคม 2568"

15. **expenseAmount ไม่หัก 3%**: ยอดโอนรวม = `calcTax(amount).net + (expenseAmount ?? 0)` — expenseAmount บวกเต็มไม่หักภาษี

16. **Accounting: WHT ฐาน**: ใน accounting ใช้ฐาน `baseBeforeVat` (= subtotal - discountTotal) ไม่ใช่ grandTotal ห้ามคำนวณ WHT จากยอดหลัง VAT

17. **Accounting: ห้ามแก้ TaxInvoice/Receipt**: ออกแล้วเป็น immutable — แก้ไม่ได้ ทำได้แค่ void เพื่อ audit trail. ถ้า user ขอแก้ → void แล้วออกใบใหม่

18. **Accounting: Receipt void**: void receipt ต้อง revert `invoices.paidAmount` ด้วย (ใน transaction เดียว) ไม่งั้นยอดเพี้ยน

19. **Accounting: PDF font**: ใช้ Sarabun (woff) จาก `/fonts/` — react-pdf ใช้ TTF/OTF/WOFF (ห้าม WOFF2). ปิด hyphenation เพราะคำไทย break ผิด

20. **Accounting: SVG ใน PDF**: react-pdf `<Image>` ไม่รองรับ SVG — ใช้ `<Svg>` + `<Path>` ตรงๆ (`LogoSvg.tsx` port มาจาก SVG ต้นฉบับ)

21. **Accounting: documentCounters**: เลขรันใช้ Firestore `runTransaction` เสมอ ห้าม read-then-write — race condition ทำให้เลขซ้ำได้

22. **Accounting: Payment → Expense bridge**: ต้องเรียก `syncExpenseFromPayment()` หลัง `markPaymentPaid()` ทุกจุด (ปัจจุบัน 3 จุด: payments page action, payments create-paid, payout bulk). ใช้ `.catch()` ไม่ block flow. ถ้าเพิ่ม flow ใหม่ที่ mark paid ต้องเรียก bridge ด้วย

23. **Accounting: Expense lock mode**: Expense ที่มี `sourceType='freelancer_payment'` ห้ามให้ admin แก้ผ่านฟอร์ม Expense — ต้องไปแก้ผ่าน Payment ต้นทาง แล้ว bridge จะ sync มาเอง

24. **Accounting: VAT/WHT classification**: ภงด.3 vs 53 dispatch ตามเงื่อนไข: `sourceType='freelancer_payment'` → ภงด.3; `vendor.type='company'` → ภงด.53; default → ภงด.3. อย่าใช้ `taxId` prefix เพื่อตัดสิน (ไม่ reliable)

25. **Accounting: P&L revenue base**: ใช้ taxInvoices (accrual basis) ไม่ใช่ receipts — ทำให้ตรงกับภพ.30 และมาตรฐานบัญชี

26. **Accounting: CSV export**: prepend `﻿` (UTF-8 BOM) เพื่อให้ Excel เปิดภาษาไทยได้ไม่เพี้ยน
