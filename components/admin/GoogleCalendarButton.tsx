'use client'

import { CalendarDaysIcon, CheckIcon } from '@heroicons/react/24/outline'
import { googleCalendarUrl, setGoogleAdded } from '@/lib/calendar'
import { formatDateTime } from '@/lib/utils'
import type { Job } from '@/lib/types'

type Props = {
  job: Job | Pick<Job, 'id' | 'title' | 'date' | 'endDate' | 'location' | 'clientName' | 'description'>
  addedAt?: string
  /** จดป้ายเสร็จ — ส่งเวลาที่ลง (undefined = เอาป้ายออก) */
  onChange?: (addedAt: string | undefined) => void
  variant?: 'icon' | 'button' | 'link'
}

/** ปุ่มเปิดหน้าสร้างนัดของ Google + จดป้าย "ลง Google แล้ว" ตอนกด */
export default function GoogleCalendarButton({ job, addedAt, onChange, variant = 'link' }: Props) {
  const mark = () => {
    setGoogleAdded(job.id, true).then(onChange).catch((e) => console.error(e))
  }
  const title = addedAt ? `ลง Google Calendar แล้ว (${formatDateTime(addedAt)}) · กดเพื่อเปิดอีกครั้ง` : 'เพิ่มลง Google Calendar'
  const common = { href: googleCalendarUrl(job), target: '_blank', rel: 'noopener noreferrer', onClick: mark, title }

  if (variant === 'icon') {
    return (
      <a {...common} className={`relative p-1.5 rounded-lg transition-colors ${addedAt ? 'text-green-600 bg-green-50 hover:bg-green-100' : 'text-gray-400 hover:text-brand hover:bg-brand-soft'}`}>
        <CalendarDaysIcon className="w-4 h-4" />
        {addedAt && <CheckIcon className="absolute -right-0.5 -bottom-0.5 w-3 h-3 p-px rounded-full bg-green-600 text-white stroke-[3]" />}
      </a>
    )
  }
  if (variant === 'button') {
    return (
      <a {...common} className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-brand text-white text-sm font-medium rounded-xl hover:bg-brand-dark transition-colors">
        <CalendarDaysIcon className="w-4 h-4" />
        {addedAt ? 'เปิด Google Calendar อีกครั้ง' : 'เพิ่มลง Google Calendar'}
      </a>
    )
  }
  return <a {...common} className="text-xs text-brand hover:underline">{addedAt ? 'เปิด Google Calendar อีกครั้ง' : 'เพิ่มลง Google Calendar'}</a>
}

/** ป้ายเล็ก "Google ✓" */
export function GoogleAddedBadge({ addedAt, onRemove }: { addedAt?: string; onRemove?: () => void }) {
  if (!addedAt) return null
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700" title={`ลง Google Calendar แล้ว ${formatDateTime(addedAt)}`}>
      <CheckIcon className="w-3 h-3 stroke-[3]" /> Google
      {onRemove && (
        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove() }} className="ml-0.5 text-green-700/60 hover:text-green-900" title="เอาป้ายออก (ยังไม่ได้ลงจริง)">×</button>
      )}
    </span>
  )
}
