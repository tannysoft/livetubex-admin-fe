'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      // ล้าง cookie แล้ว redirect ไป login
      document.cookie = 'admin_session=; path=/; max-age=0'
      router.replace('/login')
    }
    if (!loading && user) {
      // ต่ออายุ cookie เมื่อยังมี session อยู่
      document.cookie = 'admin_session=1; path=/; SameSite=Strict'
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-[#f73727] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return null

  return <>{children}</>
}
