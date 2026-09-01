import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'

/**
 * ── LINE config ต่อ tenant ────────────────────────────────────────────────────
 * เก็บที่ Firestore `publicSettings/line` (read สาธารณะ / write เฉพาะ admin)
 * ต้องอ่านได้ก่อน login เพราะ LIFF ต้อง init ก่อนจะรู้ว่า user เป็นใคร
 *
 * ⚠️ ใส่ได้เฉพาะค่าที่ไม่ลับ — LIFF ID เปิดเผยอยู่แล้วใน URL ที่ user กด
 *    ส่วน LINE_CHANNEL_ACCESS_TOKEN (Messaging API) **ห้ามเก็บที่นี่เด็ดขาด**
 *    ใครได้ไปจะส่งข้อความในนามลูกค้าได้ — เก็บใน Secret Manager เท่านั้น
 *    (`firebase functions:secrets:set LINE_CHANNEL_ACCESS_TOKEN`)
 */

export const LINE_DOC_PATH = 'publicSettings'
export const LINE_DOC_ID = 'line'

const LINE_CACHE_KEY = 'lineConfig.v1'

export interface LineConfig {
  /** LIFF ID เช่น 2009681467-TEcRBohh */
  liffId: string
  /**
   * LINE Login channel ID เช่น 2009681467
   * ใช้ฝั่ง Cloud Functions ตรวจว่า access token ออกโดย channel ของ tenant นี้จริง
   * ว่างไว้ = derive จาก prefix ของ LIFF ID ให้อัตโนมัติ
   */
  loginChannelId: string
  updatedAt?: string
}

/** ค่าตั้งต้นจาก build-time env — ใช้ตอนยังไม่ได้ตั้งค่าใน Firestore */
export const DEFAULT_LINE_CONFIG: LineConfig = {
  liffId: process.env.NEXT_PUBLIC_LINE_LIFF_ID ?? '',
  loginChannelId: '',
}

/** LIFF ID เป็นตัวเลข-ขีด-อักษร เช่น 2009681467-TEcRBohh */
export function isValidLiffId(v: string): boolean {
  return /^\d{8,12}-[A-Za-z0-9]{4,20}$/.test(v.trim())
}

/** channel ID เป็นตัวเลขล้วน */
export function isValidChannelId(v: string): boolean {
  return /^\d{8,12}$/.test(v.trim())
}

/** prefix ของ LIFF ID คือ channel ID ของ LINE Login channel นั้น */
export function channelIdFromLiffId(liffId: string): string {
  const m = /^(\d{8,12})-[A-Za-z0-9]{4,20}$/.exec(liffId.trim())
  return m ? m[1] : ''
}

function normalize(raw: Partial<LineConfig> | null | undefined): LineConfig {
  const liffId = (raw?.liffId ?? '').trim() || DEFAULT_LINE_CONFIG.liffId
  const loginChannelId = (raw?.loginChannelId ?? '').trim() || channelIdFromLiffId(liffId)
  return { ...DEFAULT_LINE_CONFIG, ...(raw ?? {}), liffId, loginChannelId }
}

// ── cache ─────────────────────────────────────────────────────────────────────
// LIFF init อยู่บนเส้นทางวิกฤต (user เปิดจาก LINE แล้วรอหน้าโหลด)
// จึงอ่าน cache ก่อน แล้วค่อย refresh เบื้องหลัง

function readCache(): LineConfig | null {
  try {
    const raw = localStorage.getItem(LINE_CACHE_KEY)
    return raw ? normalize(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function writeCache(c: LineConfig): void {
  try {
    localStorage.setItem(LINE_CACHE_KEY, JSON.stringify(c))
  } catch {
    // localStorage ถูกปิด — แค่ช้าลงรอบหน้า ไม่พัง
  }
}

let inflight: Promise<LineConfig> | null = null

/** อ่านจาก Firestore ตรงๆ (ใช้ในหน้า admin ที่ต้องการค่าล่าสุดเสมอ) */
export async function getLineConfig(): Promise<LineConfig> {
  const snap = await getDoc(doc(db, LINE_DOC_PATH, LINE_DOC_ID))
  return normalize(snap.exists() ? (snap.data() as Partial<LineConfig>) : null)
}

/**
 * LIFF ID สำหรับ init — cache ก่อน ค่อย refresh เบื้องหลัง
 * อ่าน Firestore ไม่ได้ → ตกไปใช้ค่าจาก env (พฤติกรรมเดิม)
 */
export async function resolveLiffId(): Promise<string> {
  const cached = readCache()
  if (cached?.liffId) {
    // refresh เงียบๆ ไว้ใช้รอบหน้า — ไม่บล็อก init รอบนี้
    void getLineConfig().then(writeCache).catch(() => {})
    return cached.liffId
  }

  if (!inflight) {
    inflight = getLineConfig()
      .then((c) => {
        writeCache(c)
        return c
      })
      .catch(() => DEFAULT_LINE_CONFIG)
      .finally(() => {
        inflight = null
      })
  }
  return (await inflight).liffId
}

export async function saveLineConfig(data: LineConfig): Promise<void> {
  await setDoc(
    doc(db, LINE_DOC_PATH, LINE_DOC_ID),
    {
      liffId: data.liffId.trim(),
      loginChannelId: data.loginChannelId.trim() || channelIdFromLiffId(data.liffId),
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  )
  writeCache(normalize(data))
}
