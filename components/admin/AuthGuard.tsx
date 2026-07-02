'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { isFirebaseEmailPasswordAdmin } from '@/lib/auth'
import { canAccessPath, defaultLandingForRole } from '@/lib/roles'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, role, roleLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const isAdmin = Boolean(user && isFirebaseEmailPasswordAdmin(user))
  const roleAllowed = Boolean(role && canAccessPath(role, pathname))
  const allowed = isAdmin && roleAllowed

  useEffect(() => {
    if (loading) return
    if (!user || !isFirebaseEmailPasswordAdmin(user)) {
      // ไม่ล็อกอิน หรือล็อกอินแบบอื่น (LINE custom token) — ห้ามเข้าแอดมิน
      document.cookie = 'admin_session=; path=/; max-age=0'
      router.replace('/login')
      return
    }
    document.cookie = 'admin_session=1; path=/; SameSite=Strict'
    // ตรวจสิทธิ์ตาม role — ไม่มีสิทธิ์หน้านี้ → เด้งไปหน้าแรกที่เข้าได้
    if (!roleLoading && role && !canAccessPath(role, pathname)) {
      router.replace(defaultLandingForRole(role))
    }
  }, [user, loading, role, roleLoading, pathname, router])

  const spinner = (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-4 border-[#f73727] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (loading || (isAdmin && roleLoading)) return spinner
  if (!allowed) return spinner

  return <>{children}</>
}
