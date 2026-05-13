/**
 * Helpers สำหรับหนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)
 *
 * ประเภทเงินได้ตามแบบ:
 *   1. เงินเดือน ค่าจ้าง บำนาญ (40(1))
 *   2. ค่าธรรมเนียม ค่านายหน้า ค่าบริการ (40(2))
 *   3. ค่ากู้ดวิลล์ ค่าลิขสิทธิ์ (40(3))
 *   4. ค่าดอกเบี้ย เงินปันผล (40(4))
 *   5. ค่าเช่า (40(5))
 *   6. ค่าวิชาชีพอิสระ (40(6))
 *   7. ค่ารับเหมา (40(7))
 *   8. ค่าจ้างทำของ และอื่นๆ (40(8))
 */

export type IncomeTypeCode = '40(1)' | '40(2)' | '40(3)' | '40(4)' | '40(5)' | '40(6)' | '40(7)' | '40(8)'

export interface IncomeType {
  code: IncomeTypeCode
  label: string
  shortLabel: string
}

export const INCOME_TYPES: IncomeType[] = [
  { code: '40(1)', label: 'เงินเดือน ค่าจ้าง บำเหน็จ บำนาญ', shortLabel: 'เงินเดือน' },
  { code: '40(2)', label: 'ค่าธรรมเนียม ค่านายหน้า ค่าบริการ', shortLabel: 'ค่าบริการ/นายหน้า' },
  { code: '40(3)', label: 'ค่ากู๊ดวิลล์ ค่าลิขสิทธิ์', shortLabel: 'ค่าลิขสิทธิ์' },
  { code: '40(4)', label: 'ค่าดอกเบี้ย เงินปันผล', shortLabel: 'ดอกเบี้ย/เงินปันผล' },
  { code: '40(5)', label: 'ค่าเช่าทรัพย์สิน', shortLabel: 'ค่าเช่า' },
  { code: '40(6)', label: 'ค่าวิชาชีพอิสระ', shortLabel: 'วิชาชีพอิสระ' },
  { code: '40(7)', label: 'ค่ารับเหมาก่อสร้าง', shortLabel: 'ค่ารับเหมา' },
  { code: '40(8)', label: 'ค่าจ้างทำของ และอื่นๆ', shortLabel: 'ค่าจ้างทำของ/อื่นๆ' },
]

/**
 * แมป category name → income type code (มาตรา 40 ใน ปรร.)
 * ค่าจ้างทีมงาน freelancer ตามปกติเข้า 40(2) ค่าบริการ
 */
export function deriveIncomeTypeCode(categoryName: string): IncomeTypeCode {
  const n = categoryName.toLowerCase()
  if (n.includes('เช่า')) return '40(5)'
  if (n.includes('วิชาชีพ') || n.includes('ทนาย') || n.includes('หมอ') || n.includes('สถาปนิก') || n.includes('วิศวกร')) return '40(6)'
  if (n.includes('รับเหมา') || n.includes('ก่อสร้าง')) return '40(7)'
  if (n.includes('ลิขสิทธิ์') || n.includes('ดวิลล์') || n.includes('goodwill')) return '40(3)'
  if (n.includes('ดอกเบี้ย') || n.includes('ปันผล')) return '40(4)'
  if (n.includes('เงินเดือน')) return '40(1)'
  // ค่าจ้างทำของ (freelancer ปกติ) — ใช้ 40(2) ตามที่กรมสรรพากรแนะนำสำหรับ freelance service
  // (ทำของจริงๆ ที่ใช้ 40(8) ต้องเป็นการรับจ้างทำสินค้าด้วยวัสดุของผู้รับจ้าง)
  if (n.includes('ค่าจ้างทำของ')) return '40(2)'
  if (n.includes('โฆษณา') || n.includes('marketing')) return '40(2)'
  // default
  return '40(2)'
}

export const TAX_FORM_TYPE = {
  pnd3: 'ภงด.3',
  pnd53: 'ภงด.53',
} as const

export type TaxFormType = typeof TAX_FORM_TYPE[keyof typeof TAX_FORM_TYPE]
