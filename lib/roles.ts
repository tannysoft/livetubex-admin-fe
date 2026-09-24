import type { AdminRole } from './types'

/**
 * อีเมล owner ตั้งต้น (bootstrap) — ถือเป็น owner เสมอ แม้ยังไม่มี doc ใน adminUsers
 * ใช้แก้ปัญหา "ไก่กับไข่" ตอนยังไม่มีใครเป็น owner
 *
 * ตั้งต่อ tenant ผ่าน NEXT_PUBLIC_BOOTSTRAP_OWNER_EMAIL (build-time)
 * และ BOOTSTRAP_OWNER_EMAIL ใน functions/.env ให้ตรงกัน
 * ว่าง = ไม่มี bootstrap owner (ต้องมี doc ใน adminUsers เท่านั้น)
 */
export const BOOTSTRAP_OWNER_EMAIL = (process.env.NEXT_PUBLIC_BOOTSTRAP_OWNER_EMAIL ?? '').toLowerCase()

/** เทียบอีเมลกับ bootstrap owner — ว่างแปลว่า "ไม่มีใครใช่" ไม่ใช่ "ทุกคนใช่" */
export function isBootstrapOwnerEmail(email: string | null | undefined): boolean {
  return !!BOOTSTRAP_OWNER_EMAIL && (email ?? '').toLowerCase() === BOOTSTRAP_OWNER_EMAIL
}

export const ADMIN_ROLES: AdminRole[] = ['owner', 'admin', 'accountant']

export const ROLE_LABELS: Record<AdminRole, string> = {
  owner: 'เจ้าของระบบ',
  admin: 'ผู้ดูแล',
  accountant: 'บัญชี',
}

export const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  owner: 'เข้าถึงทุกส่วน + จัดการผู้ใช้',
  admin: 'จัดการงาน, freelancer, การเบิกจ่าย',
  accountant: 'เข้าถึงเฉพาะโมดูลบัญชี',
}

export const ROLE_BADGE_COLOR: Record<AdminRole, string> = {
  owner: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
  accountant: 'bg-emerald-100 text-emerald-700',
}

// ── Sections & access ─────────────────────────────────────────────────────────
export type AdminSection = 'dashboard' | 'operations' | 'accounting' | 'users'

const ROLE_SECTIONS: Record<AdminRole, AdminSection[]> = {
  owner: ['dashboard', 'operations', 'accounting', 'users'],
  admin: ['dashboard', 'operations'],
  accountant: ['dashboard', 'accounting'],
}

/** map path → section (ใช้ทั้ง sidebar filter และ route guard เพื่อให้เป็นแหล่งเดียว) */
export function sectionForPath(pathname: string): AdminSection {
  if (pathname === '/admin' || pathname === '/admin/') return 'dashboard'
  if (pathname.startsWith('/admin/users')) return 'users'
  if (pathname.startsWith('/admin/accounting')) return 'accounting'
  return 'operations'
}

export function canAccessSection(role: AdminRole, section: AdminSection): boolean {
  return ROLE_SECTIONS[role].includes(section)
}

export function canAccessPath(role: AdminRole, pathname: string): boolean {
  return canAccessSection(role, sectionForPath(pathname))
}

/** หน้าแรกที่ role นี้เข้าได้ (ใช้ตอน redirect เมื่อเข้าหน้าที่ไม่มีสิทธิ์) */
export function defaultLandingForRole(role: AdminRole): string {
  if (canAccessSection(role, 'dashboard')) return '/admin'
  if (canAccessSection(role, 'accounting')) return '/admin/accounting/customers'
  return '/admin'
}
