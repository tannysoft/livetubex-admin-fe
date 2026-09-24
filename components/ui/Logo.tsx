'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useBrand } from '@/components/BrandProvider'
import { monoLogoSvg } from '@/lib/brand'

interface LogoProps {
  className?: string
  width?: number
  height?: number
  href?: string
  /** บนพื้นสีแบรนด์ — บังคับโลโก้เป็นสีขาวล้วน */
  white?: boolean
}

/**
 * โลโก้ตามแบรนด์ของ tenant (publicSettings/brand → logoSvg)
 * SVG ถูก sanitize แล้วใน normalizeBrand() ก่อนเข้ามาถึงตรงนี้
 */
export default function Logo({ className = '', width = 160, height = 24, href = '/', white = false }: LogoProps) {
  const brand = useBrand()

  const svg = useMemo(() => {
    const base = white ? monoLogoSvg(brand.logoSvg) : brand.logoSvg
    // บังคับขนาดจาก prop — โลโก้ที่ลูกค้าอัพโหลดอาจมี width/height/style ติดมาเอง
    // meet + xMinYMid = สเกลให้พอดีกล่องโดยไม่บิดสัดส่วน ไม่ว่าโลโก้จะอัตราส่วนไหน
    return base.replace(
      /^<svg\b([^>]*)>/i,
      (_m, attrs: string) =>
        `<svg${attrs.replace(/\s(width|height|style|preserveAspectRatio)\s*=\s*("[^"]*"|'[^']*')/gi, '')}` +
        ` width="100%" height="100%" preserveAspectRatio="xMinYMid meet" style="display:block">`,
    )
  }, [brand.logoSvg, white])

  const logo = (
    <div className={`flex items-center ${className}`}>
      <span
        aria-label={brand.appName}
        role="img"
        className={white ? 'text-white' : 'text-gray-900'}
        style={{ width, height, display: 'block' }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  )

  if (href) {
    return <Link href={href}>{logo}</Link>
  }
  return logo
}
