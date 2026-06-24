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
 * อัพโหลดสลิปค่าใช้จ่าย (freelancer เรียก)
 * path: expenseSlips/{lineUserId}/{timestamp}.{ext}
 * ใช้ lineUserId (= auth.uid) เป็น folder — Storage rule ตรวจ auth.uid == folderId โดยตรง
 *
 * หมายเหตุ: admin สร้าง payment แล้วอัพโหลด expense slip → ส่ง freelancerId ก็ได้
 * เพราะ rule อนุญาต admin เขียนได้ทุก folder อยู่แล้ว
 */
export async function uploadExpenseSlip(uploaderUid: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const ts = Date.now()
  const path = `expenseSlips/${uploaderUid}/${ts}.${ext}`
  const storageRef = ref(storage, path)

  await uploadBytes(storageRef, file, {
    contentType: file.type,
    customMetadata: { uploadedBy: uploaderUid },
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
 * ดาวน์โหลดรูปจาก URL ภายนอก (เช่น LINE profile picture) แล้วอัพโหลดเข้า Storage
 * path: profilePictures/{lineUserId}/profile.jpg
 *
 * ใช้สำหรับ snapshot รูป profile จาก LINE มาเก็บใน Storage ของเรา
 * เพื่อไม่ต้องพึ่ง LINE CDN URL ที่หมุนเปลี่ยนเป็นระยะ
 *
 * หมายเหตุ: LINE profile-scdn รองรับ CORS อยู่แล้ว — fetch จาก browser ได้
 */
export async function uploadProfilePictureFromUrl(
  lineUserId: string,
  sourceUrl: string,
): Promise<string> {
  const res = await fetch(sourceUrl)
  if (!res.ok) throw new Error(`fetch profile picture failed: ${res.status}`)
  const blob = await res.blob()
  const contentType = blob.type || 'image/jpeg'
  const path = `profilePictures/${lineUserId}/profile.jpg`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, blob, {
    contentType,
    customMetadata: { uploadedBy: lineUserId, source: 'line-profile' },
  })
  return path
}

/**
 * อัพโหลดลายเซ็นผู้มีอำนาจ (Admin เท่านั้น)
 * path: companyAssets/signature.{ext}
 */
export async function uploadCompanySignature(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
  const path = `companyAssets/signature.${ext}`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, file, { contentType: file.type })
  return path
}

/**
 * อัพโหลดสลิป/ใบเสร็จค่าใช้จ่ายบริษัท (Phase 2 — Admin เท่านั้น)
 * path: expenseReceipts/{expenseId}/{timestamp}.{ext}
 */
export async function uploadExpenseReceipt(expenseId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `expenseReceipts/${expenseId}/${Date.now()}.${ext}`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, file, { contentType: file.type })
  return path
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
