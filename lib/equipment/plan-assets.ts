import { collection, doc, addDoc, getDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase'

/**
 * รูป floor plan ที่ปูพื้นในผัง 3D — เก็บเป็น data URL ใน Firestore (`equipmentPlanAssets/{id}`)
 *
 * ทำไมไม่ใช้ Storage: รูปถูกใช้เป็น WebGL texture ซึ่งบังคับ CORS — download URL ของ Storage
 * ใช้ไม่ได้ถ้า bucket ของ tenant ไม่ได้ตั้ง CORS (ต้องใช้ gsutil ตั้งทีละ project)
 * data URL เป็น same-origin เสมอ จึงไม่ต้องให้ลูกค้า whitelabel ตั้งค่าอะไรเพิ่ม
 * แลกกับเพดาน 1MB/doc → ย่อรูปฝั่ง client ก่อนเสมอ และแยก doc ไม่ฝังในแผน
 */
const COL = 'equipmentPlanAssets'
const MAX_BYTES = 900_000

export async function getPlanAsset(id: string): Promise<string | null> {
  const snap = await getDoc(doc(db, COL, id))
  return snap.exists() ? (snap.data().dataUrl as string) : null
}

export async function deletePlanAsset(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id))
}

/** ย่อรูปเป็น JPEG จนต่ำกว่าเพดาน แล้วบันทึก — คืน { id, dataUrl } */
export async function uploadPlanAsset(planId: string, file: File): Promise<{ id: string; dataUrl: string }> {
  const bitmap = await createImageBitmap(file)
  let side = 2000
  let dataUrl = ''
  for (let attempt = 0; attempt < 5; attempt++) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff' // PNG โปร่งใส → JPEG จะดำ ถ้าไม่รองพื้นขาว
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    dataUrl = canvas.toDataURL('image/jpeg', 0.82)
    if (dataUrl.length <= MAX_BYTES) break
    side = Math.round(side * 0.75)
  }
  if (dataUrl.length > MAX_BYTES) throw new Error('รูปใหญ่เกินไป')
  const ref = await addDoc(collection(db, COL), { planId, dataUrl, createdAt: new Date().toISOString() })
  return { id: ref.id, dataUrl }
}
