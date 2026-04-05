@AGENTS.md

# LiveTubeX Admin — โครงสร้างแอปพลิเคชัน

## ภาพรวม
ระบบจัดการงานถ่ายทอดสดของ **LiveTubeX Co., Ltd.** แบ่งเป็น 2 ส่วน:
- **Admin Panel** (`/admin/*`) — จัดการงาน, freelancer, อนุมัติการเบิกจ่าย
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
