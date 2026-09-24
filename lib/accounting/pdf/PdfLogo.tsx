import { Image } from '@react-pdf/renderer'
import LogoSvg from './LogoSvg'
import { pdfBrand } from './brand-runtime'

/**
 * โลโก้บนหัวเอกสาร PDF
 *
 * ลูกค้าอัพโหลดโลโก้เป็นไฟล์ภาพ (brand.logoImagePath) → ใช้ไฟล์นั้น
 * ยังไม่ได้อัพ → ใช้โลโก้ default ที่ port เป็น <Path> ไว้ใน LogoSvg
 *
 * ⚠️ ใช้ไฟล์ภาพเท่านั้น — react-pdf <Image> ไม่รองรับ SVG จึงใช้ logoSvg
 *    (ที่ใช้บนเว็บ) ตรงนี้ไม่ได้
 */
export default function PdfLogo({ width = 140 }: { width?: number }) {
  const { logoUrl } = pdfBrand()
  if (logoUrl) {
    // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf <Image> ไม่มี prop alt
    return <Image src={logoUrl} style={{ width, objectFit: 'contain' }} />
  }
  return <LogoSvg width={width} />
}
