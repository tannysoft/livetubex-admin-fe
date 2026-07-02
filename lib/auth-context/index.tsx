'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { onAdminAuthChange, isFirebaseEmailPasswordAdmin } from '@/lib/auth'
import { resolveMyRole } from '@/lib/adminUsers'
import type { AdminRole } from '@/lib/types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  role: AdminRole | null   // null = ยังไม่รู้ (กำลังโหลด หรือไม่ใช่ admin)
  roleLoading: boolean
}

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true, role: null, roleLoading: true })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<AdminRole | null>(null)
  const [roleLoading, setRoleLoading] = useState(true)

  useEffect(() => {
    const unsub = onAdminAuthChange((u) => {
      setUser(u)
      setLoading(false)
    })
    return unsub
  }, [])

  // resolve role เมื่อ user เปลี่ยน (เฉพาะ admin email/password)
  useEffect(() => {
    if (!user || !isFirebaseEmailPasswordAdmin(user)) {
      setRole(null)
      setRoleLoading(false)
      return
    }
    let alive = true
    setRoleLoading(true)
    resolveMyRole(user.uid, user.email)
      .then((r) => { if (alive) { setRole(r); setRoleLoading(false) } })
      .catch(() => { if (alive) { setRole('admin'); setRoleLoading(false) } })
    return () => { alive = false }
  }, [user])

  return (
    <AuthContext.Provider value={{ user, loading, role, roleLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
