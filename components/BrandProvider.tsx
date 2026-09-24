'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  BRAND_CACHE_KEY,
  DEFAULT_BRAND,
  applyBrandColor,
  documentTitleFor,
  faviconDataUri,
  getBrand,
  normalizeBrand,
  type BrandSettings,
} from '@/lib/brand'

const BrandContext = createContext<BrandSettings>(DEFAULT_BRAND)

/** อ่านแบรนด์ปัจจุบัน (ชื่อระบบ, โลโก้, สี) — ใช้ได้ทุก client component */
export function useBrand(): BrandSettings {
  return useContext(BrandContext)
}

function readCache(): BrandSettings | null {
  try {
    const raw = localStorage.getItem(BRAND_CACHE_KEY)
    return raw ? normalizeBrand(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function writeCache(b: BrandSettings): void {
  try {
    localStorage.setItem(BRAND_CACHE_KEY, JSON.stringify(b))
  } catch {
    // localStorage เต็ม/ถูกปิด — ไม่เป็นไร แค่จะมี flash ตอนโหลดครั้งถัดไป
  }
}

function applyFavicon(svg: string): void {
  if (!svg) return
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.type = 'image/svg+xml'
  link.href = faviconDataUri(svg)
}

/**
 * โหลดแบรนด์จาก Firestore (publicSettings/brand) แล้วทาลง DOM
 *
 * ลำดับกัน flash:
 *   1. inline script ใน <head> ทาสีจาก localStorage ก่อน paint แรก
 *   2. provider นี้ทาซ้ำจาก cache ตอน mount (เผื่อ script ไม่ทำงาน)
 *   3. fetch ของจริง → ทา + อัพเดต cache
 * อ่านไม่ได้ (offline / ยังไม่ได้สร้าง doc) → ใช้ DEFAULT_BRAND ต่อไปเงียบๆ
 */
export default function BrandProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [brand, setBrand] = useState<BrandSettings>(DEFAULT_BRAND)

  useEffect(() => {
    let alive = true
    const apply = (b: BrandSettings) => {
      if (alive) setBrand(b)
    }

    // cache กับ Firestore เป็นแหล่งข้อมูลเหมือนกัน ต่างกันแค่เร็ว/ช้า —
    // ใส่ cache ผ่าน promise เดียวกันเพื่อให้ลำดับการทับค่าชัดเจน (cache ก่อน ของจริงทีหลัง)
    Promise.resolve(readCache()).then((c) => {
      if (c) apply(c)
    })

    getBrand()
      .then((b) => {
        apply(b)
        writeCache(b)
      })
      .catch(() => {
        // ไม่มีสิทธิ์อ่าน / ยังไม่ได้ deploy rules — ใช้ค่า default ต่อ
      })

    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    applyBrandColor(brand.primaryColor)
    applyFavicon(brand.logoSvg)
  }, [brand.primaryColor, brand.logoSvg])

  useEffect(() => {
    document.title = documentTitleFor(pathname ?? '/', brand)
  }, [pathname, brand])

  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>
}
