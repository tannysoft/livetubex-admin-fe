import { calcExpenseTotals, createExpense, getExpenseByPaymentId, updateExpense } from './expenses'
import { getOrCreateFreelancerPaymentCategory } from './expense-categories'
import { getFreelancer, getJob } from '../firebase-utils'
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
