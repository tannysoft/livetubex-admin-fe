'use client'

import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from './firebase'

/**
 * อัพโหลดสำเนาบัตรประชาชน
 * path: idCards/{lineUserId}/id_card.{ext}
 * คืน download URL
 */
export async function uploadIdCardImage(lineUserId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `idCards/${lineUserId}/id_card.${ext}`
  const storageRef = ref(storage, path)

  await uploadBytes(storageRef, file, {
    contentType: file.type,
    customMetadata: { uploadedBy: lineUserId },
  })

  return await getDownloadURL(storageRef)
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
