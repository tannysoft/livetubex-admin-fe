import {
  Bytes, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc, writeBatch,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../firebase'
import type { VenueModelKind } from '../types'

/**
 * ไฟล์โมเดล 3D ของสถานที่ (.glb / ไฟล์สแกน Gaussian splat) — `equipmentVenueModels/{id}` + `chunks/{index}`
 *
 * ทำไมไม่ใช้ Storage: เหตุผลเดียวกับรูป floor plan (plan-assets.ts) — โหลดไฟล์จาก Storage ในเบราว์เซอร์
 * (fetch/getBytes) ต้องตั้ง CORS ของ bucket ทีละ tenant · Firestore ไม่ต้องตั้งอะไร
 * แลกกับเพดาน 1 MiB/doc → หั่นไฟล์เป็นชิ้น CHUNK_BYTES เก็บเป็น Bytes (ไม่ใช่ base64 ไม่บวม)
 * ไฟล์ไม่เคยแก้ (id ใหม่ทุกครั้งที่อัปโหลด) → cache ในเบราว์เซอร์ด้วย Cache Storage ได้ตลอด
 * หน้าแชร์ทีมงาน (ไม่ได้ login) อ่านผ่าน function getSharedVenueModel ทีละชิ้น
 */

const COL = 'equipmentVenueModels'
const CHUNK_BYTES = 900_000
export const MAX_MODEL_BYTES = 40 * 1024 * 1024

export const MESH_EXTS = ['glb']
export const SPLAT_EXTS = ['spz', 'ply', 'splat', 'ksplat']
export const MODEL_ACCEPT = [...MESH_EXTS, ...SPLAT_EXTS].map((e) => `.${e}`).join(',')

export interface VenueModelMeta {
  id: string
  name: string
  fileName: string
  kind: VenueModelKind
  size: number
  chunkCount: number
  createdAt: string
}

export function modelKindOf(fileName: string): VenueModelKind | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (MESH_EXTS.includes(ext)) return 'mesh'
  if (SPLAT_EXTS.includes(ext)) return 'splat'
  return null
}

export async function listVenueModels(): Promise<VenueModelMeta[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy('createdAt', 'desc')))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<VenueModelMeta, 'id'>) }))
}

/** อัปโหลด → meta ของไฟล์ (เขียนชิ้นเป็นชุดละ ~8 MB — batch หนึ่งรับได้ไม่เกิน 10 MiB) */
export async function uploadVenueModel(file: File, onProgress?: (done: number) => void): Promise<VenueModelMeta> {
  const kind = modelKindOf(file.name)
  if (!kind) throw new Error('รองรับเฉพาะ .glb หรือไฟล์สแกน .spz / .ply / .splat / .ksplat')
  if (file.size > MAX_MODEL_BYTES) throw new Error(`ไฟล์ใหญ่เกิน ${MAX_MODEL_BYTES / 1024 / 1024} MB — บีบอัดก่อน (glb: Draco/Meshopt, สแกน: .spz)`)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const ref = doc(collection(db, COL))
  const chunkCount = Math.max(1, Math.ceil(bytes.length / CHUNK_BYTES))
  const PER_BATCH = 9
  for (let start = 0; start < chunkCount; start += PER_BATCH) {
    const batch = writeBatch(db)
    for (let i = start; i < Math.min(chunkCount, start + PER_BATCH); i++) {
      const part = bytes.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES)
      batch.set(doc(ref, 'chunks', String(i).padStart(4, '0')), { index: i, data: Bytes.fromUint8Array(part) })
    }
    await batch.commit()
    onProgress?.(Math.min(1, (start + PER_BATCH) / chunkCount))
  }
  // meta เขียนหลังชิ้นครบ — ไฟล์ที่อัปโหลดค้างครึ่งทางจึงไม่โผล่ในรายการให้เลือก
  const meta: Omit<VenueModelMeta, 'id'> = {
    name: file.name.replace(/\.[^.]+$/, ''), fileName: file.name, kind, size: bytes.length, chunkCount,
    createdAt: new Date().toISOString(),
  }
  await setDoc(ref, meta)
  return { id: ref.id, ...meta }
}

/** ลบไฟล์ — แผนที่ยังอ้าง id นี้จะกลับไปใช้สถานที่จากตัวเลข */
export async function deleteVenueModel(id: string): Promise<void> {
  const chunks = await getDocs(collection(db, COL, id, 'chunks'))
  for (let i = 0; i < chunks.docs.length; i += 400) {
    const batch = writeBatch(db)
    chunks.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
  await deleteDoc(doc(db, COL, id))
  await cacheDelete(id)
}

// ── cache ในเบราว์เซอร์ (ไฟล์ใหญ่ — เปิดผังครั้งถัดไปไม่ต้องโหลดใหม่) ───────────────
const CACHE = 'venue-models-v1'
const cacheKey = (id: string) => `/__venue-model/${id}`

async function cacheGet(id: string): Promise<ArrayBuffer | null> {
  try {
    const res = await (await caches.open(CACHE)).match(cacheKey(id))
    return res ? await res.arrayBuffer() : null
  } catch { return null } // ไม่มี Cache Storage (http / private mode) — โหลดใหม่ทุกครั้ง
}
async function cachePut(id: string, buf: ArrayBuffer): Promise<void> {
  try { await (await caches.open(CACHE)).put(cacheKey(id), new Response(buf)) } catch { /* เต็ม/ไม่รองรับ — ข้าม */ }
}
async function cacheDelete(id: string): Promise<void> {
  try { await (await caches.open(CACHE)).delete(cacheKey(id)) } catch { /* ข้าม */ }
}

function join(parts: Uint8Array[]): ArrayBuffer {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out.buffer
}

/** โหลดชิ้นพร้อมกันทีละ 4 — onProgress(0..1) */
async function loadChunks(count: number, get: (i: number) => Promise<Uint8Array>, onProgress?: (p: number) => void): Promise<ArrayBuffer> {
  const parts: Uint8Array[] = new Array(count)
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < count) {
      const i = next++
      parts[i] = await get(i)
      onProgress?.(++done / count)
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, count) }, worker))
  return join(parts)
}

/** admin: โหลดไฟล์จาก Firestore ตรง */
export async function fetchVenueModel(id: string, onProgress?: (p: number) => void): Promise<ArrayBuffer> {
  const cached = await cacheGet(id)
  if (cached) return cached
  const meta = await getDoc(doc(db, COL, id))
  if (!meta.exists()) throw new Error('ไม่พบไฟล์โมเดล (อาจถูกลบไปแล้ว)')
  const { chunkCount } = meta.data() as VenueModelMeta
  const buf = await loadChunks(chunkCount, async (i) => {
    const snap = await getDoc(doc(db, COL, id, 'chunks', String(i).padStart(4, '0')))
    if (!snap.exists()) throw new Error('ไฟล์โมเดลไม่ครบ')
    return (snap.data().data as Bytes).toUint8Array()
  }, onProgress)
  void cachePut(id, buf)
  return buf
}

/** หน้าแชร์ทีมงาน: อ่านผ่าน function (ตรวจลิงก์/รหัสเหมือน getSharedPlan) — password '' = login แล้ว */
export async function fetchSharedVenueModel(shareId: string, password: string, id: string, onProgress?: (p: number) => void): Promise<ArrayBuffer> {
  const cached = await cacheGet(id)
  if (cached) return cached
  const call = httpsCallable<{ shareId: string; password: string; assetId: string; index: number }, { data: string; count: number }>(
    functions, 'getSharedVenueModel', { timeout: 120_000 },
  )
  const decode = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  // ชิ้นแรกบอกจำนวนชิ้นทั้งหมด
  const first = (await call({ shareId, password, assetId: id, index: 0 })).data
  const rest = await loadChunks(first.count - 1, async (i) => decode((await call({ shareId, password, assetId: id, index: i + 1 })).data.data), onProgress)
  const buf = join([decode(first.data), new Uint8Array(rest)])
  void cachePut(id, buf)
  return buf
}

/** ค่าตั้งต้นของโมเดลที่เพิ่งเลือก */
export function defaultModelConfig(meta: Pick<VenueModelMeta, 'id' | 'kind' | 'fileName'>) {
  return { assetId: meta.id, kind: meta.kind, fileName: meta.fileName, scale: 1, x: 0, y: 0, z: 0, rotation: 0 }
}

export function formatBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`
}
