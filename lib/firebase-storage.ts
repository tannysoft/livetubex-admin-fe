'use client'

import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from './firebase'

/**
 * อัพโหลดสำเนาบัตรประชาชน
 * path: idCards/{lineUserId}/id_card.{ext}
 * ใช้ lineUserId (= auth.uid) เพื่อให้ Storage rule ตรวจสอบได้โดยตรง
 * โดยไม่ต้องพึ่ง firestore.get() cross-lookup ซึ่งมี race condition
 */
export async function uploadIdCardImage(lineUserId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `idCards/${lineUserId}/id_card.${ext}`
  const storageRef = ref(storage, path)

  await uploadBytes(storageRef, file, {
    contentType: file.type,
    customMetadata: { uploadedBy: lineUserId },
  })

  return path  // คืน storage path ไม่ใช่ URL
}

/**
 * อัพโหลดสลิปค่าใช้จ่าย
 * path: expenseSlips/{freelancerId}/{timestamp}.{ext}
 * คืน storage path (ไม่ใช่ URL ที่มี token) — ใช้ getStorageDownloadUrl() เพื่อขอ URL ภายหลัง
 */
export async function uploadExpenseSlip(freelancerId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const ts = Date.now()
  const path = `expenseSlips/${freelancerId}/${ts}.${ext}`
  const storageRef = ref(storage, path)

  await uploadBytes(storageRef, file, {
    contentType: file.type,
    customMetadata: { uploadedBy: freelancerId },
  })

  return path  // คืน storage path ไม่ใช่ URL
}

/**
 * อัพโหลดสลิปการโอนเงิน (admin เท่านั้น)
 * path: payoutSlips/{freelancerId}/{timestamp}.{ext}
 */
export async function uploadPayoutSlip(freelancerId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `payoutSlips/${freelancerId}/${Date.now()}.${ext}`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, file, { contentType: file.type })
  return path
}

/**
 * ขอ download URL จาก storage path (ต้อง login อยู่ ถึงจะมีสิทธิ์อ่าน)
 * ใช้ทุกครั้งที่ต้องการแสดงรูปที่เก็บอยู่ใน Firebase Storage
 */
export async function getStorageDownloadUrl(path: string): Promise<string> {
  return await getDownloadURL(ref(storage, path))
}

/**
 * ลบไฟล์สำเนาบัตรประชาชนเดิม (optional — ใช้ตอน replace)
 */
export async function deleteIdCardImage(freelancerId: string): Promise<void> {
  // ลองลบทั้ง .jpg .jpeg .png .webp
  const exts = ['jpg', 'jpeg', 'png', 'webp']
  await Promise.allSettled(
    exts.map((ext) => deleteObject(ref(storage, `idCards/${freelancerId}/id_card.${ext}`)))
  )
}
