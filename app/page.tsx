import type { Metadata } from 'next'
import HomeEntry from '@/components/landing/HomeEntry'

export const metadata: Metadata = {
  title: 'LiveTubeX',
  description: 'ระบบจัดการงานถ่ายทอดสดและการเบิกจ่าย Freelancer ของ LiveTubeX Co., Ltd.',
}

export default function HomePage() {
  return <HomeEntry />
}
