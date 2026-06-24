import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { getStorageDownloadUrl } from '../firebase-storage'
import type { CompanySettings } from '../types'

const DOC_PATH = 'companySettings'
const DOC_ID = 'main'

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  name: 'บริษัท ไลฟ์ทูป เอ็กซ์ จำกัด',
  nameEn: 'LiveTubeX Co., Ltd.',
  taxId: '0105566147487',
  branch: 'สำนักงานใหญ่',
  address: 'เลขที่ 5 บางบอน 4 ซอย 16 แขวงหนองแขม เขตหนองแขม กรุงเทพมหานคร 10160',
  phone: '082-962-9641',
  email: '',
  website: '',
  bankAccounts: [],
  vatRate: 7,
}

export async function getCompanySettings(): Promise<CompanySettings> {
  const snap = await getDoc(doc(db, DOC_PATH, DOC_ID))
  if (!snap.exists()) return DEFAULT_COMPANY_SETTINGS
  return { ...DEFAULT_COMPANY_SETTINGS, ...(snap.data() as CompanySettings) }
}

export async function saveCompanySettings(data: CompanySettings): Promise<void> {
  await setDoc(doc(db, DOC_PATH, DOC_ID), {
    ...data,
    updatedAt: new Date().toISOString(),
  }, { merge: true })
}

/**
 * โหลด company settings พร้อม resolve signature path → download URL
 * เรียกก่อน render PDF เพราะ react-pdf <Image> ต้องการ URL ไม่ใช่ storage path
 */
export async function getCompanySettingsForPdf(): Promise<CompanySettings> {
  const s = await getCompanySettings()
  if (s.signaturePath) {
    try {
      const url = await getStorageDownloadUrl(s.signaturePath)
      return { ...s, signaturePath: url }
    } catch {
      // ถ้า resolve ไม่ได้ — ใช้ค่าเดิมไป (PDF จะแสดงไม่ได้แต่ไม่ crash)
      return { ...s, signaturePath: '' }
    }
  }
  return s
}
