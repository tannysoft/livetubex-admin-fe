import { doc, runTransaction } from 'firebase/firestore'
import { db } from '../firebase'

/**
 * รูปแบบเลขรันเอกสารแบบ PEAK:
 *   {PREFIX}{YY-พ.ศ.}{MM}-{NNNN}
 *   เช่น QO6805-0001, IV6805-0001, TX6805-0001, RC6805-0001
 *
 * - YY = ปี พ.ศ. 2 หลักท้าย (ค.ศ. + 543 → mod 100)
 * - MM = เดือน 2 หลัก
 * - NNNN = running 4 หลัก, reset ทุกต้นเดือน
 *
 * ใช้ Firestore transaction กัน race condition (ไม่ซ้ำเลย แม้คน 2 คนกดพร้อมกัน)
 */

export type DocCounterField = 'quotation' | 'invoice' | 'taxInvoice' | 'receipt' | 'customer'

const PREFIX_MAP: Record<DocCounterField, string> = {
  quotation: 'QO',
  invoice: 'IV',
  taxInvoice: 'TX',
  receipt: 'RC',
  customer: 'CUS',
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0')
}

function toBuddhistYear2(date: Date): string {
  const buddhist = date.getFullYear() + 543
  return pad(buddhist % 100, 2)
}

/**
 * Counter doc path: `documentCounters/{YYYY-MM}` สำหรับเอกสาร reset รายเดือน
 * Counter doc path: `documentCounters/all` สำหรับ customer code (ไม่ reset)
 */
export async function nextDocNumber(field: DocCounterField, date: Date = new Date()): Promise<string> {
  if (field === 'customer') {
    return nextCustomerCode()
  }

  const yy = toBuddhistYear2(date)
  const mm = pad(date.getMonth() + 1, 2)
  const periodKey = `${date.getFullYear()}-${mm}`  // เก็บใน Firestore ใช้ค.ศ. ป้องกัน confusion
  const counterRef = doc(db, 'documentCounters', periodKey)

  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef)
    const data = snap.exists() ? snap.data() : {}
    const current = (data[field] as number | undefined) ?? 0
    const incremented = current + 1
    tx.set(counterRef, {
      ...data,
      [field]: incremented,
      updatedAt: new Date().toISOString(),
    }, { merge: true })
    return incremented
  })

  return `${PREFIX_MAP[field]}${yy}${mm}-${pad(next, 4)}`
}

/**
 * Customer code ไม่ reset รายเดือน — running ยาวต่อเนื่อง
 * เก็บที่ documentCounters/all
 */
async function nextCustomerCode(): Promise<string> {
  const counterRef = doc(db, 'documentCounters', 'all')
  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef)
    const data = snap.exists() ? snap.data() : {}
    const current = (data.customer as number | undefined) ?? 0
    const incremented = current + 1
    tx.set(counterRef, {
      ...data,
      customer: incremented,
      updatedAt: new Date().toISOString(),
    }, { merge: true })
    return incremented
  })
  return `CUS-${pad(next, 4)}`
}
