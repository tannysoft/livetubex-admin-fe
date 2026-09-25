import * as admin from 'firebase-admin'
import { createHmac, timingSafeEqual } from 'crypto'
import * as https from 'https'

/**
 * LINE Group — webhook ของ Messaging API จดกลุ่มที่บอทอยู่ลง `lineGroups/{groupId}`
 * (LINE ไม่มี API "รายการกลุ่มทั้งหมด" → ต้องจดจาก event: join / ข้อความในกลุ่ม / สมาชิกเข้า · leave = active false)
 * กลุ่มที่บอทอยู่ก่อนตั้ง webhook → พิมพ์อะไรก็ได้ในกลุ่ม 1 ครั้งก็ขึ้นในรายการ
 */

interface LineEvent {
  type: string
  source?: { type?: string; groupId?: string; userId?: string }
}

export interface LineGroupDoc {
  groupId: string
  name: string
  pictureUrl?: string
  active: boolean
  joinedAt?: string
  leftAt?: string
  lastEventAt: string
  /** ชื่อเรียกที่แอดมินตั้งเอง (แก้ได้จากหน้าเว็บ) */
  label?: string
  hidden?: boolean
}

/** ตรวจลายเซ็น x-line-signature = base64(HMAC-SHA256(channel secret, raw body)) */
export function verifyLineSignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature || !secret) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest()
  let got: Buffer
  try { got = Buffer.from(signature, 'base64') } catch { return false }
  return got.length === expected.length && timingSafeEqual(got, expected)
}

function getJson<T>(path: string, token: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: 'api.line.me', path, method: 'GET', headers: { Authorization: `Bearer ${token}` } },
      (res) => {
        let data = ''
        res.on('data', (c) => { data += c })
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(JSON.parse(data) as T) } catch (e) { reject(e) }
          } else reject(new Error(`LINE API ${res.statusCode}: ${data}`))
        })
      },
    )
    req.on('error', reject)
    req.end()
  })
}

/** ชื่อ/รูปกลุ่ม — ต้องใช้ token ของบอทที่อยู่ในกลุ่มนั้น */
export async function fetchGroupSummary(groupId: string, token: string): Promise<{ name: string; pictureUrl?: string } | null> {
  try {
    const s = await getJson<{ groupName?: string; pictureUrl?: string }>(`/v2/bot/group/${encodeURIComponent(groupId)}/summary`, token)
    return { name: s.groupName ?? '', ...(s.pictureUrl ? { pictureUrl: s.pictureUrl } : {}) }
  } catch (e) {
    console.warn('[lineWebhook] group summary ❌', groupId, e)
    return null
  }
}

const SUMMARY_TTL_MS = 6 * 60 * 60 * 1000 // ชื่อกลุ่มเปลี่ยนได้ — ดึงใหม่อย่างมากทุก 6 ชม. (ไม่ยิงทุกข้อความ)

export async function handleLineEvents(events: LineEvent[], token: string): Promise<void> {
  const db = admin.firestore()
  const now = new Date().toISOString()
  // 1 webhook มีหลาย event ของกลุ่มเดียวกันได้ — ทำกลุ่มละครั้ง (event สุดท้ายชนะ)
  const byGroup = new Map<string, string>()
  for (const ev of events) {
    const gid = ev.source?.type === 'group' ? ev.source.groupId : undefined
    if (gid) byGroup.set(gid, ev.type)
  }
  for (const [groupId, type] of byGroup) {
    const ref = db.collection('lineGroups').doc(groupId)
    if (type === 'leave') {
      await ref.set({ groupId, active: false, leftAt: now, lastEventAt: now }, { merge: true })
      continue
    }
    const cur = (await ref.get()).data() as LineGroupDoc | undefined
    const stale = !cur?.name || !cur.lastEventAt || Date.now() - new Date(cur.lastEventAt).getTime() > SUMMARY_TTL_MS
    const summary = stale || type === 'join' ? await fetchGroupSummary(groupId, token) : null
    await ref.set({
      groupId,
      active: true,
      lastEventAt: now,
      ...(type === 'join' ? { joinedAt: now } : {}),
      ...(summary ? { name: summary.name || cur?.name || 'กลุ่ม LINE', ...(summary.pictureUrl ? { pictureUrl: summary.pictureUrl } : {}) } : cur?.name ? {} : { name: 'กลุ่ม LINE' }),
    }, { merge: true })
  }
}
