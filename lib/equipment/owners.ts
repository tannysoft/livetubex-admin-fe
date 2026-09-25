import type { Equipment, PlanItem } from '../types'
import type { SharedPlanItem } from './plan-share'
import { itemOrigin } from './rental-cost'

/**
 * "เจ้าของ" ของอุปกรณ์ — ใช้กรองดูของทีละบริษัท (หน้าของเหลือในสต็อก + ตารางรายการในแผน)
 * ของบริษัทเอง = OWN_OWNER · พาร์ทเนอร์ = partnerName · ของเช่า = ผู้ให้เช่า · ไม่ได้กรอกชื่อ = '' (ยังไม่ระบุ)
 */
export const OWN_OWNER = '__own'
export const OWN_OWNER_LABEL = 'ของบริษัทเรา'

export function equipmentOwner(eq: Equipment): string {
  const own = eq.ownership ?? 'owned'
  if (own === 'owned') return OWN_OWNER
  return ((own === 'partner' ? eq.partnerName : eq.rentalVendor) ?? '').trim()
}

/** แถวในแผน: เช่า/พาร์ทเนอร์เก็บชื่อเจ้าไว้ที่ rentalVendor (snapshot ตอนเลือกจากสต็อก / กรอกเองในแถวต้นทุน) */
export function itemOwner(it: PlanItem): string {
  if (itemOrigin(it) === 'owned') return OWN_OWNER
  return (it.rentalVendor ?? '').trim()
}

/**
 * หน้าแชร์ทีมงาน: ข้อมูลตัด rentalVendor ออก (allowlist) → ใช้ fromLocation ซึ่งตอนเลือกจากสต็อกตั้งเป็นชื่อเจ้าให้อยู่แล้ว
 * ไม่มี origin = ข้อมูลเก่า นับเป็นของบริษัท
 */
export function sharedItemOwner(it: SharedPlanItem): string {
  if (it.origin !== 'rental' && it.origin !== 'partner') return OWN_OWNER
  return (it.fromLocation ?? '').trim()
}

export function ownerLabel(key: string): string {
  return key === OWN_OWNER ? OWN_OWNER_LABEL : key || 'ยังไม่ระบุเจ้า'
}

/** รายการเจ้าของพร้อมจำนวน — บริษัทเราก่อน แล้วเรียงตามชื่อ · ยังไม่ระบุไว้ท้าย */
export function ownerCounts(keys: string[]): { key: string; label: string; count: number }[] {
  const m = new Map<string, number>()
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1)
  const rank = (k: string) => (k === OWN_OWNER ? 0 : k ? 1 : 2)
  return [...m.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, 'th'))
    .map(([key, count]) => ({ key, label: ownerLabel(key), count }))
}
