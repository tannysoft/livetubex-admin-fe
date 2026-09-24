import type { Metadata } from 'next'

// ลิงก์แชร์ให้ทีมงาน — ไม่ให้ search engine เก็บ (มีรหัสผ่านอยู่แล้ว แต่ชื่องาน/หน้าล็อกไม่ควรโผล่ในผลค้นหา)
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-gray-50 text-gray-900">{children}</div>
}
