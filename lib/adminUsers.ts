'use client'

import { httpsCallable } from 'firebase/functions'
import { doc, getDoc } from 'firebase/firestore'
import { db, functions } from './firebase'
import { BOOTSTRAP_OWNER_EMAIL } from './roles'
import type { AdminUser, AdminRole } from './types'

export async function listAdminUsers(): Promise<AdminUser[]> {
  const res = await httpsCallable<unknown, { users: AdminUser[] }>(functions, 'adminListUsers')()
  return res.data.users
}

export async function createAdminUser(input: {
  email: string
  password: string
  name?: string
  role: AdminRole
}): Promise<string> {
  const res = await httpsCallable<typeof input, { uid: string }>(functions, 'adminCreateUser')(input)
  return res.data.uid
}

export async function updateAdminUserRole(uid: string, role: AdminRole): Promise<void> {
  await httpsCallable(functions, 'adminUpdateUserRole')({ uid, role })
}

export async function setAdminUserDisabled(uid: string, disabled: boolean): Promise<void> {
  await httpsCallable(functions, 'adminSetUserDisabled')({ uid, disabled })
}

export async function deleteAdminUser(uid: string): Promise<void> {
  await httpsCallable(functions, 'adminDeleteUser')({ uid })
}

export async function resetAdminUserPassword(uid: string, password: string): Promise<void> {
  await httpsCallable(functions, 'adminResetUserPassword')({ uid, password })
}

/**
 * หา role ของผู้ใช้ปัจจุบันจาก Firestore doc (adminUsers/{uid})
 * fallback: bootstrap owner email → 'owner', อื่นๆ → 'admin'
 * (อ่าน Firestore ตรงๆ ไม่ต้องพึ่ง Cloud Function — role ใช้ได้ทันทีแม้ functions ยังไม่ deploy)
 */
export async function resolveMyRole(uid: string, email: string | null): Promise<AdminRole> {
  try {
    const snap = await getDoc(doc(db, 'adminUsers', uid))
    if (snap.exists()) {
      const role = snap.data().role as AdminRole | undefined
      if (role) return role
    }
  } catch {
    /* ignore — ใช้ fallback */
  }
  if (email && email.toLowerCase() === BOOTSTRAP_OWNER_EMAIL) return 'owner'
  return 'admin'
}
