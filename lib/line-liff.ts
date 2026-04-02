'use client'

import { signInWithCustomToken, signOut } from 'firebase/auth'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { auth } from './firebase'

let liffInitialized = false
let liffModule: typeof import('@line/liff').default | null = null

async function getLiff() {
  if (!liffModule) {
    liffModule = (await import('@line/liff')).default
  }
  return liffModule
}

export interface LiffUserProfile {
  userId: string
  displayName: string
  pictureUrl?: string
}

/** normalize เช่น /index.html → / (บาง host เสิร์ฟแบบนี้) */
function normalizePathname(pathname: string): string {
  let p = pathname.replace(/\/+$/, '') || '/'
  if (p.endsWith('/index.html')) {
    p = p.slice(0, -'/index.html'.length).replace(/\/+$/, '') || '/'
  }
  return p
}

/** LIFF ใช้เฉพาะ `/` และ `/freelancer...` — ห้าม init บน /admin หรือ /login */
export function isLiffPathAllowed(): boolean {
  if (typeof window === 'undefined') return false
  const p = normalizePathname(window.location.pathname)
  if (p === '/') return true
  return p === '/freelancer' || p.startsWith('/freelancer/')
}

// ── LIFF init ─────────────────────────────────────────────────────────────────
/** คืน true ถ้า init สำเร็จหรือเคย init แล้ว — false ถ้า path ไม่อนุญาต (ห้ามเรียก isLoggedIn ต่อ) */
export async function initLiff(): Promise<boolean> {
  if (typeof window !== 'undefined' && !isLiffPathAllowed()) {
    return false
  }
  if (liffInitialized) return true
  const liffId = process.env.NEXT_PUBLIC_LINE_LIFF_ID
  if (!liffId) throw new Error('NEXT_PUBLIC_LINE_LIFF_ID is not set')
  const liff = await getLiff()
  await liff.init({ liffId, withLoginOnExternalBrowser: true })
  liffInitialized = true
  return true
}

// ── Login ─────────────────────────────────────────────────────────────────────
export async function liffLogin(): Promise<void> {
  if (typeof window !== 'undefined' && !isLiffPathAllowed()) return
  const ok = await initLiff()
  if (!ok) return
  const liff = await getLiff()
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: window.location.href })
  }
}

// ── Logout ────────────────────────────────────────────────────────────────────
export async function liffLogout(): Promise<void> {
  if (!liffInitialized) {
    await signOut(auth).catch(() => {})
    window.location.reload()
    return
  }
  const liff = await getLiff()
  liff.logout()
  await signOut(auth).catch(() => {})
  window.location.reload()
}

export async function isLiffLoggedIn(): Promise<boolean> {
  if (!liffInitialized) return false
  const liff = await getLiff()
  return liff.isLoggedIn()
}

/** @deprecated ใช้ initLiffAndIsInClient แทน — ฟังก์ชันนี้ไม่ได้เรียก init ก่อน */
export async function isInLineApp(): Promise<boolean> {
  const liff = await getLiff()
  return liff.isInClient()
}

/** init LIFF แล้วตรวจว่าเปิดใน LINE in-app หรือไม่ — ใช้แยกหน้าแรกจากแอดมิน */
export async function initLiffAndIsInClient(): Promise<boolean> {
  try {
    if (typeof window !== 'undefined' && !isLiffPathAllowed()) {
      return false
    }
    const ok = await initLiff()
    if (!ok) return false
    return (await getLiff()).isInClient()
  } catch {
    return false
  }
}

// ── Auth: แปลง LINE token → Firebase Custom Token → signIn ───────────────────
/**
 * เรียกครั้งเดียวหลัง LIFF login:
 * 1. ดึง LINE Access Token จาก LIFF SDK
 * 2. ส่งไป Cloud Function lineAuth เพื่อยืนยันกับ LINE API
 * 3. ได้ Firebase Custom Token กลับมา → signInWithCustomToken
 * 4. ตอนนี้ request.auth.uid = lineUserId ใน Firestore rules
 */
export async function signInFirebaseWithLiff(): Promise<LiffUserProfile> {
  if (!liffInitialized) {
    throw new Error('LIFF ยังไม่ได้ init')
  }
  const liff = await getLiff()

  if (!liff.isLoggedIn()) {
    throw new Error('Not logged in with LINE')
  }

  const accessToken = liff.getAccessToken()
  if (!accessToken) {
    throw new Error('Cannot get LINE access token')
  }

  // เรียก Cloud Function ใน region asia-southeast1
  const functions = getFunctions(undefined, 'asia-southeast1')
  const lineAuthFn = httpsCallable<{ accessToken: string }, {
    firebaseToken: string
    lineUserId: string
    displayName: string
    pictureUrl: string
  }>(functions, 'lineAuth')

  let result
  try {
    result = await lineAuthFn({ accessToken })
  } catch (err: unknown) {
    // แปลง Firebase Functions error ให้อ่านง่ายขึ้น
    const code = (err as { code?: string })?.code ?? ''
    const message = (err as { message?: string })?.message ?? 'Unknown error'

    if (code === 'functions/unauthenticated') {
      throw new Error('LINE token หมดอายุ กรุณา login ใหม่')
    }
    if (code === 'functions/permission-denied') {
      throw new Error('ระบบยังตั้งค่าไม่เสร็จ กรุณาติดต่อ Admin (IAM permission)')
    }
    if (code === 'functions/not-found' || code === 'functions/unavailable') {
      throw new Error('ไม่พบ Cloud Function กรุณาตรวจสอบว่า deploy แล้ว')
    }
    throw new Error(`ยืนยันตัวตนไม่สำเร็จ: ${message}`)
  }

  const { firebaseToken, lineUserId, displayName, pictureUrl } = result.data

  // Sign in Firebase ด้วย Custom Token
  await signInWithCustomToken(auth, firebaseToken)

  return { userId: lineUserId, displayName, pictureUrl }
}

// ── Get current LINE profile (ไม่ต้อง call API ซ้ำ ใช้ cache จาก auth) ────────
export async function getLiffProfile(): Promise<LiffUserProfile | null> {
  if (!liffInitialized) return null
  const liff = await getLiff()
  if (!liff.isLoggedIn()) return null
  const profile = await liff.getProfile()
  return {
    userId: profile.userId,
    displayName: profile.displayName,
    pictureUrl: profile.pictureUrl,
  }
}
