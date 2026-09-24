# ระบบจัดการงานถ่ายทอดสด + บัญชี SME

ระบบจัดการงานถ่ายทอดสด, การเบิกจ่าย Freelancer ผ่าน LINE และงานบัญชี SME
เต็มรูปแบบ (ขาย–รายจ่าย–ภาษี–งบการเงิน) ในตัวเดียว

**เป็น whitelabel** — deploy ให้หลายบริษัทได้จาก codebase เดียว
1 บริษัท = 1 Firebase project ข้อมูลแยกกันจริงทางกายภาพ
ชื่อระบบ / โลโก้ / สี ตั้งได้ที่หน้าเว็บโดยไม่ต้อง build ใหม่

---

## 3 ส่วนของระบบ

| ส่วน | path | ใครใช้ |
|---|---|---|
| **Admin Panel** | `/admin/*` | จัดการงาน, freelancer, อนุมัติ/โอนเงิน |
| **Accounting** | `/admin/accounting/*` | ใบเสนอราคา → ใบแจ้งหนี้ → ใบกำกับภาษี → ใบเสร็จ, รายจ่าย, ภพ.30, ภงด.3/53, P&L (มี PDF ภาษาไทย) |
| **Freelancer LIFF** | `/freelancer/*` | Freelancer ดูงาน/รายได้ และขอเบิกเงินผ่าน LINE |

## Stack

Next.js 16 (App Router, `output: 'export'`) · Tailwind CSS v4 · Firebase
(Auth / Firestore / Storage / Functions v2) · LINE LIFF · @react-pdf/renderer +
ฟอนต์ Sarabun · Resend

> ⚠️ Next.js เวอร์ชันนี้มี breaking changes จากที่คุ้นเคย — อ่าน
> `node_modules/next/dist/docs/` ก่อนเขียนโค้ด (ดู [AGENTS.md](AGENTS.md))

---

## เริ่มพัฒนา

ต้องมี Node 22 และ pnpm

```bash
pnpm install
cp .env.example .env.local     # กรอก Firebase config + LIFF ID
pnpm dev                       # http://localhost:3000
```

ไม่มี `.env.local` แอปจะ build ผ่านแต่ต่อ Firebase ไม่ได้ —
ขอค่าจากคนดูแล project หรือสร้าง Firebase project ของตัวเองตาม
[docs/WHITELABEL.md](docs/WHITELABEL.md)

### คำสั่งที่ใช้บ่อย

```bash
pnpm dev                  # dev server
pnpm build                # static export → out/
npx tsc --noEmit          # typecheck (ควรรันก่อน commit เสมอ)
pnpm lint                 # eslint (มี warning ค้างเยอะ ดูเฉพาะไฟล์ที่แก้)

cd functions && npm run build    # build Cloud Functions
```

### Deploy

push เข้า `main` → GitHub Actions deploy **hosting** ให้อัตโนมัติ
ส่วน functions และ rules ต้อง deploy มือ:

```bash
firebase deploy --only functions,firestore:rules,storage
```

---

## โครงสร้างโดยย่อ

```
app/            หน้าเว็บ (admin / accounting / freelancer LIFF / login)
components/     UI + ฟอร์ม + BrandProvider (whitelabel)
lib/            Firebase CRUD, brand, earnings, accounting (calc / PDF / เอกสาร)
functions/      Cloud Functions — LINE auth, อีเมล, LINE push, จัดการ admin user
scripts/        script รันมือ (seed แบรนด์ให้ tenant ใหม่)
docs/           คู่มือ deploy whitelabel
```

---

## เอกสารต่อ

| อ่านเมื่อ | ไฟล์ |
|---|---|
| จะเขียนโค้ดในโปรเจกต์นี้ | **[CLAUDE.md](CLAUDE.md)** — โครงสร้าง collections, ทุกฟังก์ชันใน `lib/`, security rules และ **gotchas 41 ข้อ** ที่พลาดแล้วเจ็บ (timezone, WHT ฐานภาษี, เอกสารที่แก้ไม่ได้, สีแบรนด์ ฯลฯ) |
| จะ deploy ให้ลูกค้าใหม่ | **[docs/WHITELABEL.md](docs/WHITELABEL.md)** — ขั้นตอนครบตั้งแต่สร้าง Firebase project ถึง checklist ก่อนส่งมอบ |
| จะแตะโค้ด Next.js | [AGENTS.md](AGENTS.md) |

### กฎที่พลาดบ่อยที่สุด

- **ห้าม hardcode ชื่อ/โลโก้/สีของบริษัทใดในโค้ด** — ใช้ `useBrand()` เสมอ
  ถ้าต้องแก้โค้ดเพื่อ deploy ลูกค้าใหม่ แปลว่ามีค่า hardcode หลุด
- **สีแบรนด์ใช้ `bg-brand` / `text-brand` / `bg-brand-dark` / `bg-brand-soft`**
  ห้ามใช้ `red-*` แทน — `red-*` สงวนให้ danger (ลบ/ปฏิเสธ/error) เท่านั้น
  เพราะสีของลูกค้าอาจไม่ใช่สีแดง
- **วันที่**: `new Date(str + 'T00:00:00')` แล้วอ่าน local เสมอ
  ห้าม `toISOString().split('T')[0]` (UTC+7 ทำให้เพี้ยนไป 1 วัน)
- **ใบกำกับภาษีกับใบเสร็จแก้ไม่ได้** — ออกแล้วทำได้แค่ void แล้วออกใหม่
