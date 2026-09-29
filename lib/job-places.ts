import { collection, deleteDoc, doc, getDocs, increment, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import { safeMapUrl } from './job-map'
import type { Job } from './types'

/**
 * สถานที่ที่เคยใช้ (admin-only) — จดอัตโนมัติทุกครั้งที่บันทึกงาน (createJob/updateJob ที่มี location)
 * ใช้ทำ autocomplete ช่องสถานที่ในฟอร์มงาน: เลือกแล้วเติมลิงก์ Google Maps ให้
 * doc id = ชื่อที่ normalize แล้ว (พิมพ์ช่องว่าง/ตัวพิมพ์ต่างกันเป็นที่เดียวกัน)
 */
export interface JobPlace {
  id: string
  name: string
  mapUrl?: string
  useCount: number
  lastUsedAt: string
}

const COL = 'jobPlaces'
const normName = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
const placeId = (name: string) => normName(name).replace(/\//g, '∕').slice(0, 300) || '_'

export async function getJobPlaces(): Promise<JobPlace[]> {
  const snap = await getDocs(collection(db, COL))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as JobPlace))
}

/** จดสถานที่ (ลิงก์ว่าง = ไม่ทับลิงก์เดิมที่เคยบันทึก) — พังก็ไม่ block การบันทึกงาน */
export async function rememberJobPlace(name?: string, mapUrl?: string): Promise<void> {
  const n = (name ?? '').trim()
  if (!n) return
  const map = safeMapUrl(mapUrl)
  await setDoc(doc(db, COL, placeId(n)), {
    name: n.slice(0, 200),
    ...(map ? { mapUrl: map } : {}),
    useCount: increment(1),
    lastUsedAt: new Date().toISOString(),
  }, { merge: true })
}

export async function deleteJobPlace(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id))
}

/**
 * รายการแนะนำ = สถานที่ที่บันทึกไว้ + สถานที่ของงานเก่า (ก่อนมีระบบนี้) → ชื่อ → ลิงก์ Maps
 * ที่บันทึกไว้ชนะงานเก่า · เรียงใช้บ่อยก่อน
 */
export function placeSuggestions(places: JobPlace[], jobs: Pick<Job, 'location' | 'mapUrl'>[]): { names: string[]; mapOf: Map<string, string> } {
  const mapOf = new Map<string, string>()
  const count = new Map<string, number>()
  const nameOf = new Map<string, string>()
  for (const j of jobs) {
    const n = j.location?.trim()
    if (!n) continue
    const k = normName(n)
    if (!nameOf.has(k)) nameOf.set(k, n)
    count.set(k, (count.get(k) ?? 0) + 1)
    const m = safeMapUrl(j.mapUrl)
    if (m && !mapOf.has(k)) mapOf.set(k, m)
  }
  for (const p of places) {
    const k = normName(p.name)
    nameOf.set(k, p.name)
    count.set(k, Math.max(count.get(k) ?? 0, p.useCount ?? 0))
    const m = safeMapUrl(p.mapUrl)
    if (m) mapOf.set(k, m)
  }
  const names = [...nameOf.entries()].sort((a, b) => (count.get(b[0]) ?? 0) - (count.get(a[0]) ?? 0)).map(([, n]) => n)
  const byName = new Map<string, string>()
  for (const [k, n] of nameOf) { const m = mapOf.get(k); if (m) byName.set(n, m) }
  return { names, mapOf: byName }
}

export const placeMapFor = (mapOf: Map<string, string>, name: string) => {
  const k = normName(name)
  for (const [n, m] of mapOf) if (normName(n) === k) return m
  return ''
}
