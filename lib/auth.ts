'use client'

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth'
import { auth } from './firebase'

/** /admin รับเฉพาะ Firebase Email/Password — ไม่รับ LINE (custom token) หรือ provider อื่น */
export function isFirebaseEmailPasswordAdmin(user: User | null): boolean {
  if (!user) return false
  return user.providerData.some((p) => p.providerId === 'password')
}

export async function adminLogin(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email, password)
  // Set session cookie so middleware can guard /admin routes
  document.cookie = 'admin_session=1; path=/; SameSite=Strict'
  return result.user
}

export async function adminLogout(): Promise<void> {
  await signOut(auth)
  document.cookie = 'admin_session=; path=/; max-age=0'
}

export function onAdminAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback)
}
