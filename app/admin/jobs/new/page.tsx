'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeftIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import JobForm, { type JobFormData } from '@/components/admin/JobForm'
import { Skeleton } from '@/components/ui/Skeleton'
import { getJobWithBudget, createJob, updateJob } from '@/lib/firebase-utils'
import Modal from '@/components/ui/Modal'
import { addJobToCalendar } from '@/lib/calendar'
import { getAccountingStatuses, type AccountingStatusDef } from '@/lib/job-accounting'
import GoogleCalendarButton from '@/components/admin/GoogleCalendarButton'
import type { Job } from '@/lib/types'

function JobEditor() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('id')

  const [loading, setLoading] = useState(!!editId)
  const [saving, setSaving] = useState(false)
  const [existing, setExisting] = useState<Job | null>(null)
  const [acctStatuses, setAcctStatuses] = useState<AccountingStatusDef[]>([])
  useEffect(() => { getAccountingStatuses().then(setAcctStatuses).catch(() => {}) }, [])
  const [created, setCreated] = useState<(JobFormData & { id: string; googleAddedAt?: string }) | null>(null)

  useEffect(() => {
    if (!editId) return
    let alive = true
    setLoading(true)
    getJobWithBudget(editId).then((j) => {
      if (!alive) return
      setExisting(j)
      setLoading(false)
    })
    return () => { alive = false }
  }, [editId])

  const handleSubmit = async (data: JobFormData) => {
    setSaving(true)
    try {
      if (editId) {
        await updateJob(editId, data)
        router.push('/admin/jobs')
        return
      }
      const id = await createJob(data)
      // งานใหม่ขึ้นปฏิทินงานเลย — พังก็ไม่ block การสร้างงาน (เพิ่มเองทีหลังจากหน้าปฏิทินได้)
      await addJobToCalendar(id).catch(() => {})
      setCreated({ ...data, id })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/jobs"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          งานถ่ายทอดสด
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {editId ? `แก้ไขข้อมูลงาน${existing?.title ? ` — ${existing.title}` : ''}` : 'เพิ่มงานถ่ายทอดสดใหม่'}
        </h1>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
          <JobForm
            defaultValues={existing ?? undefined}
            onSubmit={handleSubmit}
            onCancel={() => router.push('/admin/jobs')}
            isLoading={saving}
            accountingStatuses={acctStatuses}
          />
        </div>
      )}

      {created && (
        <Modal isOpen onClose={() => router.push('/admin/jobs')} title="สร้างงานแล้ว" size="sm">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircleIcon className="w-6 h-6 text-green-600 shrink-0" />
              <div className="text-sm">
                <p className="font-semibold text-gray-900">{created.title}</p>
                <p className="text-gray-500 mt-0.5">ลงปฏิทินงานให้แล้ว{created.googleAddedAt ? ' · เปิด Google Calendar แล้ว — กดบันทึกในหน้าของ Google ด้วย' : ''}</p>
              </div>
            </div>
            <GoogleCalendarButton variant="button" job={created} addedAt={created.googleAddedAt} onChange={(at) => setCreated((c) => c && { ...c, googleAddedAt: at })} />
            <button
              onClick={() => router.push('/admin/jobs')}
              className="w-full px-4 py-2.5 text-sm font-medium text-gray-600 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              ไปหน้างานถ่ายทอดสด
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default function JobEditorPage() {
  return (
    <Suspense fallback={
      <div className="space-y-4">
        <Skeleton className="h-8 w-48 rounded-md" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    }>
      <JobEditor />
    </Suspense>
  )
}
