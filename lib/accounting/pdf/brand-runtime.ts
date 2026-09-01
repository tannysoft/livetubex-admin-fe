'use client'

import { DEFAULT_BRAND, getBrand } from '../../brand'
import { getStorageDownloadUrl } from '../../firebase-storage'

/**
 * แบรนด์สำหรับ PDF
 *
 * react-pdf ประกอบ StyleSheet ตอน import module (ค่าคงที่) และ <Image> ต้องการ
 * URL ไม่ใช่ storage path — เลยโหลดแบรนด์ไว้ที่นี่ครั้งเดียวก่อน render
 * แล้วให้ component อ่านผ่าน pdfBrand() ตอน render
 *
 * เรียก loadPdfBrand() ใน generatePdfBlob() จุดเดียว — call site ไม่ต้องรู้เรื่อง
 */

interface PdfBrand {
  color: string
  /** download URL ของโลโก้ (PNG/JPG) — ว่าง = ใช้โลโก้ default ที่ฝังมาในโค้ด */
  logoUrl: string
}

let cached: PdfBrand = { color: DEFAULT_BRAND.primaryColor, logoUrl: '' }
let loading: Promise<void> | null = null

export function pdfBrand(): PdfBrand {
  return cached
}

/** โหลดครั้งเดียวต่อ session — โหลดไม่ได้ก็ใช้ค่า default ต่อ ไม่ทำให้ PDF พัง */
export function loadPdfBrand(): Promise<void> {
  if (loading) return loading
  loading = (async () => {
    try {
      const b = await getBrand()
      let logoUrl = ''
      if (b.logoImagePath) {
        try {
          logoUrl = await getStorageDownloadUrl(b.logoImagePath)
        } catch {
          logoUrl = ''
        }
      }
      cached = { color: b.primaryColor, logoUrl }
    } catch {
      // เก็บค่า default ไว้
    }
  })()
  return loading
}

/** ล้าง cache — เรียกหลังแก้แบรนด์ เพื่อให้ PDF ใบถัดไปใช้ค่าใหม่ */
export function resetPdfBrand(): void {
  cached = { color: DEFAULT_BRAND.primaryColor, logoUrl: '' }
  loading = null
}
