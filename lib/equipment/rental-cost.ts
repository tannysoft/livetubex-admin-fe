import type { EquipmentPlan, Expense, PlanCost, PlanItem } from '../types'
import { createExpense } from '../accounting/expenses'
import {
  DEFAULT_CATEGORIES, getExpenseCategories, createExpenseCategory,
} from '../accounting/expense-categories'
import { round2 } from '../accounting/calc'

// ต้นทุนของแผน → ต้นทุนจริงของงาน มี 2 แหล่ง:
//   1. ค่าเช่าอุปกรณ์  — PlanItem ที่เป็นของนอกสต็อก (หมวดบัญชี "ค่าเช่า")
//   2. ค่าใช้จ่ายอื่น  — plan.extraCosts เช่น รถตู้ ที่พัก อาหาร (เลือกหมวดบัญชีเอง)
//
// ยอดเดียวกันมีได้ 2 สถานะ และต้องถูกนับ "ที่เดียว" เสมอ ไม่งั้นต้นทุนงานเบิ้ล:
//   ยังไม่ลงบัญชี (ไม่มี expenseId)  → หน้าต้นทุนต่อโปรเจกต์นับจากแผนตรงๆ (ประมาณการ)
//   ลงบัญชีแล้ว (มี expenseId)       → นับผ่าน Expense ตามปกติ แผนไม่ถูกนับซ้ำ

export const RENTAL_CATEGORY = 'ค่าเช่า'
export const DEFAULT_EXTRA_CATEGORY = 'ค่าเดินทาง'

export type ItemOrigin = 'owned' | 'rental' | 'partner'

/** ที่มาของของในแผน — รองรับข้อมูลเก่าที่มีแค่ isRental / equipmentId */
export function itemOrigin(it: PlanItem): ItemOrigin {
  if (it.origin) return it.origin
  if (it.isRental != null) return it.isRental ? 'rental' : 'owned'
  return it.equipmentId ? 'owned' : 'rental'
}

/** ของนอกบริษัท (เช่า/พาร์ทเนอร์) = มีแถวต้นทุนให้กรอก (พาร์ทเนอร์ปกติ 0) */
export function isRentalItem(it: PlanItem): boolean {
  return itemOrigin(it) !== 'owned'
}

export const ORIGIN_LABEL: Record<ItemOrigin, string> = { owned: 'ของบริษัท', rental: 'เช่า', partner: 'พาร์ทเนอร์' }

export function itemCost(it: PlanItem): number {
  if (!isRentalItem(it)) return 0
  return round2((it.unitCost ?? 0) * (it.quantity || 0) * (it.rentalDays ?? 1))
}

export function extraCostAmount(c: PlanCost): number {
  return round2((c.unitCost || 0) * (c.quantity || 0))
}

/** บรรทัดต้นทุนแบบกลาง — รวมสองแหล่งให้โค้ดสรุปยอด/ลงบัญชีใช้ทางเดียวกัน */
export interface CostLine {
  source: 'item' | 'extra'
  id: string
  label: string
  vendor: string
  categoryName: string
  amount: number
  expenseId?: string
}

export function planCostLines(plan: Pick<EquipmentPlan, 'items' | 'extraCosts'>): CostLine[] {
  // พาร์ทเนอร์ที่มีข้อตกลงค่าใช้จ่ายก็ลงหมวด "ค่าเช่า" เหมือนกัน (ถ้า 0 จะถูกกรองออกท้ายฟังก์ชัน)
  const rentals: CostLine[] = plan.items.filter(isRentalItem).map((it) => ({
    source: 'item', id: it.id, vendor: it.rentalVendor?.trim() ?? '', categoryName: RENTAL_CATEGORY,
    label: `${it.name || 'อุปกรณ์'} ×${it.quantity}${(it.rentalDays ?? 1) > 1 ? ` ${it.rentalDays} วัน` : ''}`,
    amount: itemCost(it), expenseId: it.expenseId,
  }))
  const extras: CostLine[] = (plan.extraCosts ?? []).map((c) => ({
    source: 'extra', id: c.id, vendor: c.vendor?.trim() ?? '', categoryName: c.categoryName || DEFAULT_EXTRA_CATEGORY,
    label: `${c.description || 'ค่าใช้จ่าย'}${c.quantity > 1 ? ` ×${c.quantity}` : ''}`,
    amount: extraCostAmount(c), expenseId: c.expenseId,
  }))
  return [...rentals, ...extras].filter((l) => l.amount > 0)
}

export function planCostTotals(plan: Pick<EquipmentPlan, 'items' | 'extraCosts'>) {
  let recorded = 0
  let pending = 0
  let rental = 0
  let extra = 0
  for (const l of planCostLines(plan)) {
    if (l.expenseId) recorded += l.amount
    else pending += l.amount
    if (l.source === 'item') rental += l.amount
    else extra += l.amount
  }
  return {
    recorded: round2(recorded), pending: round2(pending),
    rental: round2(rental), extra: round2(extra), total: round2(recorded + pending),
  }
}

/**
 * ยอดของแผนที่ยัง "ไม่ถูกนับผ่าน Expense" — ใช้ในหน้าต้นทุนต่อโปรเจกต์
 * liveExpenseIds = expense ที่ยังมีผล (ไม่ถูกยกเลิก/ลบ) — ถ้า expense ที่เคยลงไว้ถูกยกเลิก
 * ยอดจะกลับมานับจากแผน ต้นทุนงานจึงไม่หายเงียบๆ
 */
export function uncountedPlanCost(plan: EquipmentPlan, liveExpenseIds: Set<string>): { sum: number; count: number } {
  let sum = 0
  let count = 0
  for (const l of planCostLines(plan)) {
    if (l.expenseId && liveExpenseIds.has(l.expenseId)) continue
    sum += l.amount
    count += 1
  }
  return { sum: round2(sum), count }
}

function todayLocal(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * ลงบัญชีต้นทุนที่ยังค้าง → Expense 1 ใบต่อ (หมวด + ผู้รับเงิน) — ใบแจ้งหนี้จริงมาเป็นรายเจ้า
 * คืน items/extraCosts ที่ติด expenseId แล้ว — ผู้เรียกต้องบันทึกแผนต่อทันที
 *
 * ตั้งใจไม่ใส่ VAT / หัก ณ ที่จ่าย: คนจัดงานไม่รู้เงื่อนไขภาษีของคู่ค้าแต่ละราย
 * → ให้ฝ่ายบัญชีเปิด Expense มาเติมเองตอนได้ใบกำกับ (amount ก่อน VAT ไม่เปลี่ยน ต้นทุนงานจึงไม่เพี้ยน)
 */
export async function recordPlanExpenses(
  plan: EquipmentPlan, createdBy: string,
): Promise<{ items: PlanItem[]; extraCosts: PlanCost[]; failed: boolean }> {
  const extraCosts = plan.extraCosts ?? []
  const pending = planCostLines(plan).filter((l) => !l.expenseId)
  if (pending.length === 0) return { items: plan.items, extraCosts, failed: false }

  const categories = (await getExpenseCategories()).map((c) => ({ id: c.id, name: c.name }))
  const categoryFor = async (name: string) => {
    const found = categories.find((c) => c.name.trim() === name.trim())
    if (found) return found
    const preset = DEFAULT_CATEGORIES.find((c) => c.name === name)
    const id = await createExpenseCategory({ name, defaultWhtRate: preset?.defaultWhtRate, order: preset?.order ?? 900 })
    const created = { id, name }
    categories.push(created)
    return created
  }

  const groups = new Map<string, CostLine[]>()
  for (const l of pending) {
    const key = JSON.stringify([l.categoryName, l.vendor])
    groups.set(key, [...(groups.get(key) ?? []), l])
  }

  // ล้มกลางทาง → ยังต้องคืนรายการที่ลงสำเร็จไปแล้ว ไม่งั้นกดซ้ำจะได้ Expense เบิ้ล
  const linked = new Map<string, { id: string; code: string }>()
  let failed = false
  for (const lines of groups.values()) {
    const { categoryName, vendor } = lines[0]
    const amount = round2(lines.reduce((s, l) => s + l.amount, 0))
    try {
      const category = await categoryFor(categoryName)
      const expense: Omit<Expense, 'id' | 'code' | 'createdAt' | 'updatedAt'> = {
        sourceType: 'manual',
        jobId: plan.jobId || undefined,
        jobTitle: plan.jobTitle || undefined,
        categoryId: category.id,
        categoryName: category.name,
        date: plan.date || todayLocal(),
        description: `${categoryName}${vendor ? ` — ${vendor}` : ''}: ${lines.map((l) => l.label).join(', ')}`.slice(0, 500),
        amount,
        hasVat: false,
        vatRate: 0,
        vatAmount: 0,
        totalAmount: amount,
        paidAmount: amount,
        status: 'recorded',
        notes: `สร้างจากแผนจัดอุปกรณ์ "${plan.title}" — ตรวจ VAT / หัก ณ ที่จ่าย และผูกผู้ขายก่อนจ่ายจริง`,
        createdBy,
      }
      const created = await createExpense(expense)
      lines.forEach((l) => linked.set(`${l.source}:${l.id}`, created))
    } catch (e) {
      console.error(e)
      failed = true
      break
    }
  }

  const tag = <T extends { id: string }>(source: CostLine['source'], row: T): T => {
    const e = linked.get(`${source}:${row.id}`)
    return e ? { ...row, expenseId: e.id, expenseCode: e.code } : row
  }
  return {
    items: plan.items.map((it) => tag('item', it)),
    extraCosts: extraCosts.map((c) => tag('extra', c)),
    failed,
  }
}
