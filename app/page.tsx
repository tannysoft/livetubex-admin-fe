import type { Metadata } from 'next'
import HomeEntry from '@/components/landing/HomeEntry'

export const metadata: Metadata = {
  title: 'ระบบจัดการงานถ่ายทอดสด',
  description: 'ระบบจัดการงานถ่ายทอดสดและการเบิกจ่าย Freelancer',
}

export default function HomePage() {
  return <HomeEntry />
}
