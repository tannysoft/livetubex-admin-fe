import type { Metadata } from 'next'
import { Noto_Sans_Thai } from 'next/font/google'
import './globals.css'

const notoSansThai = Noto_Sans_Thai({
  variable: '--font-noto-sans-thai',
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'LiveTubeX - ระบบจัดการงานถ่ายทอดสด',
  description: 'ระบบจัดการงานถ่ายทอดสดและการเบิกจ่าย Freelancer ของ LiveTubeX Co., Ltd.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${notoSansThai.variable} h-full`}>
      <body className="min-h-full font-[family-name:var(--font-noto-sans-thai)] antialiased">
        {children}
      </body>
    </html>
  )
}
