import * as admin from 'firebase-admin'
import { HttpsError } from 'firebase-functions/v2/https'
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

/**
 * แชร์แผนจัดอุปกรณ์ให้ทีมงานดูผ่านลิงก์ + รหัสผ่าน (ไม่ต้อง login)
 *
 * `planShares/{planId}` — client อ่านได้เฉพาะ admin, เขียนผ่าน function นี้เท่านั้น (hash รหัสผ่านฝั่ง server)
 * หน้า /share/plan เรียก getSharedPlan → ตรวจรหัสผ่าน → คืนแผนที่ตัดข้อมูลการเงินออกแล้ว
 * ⚠️ type ที่คืนเป็นฝาแฝดของ SharedPlan ใน lib/equipment/plan-share.ts
 */

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>

const MIN_PASSWORD = 4
const MAX_PASSWORD = 64
/** ผิดติดกันเท่านี้ → ล็อกลิงก์ชั่วคราว (กันสุ่มรหัส) */
const MAX_FAILS = 8
const LOCK_MS = 10 * 60 * 1000

interface PlanShareDoc {
  planId: string
  shareId: string
  enabled: boolean
  salt: string
  hash: string
  failCount?: number
  lockedUntil?: number
  updatedAt: string
  updatedBy?: string
}

async function hashPassword(password: string, salt: Buffer): Promise<Buffer> {
  return scrypt(password, salt, 32)
}

function newShareId(): string {
  // 16 byte → base64url 22 ตัว เดาไม่ได้ — ลิงก์เองก็เป็นความลับชั้นแรก รหัสผ่านเป็นชั้นที่สอง
  return randomBytes(16).toString('base64url')
}

/** admin: เปิด/ปิด/ตั้งรหัสผ่าน/เปลี่ยนลิงก์ */
export async function handleSetPlanShare(data: unknown, adminEmail?: string) {
  const d = (data ?? {}) as { planId?: unknown; enabled?: unknown; password?: unknown; regenerate?: unknown }
  const planId = typeof d.planId === 'string' ? d.planId : ''
  if (!planId) throw new HttpsError('invalid-argument', 'ต้องระบุแผน')
  const db = admin.firestore()
  const plan = await db.collection('equipmentPlans').doc(planId).get()
  if (!plan.exists) throw new HttpsError('not-found', 'ไม่พบแผนนี้')

  const ref = db.collection('planShares').doc(planId)
  const cur = (await ref.get()).data() as PlanShareDoc | undefined
  const password = typeof d.password === 'string' ? d.password : ''
  if (password && (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD)) {
    throw new HttpsError('invalid-argument', `รหัสผ่านต้องยาว ${MIN_PASSWORD}–${MAX_PASSWORD} ตัวอักษร`)
  }
  if (!cur && !password) throw new HttpsError('invalid-argument', 'ตั้งรหัสผ่านก่อนเปิดลิงก์')

  let salt = cur?.salt ?? ''
  let hash = cur?.hash ?? ''
  if (password) {
    const s = randomBytes(16)
    salt = s.toString('hex')
    hash = (await hashPassword(password, s)).toString('hex')
  }
  const next: PlanShareDoc = {
    planId,
    shareId: !cur || d.regenerate === true ? newShareId() : cur.shareId,
    enabled: typeof d.enabled === 'boolean' ? d.enabled : cur?.enabled ?? true,
    salt,
    hash,
    // เปลี่ยนรหัส/ลิงก์ = ปลดล็อกให้ด้วย
    failCount: 0,
    lockedUntil: 0,
    updatedAt: new Date().toISOString(),
    ...(adminEmail ? { updatedBy: adminEmail } : {}),
  }
  await ref.set(next)
  return { shareId: next.shareId, enabled: next.enabled }
}

/** สาธารณะ: ตรวจรหัสผ่านแล้วคืนแผนแบบตัดข้อมูลการเงิน */
export async function handleGetSharedPlan(data: unknown) {
  const d = (data ?? {}) as { shareId?: unknown; password?: unknown }
  const shareId = typeof d.shareId === 'string' ? d.shareId.trim() : ''
  const password = typeof d.password === 'string' ? d.password : ''
  // ข้อความเดียวกันทั้ง "ไม่มีลิงก์" และ "ปิดแล้ว" — ไม่บอกคนนอกว่าลิงก์ไหนเคยมีจริง
  const notFound = () => new HttpsError('not-found', 'ลิงก์นี้ไม่ถูกต้องหรือถูกปิดแล้ว')
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(shareId)) throw notFound()
  if (!password || password.length > MAX_PASSWORD) throw new HttpsError('permission-denied', 'รหัสผ่านไม่ถูกต้อง')

  const db = admin.firestore()
  const snap = await db.collection('planShares').where('shareId', '==', shareId).limit(1).get()
  if (snap.empty) throw notFound()
  const ref = snap.docs[0].ref
  const share = snap.docs[0].data() as PlanShareDoc
  if (!share.enabled) throw notFound()

  const now = Date.now()
  if ((share.lockedUntil ?? 0) > now) {
    const min = Math.ceil(((share.lockedUntil ?? 0) - now) / 60000)
    throw new HttpsError('resource-exhausted', `ใส่รหัสผิดหลายครั้ง — ลองใหม่ในอีก ${min} นาที`)
  }

  const expected = Buffer.from(share.hash, 'hex')
  const got = await hashPassword(password, Buffer.from(share.salt, 'hex'))
  const ok = expected.length === got.length && timingSafeEqual(expected, got)
  if (!ok) {
    await db.runTransaction(async (tx) => {
      const cur = (await tx.get(ref)).data() as PlanShareDoc | undefined
      const fails = (cur?.failCount ?? 0) + 1
      tx.update(ref, fails >= MAX_FAILS ? { failCount: 0, lockedUntil: now + LOCK_MS } : { failCount: fails })
    })
    throw new HttpsError('permission-denied', 'รหัสผ่านไม่ถูกต้อง')
  }
  if (share.failCount) await ref.update({ failCount: 0 })

  const planSnap = await db.collection('equipmentPlans').doc(share.planId).get()
  if (!planSnap.exists) throw notFound()
  return sanitizePlan(planSnap.data() as Record<string, unknown>)
}

type Obj = Record<string, unknown>
const pick = (o: Obj, keys: string[]): Obj => Object.fromEntries(keys.filter((k) => o[k] !== undefined && o[k] !== null).map((k) => [k, o[k]]))

/**
 * ตัดเฉพาะที่ทีมหน้างานต้องใช้ — ไม่ส่งต้นทุน/ผู้ให้เช่า/เลขรายจ่าย/ค่าใช้จ่ายอื่น/jobId
 * (เพิ่ม field ใหม่ให้ PlanItem แล้วไม่ต้องห่วงว่าจะหลุด เพราะใช้ allowlist)
 */
function sanitizePlan(p: Obj) {
  const items = ((p.items as Obj[] | undefined) ?? []).map((it) => pick(it, [
    'id', 'code', 'name', 'category', 'quantity', 'fromLocation', 'toLocation', 'note', 'attachedTo', 'origin', 'packed', 'returned', 'useFrom', 'useTo',
  ]))
  const layouts = ((p.layouts as Obj[] | undefined) ?? []).map((l) => {
    const venue = { ...(l.venue as Obj) }
    // รูป floor plan อยู่ใน collection admin-only — ไม่ส่ง (ผังวางยังดูได้ แค่ไม่มีรูปปูพื้น)
    delete venue.floorImageId
    return { id: l.id, name: l.name, venue, objects: l.objects ?? [], cables: l.cables ?? [] }
  })
  const revision = p.revision as Obj | undefined
  return {
    ...pick(p, ['title', 'jobTitle', 'date', 'endDate', 'location', 'notes', 'status', 'videoFormat', 'recordings', 'fohFeeds', 'updatedAt']),
    items,
    diagrams: (p.diagrams as unknown[] | undefined) ?? [],
    layouts,
    ...(revision ? { revision: pick(revision, ['number', 'label', 'savedAt']) } : {}),
  }
}
