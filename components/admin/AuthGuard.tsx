'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { isFirebaseEmailPasswordAdmin } from '@/lib/auth'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  const allowed = Boolean(user && isFirebaseEmailPasswordAdmin(user))

  useEffect(() => {
    if (loading) return
    if (!user) {
      document.cookie = 'admin_session=; path=/; max-age=0'
      router.replace('/login')
      return
    }
    if (!isFirebaseEmailPasswordAdmin(user)) {
      // ล็อกอินแบบอื่น (เช่น LINE custom token) — ห้ามเข้าแอดมิน
      document.cookie = 'admin_session=; path=/; max-age=0'
      router.replace('/login')
      return
    }
    document.cookie = 'admin_session=1; path=/; SameSite=Strict'
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-[#f73727] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-[#f73727] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return <>{children}</>
}
