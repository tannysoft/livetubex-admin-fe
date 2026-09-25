@AGENTS.md

# LiveTubeX Admin — โครงสร้างแอปพลิเคชัน

## ภาพรวม
ระบบจัดการงานถ่ายทอดสด — **whitelabel** deploy ให้หลายบริษัทได้
(1 บริษัท = 1 Firebase project — ดู [docs/WHITELABEL.md](docs/WHITELABEL.md)) แบ่งเป็น 3 ส่วนใหญ่:
- **Admin Panel** (`/admin/*`) — จัดการงาน, freelancer, อนุมัติการเบิกจ่าย
- **Admin Accounting** (`/admin/accounting/*`) — ระบบบัญชี SME เต็มรูปแบบ:
  - **ขาย**: ลูกค้า, ใบเสนอราคา, ใบแจ้งหนี้, ใบกำกับภาษี, ใบเสร็จ + PDF (Sarabun)
  - **รายจ่าย**: ผู้ขาย, รายจ่าย, หมวดค่าใช้จ่าย, รายงานรายจ่าย
  - **ภาษี**: รายงาน ภพ.30 (VAT) + ภงด.3/53 (WHT) + Export CSV
  - **งบการเงิน**: P&L รายเดือน เปรียบเทียบเดือนก่อนหน้า
  - **Auto-link**: Freelancer payment ที่ paid → สร้าง Expense (ค่าจ้างทำของ) อัตโนมัติ
- **Equipment OB** (`/admin/equipment/*`) — สต็อกอุปกรณ์ + แผนจัดของต่องาน (จดว่าอะไรโยกไปไหน) + ผังโยงสัญญาณ + print
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
| status | 'draft' \| 'published' \| 'in_progress' \| 'completed' \| 'cancelled' | |
| createdAt / updatedAt | string | ISO datetime |

> ⚠️ **budget (ราคาขาย) ไม่อยู่ใน jobs doc แล้ว** — ย้ายไปเก็บที่ `jobFinance/{jobId}` (rules: admin-only)
> เพื่อไม่ให้หลุดไปกับ network response ของ LIFF ที่อ่าน `jobs` ได้
> ฝั่ง admin ใช้ `getJobsWithBudget()` / `getJobWithBudget(id)` join ให้อัตโนมัติ
> (ข้อมูลเก่า migrate ครบแล้ว ก.ค. 2569)

### `jobFinance` (admin-only)
| Field | Type | หมายเหตุ |
|---|---|---|
| budget | number | ราคาขายของงาน — doc id = jobId |

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

### `publicSettings/brand` (whitelabel)
| Field | Type | หมายเหตุ |
|---|---|---|
| appName / appNameEn | string | ชื่อระบบที่โชว์ทุกที่ |
| tagline / description | string | ต่อท้ายชื่อใน `<title>` |
| primaryColor | string | hex — เฉดอื่น derive ด้วย `color-mix()` |
| logoSvg | string | โลโก้ inline SVG (สำหรับเว็บ) |
| logoImagePath | string? | Storage path PNG/JPG (สำหรับ PDF) |
| loginEmailPlaceholder | string | placeholder ช่องอีเมลหน้า login |
| celebrationImage | string? | รูปตอนโอนสำเร็จ (`/xxx.png` = public, ที่เหลือ = Storage path) |

> ⚠️ **read: if true** (ไม่ต้อง login) — หน้า `/login` และ LIFF ต้องโชว์โลโก้ก่อนมี auth
> ห้ามเก็บข้อมูลลับใน collection นี้เด็ดขาด

### `publicSettings/line` (whitelabel)
| Field | Type | หมายเหตุ |
|---|---|---|
| liffId | string | LIFF ID เช่น `2009681467-TEcRBohh` |
| loginChannelId | string | LINE Login channel ID — ใช้ตรวจที่มาของ access token (ว่าง = derive จาก prefix ของ liffId) |

> อ่านได้โดยไม่ต้อง login (LIFF ต้อง init ก่อนรู้ว่า user เป็นใคร)
> ใช้ทั้งฝั่งเว็บ (`resolveLiffId()`) และ Cloud Functions (`getLiffId()` ทำ deep link)
> อ่านไม่ได้ → fallback เป็น `NEXT_PUBLIC_LINE_LIFF_ID` / `LINE_LIFF_ID`
>
> ⚠️ `LINE_CHANNEL_ACCESS_TOKEN` **ห้ามย้ายมาที่นี่** — เป็นความลับ อยู่ใน Secret Manager เท่านั้น

### `positions`
| Field | Type |
|---|---|
| name | string |
| createdAt | string |

### `settings/mail` (whitelabel — admin-only)
| Field | Type | หมายเหตุ |
|---|---|---|
| provider | 'resend' \| 'smtp' | ช่องทางส่ง |
| fromName / fromEmail / replyTo | string | ผู้ส่ง (fromName ว่าง = ใช้ชื่อระบบจากแบรนด์) |
| adminRecipients | string[] | อีเมล admin ที่รับแจ้งเตือน (แทน secret MAIL_TO) |
| smtp | `{host, port, secure, user}` | ใช้เมื่อ provider='smtp' — **ไม่มีรหัสผ่าน** |
| templates | `Record<EmailKey, EmailTemplate>` | subject / heading / intro / footer / enabled ต่อประเภทเมล |

> ⚠️ **ห้ามเก็บ API key / รหัสผ่านที่นี่** — `RESEND_API_KEY`, `SMTP_PASSWORD` อยู่ใน Secret Manager
> EmailKey: `paymentRequestAdmin` | `paymentRequestFreelancer` | `payoutSuccess` | `earningsReport`

### `settings/equipmentAgent` (admin-only — ตั้งค่าผู้ช่วย AI จัดอุปกรณ์)
| Field | Type | หมายเหตุ |
|---|---|---|
| systemPrompt | string | ว่าง = ใช้ `DEFAULT_SYSTEM_PROMPT` (ได้ค่าใหม่อัตโนมัติเมื่ออัปเดตระบบ) |
| rules | string | กฎการต่อสายของทีม ต่อท้าย prompt เป็นบล็อกแยก — ไม่มี field = `DEFAULT_AGENT_RULES` |
| defaultModel | string | model ID เช่น `claude-sonnet-5` (ต้องตรง `/^claude-[a-z0-9.-]+$/`) |
| defaultEffort | 'low' \| 'medium' \| 'high' | ระดับความคิด (`output_config.effort`) ไม่มี field = medium · Haiku 4.5 ไม่รองรับ server ข้ามให้ |
| phaseModels | `{items, wiring}` | รุ่นต่อขั้นในโหมดแบ่ง 2 ขั้น ('' = ตามรุ่นใน dropdown) · ไม่มี field = `DEFAULT_PHASE_MODELS` (จัดของ Sonnet 5 → โยงผัง Opus 5.5) |

> แก้ที่ `/admin/equipment/agent-settings` · client ส่ง prompt/กฎ/model ไปกับทุกคำสั่ง — server ไม่อ่าน doc นี้เอง

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
│   ├── earnings/page.tsx       # รายได้ Freelancer รายเดือน (matrix 12 เดือน × คน + drill-down + CSV)
│   ├── settings/page.tsx       # ตั้งค่าระบบ (รอบการจ่ายเงิน)
│   ├── settings/brand/page.tsx # whitelabel: ชื่อระบบ, สีหลัก, โลโก้ (เว็บ+PDF)
│   ├── settings/line/page.tsx  # whitelabel: LIFF ID + ค่าที่ต้องไปตั้งใน LINE Console
│   └── settings/mail/page.tsx  # whitelabel: provider/ผู้ส่ง/ข้อความในเมล + ปุ่มส่งเมลทดสอบ
└── freelancer/
    ├── layout.tsx              # Freelancer layout
    ├── page.tsx                # หน้าหลัก LIFF: stats, ปุ่มขอเบิก, modal
    ├── register/page.tsx       # สมัคร/แก้ไขโปรไฟล์ + อัพโหลดบัตร
    ├── earnings/page.tsx       # รายได้รายเดือนของตัวเอง (เลือกปี + การ์ดรายเดือน + drill-down)
    └── payments/page.tsx       # ประวัติการเบิกจ่าย + ขอเบิกใหม่
```

### `components/`
```
components/
├── BrandProvider.tsx           # โหลดแบรนด์ runtime + useBrand() + ทา --brand/favicon/title
├── ui/
│   ├── Badge.tsx               # Status pill
│   ├── Modal.tsx               # Generic modal (size: sm/md/lg/xl)
│   ├── ConfirmDialog.tsx       # Confirm destructive action
│   ├── Logo.tsx                # โลโก้จาก brand.logoSvg (prop: white=true → mono)
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
├── line-config.ts              # LIFF ID runtime (publicSettings/line) + cache
├── brand.ts                    # whitelabel: อ่าน/เขียน publicSettings/brand, sanitizeSvg, applyBrandColor
├── mail-settings.ts            # whitelabel: settings/mail + EMAIL_TYPES + renderVars + sendTestEmail
├── email-preview.ts            # renderEmailShell ฝาแฝดของ functions/src/mail.ts (ใช้ทำ modal preview)
├── brand-default-logo.ts       # โลโก้ default (currentColor / var(--brand))
├── types.ts                    # TS interfaces: Job, Freelancer, Payment, etc.
├── utils.ts                    # formatDate, formatCurrency, calcTax, status labels/colors, Thai month/year
├── earnings.ts                 # สรุปรายได้ freelancer รายเดือน — ใช้ร่วม admin + LIFF
└── auth-context/               # Admin auth context
```

### `functions/src/index.ts`
```typescript
lineAuth(onCall)
// รับ: { accessToken: string }
// 1. verify กับ /oauth2/v2.1/verify → เช็ก client_id ตรงกับ loginChannelId ของ tenant
// 2. ดึง profile → สร้าง Firebase Custom Token
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
// Secrets: RESEND_API_KEY, SMTP_PASSWORD, MAIL_FROM

sendTestEmail(onCall)
// Admin only — ส่งเมลทดสอบด้วย config ที่บันทึกไว้ (ไม่รับ from/provider จาก client)
// รับ: { to: string, templateKey: EmailKey }

setPlanShare(onCall)   // Admin — { planId, enabled?, password?, regenerate? } → { shareId, enabled } (hash รหัสด้วย scrypt)
getSharedPlan(onCall)  // สาธารณะ — { shareId, password } → แผนที่ตัดข้อมูลการเงิน (ดู planShares)

equipmentAgent(onCall)  — ดู functions/src/equipment-agent/
// Admin only — ผู้ช่วย AI จัดอุปกรณ์ + ร่างผังโยง (LangGraph.js + Claude) timeout 900s, 1GiB
// รับ: { plan: {id,title,date,endDate,location,notes,items,diagrams}, instruction, history[], model, systemPrompt, rules, phase, effort }
// phase: 'all' (default) | 'items' (ขั้น 1 จัดของ — ปิด tool ผังโยง) | 'wiring' (ขั้น 2 วาดผังจากรายการที่จัดแล้ว)
// คืน: ร่าง { items, diagrams, newDiagramIds, newNodeIds, summary, questions, issues, steps, usage } — ไม่เขียน Firestore
// stream (sendChunk): AgentEvent — step / thinking / text / tool / tool_result / review → หน้าเว็บโชว์ความคิดสด
// Secret: ANTHROPIC_API_KEY
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
// Jobs — budget เก็บแยกที่ jobFinance/{jobId} (admin-only)
getJobs(): Promise<Job[]>                 // ไม่มี budget — ปลอดภัยสำหรับ LIFF
getJob(id): Promise<Job | null>           // ไม่มี budget
getJobsWithBudget(): Promise<Job[]>       // Admin — join budget จาก jobFinance
getJobWithBudget(id): Promise<Job | null> // Admin — join budget
createJob(data), updateJob(id, data), deleteJob(id)  // แยกเขียน/ลบ budget → jobFinance ให้เอง

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
revertPaymentPaid(id, freelancerId, amount)                // ย้อน paid → approved: decrement totalEarned + ถอด paidAt/payoutSlipPath
                                                           // ⚠️ ต้องเรียก removeExpenseForPayment(paymentId) ควบคู่เสมอ (ลบ Expense จาก bridge)
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
THAI_MONTHS / THAI_MONTHS_SHORT  // "มกราคม" / "ม.ค."
thaiYear(year): number             // ค.ศ. → พ.ศ.
thaiMonthYearLabel(year, month)    // (2026, 8) → "สิงหาคม 2569"
```

## lib/earnings.ts — สรุปรายได้ Freelancer รายเดือน

```typescript
toEarningsEntries(payments, jobTitleOf): EarningsEntry[]
  // นับเฉพาะ status='paid' + มี paidAt → คำนวณ gross/tax/net/expense/payout ให้พร้อม
  // payout = net + expenseAmount (ค่าใช้จ่ายเบิกคืนเต็ม ไม่หัก 3%)
paidMonthParts(paidAt): { year, month, key } | null   // "YYYY-MM" ตามเวลาท้องถิ่น
groupByMonth(entries, year?): MonthlyEarnings[]       // เดือนที่มีรายการ (ใหม่ → เก่า)
monthlyTotals(entries, year): EarningsTotals[]        // 12 ช่อง index 0 = ม.ค. (สำหรับ matrix)
sumEarnings(list): EarningsTotals
earningsYears(entries): number[]                      // ปีที่มีรายได้ (ใหม่ → เก่า)
basisAmount(totals, basis): number                    // basis: 'gross' | 'net' | 'payout'
```

> **เกณฑ์เข้าเดือน** = วันที่โอนจริง (`paidAt`) ไม่ใช่ `workDates` — ตรงกับเงินที่ออกจริง
> และตรงกับ Expense/ภงด. ที่ bridge สร้างตอน mark paid
>
> ⚠️ ห้าม `paidAt.slice(0,7)` — paidAt เป็น UTC, ต้อง `new Date(paidAt)` แล้วอ่าน local
> ไม่งั้นรายการที่จ่ายช่วงเช้ามืด (00:00–07:00 ICT) ตกไปเดือนก่อนหน้า

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

publicSettings: read: PUBLIC (ไม่ต้อง login) | write: admin — แบรนด์เท่านั้น ห้ามใส่ของลับ
jobs:           read: authenticated, write: admin
jobFinance:     admin เท่านั้น (budget/ราคาขายของงาน)
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

# Whitelabel — อีเมล owner ตั้งต้น (ต้องตรงกับ BOOTSTRAP_OWNER_EMAIL ใน functions/.env)
NEXT_PUBLIC_BOOTSTRAP_OWNER_EMAIL

# functions/.env (ไม่ใช่ secret — ดู functions/.env.example)
APP_ORIGINS         # โดเมนที่เรียก callable ได้ คั่นด้วย comma (ตัวแรก = ลิงก์ในอีเมล)
LINE_LIFF_ID        # fallback ของ LIFF ID (ค่าจริงอยู่ใน publicSettings/line)
BOOTSTRAP_OWNER_EMAIL
APP_NAME            # ชื่อในอีเมลตอนอ่าน publicSettings/brand ไม่ได้
BRAND_COLOR         # สีในอีเมลตอนอ่าน publicSettings/brand ไม่ได้

# Firebase Secrets (Cloud Functions — ตั้งด้วย firebase functions:secrets:set)
RESEND_API_KEY   # API key จาก resend.com (provider = resend)
SMTP_PASSWORD    # รหัสผ่าน SMTP (provider = smtp) — ต้องมีก่อน deploy เสมอ ใส่ค่าว่างไว้ได้
MAIL_FROM        # อีเมลผู้ส่ง fallback (ค่าจริงอยู่ใน settings/mail)
MAIL_TO          # อีเมล admin fallback (ค่าจริงอยู่ใน settings/mail.adminRecipients)
ANTHROPIC_API_KEY # ผู้ช่วย AI จัดอุปกรณ์ (equipmentAgent) — ต้องมีก่อน deploy functions เสมอ
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
Equipment: equipment, equipmentPlans (+ subcollection revisions), equipmentPlanAssets
ทั้งหมด: admin-only (isAdmin)
```

### Storage Paths

```
companyAssets/{fileName}                     # ลายเซ็น/โลโก้แบรนด์/รูปฉลอง (admin write, auth read) ≤5MB
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
EQ-0001        # อุปกรณ์ OB (running ไม่ reset)
VEN-0001       # ผู้ขาย (running ไม่ reset)
```

> YY = พ.ศ. 2 หลัก, MM = เดือน 2 หลัก, NNNN = running 4 หลัก
> ใช้ `runTransaction` กัน race — `lib/accounting/doc-numbering.ts`

---

## Equipment — อุปกรณ์ OB / แผนจัดของ / ผังโยง

### Collections (admin-only)

#### `equipment`
| Field | Type | หมายเหตุ |
|---|---|---|
| code | string | auto: EQ-0001 (running ไม่ reset — `nextDocNumber('equipment')`) |
| name / category | string / `EquipmentCategory` | หมวดเป็นค่าคงที่ใน `lib/equipment/constants.ts` |
| brand / model / serialNumber | string? | |
| quantity | number | ของชิ้นเดียว = 1, ของนับจำนวน (สาย, ขาตั้ง) > 1 |
| storageLocation | string? | ที่เก็บประจำ → เป็นค่าตั้งต้นของ "หยิบจาก" ในแผน |
| status | 'available' \| 'repair' \| 'retired' | retired ไม่โชว์ในตัวเลือกของแผน |
| inputs / outputs | string[]? | ชื่อ port — **แม่แบบ**ตอนวางลงผังโยง (แก้ในผังไม่กระทบสต็อก) |
| ownership | 'owned' \| 'rental' \| 'partner' | ไม่มี field = owned · rental = **แค็ตตาล็อกของที่เช่าได้** · partner = ของพาร์ทเนอร์ที่เอามาร่วมงาน (เช่น Windblue) — `partnerName`, ค่าใช้จ่ายปกติ 0 |
| rentalVendor / rentalRate | string? / number? | ผู้ให้เช่า + ราคา/ชิ้น/วัน — เลือกเข้าแผนแล้ว snapshot ลง `PlanItem` เป็นต้นทุนให้เอง |

#### `equipmentPlans` (1 doc = 1 แผน เก็บรายการ + ผังทั้งหมดใน doc เดียว)
| Field | Type | หมายเหตุ |
|---|---|---|
| title / date / endDate / location / notes | string | endDate ว่าง = งานวันเดียว — ใช้เช็กของชนกัน |
| jobId / jobTitle | string? | ผูกกับ `jobs/{id}` (optional) — jobTitle เป็น snapshot |
| status | 'draft' \| 'ready' \| 'on_site' \| 'returned' | |
| items | `PlanItem[]` | snapshot `code/name/category` + `quantity`, `fromLocation` → `toLocation`, `note`, `packed`, `returned` |
| diagrams | `PlanDiagram[]` | **1 แผน = 1 ผังโยง** (ภาพ เสียง ส่งจอ FOH Intercom รวมกัน) — ยังเป็น array เพราะข้อมูลเก่าแยกหลายผัง หน้าแก้แผนมีปุ่ม "รวมเป็นผังเดียว" (`mergeDiagrams`) · แต่ละผังมี `nodes[]` + `edges[]` |
| videoFormat | `VideoFormat?` | ระบบภาพ `{resolution, frameRate, range, note}` → หัวกระดาษทุกหน้า "1080i50 · SDR · Rec.709 · HD-SDI" (`lib/equipment/video-format.ts`) — ระดับ SDI คำนวณเอง ไม่เก็บ · interlaced ใช้ field rate |
| recordings | `RecordingSpec[]?` | format ไฟล์บันทึก หลายรายการ `{target, codec, container, resolution?, media, note}` — `resolution` ว่าง = ตามระบบภาพ (ISO BRAW 4K + PGM HD ได้) เช่น PGM ProRes 422 HQ .mov / ISO H.264 .mp4 — หัวกระดาษบรรทัด "บันทึก:" (`lib/equipment/recording-format.ts`) |
| fohFeeds | `FohFeed[]?` | สัญญาณส่งทีม Visual ที่ FOH `{source, destination, destInput?, connection, format?, cableLength, note}` — format ว่าง = ตามระบบหลัก · พิมพ์หน้าแยก (ช่องติ๊กรับ + เซ็นส่ง/รับ) + บรรทัดสรุปบนหัวกระดาษ (`lib/equipment/foh-feeds.ts`) |
| layouts | `PlanLayout[]?` | ผังวาง 3D — `venue` (ขนาดสถานที่/เวที/อัฒจันทร์) + `objects[]` (กล้อง, jib, รถ OB, จอ ฯลฯ) |

#### `equipmentPlans/{planId}/revisions` (admin-only — rule แยกของ subcollection)
snapshot ของแผน: `number` (Rev 1,2,3… ต่อแผน), `label`, `note`, `source` ('manual' | 'agent' ก่อนใช้ร่าง AI | 'restore' ก่อนกู้คืน),
`items`, `diagrams`, `layouts`, `hash`, `stats`, `createdBy` — **ไม่เก็บ extraCosts** · plan doc มี `revision` (meta ของ Rev ที่ตรงกับแผน)
ลบแผนต้องลบ subcollection เอง (`deleteEquipmentPlan` ทำให้แล้ว)

#### `planShares/{planId}` (อ่าน: admin · เขียน: function `setPlanShare` เท่านั้น)
ลิงก์แชร์แผนให้ทีมงานดูบนมือถือ `/share/plan?s={shareId}` + รหัสผ่าน (ไม่ต้อง login)
`shareId` (สุ่ม 22 ตัว เปลี่ยนได้ = ลิงก์เก่าใช้ไม่ได้), `enabled`, `salt`/`hash` (scrypt ฝั่ง server), `failCount`/`lockedUntil`
(ผิด 8 ครั้ง → ล็อก 10 นาที) · หน้าแชร์เรียก `getSharedPlan` (สาธารณะ) ได้แผน **ปัจจุบัน** ที่ผ่าน `sanitizePlan()` —
allowlist field ของ item (ไม่มีต้นทุน/ผู้ให้เช่า/expenseId), ไม่มี extraCosts/jobId, ผังวางไม่มีรูป floor plan
⚠️ เพิ่ม field ที่ทีมหน้างานต้องเห็น → เพิ่มใน allowlist ของ `functions/src/plan-share.ts` + type `SharedPlan` (`lib/equipment/plan-share.ts`)

#### `equipmentPlanAssets` (admin-only)
รูป floor plan ที่ปูพื้นในผัง 3D เก็บเป็น **data URL ใน Firestore** (ย่อ ≤900KB ฝั่ง client) —
ตั้งใจไม่ใช้ Storage เพราะ WebGL texture บังคับ CORS ซึ่ง bucket ของ tenant ใหม่ไม่ได้ตั้งไว้
ไม่ลบ doc ตอนเอารูปออก/ลบแผน เพราะแผนที่ถูกสำเนาอาจอ้างรูปเดียวกัน

> `PlanItem.equipmentId` ว่าง = ของนอกสต็อก (เช่า/ยืม) — แก้ชื่อ/หมวดในตารางได้เอง
> `PlanItem.useFrom/useTo` = ใช้ไม่เต็มงาน (ช่วงย่อยในวันงาน, ว่าง = ทั้งงาน) — **เช็กคิวทุกจุดนับทีละวันตามช่วงของแถว**
> (`planBookings`/`planConflicts`/`usageByEquipment(plans, range)`/`usageInRange` ใน `availability.ts` + ฝาแฝด `loadOtherUsage`/`Workspace.available`/`validate` ฝั่ง functions)
> อ่านผ่าน `clipItemRange()`/`itemUseLabel()` เสมอ · ตารางจัดของตั้งวันได้เฉพาะงานหลายวัน, ของเช่า → `rentalDays` = จำนวนวันที่ใช้, ของติดกล้องที่วันตรงกับกล้องเปลี่ยนตาม
> `PlanItem.attachedTo` = id ของแถวแม่ในแผน (เลนส์ → กล้อง) — ตาราง/print วาดใต้กล้อง (หมวดกล้อง), แถวแม่หาย = กลับเป็นแถวปกติ
> เลนส์รุ่นเดียวกันจับคู่หลายกล้องได้ = **หลายแถว equipmentId ซ้ำ** → เช็กของว่างต้องรวมจำนวนต่อ equipmentId (`planConflicts` ทำแล้ว,
> picker ทุกตัวรับ `inPlanQty` (แถวกล้องมีปุ่มเดียว "+ เพิ่มของ" → picker ทุกหมวด ติดกล้องนั้น + เช่าเพิ่มนอกสต็อก)) · ปุ่ม "เปลี่ยน" ทุกแถวในสต็อก (ยังไม่ลงบัญชี) = `replaceWithStock` เปลี่ยนเป็นของตัวอื่น/เจ้าอื่น คงแถว (id, ปลายทาง, ของในชุด, วันใช้) + กล่องในผัง (label/port เดิม, sub รุ่นใหม่) · ลบกล้อง = ถอดคู่ ไม่ลบเลนส์ · เปลี่ยนปลายทางกล้อง → เลนส์ที่ปลายทางเดิมตรงกันย้ายตาม
> ผู้ช่วย AI: `add_items`/`update_items` มี `attachTo` (ฝาแฝดใน `workspace.ts`)
> `DiagramEdge.from/to` = `{ nodeId, side: 'in'|'out'|'io', index }` — **อ้าง port ด้วย index**
> `DiagramNode.note` = หมายเหตุของกล่อง วาดเป็นแถบเหลืองใต้ port (`wrapNote` ตัดคำไทยด้วย `Intl.Segmenter`, ≤ `NOTE_MAX_LINES` บรรทัด
> เกินแล้วต่อ … ฉบับเต็มพิมพ์ใต้ผัง) — `nodeHeight()` รวมความสูงหมายเหตุแล้ว port/เส้นไม่ขยับเพราะหมายเหตุอยู่ล่างสุด
> `io` = port เข้า-ออกในตัวเดียว (12G-SDI bidirectional, LAN, Intercom) วาดเป็น ◇ ฝั่งขวาต่อจาก outputs โยงได้ทุกทิศ
> อ่านชื่อ/แถวของ port ผ่าน `portsOf()` / `portRow()` เสมอ อย่า index `inputs/outputs` ตรงๆ
> ลบ port กลางรายการต้องเลื่อน index ของเส้นที่เหลือ (ดู `removePort()` ใน `DiagramEditor`)

### ไฟล์

```
lib/equipment/
├── constants.ts     # หมวด, สถานะ, DEFAULT_PORTS ต่อหมวด, SIGNAL_TYPES (สี + dash), CATEGORY_COLORS
├── equipment.ts     # CRUD สต็อก
├── plans.ts         # CRUD แผน + stripUndefined (deep) + newId
├── diagram.ts       # เรขาคณิตผัง: nodeHeight, portPosition, edgePath, diagramBounds, isEdgeValid
├── venues.ts        # VENUE_PRESETS (ขนาดโดยประมาณ!), OBJECT_KINDS, KIND_DEFAULTS
├── layout-scene.ts  # three.js: buildVenue, buildObject, cameraPose, snapshotLayout (print)
├── plan-assets.ts   # รูป floor plan (data URL ใน Firestore)
├── agent.ts         # เรียก equipmentAgent + จัดตำแหน่งกล่องของร่าง (autoLayoutDiagram ใน diagram.ts)
├── agent-settings.ts # settings/equipmentAgent + AGENT_MODELS + DEFAULT_SYSTEM_PROMPT + DEFAULT_AGENT_RULES
├── foh-feeds.ts     # ส่งภาพทีม Visual (FOH): FOH_SYSTEMS (E2/Aquilon/Novastar…), feedFormatLabel, fohSummary, fohAgentText
├── layout-zones.ts  # ผังวาง 3D ตามโซน: applyZonePlacements, ensureFoh (ทุกผังมีโต๊ะ FOH), newLayout, applyAgentLayout
├── atem-export.ts   # ตั้งค่า ATEM จากผังโยง: ชื่อ input (เดินย้อนผ่าน converter หากล้อง) · AUX = port SDI OUT ที่มีสาย (เดาแหล่งจากป้ายสาย PGM/Clean/MV/CAM n, เดาไม่ได้ = ATEM_UNSET ไม่แตะ) · Multiview (PVW, PGM + input) — เลขแหล่งตามโปรโตคอล ATEM (input n, PGM 10010+10(ME-1), Clean 700n, MV 900n) · patch ไฟล์ .xml จากเครื่อง (แก้เฉพาะ element ที่มีอยู่) หรือสร้าง XML ขั้นต่ำ (tag AUX/MV เดา) — `AtemExportModal` เปิดได้ 3 ที่: ปุ่ม "Download XML ATEM" บนแถบแท็บผังโยง, แผงกล่อง switcher, และหน้าแชร์ทีมงาน (แท็บผังโยง — ทำงานฝั่ง client ล้วน ไม่ต้อง login)
├── foh-diagram.ts   # buildFohDiagram: feed → ผัง "ส่งภาพ FOH — ทีม Visual" (สวิตเชอร์ → converter/fiber/encoder → เครื่อง FOH)
├── recording-format.ts # format ไฟล์บันทึก: codec → นามสกุลไฟล์ตั้งต้น, presets, recordingsLabel
├── video-format.ts  # ระบบภาพ: presets, formatFullLabel, sdiLevel (ส่งเป็นข้อความให้ผู้ช่วย AI ด้วย)
├── owners.ts        # "เจ้าของ" ของอุปกรณ์ (OWN_OWNER = บริษัทเรา / partnerName / rentalVendor) — กรองทีละบริษัทในหน้าของเหลือ (dropdown) ตารางรายการในแผน (chips, `PlanItemsTable.ownerFilter`) และหน้าแชร์ทีมงาน (`sharedItemOwner` ใช้ fromLocation เพราะ allowlist ไม่ส่ง rentalVendor)
├── revisions.ts     # revision: create/list/get/delete, planContentHash, restoreContent
└── plan-diff.ts     # diffItems / changedDiagrams / removedDiagrams — ใช้ทั้งร่าง AI และหน้า revision

functions/src/equipment-agent/   # ผู้ช่วย AI (LangGraph.js + @langchain/anthropic)
├── types.ts         # ฝาแฝดของ type ฝั่งเว็บ (Equipment, PlanItem, PlanDiagram, DEFAULT_PORTS) ⚠️ ต้อง sync
├── workspace.ts     # ร่างในหน่วยความจำ + ตรวจ (ของชนวัน, port มีจริง, port ละเส้น) — ทุก tool ทำงานผ่านนี่
├── tools.ts         # tool ที่ให้ LLM เรียก (search_inventory, add_items, add_nodes, connect, validate, finish …)
├── prompt.ts        # system prompt ตั้งต้น — fallback เท่านั้น ⚠️ ฝาแฝดของ DEFAULT_SYSTEM_PROMPT ฝั่งเว็บ
├── graph.ts         # StateGraph: agent ⇄ tools → review (มี ✗ ส่งกลับแก้ ≤2 รอบ) → END
└── index.ts         # ตรวจ payload + โหลด equipment/แผนอื่นด้วย admin SDK แล้วรัน graph

components/admin/equipment/
├── EquipmentForm.tsx      # ฟอร์มอุปกรณ์ (port = textarea บรรทัดละ 1)
├── EquipmentPicker.tsx    # modal เลือกของจากสต็อกเข้าแผน (multi-select + จำนวน)
├── PlanItemsTable.tsx     # ตารางจัดของ แก้ inline + ตั้งปลายทางรวดเดียว
├── DiagramGraph.tsx       # เนื้อ SVG (เส้น+กล่อง) — ใช้ร่วม editor และ print
├── DiagramEditor.tsx      # ตัวแก้ผัง: ลากกล่อง, โยงสาย, pan/zoom, side panel
├── LayoutEditor.tsx       # ตัวแก้ผังวาง 3D (three.js) — โหลดผ่าน next/dynamic ssr:false เท่านั้น
├── AgentPanel.tsx         # modal ผู้ช่วย AI: สั่ง → ร่าง (สรุป/คำถาม/ปัญหา/diff/preview ผัง) → ใช้ร่าง
├── RevisionPanel.tsx      # modal revision: บันทึก Rev ใหม่, เทียบกับตอนนี้, พิมพ์ฉบับ revision, กู้คืน, ลบ
├── FohFeedsEditor.tsx     # แก้ feed ที่ส่ง FOH (ใช้ VideoFormatPicker แบบ compact เมื่อ format ต่างจากระบบหลัก)
├── RecordingFormatsEditor.tsx # แก้ format ไฟล์บันทึก (หลายแถว)
├── VideoFormatPicker.tsx  # เลือกระบบภาพ (ใช้ตอนสร้างแผน + หน้าแก้แผน)
├── DiagramPreview.tsx     # ผังย่อ read-only (ใช้ใน AgentPanel + RevisionPanel)
└── PlanPrintDocument.tsx  # เอกสารที่พิมพ์: รายการ → ผัง → ตารางสาย

app/admin/equipment/
├── inventory/page.tsx     # สต็อกอุปกรณ์ (CRUD + ค้นหา + ทำสำเนา)
├── availability/page.tsx  # ของเหลือตามช่วงวันที่ (มีปุ่มพิมพ์) — หักของที่แผน (ยังไม่เก็บกลับ) จองไว้ · usageInRange() ใช้ยอดวันพีค ไม่รวมแผนคนละวัน
├── plans/page.tsx         # รายการแผน + สร้าง/สำเนา/ลบ
├── plans/edit/page.tsx    # ?id=xxx — แท็บ รายการอุปกรณ์ / ผังโยง (autosave)
├── plans/print/page.tsx   # ?id=xxx — เลือกส่วนที่จะพิมพ์ แล้ว window.print()
└── agent-settings/page.tsx # ตั้งค่าผู้ช่วย AI: รุ่นเริ่มต้น, กฎของทีม, system prompt (คืนค่าเริ่มต้นได้)

app/share/plan/page.tsx     # ?s=shareId — หน้าแชร์ทีมงาน (มือถือ, ไม่ต้อง login): ใส่รหัส → แท็บ อุปกรณ์ / ผังโยง / ผังวาง
                            # ผังซูมด้วย components/ui/ZoomPan (บีบ 2 นิ้ว/ลาก/แตะ 2 ครั้ง) · รหัสจำใน sessionStorage · robots noindex
                            # แท็บผังวางวาด 3D สดด้วย LayoutViewer (ไม่ใช่รูป — ซูมแล้วไม่แตก) · ปุ่มแนวเลนส์ใช้ค่า useLensLines() ร่วมกับหน้าแก้ผัง/หน้าพิมพ์ · ขนาดป้าย S/M/L = useLabelSize() + LabelSizePicker (lib/equipment/lens-lines.ts) ใช้ร่วม 3 หน้าเช่นกัน · โพเดียมไม่มีป้าย
components/admin/equipment/SharePlanModal.tsx  # ปุ่ม "แชร์ทีมงาน" หน้าแก้แผน: ตั้งรหัส, เปิด/ปิด, คัดลอกลิงก์, สร้างลิงก์ใหม่
lib/equipment/item-groups.ts # groupItems (ตามหมวด/ปลายทาง + เลนส์ใต้กล้อง) ใช้ร่วมหน้าพิมพ์ + หน้าแชร์
                             # ป้าย CAM: camTag(item, camLabels(plan)) อ่านเบอร์จาก label กล่องในผังโยง/ผัง 3D (planItemId) ก่อน → หมายเหตุ (ข้อมูลเก่า) → ปลายทาง
                             # ⇒ หมายเหตุไม่ต้องมี "CAM n" · กล้องเรียงตามเบอร์ (sortByCam) · หมายเหตุที่มีแค่ "CAMn" ไม่โชว์ (isCamOnlyNote)
```

### กฎสำคัญ

- **ผังโยงเขียนเองด้วย SVG ไม่ใช้ library** — `DiagramGraph` เป็นตัว render เดียวทั้งจอและ print
  แก้หน้าตากล่อง/เส้นที่เดียว ผังที่พิมพ์จะตรงกับที่วาดเสมอ ขนาดกล่อง/ตำแหน่ง port อยู่ใน `lib/equipment/diagram.ts`
- **สีเส้นต้องคู่กับ dash เสมอ** (`SIGNAL_TYPES`) — ผังมักถูกพิมพ์ขาวดำ สีอย่างเดียวแยกประเภทสายไม่ออก
  สีหมวด/สีสัญญาณเป็น hex คงที่ได้ (เป็นความหมายของข้อมูล ไม่ใช่สีแบรนด์ — ไม่ขัดกฎข้อ 28)
- **autosave ของหน้าแก้แผน**: `change()` เขียน `latest` ref + bump `version` แล้ว debounce 1.2s
  ห้ามอ่าน `plan` state ใน `save()` — ต้องอ่านจาก ref ไม่งั้น save ที่ค้างอยู่ได้ค่าเก่า
  ปุ่มพิมพ์ต้อง `await save()` ก่อน navigate เพราะหน้า print อ่านจาก Firestore
- **Print ใช้ CSS ไม่ใช่ react-pdf**: `@page` ใน `globals.css` — **ทุกหน้าเป็น A4 แนวนอน** (ผู้ใช้ขอ — แนวตั้งไม่สวย), `.print-landscape`/`.print-portrait`
  เหลือแค่ขึ้นหน้าใหม่ (ชื่อ class เก่า) · ใช้ `window.print()` 2 ที่: หน้าพิมพ์แผน และหน้าของเหลือในสต็อก (`availability` — ซ่อนตัวกรองด้วย `print:hidden`, หัวกระดาษบอกช่วงวัน + ตัวกรอง) sidebar/toolbar ซ่อนด้วย `print:hidden`
  `app/admin/layout.tsx` มี `print:ml-0 print:p-0` — ห้ามเอาออก ไม่งั้นเอกสารเยื้องขวาเท่าความกว้าง sidebar
- **React ผูก `wheel` แบบ passive** → zoom/pan ของ canvas ผูก native listener เอง (`{ passive: false }`)
- **ผังวาง 3D**: หน่วยเมตร, x = ซ้าย-ขวา, z = ลึก (เวทีอยู่ฝั่ง -z), `rotation` 0° = หันหาเวที หมุนตามเข็ม
  `layout-scene.ts` ดึง three.js ทั้งก้อน → **ห้าม import แบบ static จากหน้า/‌component ที่ prerender**
  (ใช้ `next/dynamic` หรือ `await import`) mesh ที่ `userData.ground = true` คือผิวที่วางของได้ —
  ลากวัตถุแล้ว `y` ตั้งตามผิวที่ ray ชนเอง (พื้น/เวที/ขั้นอัฒจันทร์)
- **ทางเดินอัฒจันทร์** (เฉพาะแบบเหลี่ยม): `tiers.aisleWidth/sectionWidth` แบ่งที่นั่งเป็นบล็อก (ตำแหน่งคิดจากขอบพื้นราบ ใช้ทุกขั้น = แนวตรง),
  `tiers.crossAisle` = ขั้นที่เป็นทางเดินขวาง — ทางเดินยังเป็นผิววางของได้ · ค่าอยู่ใน venue ของแต่ละผัง แก้ preset แล้วผังเก่าไม่เปลี่ยนตาม
- **ผนังล่างอัฒจันทร์** `tiers.wallSteps` = ขอบตรงลงพื้น N ขั้นก่อนแถวแรก (นั่ง/วางของที่ผนังไม่ได้) ทุกแถวยกขึ้น N ขั้น — Impact Arena = 3
- **มุมโค้งอัฒจันทร์** `tiers.cornerRadius` (แบบเหลี่ยมที่มี sides + back/front) = มุมข้าง↔หลัง/หน้าเป็นวงแหวน 1/4 (`cornerSlab`) รัศมีวัดที่ขอบพื้นราบ — Impact Arena = 14
- **หน้าพิมพ์ขยายเพิ่ม** (`snapshotLayout`): ป้าย ×`PRINT_LABEL_BOOST` และโมเดลกล้อง ×`PRINT_MODEL_BOOST` (ขยายจากพื้น กล้องดูสูงขึ้น — ไม่ใช่สเกลจริง) เพราะ A4 ย่อทั้งสถานที่
- **โมเดลกล้องขยาย `CAMERA_MODEL_SCALE` (1.6×)** ให้เห็นในผังใหญ่ — สร้างที่ mountHeight/S แล้วขยายทั้งก้อน ระดับเลนส์ยังตรงค่าจริง · กรวยมุมภาพ (`userData.wedge`) ถูกย้ายออกนอกก้อนที่ขยาย ระยะไม่เพี้ยน · jib ไม่ขยาย
- **เลนส์ tele เช่า → ขาตั้งมาด้วย** (`lib/equipment/tele-tripod.ts`): จับคู่เลนส์เช่าที่เป็น tele (box lens / ≥40x) กับกล้อง ทั้ง picker เลนส์และ dropdown จับคู่ในตาราง
  เพิ่มแถว "ขาตั้ง (มากับเลนส์ Tele Nx)" ร้านเดียวกัน ราคา 0 ติดกล้องเดียวกัน · กฎเดียวกันอยู่ใน `DEFAULT_AGENT_RULES` ให้ผู้ช่วย AI
- **อัฒจันทร์ 2 แบบ**: เหลี่ยม (เลือกด้าน `sides/back/front`) หรือ `tiers.curved` = ชามวงรีล้อมรอบ
  (`ellipseSlab` — วงแหวน ExtrudeGeometry ต่อขั้น, `width/depth` กลายเป็นแกนของพื้นวงรี) เช่น อินดอร์ฯ หัวหมาก, ราชมังคลา
  `venue.pitch` = สนามกีฬากลาง (พื้นเขียว) · ตาราง 5 ม. เป็น **texture บนพื้น** ไม่ใช่ GridHelper (สี่เหลี่ยมล้นออกนอกวงรี)
- **Riser ก็เป็นผิววางของ** (`userData.ground` บนตัวแท่น) — ลากกล้องมาทับแล้วขึ้นไปอยู่บนแท่น, ย้าย/ปรับความสูง riser
  แล้วของบนแท่นตามไปด้วย (`ridersOf`) · หลัง rebuild วัตถุต้อง `updateMatrixWorld(true)` เอง เพราะ three อัปเดตตอน render
  แต่ pointermove ถัดไปอาจ raycast ก่อน frame นั้น (อาการ: วางทับ riser ไม่ติด)
- **`VENUE_PRESETS` เป็นขนาดโดยประมาณ** ไม่ได้มาจากแบบก่อสร้าง — UI และหน้า print มีคำเตือนกำกับ ห้ามเอาออก
  ความแม่นได้จากให้ผู้ใช้ปูรูป floor plan จริง + กรอกความกว้างจริง
- OrbitControls กับการลากวัตถุใช้ pointer ตัวเดียวกัน → listener ของเราผูกแบบ `capture` ให้ทำงานก่อน
  แล้วปิด `controls.enabled` เมื่อโดนวัตถุ
- **ต้นทุนของแผน → ต้นทุนจริงของงาน** (`lib/equipment/rental-cost.ts`) มี 2 แหล่งที่รวมเป็น `CostLine` เดียวกัน:
  `plan.extraCosts` (รถตู้/ที่พัก/อาหาร — เลือกหมวดบัญชีเอง, ไม่โผล่ในใบจัดของ) และค่าเช่า: `isRentalItem()` =
  `itemOrigin(it) !== 'owned'` — `PlanItem.origin` ('rental'|'partner', ยังมี `equipmentId` จึงได้ port ในผังโยง) หรือของพิมพ์เอง
  (`equipmentId` ว่าง) · `isRental` เป็น field เก่า อ่านผ่าน `itemOrigin()` เท่านั้น · พาร์ทเนอร์มีแถวต้นทุนแต่ปกติ 0 (ลงบัญชีเฉพาะที่ > 0)
  มี `rentalVendor / unitCost / rentalDays` — ยอด = `unitCost × quantity × rentalDays` (ก่อน VAT)
  ยอดเดียวกันต้องถูกนับ **ที่เดียวเสมอ**: ยังไม่มี `expenseId` → หน้าต้นทุนต่อโปรเจกต์นับจากแผน
  (`uncountedPlanCost`), กด "ลงบัญชีเป็นรายจ่าย" แล้ว → เป็น Expense (1 ใบต่อหมวด+ผู้รับเงิน,
  `sourceType='manual'`, ไม่ใส่ VAT/WHT ให้บัญชีเติมเอง) และแผนเลิกนับ ถ้า Expense ถูกยกเลิก ยอดกลับมานับจากแผน
  แผนต้องผูก `jobId` ไม่งั้นค่าเช่าไม่เข้างานใด · สำเนาแผนต้องถอด `expenseId`
- **แค็ตตาล็อกผลิตภัณฑ์** (`lib/equipment/catalog/`) เป็น static data ในโค้ด (Blackmagic, Sony, Panasonic Lumix, DJI (Ronin, Osmo/Action, โดรน), Hollyland, Vaxis, SWIT, Accsoon, Peplink, AVMATRIX, AJA, NAYA, มิกเซอร์ Yamaha/Allen & Heath/Zoom, ADAM Audio, Focusrite) —
  port ต่อรุ่นมาจากความรู้ทั่วไป ไม่ใช่ spec sheet ฟอร์มเติมเป็นค่าตั้งต้นให้แก้ต่อ
  เพิ่มยี่ห้อ = เพิ่มไฟล์แล้วรวมใน `PRODUCT_CATALOG` + ชื่อใน `CATALOG_BRANDS` · `searchCatalog` จับคู่ทั้งแบบมี/ไม่มีช่องว่าง ("m/e" ↔ "me")
  **ราคา** แยกไว้ที่ `prices.ts` (key = `name`, บาทรวม VAT ต่อชิ้น **โดยประมาณ** — ที่รู้ราคาไทยจริงใช้ตามร้าน ที่เหลือ USD×~40)
  รวมเข้า `price/priceNote` ตอน build `PRODUCT_CATALOG` · รุ่นเก่า/เลิกผลิตตั้งใจไม่ใส่ราคา · ลำโพง ADAM เป็นราคาต่อข้าง · กล้อง Sony เป็นราคา body
  ฟอร์มเติม `Equipment.price` เฉพาะตอนช่องยังว่าง (มูลค่าต่อชิ้น ไว้ประกัน/ประเมิน — **ไม่เข้าต้นทุนงาน** นั่นคือ `rentalRate`)
  ของที่ขายเป็นชุด (อินเตอร์คอม Hollyland `-4S/-8B`, ส่งภาพไร้สาย Vaxis TX+RX) ให้เป็น **1 รายการต่อชุด** port = ตัวแม่/base station
  (ชุดส่งภาพ: ขาเข้า = port ตัวส่ง, ขาออก = port ตัวรับ ต่อท้ายชื่อด้วย `(TX)`/`(RX)`)
  ส่งภาพไร้สายทุกยี่ห้ออยู่หมวด `wireless` (แยกจาก `converter`) — เพิ่มหมวดใหม่ต้องแก้ทั้ง `EquipmentCategory`,
  `EQUIPMENT_CATEGORIES/CATEGORY_COLORS/DEFAULT_PORTS`, คอลัมน์ใน `autoLayoutDiagram` และฝาแฝดใน `functions/src/equipment-agent/types.ts`
  ตัวเดี่ยวเก็บเป็นรายการ "(เพิ่ม/อะไหล่)" ต่างหาก
- **autocomplete ช่องข้อความ** (ที่เก็บ / ผู้ให้เช่า / พาร์ทเนอร์ / ปลายทาง / ผู้รับเงิน) ใช้ `components/ui/SuggestInput`
  ไม่ใช้ `<datalist>` (Safari/มือถือโชว์ไม่ติด กรองไม่ได้) ตัวเลือก = ค่าที่เคยกรอกในสต็อก/แผน **+ ชื่อผู้ขายจาก `vendors` (บัญชี)**
  เพื่อให้ผู้รับเงินสะกดตรงกับตอน `recordPlanExpenses` สร้าง Expense · โหลด vendors แบบ `.catch(() => [])` ห้ามให้สต็อกพังเพราะบัญชี
- **ของชนกันระหว่างแผน** (`lib/equipment/availability.ts`): แผนอื่นที่ `date..endDate` ทับกันและยังไม่ `returned`
  → นับจำนวนที่ใช้ต่อ `equipmentId` (`usageByEquipment`) picker กันเลือกเกิน `quantity - used` และหน้าแผนมีแถบแดง
  (`planConflicts`) ถ้าเปลี่ยนวัน/จำนวนทีหลัง · แผนไม่มี `date` = เช็กไม่ได้ (เตือนใน picker) · ของพิมพ์เอง (ไม่มี `equipmentId`) ไม่ถูกนับ
- **ผังวาง 3D จากผู้ช่วย AI** (`layout-zones.ts`): tool `place_3d` ให้ LLM เลือก **โซน** (stage_front_left/right/center, on_stage,
  floor_left/right, foh_center, back_left/right, ob_area) ไม่ใช่พิกัด — server คืน `placements` แล้วเว็บแปลงเป็น x/z/rotation ตามขนาด venue
  (ซ้าย/ขวา = มองจาก FOH ไปเวที = x ลบ/บวก) · ของเดิมจับด้วย `planItemId` ก่อนชื่อ (ย้ายแล้วคงชนิดเดิม) · `swapWith` = สลับตำแหน่ง 2 วัตถุ
  (tool `swap_positions` สลับปลายทาง+ของในชุด, sub ในผังโยง, ตำแหน่ง 3D ในครั้งเดียว) · `layoutAgentText` บอกโซนปัจจุบันของแต่ละชิ้นให้ผู้ช่วย
  · `update_items`: เปลี่ยน toLocation กล้อง → ของในชุดที่อยู่ที่เดิมตาม, attachTo ไปกล้องใหม่ → ปลายทางตามกล้อง (ฝาแฝดของตารางหน้าเว็บ) วางในผังแรก (ไม่มี = สร้างใหม่ เดา venue จาก `plan.location`) · ชื่อ+item เดิม = ย้าย ไม่สร้างซ้ำ
  · หาช่องว่างในโซนเอง (ไม่ทับของเดิม) · **ทุกผังวางใหม่มีโต๊ะ FOH** (`ensureFoh`) ทั้งปุ่มเพิ่มผังและร่าง AI
  กติกาเลนส์ → โซน (16x/left/right = หน้าเวทีซ้ายขวา, tele/half tele = foh_center) อยู่ใน `DEFAULT_SYSTEM_PROMPT` แก้ได้จากหน้าตั้งค่า
  รายการโซนต้องตรงกันระหว่าง `LayoutZone` (เว็บ) และ `LAYOUT_ZONES` (functions/types.ts)
  ชนิดวัตถุ (`LayoutObjectKind`) ต้องตรงกับ `LAYOUT_KINDS` เช่นกัน · ชนิดที่เป็นกล้อง (กรวยภาพ/มุมมองกล้อง/คอลัมน์เลนส์) เช็กผ่าน `isCameraKind()` เท่านั้น
  (camera, jib, gimbal = โรนิน/กิมบอลถือมือ, remote_head = หัว Jimmy Jib ห้อยจาก truss, micro_stand = ขา Micro เสาสูงฐานสามขา, action_cam = action cam บนไม้ถือสั้น, ptz = กล้อง PTZ บนขาตั้ง, tele_lens = กล้อง + เลนส์ tele ENG ~40x บนขาตั้ง, box_lens = กล้อง + box lens บนขาตั้งงานหนัก) — มี `podium` (แท่นพูด หมุน 180° หาผู้ชมเป็นค่าตั้งต้น)
- **สายส่ง FOH** (`buildFohDiagram`): ปุ่ม "วาดลงผังโยง" วาด **ลงผังหลัก** (ไม่สร้างผังแยกแล้ว) กล่องที่สร้างติด `DiagramNode.generated = 'foh'`
  → กดซ้ำ = ยืนยันแล้ว `stripFoh` ชุดเดิมก่อนวาดใหม่ กล่องอื่นไม่แตะ · ผังแยกแบบเก่า (`FOH_DIAGRAM_NAME`) ถูกเอาออกตอนวาดใหม่ · bump `agentApplied` ให้ DiagramEditor remount
  · ต้นทาง = กล่องสวิตเชอร์ที่อยู่ในผังแล้ว (port ขาออกที่มีเส้นอยู่ไม่แย่ง) ไม่มี = กล่องของแถว switcher แรก · จับ port ตามชื่อสัญญาณ 2 รอบ: ชื่อตรงก่อนแล้วค่อยตัวสำรอง
  ไม่งั้น "Clean feed" แย่ง AUX 1 · จัดตำแหน่งเฉพาะกล่องใหม่ต่อใต้ของเดิม · SDI↔HDMI ไม่ตรง = กล่อง converter, format ต่างจากระบบหลัก = cross converter, Fiber = TX/RX, NDI/SRT = encoder
  (กล่องแทรกเป็นกล่องอิสระ ไม่ผูกสต็อก) · ปลายทางชื่อเดียวกัน = กล่องเดียว · เตือนเมื่อส่ง 1080i ไปเครื่องที่ `FOH_SYSTEMS.progressive`
- **Revision** (`lib/equipment/revisions.ts`): `planContentHash()` ไม่นับ `packed/returned/expenseId/expenseCode`
  (ความคืบหน้าหน้างาน/บัญชีไม่ใช่การแก้แผน) และเรียง key เอง (Firestore ไม่รับประกันลำดับ key)
  `plan.revision` เขียนตรงด้วย `setPlanRevision()` **ไม่ผ่าน `change()`** — ไม่ใช่การแก้เนื้อหา autosave จึงไม่ต้องทำงาน
  (autosave ก็ไม่เขียน field นี้ ไม่ทับกัน) · **กู้คืน**: `restoreContent()` คงสถานะจัดแล้ว/เก็บกลับของปัจจุบัน, แถวที่ลงบัญชีแล้วใช้ของปัจจุบัน
  (ไม่มีใน revision ก็ต่อท้ายไว้), ไม่พา expenseId เก่าจาก snapshot กลับมา, ไม่แตะ extraCosts
  ก่อนกู้คืน/ก่อนใช้ร่าง AI บันทึกของปัจจุบันเป็น revision อัตโนมัติถ้ายังไม่เคยบันทึก · หน้า print รับ `?rev=` = พิมพ์ฉบับ revision
  หัวกระดาษทุกหน้ามีป้าย Rev (หรือ "ร่าง (แก้หลัง Rev N)")
- `stripUndefined()` เข้าไปล้างเฉพาะ **plain object** — sentinel ของ Firestore (`deleteField()`) ต้องผ่านไปทั้งตัว
  ล้างค่า field ที่เป็น object (เช่น `videoFormat`) ใน autosave ต้องส่ง `deleteField()` ไม่ใช่ undefined (undefined ถูกกรองทิ้ง ค่าเก่าค้าง)
- แผนเก็บ **snapshot** ชื่อ/รหัสอุปกรณ์ — ลบ/แก้ของในสต็อกแล้วแผนเก่าไม่เพี้ยน (หลักเดียวกับ CustomerSnapshot)
- **ผู้ช่วย AI (`equipmentAgent`) คืนร่าง ไม่เขียน Firestore** — client ส่งแผนบนจอ (รวมที่ยังไม่ autosave) ไป
  server อ่าน `equipment` + แผนอื่นเองเพื่อเช็กของชน · ผู้ใช้กด "ใช้ร่างนี้" แล้วค่อย `change({items, diagrams})` เข้า autosave
  **LLM ไม่วางพิกัด** — server ใส่ x/y = 0 แล้ว `autoLayoutDiagram()` ฝั่งเว็บจัดเป็นคอลัมน์ตามทางสัญญาณ
  (ผังใหม่ = จัดทั้งผัง, ผังเดิม = จัดเฉพาะ `newNodeIds` ต่อใต้กล่องเดิม) · LLM อ้าง port ด้วย**ชื่อ** workspace แปลงเป็น side/index เอง
  กฎที่หน้าเว็บบังคับ (ของชนวัน, 1 port 1 เส้น, ต้นทาง OUT/IO ปลายทาง IN/IO, กล่องต่อแถวไม่เกินจำนวนชิ้น, แถว 🔒 ลงบัญชีแล้ว)
  ต้องบังคับซ้ำใน `workspace.ts` ด้วย — แก้กฎฝั่งไหนต้องแก้อีกฝั่ง · โมเดลเลือกได้ (`AGENT_MODELS`) ไม่ส่ง/ผิดรูปแบบ = `claude-sonnet-5`
  **system prompt / กฎของทีม / รุ่น แก้ได้จากหน้าเว็บ** (`settings/equipmentAgent`) — **กฎเฉพาะบริษัทใส่ใน "กฎของทีม" ห้าม hardcode
  ลง prompt ในโค้ด** (whitelabel: แต่ละ tenant ต่อสายไม่เหมือนกัน) กฎอยู่บล็อก system แยกหลัง prompt พร้อม cache breakpoint
  แก้ `DEFAULT_SYSTEM_PROMPT` ต้อง sync กับ `functions/src/equipment-agent/prompt.ts` · เพิ่ม/เปลี่ยนชื่อ tool ต้องแก้ `AGENT_TOOL_NAMES` ด้วย
  **แสดงความคิด**: เปิด thinking (`adaptive` + `display: 'summarized'` — รุ่นใหม่ค่าเริ่มต้นเป็น omitted ข้อความว่าง; Haiku 4.5 ใช้ `budget_tokens`)
  node `agent` ใช้ `model.stream()` แล้ว concat chunk เก็บลง state (thinking block + signature ต้องอยู่ครบ ไม่งั้นรอบที่มี tool_result โดน 400)
  ส่งเหตุการณ์ผ่าน `response.sendChunk` → client เรียก `call.stream()` แล้ว `appendTrace()` · `AgentEvent` มีฝาแฝด 2 ที่ (graph.ts / lib/equipment/agent.ts) ต้อง sync
  error ตอนเรียกโมเดลครั้งแรก (key/model ผิด) ถูก throw ออกไปให้ผู้ใช้เห็น ไม่กลืนเป็น "หยุดก่อนเสร็จ"
  **ความเร็ว**: รายการสต็อกทั้งหมด (≤400 รายการ, `inventoryCatalog()`) อยู่ใน message แรกแล้ว — โมเดลไม่ต้องเสียรอบค้นสต็อก
  · `effort` ค่าเริ่มต้น medium (API default คือ high ซึ่งช้ามาก) · เปิด automatic caching (`cache_control` ต่อ request) ให้บทสนทนาที่ยาวขึ้นทุกรอบ
  **แบ่งขั้น**: คำสั่งแรกของ AgentPanel (ติ๊ก "แบ่งเป็น 2 ขั้น" เป็นค่าเริ่มต้น) เรียก function 2 ครั้ง `phase: 'items'` → `'wiring'`
  (ขั้น 2 ใช้ร่างขั้น 1 เป็นฐาน) แล้วรวมด้วย `mergeStagedDrafts()` แต่ละขั้นได้งบเวลาเต็ม · ขั้น 2 พัง = เก็บร่างขั้น 1 ไว้ · คำสั่งแก้ร่างต่อ = รอบเดียว (`all`)
  โมเดลหยุดโดยไม่เรียก finish / ชน maxTokens → graph สะกิดให้ทำต่อ (`MAX_NUDGES`) ห้ามปล่อยให้จบเงียบ (ร่างว่าง)
  client timeout ต้องยาวกว่า function (930s vs 900s — งบเวลาใน graph 780s) · `functions/tsconfig.json` ต้องมี `skipLibCheck` + `types: ["node"]`
  (d.ts ของ langchain ไม่ตรงกับ @anthropic-ai/sdk บางเวอร์ชัน และกัน tsc ไปหยิบ @types ของเว็บ เช่น three)

---

## ข้อควรระวัง / Gotchas

1. **Timezone**: ใช้ `new Date(str + 'T00:00:00')` แล้วอ่าน `getFullYear/getMonth/getDate` เสมอ — ห้ามใช้ `toISOString().split('T')[0]` เพราะ convert เป็น UTC แล้วได้วันผิด (UTC+7 ทำให้ shift -1 วัน)

2. **Firestore undefined**: ก่อน `addDoc` ต้อง filter `undefined` ออกก่อน — Firestore SDK ไม่รองรับ `undefined` → ใช้ `Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))`

3. **totalEarned**: ต้อง update ด้วย `increment(amount)` เสมอ ห้ามทำ read-then-write

4. **budget ลับ**: budget (ราคาขาย) เก็บแยกที่ `jobFinance/{jobId}` (admin-only rules) — ห้ามเขียน budget ลงใน jobs doc เด็ดขาด เพราะ LIFF อ่าน `jobs` ได้ทั้ง collection. ฝั่ง admin join ผ่าน `getJobsWithBudget()` / `getJobWithBudget(id)` ส่วน `createJob`/`updateJob`/`deleteJob` จัดการแยก-รวม budget ให้เองแล้ว

5. **Firestore Trigger v2 ไม่ได้**: Firestore database อยู่ที่ region `asia-southeast3` ซึ่ง Eventarc ไม่รองรับ → ใช้ HTTPS Callable แทน และเรียกจาก frontend

6. **Payment flow**: Freelancer ไม่ต้องมี JobAssignment — เลือก Job จาก dropdown แล้วขอเบิกได้เลย ชื่องานดึงจาก `jobId` → `jobs` collection

7. **Logo white mode**: บนพื้นสีแบรนด์ ต้องส่ง `white` prop → ระบบแทน `fill` ทุกตัวด้วย `currentColor` ให้เอง ไม่ต้องทำโลโก้เวอร์ชันขาวแยก

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

---

## Whitelabel — กฎที่ห้ามพลาด

> รายละเอียดการ deploy ให้ลูกค้าใหม่: [docs/WHITELABEL.md](docs/WHITELABEL.md)

27. **ห้าม hardcode ชื่อ/โลโก้/สีของบริษัทใดในโค้ด** — ทุกอย่างมาจาก `publicSettings/brand`
    ผ่าน `useBrand()` (client) หรือ `getBrandInfo()` (Cloud Functions)
    ถ้าต้องแก้โค้ดเพื่อ deploy เจ้าใหม่ = มีค่า hardcode หลุด ให้ย้ายไป config

28. **สีแบรนด์ใช้ token `brand` เท่านั้น** — `bg-brand`, `text-brand`, `border-brand`,
    `bg-brand-dark` (hover), `bg-brand-soft` (พื้นอ่อน), `bg-brand-tint` (เงา/เส้นอ่อน)
    เฉดทั้งหมด derive จาก `--brand` ตัวเดียวด้วย `color-mix()` ใน `globals.css`
    **ห้ามใช้ `red-*` ของ Tailwind หรือ hex ตรงๆ แทนสีแบรนด์** —
    `red-*` สงวนไว้ให้ danger เท่านั้น (ลบ/ปฏิเสธ/error/ช่องกรอกผิด)
    เพราะสีแบรนด์ของ tenant อาจไม่ใช่สีแดง

29. **`publicSettings` อ่านได้โดยไม่ต้อง login** — จำเป็นเพราะหน้า `/login` และ LIFF
    ต้องโชว์โลโก้ก่อนมี auth **ห้ามเก็บอะไรที่เป็นความลับใน collection นี้**

30. **โลโก้เว็บ ≠ โลโก้ PDF** — เว็บใช้ inline SVG (`brand.logoSvg`),
    PDF ใช้ไฟล์ภาพ (`brand.logoImagePath`) เพราะ react-pdf `<Image>` ไม่รองรับ SVG
    ไม่อัพโหลด PNG → เอกสารจะขึ้นโลโก้ default ของระบบ

31. **`<title>` ตั้ง runtime ไม่ใช่ build** — static export ฝัง metadata ตอน build
    จึงเป็นค่ากลางๆ แล้วให้ `BrandProvider` เขียนทับ `document.title` ตาม pathname
    (ดู `documentTitleFor()`) — เพิ่มหน้าใหม่ที่ต้องการ title เฉพาะ ให้แก้ที่ฟังก์ชันนั้น

32. **กัน flash ตอนโหลด**: `BRAND_PREPAINT_SCRIPT` ถูก inline ใน `<head>` อ่านสีจาก
    localStorage แล้วทา `--brand` ก่อน paint แรก — ห้ามลบออก ไม่งั้นจอกระพริบสี default
    สคริปต์นี้ทำให้ `<html>` มี attribute `style` ที่ตอน prerender ไม่มี จึงต้องมี
    `suppressHydrationWarning` บน `<html>` ใน `app/layout.tsx` **ห้ามเอาออก**
    ไม่งั้นขึ้น hydration mismatch ทุกหน้า และห้ามให้สคริปต์นี้ไปแตะ `<head>`
    (เช่นเขียน `document.title`) เพราะ Next จัดการ head เองอยู่

33. **สี/โลโก้ใน PDF**: react-pdf `StyleSheet` เป็นค่าคงที่ตอน import จึงใช้ตัวแปร
    runtime ตรงๆ ไม่ได้ — `generatePdfBlob()` เรียก `loadPdfBrand()` ก่อน render
    แล้ว component override ด้วย `pdfBrand().color` (style array) แก้แบรนด์แล้วอย่าลืม
    `resetPdfBrand()` เพื่อล้าง cache

34. **Cloud Functions CORS**: `APP_ORIGINS` ใน `functions/.env` — ไม่ตั้งจะ fallback เป็น
    `https://{projectId}.web.app` + `.firebaseapp.com` ลูกค้าที่ใช้ custom domain
    **ต้องตั้ง** ไม่งั้น callable functions โดน CORS บล็อก

35. **LIFF ID เป็น runtime config** — เก็บที่ `publicSettings/line` แก้ที่ `/admin/settings/line`
    ฝั่งเว็บใช้ `resolveLiffId()` (cache localStorage แล้ว refresh เบื้องหลัง เพราะ LIFF init
    อยู่บนเส้นทางวิกฤต) ฝั่ง functions ใช้ `getLiffId()` **ห้ามอ่าน
    `process.env.NEXT_PUBLIC_LINE_LIFF_ID` ตรงๆ ในโค้ดใหม่** — env เป็นแค่ fallback

36. **`lineAuth` ต้อง verify ที่มาของ token เสมอ** — `/v2/profile` ของ LINE
    รับ access token จาก **channel ไหนก็ได้** ถ้าไม่เช็ก ใครก็เอา token จาก LIFF app อื่น
    มาแลก Firebase custom token ของระบบนี้ได้ (สวมรอยเป็น freelancer)
    จึงต้องเรียก `/oauth2/v2.1/verify` ก่อน แล้วเทียบ `client_id` กับ `loginChannelId`
    **ห้ามลบขั้นตอนนี้ออก** และห้ามสลับลำดับไปเรียก profile ก่อน
    ไม่มี `loginChannelId` → ปฏิเสธ (fail closed) ไม่ใช่ปล่อยผ่าน

37. **ห้ามเอา secret ไปไว้ใน `publicSettings`** — collection นี้ `read: if true`
    `LINE_CHANNEL_ACCESS_TOKEN`, `RESEND_API_KEY` ฯลฯ อยู่ใน Secret Manager เท่านั้น
    (ตั้งด้วย `firebase functions:secrets:set`) ถ้าจะเพิ่ม config ใหม่ ถามก่อนว่า
    "หลุดออกไปแล้วเสียหายไหม" — เสียหาย = Secret Manager, ไม่เสียหาย = publicSettings

38. **อีเมล: ลูกค้าแก้ได้แค่ข้อความ ไม่ใช่ HTML** — โครงการ์ด/แถบสีแบรนด์/ตารางข้อมูล
    อยู่ใน `renderEmailShell()` (`functions/src/mail.ts`) ตั้งใจไม่ให้ลูกค้าแตะ
    เพราะ HTML เมลพังง่ายและทำให้เข้า spam — ที่แก้ได้คือ subject / heading / intro / footer
    ผ่าน `{{var}}` ตัวแปรที่ไม่รู้จักถูกลบทิ้ง (ไม่ปล่อย `{{...}}` ให้ผู้รับเห็น)

39. **โค้ดอีเมล 3 ไฟล์ต้อง sync กันเสมอ** (แชร์กันตรงๆ ไม่ได้ — functions คนละ package):
    - `functions/src/mail.ts` — ของจริงที่ส่งเมล
    - `lib/mail-settings.ts` — type + `DEFAULT_TEMPLATES` + `renderVars()` ฝั่งเว็บ
    - `lib/email-preview.ts` — `renderEmailShell()` ฝาแฝดของ functions ใช้ทำ preview

    แก้ `EmailKey` / `DEFAULT_TEMPLATES` / โครง shell ที่ไฟล์เดียวไม่พอ —
    `renderEmailShell()` ต่างกันเมื่อไหร่ preview จะโกหกว่าเมลจริงหน้าตาแบบนั้น
    และ `EMAIL_TYPES[].vars` ต้องตรงกับตัวแปรที่ call site ส่งเข้า `renderVars()` จริง
    ไม่งั้นแอดมินเห็นตัวแปรที่ใช้ไม่ได้ (หรือใช้ได้แต่ไม่โชว์)

40. **`SMTP_PASSWORD` และ `ANTHROPIC_API_KEY` ต้องมีใน Secret Manager ก่อน deploy functions** — ถูกประกาศใน
    `secrets: [...]` ของทุก function ที่ส่งเมล ถ้า secret ไม่มี **deploy จะล้มทั้งชุด**
    แม้ใช้ Resend อยู่ก็ตาม ตั้งค่าว่างไว้ก็ได้: `firebase functions:secrets:set SMTP_PASSWORD`

41. **bootstrap owner**: `NEXT_PUBLIC_BOOTSTRAP_OWNER_EMAIL` (frontend) กับ
    `BOOTSTRAP_OWNER_EMAIL` (functions) ต้องตรงกัน — เทียบผ่าน `isBootstrapOwnerEmail()` /
    `isBootstrapOwner()` เสมอ **ห้ามเทียบ `===` ตรงๆ** เพราะค่าว่างจะ match อีเมลว่าง
