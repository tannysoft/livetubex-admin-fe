import { calcExpenseTotals, createExpense, deleteExpense, getExpenseByPaymentId, updateExpense } from './expenses'
import { getOrCreateFreelancerPaymentCategory } from './expense-categories'
import { getFreelancer, getJob, getPayments } from '../firebase-utils'
import { formatDate } from '../utils'
import { round2 } from './calc'
import type { Payment } from '../types'

/**
 * สร้างหรืออัพเดท Expense จากการจ่ายเงิน Freelancer
 *
 * เรียกหลังจาก markPaymentPaid() สำเร็จ:
 *   - ถ้ายังไม่มี expense ที่ผูกกับ paymentId นี้ → สร้างใหม่
 *   - ถ้ามีอยู่แล้ว → update (เผื่อ admin แก้ amount หรือ adminNotes)
 *
 * คำนวณ:
 *   - amount        = payment.amount (gross fee — ฐาน WHT 3%)
 *   - whtAmount     = round(amount * 3%)
 *   - paidAmount    = (amount - whtAmount) + expenseAmount (ค่าใช้จ่ายเบิกคืน เพิ่มเต็ม ไม่หัก)
 *   - status        = 'paid'
 *
 * ⚠️ Failure ของ expense creation ไม่ block การจ่ายเงิน — caller ควร handle ด้วย .catch()
 */
export async function syncExpenseFromPayment(payment: Payment): Promise<void> {
  if (!payment.id) return

  const [freelancer, job, category, existing] = await Promise.all([
    getFreelancer(payment.freelancerId),
    payment.jobId ? getJob(payment.jobId) : Promise.resolve(null),
    getOrCreateFreelancerPaymentCategory(),
    getExpenseByPaymentId(payment.id),
  ])

  if (!freelancer) return

  const gross = payment.amount
  const expenseReimburse = payment.expenseAmount ?? 0
  const totals = calcExpenseTotals({
    amount: gross,
    hasVat: false,
    whtRate: 3,
  })

  const paidAmount = round2(totals.paidAmount + expenseReimburse)

  const descriptionParts = [
    `ค่าจ้างทีมงาน: ${freelancer.name}`,
    job?.title ? `งาน: ${job.title}` : null,
    payment.position ? `ตำแหน่ง: ${payment.position}` : null,
    payment.workDates?.length ? `วันที่ทำงาน: ${payment.workDates.map(formatDate).join(', ')}` : null,
    expenseReimburse > 0 ? `+ ค่าใช้จ่ายเพิ่มเติม (เบิกคืน): ${expenseReimburse.toLocaleString('th-TH')} บาท` : null,
  ].filter(Boolean) as string[]

  const payload = {
    sourceType: 'freelancer_payment' as const,
    paymentId: payment.id,
    jobId: payment.jobId || undefined,
    jobTitle: job?.title || undefined,
    categoryId: category.id,
    categoryName: category.name,
    date: payment.paidAt ? payment.paidAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
    description: descriptionParts.join('\n'),
    amount: totals.amount,
    hasVat: false,
    vatRate: 0,
    vatAmount: 0,
    whtRate: 3,
    whtAmount: totals.whtAmount,
    totalAmount: totals.totalAmount,
    paidAmount,
    paymentMethod: 'transfer' as const,
    notes: payment.adminNotes || undefined,
    status: 'paid' as const,
  }

  if (existing) {
    await updateExpense(existing.id, payload)
  } else {
    await createExpense({ ...payload, createdBy: 'system' })
  }
}

/**
 * ลบ Expense ที่ bridge สร้างจาก payment นี้ — ใช้ตอนย้อนการยืนยันโอน (revertPaymentPaid)
 * ถ้าไม่พบ expense (ยังไม่เคย sync / ถูกลบไปแล้ว) → no-op
 */
export async function removeExpenseForPayment(paymentId: string): Promise<void> {
  const existing = await getExpenseByPaymentId(paymentId)
  if (existing) await deleteExpense(existing.id)
}

/**
 * Migration / backfill: sync ทุก payment ที่ status='paid' เข้า expenses
 *   - สร้าง expense ที่ยังไม่มี + อัปเดตของเดิม (เติม jobId/jobTitle ให้รายการเก่า)
 *   - idempotent: รันซ้ำได้ ปลอดภัย (เช็ค paymentId ก่อนเสมอ)
 *   - sequential เพื่อกัน doc-numbering transaction ชน (เลขรัน expense เดือนเดียวกัน)
 *
 * คืนค่าสรุปผล — caller เอาไปแสดงได้
 */
export async function syncAllPaidPaymentsToExpenses(
  onProgress?: (done: number, total: number) => void,
): Promise<{ total: number; ok: number; failed: number; failedIds: string[] }> {
  const payments = await getPayments()
  const paid = payments.filter((p) => p.status === 'paid')
  let ok = 0
  const failedIds: string[] = []

  for (let i = 0; i < paid.length; i++) {
    try {
      await syncExpenseFromPayment(paid[i])
      ok += 1
    } catch (err) {
      console.error('sync failed for payment', paid[i].id, err)
      if (paid[i].id) failedIds.push(paid[i].id)
    }
    onProgress?.(i + 1, paid.length)
  }

  return { total: paid.length, ok, failed: failedIds.length, failedIds }
}
