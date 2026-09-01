# Whitelabel — deploy ให้ลูกค้าใหม่

โมเดล: **1 บริษัท = 1 Firebase project = 1 โดเมน** ใช้ codebase เดียวกัน
ข้อมูลลูกค้าแต่ละเจ้าแยกกันจริงทางกายภาพ (สำคัญมากเพราะระบบเก็บบัตรประชาชน,
เลขบัญชี และเอกสารบัญชี)

แบรนด์ (ชื่อระบบ / โลโก้ / สี) อ่าน **runtime จาก Firestore** `publicSettings/brand`
ไม่ต้อง build ใหม่เวลาลูกค้าอยากเปลี่ยนโลโก้หรือสี

---

## สิ่งที่ต่างกันต่อ tenant

| อยู่ที่ไหน | คืออะไร |
|---|---|
| Firebase project | Firestore, Auth, Storage, Functions, Hosting |
| `.env.local` (build-time) | Firebase config, LIFF ID, bootstrap owner email |
| `functions/.env` | APP_ORIGINS, LINE_LIFF_ID, BOOTSTRAP_OWNER_EMAIL |
| Firebase secrets | RESEND_API_KEY, MAIL_FROM, MAIL_TO, LINE_CHANNEL_ACCESS_TOKEN |
| Firestore `publicSettings/brand` | ชื่อระบบ, โลโก้, สีหลัก |
| Firestore `publicSettings/line` | LIFF ID |
| Firestore `settings/mail` | ช่องทางส่งเมล, ผู้ส่ง/ผู้รับ, ข้อความในเมล |
| Firestore `companySettings/main` | ข้อมูลนิติบุคคลสำหรับออกเอกสาร |
| LINE Developers | LINE Login channel + Messaging API channel + LIFF app |

**ไม่มีอะไรที่ต้องแก้ในโค้ด** — ถ้าต้องแก้โค้ดเพื่อ deploy เจ้าใหม่ แปลว่ามี
ค่า hardcode หลุดมา ให้ย้ายไป config แทน

---

## ขั้นตอน

### 1. Firebase project

```bash
# สร้าง project ใหม่ที่ console.firebase.google.com แล้ว
firebase use --add          # เลือก project ใหม่ ตั้ง alias เช่น "clientb"
```

เปิดใช้: Authentication (Email/Password), Firestore, Storage, Functions (Blaze plan)

> ⚠️ Firestore ของ LiveTubeX อยู่ region `asia-southeast3` ซึ่ง **Eventarc ไม่รองรับ**
> จึงใช้ HTTPS Callable แทน Firestore Trigger ทั้งระบบ — project ใหม่จะเลือก region
> ไหนก็ได้ แต่ห้ามเผลอเขียน Firestore Trigger v2 เพราะ pattern ทั้งระบบเป็น callable

### 2. LINE

สร้างใน [LINE Developers Console](https://developers.line.biz/):
- **LINE Login channel** → LIFF app (endpoint = `https://<โดเมน>/freelancer`)
- **Messaging API channel** → long-lived access token (ใช้ push แจ้งโอนเงิน)

### 3. env ฝั่ง frontend

```bash
cp .env.example .env.local
# กรอก Firebase config (Project settings → General → Your apps → Web app)
# NEXT_PUBLIC_LINE_LIFF_ID = LIFF ID ที่เพิ่งสร้าง
# NEXT_PUBLIC_BOOTSTRAP_OWNER_EMAIL = อีเมล admin คนแรกของลูกค้า
```

### 4. env + secrets ฝั่ง functions

```bash
cp functions/.env.example functions/.env
# APP_ORIGINS = โดเมนของลูกค้า คั่นด้วย comma (ตัวแรกใช้ทำลิงก์ในอีเมล)
# LINE_LIFF_ID = ต้องตรงกับ NEXT_PUBLIC_LINE_LIFF_ID
# BOOTSTRAP_OWNER_EMAIL = ต้องตรงกับ NEXT_PUBLIC_BOOTSTRAP_OWNER_EMAIL
# APP_NAME / BRAND_COLOR = ชื่อ/สีที่ใช้ในอีเมลตอนยังไม่ได้ seed publicSettings/brand

firebase functions:secrets:set RESEND_API_KEY
firebase functions:secrets:set SMTP_PASSWORD          # ต้องมีเสมอ ใส่ค่าว่างได้ถ้าใช้ Resend
firebase functions:secrets:set MAIL_FROM
firebase functions:secrets:set MAIL_TO
firebase functions:secrets:set LINE_CHANNEL_ACCESS_TOKEN
```

> ⚠️ `SMTP_PASSWORD` ถูกประกาศใน `secrets: [...]` ของทุก function ที่ส่งเมล
> **ไม่สร้างไว้ = deploy functions ล้มทั้งชุด** แม้จะใช้ Resend ก็ตาม

> ไม่ตั้ง `APP_ORIGINS` ก็ยังใช้ได้ — จะ fallback เป็น
> `https://{projectId}.web.app` + `https://{projectId}.firebaseapp.com` อัตโนมัติ
> แต่ถ้าลูกค้าใช้ custom domain **ต้องตั้ง** ไม่งั้น CORS บล็อก callable functions
>
> ถ้าอยากเก็บ config ของหลาย tenant ไว้ในรีโปเดียว ใช้ชื่อไฟล์
> `functions/.env.<projectId>` ได้ — firebase-functions เลือกให้ตาม active project เอง
> (`.env*` ถูก gitignore อยู่ ต้องแก้ .gitignore ก่อนถ้าจะ commit)

### 5. Deploy

```bash
pnpm build
cd functions && npm run build && cd ..
firebase deploy --only hosting,firestore:rules,storage,functions
```

### 6. สร้าง admin คนแรก

Firebase Console → Authentication → Add user ด้วยอีเมลเดียวกับ
`BOOTSTRAP_OWNER_EMAIL` — คนนี้จะเป็น owner อัตโนมัติแม้ยังไม่มี doc ใน `adminUsers`
(แก้ปัญหาไก่กับไข่) จากนั้นเพิ่ม admin คนอื่นได้ที่ `/admin/users`

### 7. ตั้งค่า LINE

`/admin/settings/line` — ใส่ LIFF ID แล้วคัดลอก Endpoint URL / Callback URL
จากหน้านั้นไปวางใน LINE Developers Console ให้ตรงกัน

**LINE Login Channel ID** ระบบเติมให้อัตโนมัติจาก prefix ของ LIFF ID —
ตรวจกับ LINE Console (LINE Login channel → Basic settings → Channel ID) ให้ตรงก่อน
เพราะ `lineAuth` ใช้ค่านี้ปฏิเสธ access token ที่ออกจาก channel อื่น
**ใส่ผิด = freelancer login ไม่ได้ทั้งระบบ**

> `LINE_CHANNEL_ACCESS_TOKEN` ตั้งจากหน้าเว็บไม่ได้โดยตั้งใจ — เป็นความลับ
> ใครได้ไปจะส่งข้อความในนามบริษัทได้ ใช้ `firebase functions:secrets:set` เท่านั้น

### 8. ตั้งแบรนด์

**ทางเว็บ** (แนะนำ): login แล้วไปที่ `/admin/settings/brand`
ตั้งชื่อระบบ, สีหลัก, อัพโหลดโลโก้ SVG (เว็บ) + PNG (PDF)

**หรือ seed ด้วย script**:

```bash
GOOGLE_APPLICATION_CREDENTIALS=~/sa-clientb.json \
node scripts/seed-brand.mjs \
  --name "ชื่อระบบลูกค้า" \
  --color "#2563eb" \
  --logo ./client-logo.svg
```

### 9. ตั้งค่าอีเมล

`/admin/settings/mail` — เลือก Resend หรือ SMTP, ตั้งผู้ส่ง/ผู้รับ, แก้ข้อความในเมลได้ 4 ประเภท
แล้ว**กดปุ่มส่งเมลทดสอบ**เพื่อยืนยันว่าตั้งถูกก่อนใช้งานจริง

> ลูกค้าแก้ได้เฉพาะ**ข้อความ** (subject / หัวข้อ / ย่อหน้านำ / ท้ายเมล) พร้อมตัวแปร `{{...}}`
> ส่วนเลย์เอาต์ สีแบรนด์ และตารางข้อมูลมาจากโค้ด — กันเมลพังและเข้า spam

### 10. ข้อมูลบริษัท (สำหรับออกเอกสารบัญชี)

`/admin/accounting/company-settings` — ชื่อนิติบุคคล, เลขผู้เสียภาษี, ที่อยู่,
บัญชีธนาคาร, ลายเซ็น แล้วกดปุ่ม seed หมวดค่าใช้จ่ายที่ `/admin/accounting/expense-categories`

---

## การทำโลโก้ให้รองรับ whitelabel

โลโก้บนเว็บเป็น **inline SVG** เก็บใน `publicSettings/brand.logoSvg`
กติกาสีใน SVG:

| fill | ผล |
|---|---|
| `fill="currentColor"` | ตามสีตัวอักษรของ parent — โหมดขาวจะกลายเป็นขาว |
| `fill="var(--brand)"` | ตามสีหลักของแบรนด์ เปลี่ยนสีอัตโนมัติ |
| `fill="#xxxxxx"` | สีตายตัว (โหมดขาวยังถูกแทนเป็นขาวให้) |

เวลาโชว์บนพื้นสีแบรนด์ (`<Logo white />`) ระบบจะแทน `fill` ทุกตัวเป็น
`currentColor` ให้เอง จึงไม่ต้องทำโลโก้เวอร์ชันขาวแยก

**PDF ใช้ไฟล์คนละตัว** — react-pdf ใส่ SVG ไม่ได้ ต้องอัพโหลด PNG/JPG
(`brand.logoImagePath`) ไม่งั้นเอกสารจะขึ้นโลโก้ default ของระบบ

---

## สีแบรนด์

ตั้งสีเดียว (`primaryColor`) เฉดที่เหลือคำนวณด้วย `color-mix()` ใน
[app/globals.css](../app/globals.css):

| token | ใช้ตอน |
|---|---|
| `bg-brand` / `text-brand` / `border-brand` | สีหลัก |
| `bg-brand-dark` | hover/active ของปุ่มหลัก |
| `bg-brand-soft` | พื้นหลังอ่อน (ป้าย, แถบ) |
| `bg-brand-tint` | เงา/เส้นขอบอ่อน |

**อย่าใช้ `red-*` ของ Tailwind แทนสีแบรนด์** — `red-*` สงวนไว้สำหรับ
สถานะ danger (ปุ่มลบ, ปฏิเสธ, error, ช่องกรอกไม่ถูกต้อง) เท่านั้น
สีแบรนด์ของ tenant อาจไม่ใช่สีแดง

---

## CI/CD

`.github/workflows/deploy.yml` deploy hosting อัตโนมัติเมื่อ push เข้า main
secrets ที่ต้องตั้งในรีโป:

```
FIREBASE_SERVICE_ACCOUNT              # JSON ทั้งไฟล์
FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_LINE_LIFF_ID
NEXT_PUBLIC_BOOTSTRAP_OWNER_EMAIL
```

deploy หลาย tenant จากรีโปเดียว: ใช้ GitHub Environments แยกชุด secrets
ต่อ tenant แล้วเพิ่ม `environment:` ใน job (functions/rules ยัง deploy มือ —
service account ที่ `firebase init hosting:github` สร้างมีสิทธิ์แค่ hosting)

---

## Checklist ก่อนส่งมอบ

- [ ] `/login` โชว์โลโก้ + สีของลูกค้า (ไม่ใช่ default)
- [ ] favicon เป็นโลโก้ลูกค้า
- [ ] LIFF เปิดจาก LINE ได้ สมัคร freelancer ได้ (LIFF ID ตรงกับที่ตั้งใน `/admin/settings/line`)
- [ ] Channel ID ตรงกับ LINE Console — ถ้าผิด login จะขึ้น "token ไม่ได้ออกโดย channel ของระบบนี้"
- [ ] ส่งเมลทดสอบจาก `/admin/settings/mail` ผ่านทั้ง 4 ประเภท
- [ ] ขอเบิกเงิน → อีเมลถึง admin มีชื่อ/สีของลูกค้า และลิงก์ไปโดเมนที่ถูกต้อง
- [ ] mark paid → LINE push ขึ้นชื่อลูกค้า และ deep link เข้า LIFF ถูกตัว
- [ ] PDF ใบเสนอราคา/ใบเสร็จ ขึ้นโลโก้ + สีของลูกค้า
- [ ] ไม่มีคำว่า LiveTubeX โผล่ที่ไหนในระบบของลูกค้า
