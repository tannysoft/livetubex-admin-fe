import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'LiveTubeX Freelancer Portal',
  description: 'ระบบจัดการงานและการเบิกจ่าย Freelancer LiveTubeX',
}

// ป้องกัน iOS zoom เมื่อแตะ input — เฉพาะหน้า freelancer เท่านั้น
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function FreelancerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  )
}
