'use client'

import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from './firebase'

/**
 * อัพโหลดสำเนาบัตรประชาชน
 * path: idCards/{lineUserId}/id_card.{ext}
 * คืน storage path (ไม่ใช่ URL ที่มี token) — ใช้ getStorageDownloadUrl() เพื่อขอ URL ภายหลัง
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
 * path: expenseSlips/{lineUserId}/{timestamp}.{ext}
 * คืน storage path (ไม่ใช่ URL ที่มี token) — ใช้ getStorageDownloadUrl() เพื่อขอ URL ภายหลัง
 */
export async function uploadExpenseSlip(lineUserId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const ts = Date.now()
  const path = `expenseSlips/${lineUserId}/${ts}.${ext}`
  const storageRef = ref(storage, path)

  await uploadBytes(storageRef, file, {
    contentType: file.type,
    customMetadata: { uploadedBy: lineUserId },
  })

  return path  // คืน storage path ไม่ใช่ URL
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
export async function deleteIdCardImage(lineUserId: string): Promise<void> {
  // ลองลบทั้ง .jpg .jpeg .png .webp
  const exts = ['jpg', 'jpeg', 'png', 'webp']
  await Promise.allSettled(
    exts.map((ext) => deleteObject(ref(storage, `idCards/${lineUserId}/id_card.${ext}`)))
  )
}
