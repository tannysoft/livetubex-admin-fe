import type { PlanItem } from '../types'
import { itemOrigin } from './rental-cost'
import { newId } from './plans'

/**
 * เลนส์ tele ที่เช่ามา (box lens / ซูมยาว ≥ 40x) ร้านเช่าส่งขาตั้งมาด้วยเสมอ
 * → ตอนจับคู่เลนส์กับกล้อง เพิ่มแถวขาตั้งของร้านเดียวกัน (ราคา 0 — รวมในค่าเช่าเลนส์) ติดกล้องตัวนั้นให้เอง
 * ⚠️ กฎเดียวกันอยู่ใน DEFAULT_AGENT_RULES (ผู้ช่วย AI) — แก้เงื่อนไขต้องแก้ทั้งสองที่
 */
const TRIPOD_MARK = 'มากับเลนส์'

export function teleZoom(name: string): number {
  const m = name.match(/(\d{2,3})\s*x/i)
  return m ? Number(m[1]) : 0
}

export function isTeleLens(it: Pick<PlanItem, 'category' | 'name'>): boolean {
  if (it.category !== 'lens') return false
  return /tele|box\s*lens/i.test(it.name) || teleZoom(it.name) >= 40
}

/** แถวขาตั้งที่มากับเลนส์ tele เช่า — null = ไม่ต้องเพิ่ม (ไม่ใช่ tele เช่า / กล้องมีขาตั้งของร้านอยู่แล้ว) */
export function teleTripodFor(lens: PlanItem, camera: PlanItem | undefined, items: PlanItem[]): PlanItem | null {
  if (!camera || !isTeleLens(lens) || itemOrigin(lens) !== 'rental') return null
  if (items.some((i) => i.attachedTo === camera.id && i.category === 'support' && i.name.includes(TRIPOD_MARK))) return null
  const zoom = teleZoom(lens.name)
  const vendor = lens.rentalVendor || lens.fromLocation
  return {
    id: newId(),
    name: `ขาตั้ง (${TRIPOD_MARK} ${zoom ? `Tele ${zoom}x` : lens.name})`,
    category: 'support',
    quantity: 1,
    packed: false,
    returned: false,
    origin: 'rental',
    ...(vendor ? { rentalVendor: vendor, fromLocation: vendor } : {}),
    unitCost: 0,
    rentalDays: lens.rentalDays ?? 1,
    attachedTo: camera.id,
    ...(camera.toLocation ? { toLocation: camera.toLocation } : {}),
    ...(lens.useFrom ? { useFrom: lens.useFrom } : {}),
    ...(lens.useTo ? { useTo: lens.useTo } : {}),
  }
}
