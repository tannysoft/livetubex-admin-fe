import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import { DEFAULT_LOGO_SVG } from './brand-default-logo'

/**
 * ── Whitelabel branding ───────────────────────────────────────────────────────
 * แบรนด์ทั้งหมดอ่าน runtime จาก Firestore `publicSettings/brand`
 * (rules: read สาธารณะ / write เฉพาะ admin) — ต้องอ่านได้ก่อน login เพราะ
 * หน้า /login และ LIFF ต้องโชว์โลโก้ตั้งแต่ยังไม่มี auth
 *
 * deploy ให้ลูกค้าใหม่ = สร้าง Firebase project ใหม่ + ตั้ง doc นี้
 * (ทำผ่านหน้า /admin/settings/brand หรือ scripts/seed-brand.mjs)
 */

export const BRAND_DOC_PATH = 'publicSettings'
export const BRAND_DOC_ID = 'brand'

/** key ของ localStorage cache — ใช้ทา theme ก่อน paint กัน flash */
export const BRAND_CACHE_KEY = 'brand.v1'

export interface BrandSettings {
  /** ชื่อระบบที่โชว์ใน sidebar / title / อีเมล */
  appName: string
  appNameEn: string
  /** คำอธิบายสั้นต่อท้ายชื่อใน <title> */
  tagline: string
  description: string
  /** สีหลัก (hex) — ที่เหลือ derive ด้วย color-mix ใน globals.css */
  primaryColor: string
  /** โลโก้เป็น inline SVG (ดู brand-default-logo.ts เรื่อง currentColor / var(--brand)) */
  logoSvg: string
  /** โลโก้ไฟล์ภาพ (storage path) สำหรับ PDF — react-pdf ไม่รองรับ SVG */
  logoImagePath: string
  /** placeholder ช่องอีเมลหน้า login */
  loginEmailPlaceholder: string
  /**
   * รูปที่โผล่ตอน celebration หลังโอนเงิน — ว่าง = โชว์แค่ป้ายข้อความ
   * ขึ้นต้นด้วย "/" = ไฟล์ใน public/ ; ที่เหลือ = Firebase Storage path
   */
  celebrationImage: string
  updatedAt?: string
}

export const DEFAULT_BRAND: BrandSettings = {
  appName: 'LiveTubeX',
  appNameEn: 'LiveTubeX',
  tagline: 'ระบบจัดการงานถ่ายทอดสด',
  description: 'ระบบจัดการงานถ่ายทอดสดและการเบิกจ่าย Freelancer',
  primaryColor: '#f73727',
  logoSvg: DEFAULT_LOGO_SVG,
  logoImagePath: '',
  loginEmailPlaceholder: 'admin@example.com',
  celebrationImage: '/ceo.png',
}

// ── Sanitize ──────────────────────────────────────────────────────────────────

/**
 * ตัดของอันตรายออกจาก SVG ก่อนเอาไป inject
 * (คนเขียนคือ admin ของ tenant เอง แต่กัน XSS ไว้อีกชั้น)
 */
export function sanitizeSvg(svg: string): string {
  if (!svg) return ''
  const cleaned = svg
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*(script|foreignObject|iframe|object|embed)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|xlink:href)\s*=\s*("|')?\s*javascript:[^"'>\s]*("|')?/gi, '')
    .trim()
  // ต้องเป็น <svg> จริงๆ เท่านั้น
  return /^<svg[\s>]/i.test(cleaned) ? cleaned : ''
}

/** hex สีที่ใช้ได้จริงเท่านั้น — กัน CSS injection ตอน setProperty */
export function isValidHexColor(v: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim())
}

export function normalizeBrand(raw: Partial<BrandSettings> | undefined | null): BrandSettings {
  const b = { ...DEFAULT_BRAND, ...(raw ?? {}) }
  return {
    ...b,
    primaryColor: isValidHexColor(b.primaryColor) ? b.primaryColor : DEFAULT_BRAND.primaryColor,
    logoSvg: sanitizeSvg(b.logoSvg) || DEFAULT_BRAND.logoSvg,
  }
}

/** โลโก้เวอร์ชันสีเดียว — ใช้บนพื้นสีแบรนด์ (fill ทุกตัว → currentColor) */
export function monoLogoSvg(svg: string): string {
  return svg.replace(/fill\s*=\s*("|')(?!none)(?:(?!\1).)*\1/gi, 'fill="currentColor"')
}

// ── Firestore ─────────────────────────────────────────────────────────────────

export async function getBrand(): Promise<BrandSettings> {
  const snap = await getDoc(doc(db, BRAND_DOC_PATH, BRAND_DOC_ID))
  return normalizeBrand(snap.exists() ? (snap.data() as Partial<BrandSettings>) : null)
}

export async function saveBrand(data: BrandSettings): Promise<void> {
  await setDoc(
    doc(db, BRAND_DOC_PATH, BRAND_DOC_ID),
    { ...normalizeBrand(data), updatedAt: new Date().toISOString() },
    { merge: true },
  )
}

// ── DOM ───────────────────────────────────────────────────────────────────────

/** ทาสีแบรนด์ลง :root — เฉดที่เหลือ derive ด้วย color-mix ใน globals.css */
export function applyBrandColor(color: string): void {
  if (typeof document === 'undefined' || !isValidHexColor(color)) return
  document.documentElement.style.setProperty('--brand', color)
}

/** ชื่อหน้าตาม path — static export ตั้ง metadata ตอน build ไม่ได้ */
export function documentTitleFor(pathname: string, brand: BrandSettings): string {
  if (pathname.startsWith('/freelancer')) return `${brand.appName} Freelancer Portal`
  // หน้าแชร์ตั้งชื่อแผนเองหลังปลดล็อก — ก่อนหน้านั้นไม่บอกว่าเป็นงานอะไร
  if (pathname.startsWith('/share')) return `แผนงานทีม — ${brand.appName}`
  return `${brand.appName} — ${brand.tagline}`
}

export function faviconDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/**
 * สคริปต์ที่ inline ไว้ใน <head> — ทาสีแบรนด์จาก cache ก่อน React จะ hydrate
 *
 * แตะ `--brand` อย่างเดียวเท่านั้น: การเขียน document.title ตรงนี้ไปยุ่งกับ <head>
 * ที่ Next จัดการอยู่ และได้ประโยชน์แค่เสี้ยววินาทีก่อน BrandProvider ตั้งให้อยู่ดี
 *
 * ⚠️ ทำให้ <html> มี attribute style ที่ prerender ไม่มี → RootLayout ต้องใส่
 *    suppressHydrationWarning ไว้ ห้ามเอาออก
 */
export const BRAND_PREPAINT_SCRIPT = `(function(){try{
var c=JSON.parse(localStorage.getItem(${JSON.stringify(BRAND_CACHE_KEY)})||'null');
if(c&&/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.primaryColor||''))
document.documentElement.style.setProperty('--brand',c.primaryColor);
}catch(e){}})();`
