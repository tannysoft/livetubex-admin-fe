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
| Storage | Firebase Storage (รูปบัตรประชาชน) |
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
| idCardImageUrl | string? | Firebase Storage path |
| totalEarned | number | update ด้วย `increment()` เท่านั้น |
| isActive | boolean | |
| createdAt | string | |

### `payments`
| Field | Type | หมายเหตุ |
|---|---|---|
| freelancerId | string | Firestore doc ID |
| lineUserId | string | LINE userId (ใช้ใน Firestore rules) |
| amount | number | ยอดขอเบิก (gross) |
| status | 'pending' \| 'approved' \| 'paid' \| 'rejected' | |
| workDescription | string | ชื่องาน (จาก job.title) |
| workDates | string[]? | วันที่ทำงาน (ISO date) |
| notes | string? | หมายเหตุ freelancer |
| adminNotes | string? | หมายเหตุ admin |
| requestedAt | string | ISO datetime |
| approvedAt / paidAt / rejectedAt | string? | |
| freelancerName / bankAccount / bankName | string | denormalized |

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
│   ├── page.tsx                # Dashboard: stats, recent jobs/payments
│   ├── jobs/page.tsx           # CRUD งาน (ไม่มี assign แล้ว)
│   ├── freelancers/page.tsx    # CRUD freelancer
│   └── payments/page.tsx       # อนุมัติ/ปฏิเสธ payment (list + grouped by job)
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
├── admin/
│   ├── StatCard.tsx            # Dashboard stat card
│   ├── AdminSidebar.tsx        # Sidebar navigation
│   ├── AuthGuard.tsx           # Redirect ถ้า admin ไม่ได้ login
│   ├── JobForm.tsx             # สร้าง/แก้ไขงาน
│   ├── FreelancerForm.tsx      # สร้าง/แก้ไข freelancer
│   └── AssignmentModal.tsx     # (ยังมีอยู่แต่ไม่ใช้แล้ว)
└── landing/
    └── HomeEntry.tsx           # Entry point routing
```

### `lib/`
```
lib/
├── firebase.ts                 # init app, export: db, auth, storage, functions
├── firebase-utils.ts           # Firestore CRUD + httpsCallable
├── firebase-storage.ts         # uploadIdCardImage, deleteIdCardImage
├── line-liff.ts                # initLiff, liffLogin, liffLogout, signInFirebaseWithLiff
├── types.ts                    # TS interfaces: Job, Freelancer, Payment, JobAssignment, etc.
├── utils.ts                    # formatDate, formatCurrency, calcTax, status labels/colors
└── auth-context/               # Admin auth context
```

### `functions/src/index.ts`
```typescript
// Cloud Functions ทั้งหมด

lineAuth(onCall)
// รับ: { accessToken: string }
// verify กับ LINE API → สร้าง Firebase Custom Token
// คืน: { firebaseToken, lineUserId, displayName, pictureUrl }
// CORS: livetubex-admin.web.app, livetubex-admin.firebaseapp.com, localhost

sendPaymentNotification(onCall)
// รับ: payment data + freelancerEmail?
// ส่งเมลหา admin เสมอ
// ส่งเมลยืนยันหา freelancer ถ้ามี email
// Secrets: RESEND_API_KEY, MAIL_FROM, MAIL_TO
// เรียกจาก createPayment() ใน firebase-utils.ts (fire-and-forget)
```

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
upsertFreelancerByLineId(lineUserId, data)  // create หรือ update

// Payments
getPayments(): Promise<Payment[]>                          // Admin ใช้
getPaymentsByLineUserId(lineUserId): Promise<Payment[]>    // Freelancer ใช้ (query by lineUserId)
getPaymentsByFreelancer(freelancerId): Promise<Payment[]>  // Admin ใช้ (query by Firestore docId)
createPayment(data, freelancerEmail?): Promise<string>     // trigger email อัตโนมัติ
updatePayment(id, data)
approvePayment(id, adminNotes?)
markPaymentPaid(id, freelancerId, amount, adminNotes?)     // atomic increment totalEarned
rejectPayment(id, adminNotes?)

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
                  create: status=pending, amount>0, workDescription ไม่ว่าง
                  required fields: freelancerId, lineUserId, amount, status,
                                   requestedAt, workDescription,
                                   freelancerName, bankAccount, bankName
```

## Storage Rules — สรุป

```
idCards/{lineUserId}/{fileName}:
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

# Deploy ทั้งหมด
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

6. **Payment flow**: Freelancer ไม่ต้องมี JobAssignment — เลือก Job จาก dropdown แล้วขอเบิกได้เลย `workDescription` = ชื่องาน

7. **Logo white mode**: ใน header สีแดง ต้องส่ง `white` prop → SVG ทุก path เป็น `fill="white"`

8. **Skeleton**: ใช้ class `.skeleton` จาก `globals.css` (shimmer animation) — อย่าใช้ `animate-pulse` ของ Tailwind

9. **calcTax**: `tax = Math.round(gross * 0.03)` ใช้ทั้ง frontend และ function (เขียนซ้ำในแต่ละที่)

10. **Firebase Functions region**: `asia-southeast1` สำหรับทุก function — ตั้งไว้ใน `setGlobalOptions`
