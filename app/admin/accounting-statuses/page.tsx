'use client'

import { useEffect, useState } from 'react'
import { CheckCircleIcon } from '@heroicons/react/24/outline'
import { Skeleton } from '@/components/ui/Skeleton'
import { AccountingStatusEditor } from '@/components/admin/AccountingStatusManager'
import { AccountingPill } from '@/components/admin/AccountingStatusMenu'
import { getJobsWithBudget } from '@/lib/firebase-utils'
import { getAccountingStatuses, type AccountingStatusDef } from '@/lib/job-accounting'

/**
 * Master data: สถานะทางบัญชีของงาน — ชื่อ สี ลำดับ (settings/jobAccounting)
 * ใช้ที่หน้างานถ่ายทอดสด (คอลัมน์บัญชี + ตัวกรอง), ฟอร์มงาน, ปฏิทินงาน (สีแถบงาน) และผู้ช่วย AI
 */
export default function AccountingStatusesPage() {
  const [statuses, setStatuses] = useState<AccountingStatusDef[] | null>(null)
  const [usage, setUsage] = useState<Map<string, number>>(new Map())
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    Promise.all([getAccountingStatuses(), getJobsWithBudget()])
      .then(([st, jobs]) => {
        const m = new Map<string, number>()
        for (const j of jobs) if (j.accountingStatus) m.set(j.accountingStatus, (m.get(j.accountingStatus) ?? 0) + 1)
        setUsage(m)
        setStatuses(st)
      })
      .catch((e) => { console.error(e); setStatuses([]) })
  }, [])

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">สถานะทางบัญชี</h1>
        <p className="text-gray-500 mt-1">ชื่อและสีของสถานะบัญชีงาน — สีนี้ใช้เป็นสีแถบงานบนปฏิทินด้วย · แก้ชื่อแล้วงานที่ตั้งไว้ไม่หลุด</p>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        {statuses === null ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : (
          <AccountingStatusEditor
            statuses={statuses}
            usage={usage}
            onSaved={(list) => { setStatuses(list); setSaved(true); setTimeout(() => setSaved(false), 2500) }}
          />
        )}
        {saved && <p className="mt-3 flex items-center gap-1.5 text-sm text-green-700"><CheckCircleIcon className="w-5 h-5" /> บันทึกแล้ว</p>}
      </div>
      {statuses && statuses.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {statuses.map((s) => <AccountingPill key={s.id} status={s} />)}
        </div>
      )}
    </div>
  )
}
