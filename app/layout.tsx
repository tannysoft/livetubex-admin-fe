import type { Metadata } from 'next'
import { Noto_Sans_Thai } from 'next/font/google'
import BrandProvider from '@/components/BrandProvider'
import { BRAND_PREPAINT_SCRIPT } from '@/lib/brand'
import './globals.css'

const notoSansThai = Noto_Sans_Thai({
  variable: '--font-noto-sans-thai',
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
})

// metadata ถูกฝังตอน build (static export) จึงเป็นค่ากลางๆ ไม่ผูกกับบริษัทไหน
// ชื่อจริงตามแบรนด์ถูกเขียนทับ runtime โดย BrandProvider
export const metadata: Metadata = {
  title: 'ระบบจัดการงานถ่ายทอดสด',
  description: 'ระบบจัดการงานถ่ายทอดสดและการเบิกจ่าย Freelancer',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: สคริปต์ด้านล่างเซ็ต --brand ลง <html> ก่อน React hydrate
    // ทำให้ attribute style ไม่ตรงกับที่ prerender ไว้ — ตั้งใจให้ต่าง ไม่ใช่บั๊ก
    // ครอบเฉพาะ attribute ของ <html> เอง ลูกหลานยังเตือน mismatch ตามปกติ
    <html lang="th" className={`${notoSansThai.variable} h-full`} suppressHydrationWarning>
      <head>
        {/* ทาสีแบรนด์จาก cache ก่อน paint แรก — กันจอกระพริบสี default */}
        <script dangerouslySetInnerHTML={{ __html: BRAND_PREPAINT_SCRIPT }} />
      </head>
      <body className="min-h-full font-[family-name:var(--font-noto-sans-thai)] antialiased">
        <BrandProvider>{children}</BrandProvider>
      </body>
    </html>
  )
}
