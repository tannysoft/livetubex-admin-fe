/**
 * seed-brand.mjs
 *
 * ตั้งแบรนด์ตั้งต้นให้ tenant ใหม่ — เขียน publicSettings/brand ใน Firestore
 * (หลังจากนี้แก้ต่อได้ที่หน้า /admin/settings/brand)
 *
 * วิธีรัน:
 *   GOOGLE_APPLICATION_CREDENTIALS=~/sa-newclient.json \
 *   node scripts/seed-brand.mjs \
 *     --name "ชื่อระบบ" \
 *     --color "#2563eb" \
 *     --tagline "ระบบจัดการงานถ่ายทอดสด" \
 *     --logo ./client-logo.svg
 *
 * ไม่ส่ง --logo → ใช้โลโก้ default ของระบบไปก่อน (ตั้งทีหลังผ่านหน้าเว็บได้)
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { homedir } from 'os'

// ── args ──────────────────────────────────────────────────────────────────────
function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const appName = arg('name')
const color = arg('color', '#2563eb')
const tagline = arg('tagline', 'ระบบจัดการงานถ่ายทอดสด')
const appNameEn = arg('name-en', appName)
const logoPath = arg('logo')

if (!appName) {
  console.error('ต้องระบุ --name "ชื่อระบบ"')
  process.exit(1)
}
if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) {
  console.error(`--color ต้องเป็น hex เช่น #2563eb (ได้มา: ${color})`)
  process.exit(1)
}

// ── sanitize SVG (ตรรกะเดียวกับ lib/brand.ts) ────────────────────────────────
function sanitizeSvg(svg) {
  if (!svg) return ''
  const cleaned = svg
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*(script|foreignObject|iframe|object|embed)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|xlink:href)\s*=\s*("|')?\s*javascript:[^"'>\s]*("|')?/gi, '')
    .trim()
  return /^<svg[\s>]/i.test(cleaned) ? cleaned : ''
}

// ── init ──────────────────────────────────────────────────────────────────────
const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? `${homedir()}/service-account.json`
const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'))
if (!getApps().length) initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()

// ── payload ───────────────────────────────────────────────────────────────────
const brand = {
  appName,
  appNameEn,
  tagline,
  description: `${tagline}และการเบิกจ่าย Freelancer`,
  primaryColor: color,
  loginEmailPlaceholder: 'admin@example.com',
  logoImagePath: '',
  celebrationImage: '',
  updatedAt: new Date().toISOString(),
}

if (logoPath) {
  const svg = sanitizeSvg(readFileSync(logoPath, 'utf8'))
  if (!svg) {
    console.error(`อ่าน SVG จาก ${logoPath} ไม่ได้ (ไฟล์ไม่ใช่ SVG หรือถูก sanitize จนหมด)`)
    process.exit(1)
  }
  brand.logoSvg = svg
}

await db.doc('publicSettings/brand').set(brand, { merge: true })

console.log('✅ ตั้งแบรนด์เรียบร้อย — publicSettings/brand')
console.log(`   ชื่อระบบ : ${appName}`)
console.log(`   สีหลัก   : ${color}`)
console.log(`   โลโก้    : ${logoPath ? logoPath : '(ใช้ default ของระบบ)'}`)
console.log('')
console.log('อย่าลืม: อัพโหลดโลโก้ PNG สำหรับ PDF ที่ /admin/settings/brand')
process.exit(0)
