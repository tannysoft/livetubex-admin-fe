'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { initLiffAndIsInClient } from '@/lib/line-liff'

/**
 * หน้าแรก `/`
 * - เบราว์เซอร์ทั่วไป → redirect `/admin` (เหมือนเดิม)
 * - เปิดใน LINE in-app (LIFF) → `/freelancer` + query/hash
 *   จากนั้น `app/freelancer/page.tsx` จะส่งไป `/freelancer/register` ถ้ายังไม่ลงทะเบียน
 *   หลังลงทะเบียน/มีโปรไฟล์แล้วจึงแสดงหน้าหลัก freelancer
 */
export default function HomeEntry() {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const inLine = await initLiffAndIsInClient()
      if (cancelled) return
      if (inLine && typeof window !== 'undefined') {
        const suffix = `${window.location.search}${window.location.hash}`
        router.replace(`/freelancer${suffix}`)
        return
      }
      router.replace('/admin')
    })()
    return () => {
      cancelled = true
    }
  }, [router])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <div className="w-10 h-10 border-4 border-[#f73727] border-t-transparent rounded-full animate-spin" />
      <p className="mt-4 text-gray-400 text-sm">กำลังโหลด...</p>
    </div>
  )
}
