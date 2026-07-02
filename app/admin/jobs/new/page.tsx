'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import JobForm, { type JobFormData } from '@/components/admin/JobForm'
import { Skeleton } from '@/components/ui/Skeleton'
import { getJob, createJob, updateJob } from '@/lib/firebase-utils'
import type { Job } from '@/lib/types'

function JobEditor() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('id')

  const [loading, setLoading] = useState(!!editId)
  const [saving, setSaving] = useState(false)
  const [existing, setExisting] = useState<Job | null>(null)

  useEffect(() => {
    if (!editId) return
    let alive = true
    setLoading(true)
    getJob(editId).then((j) => {
      if (!alive) return
      setExisting(j)
      setLoading(false)
    })
    return () => { alive = false }
  }, [editId])

  const handleSubmit = async (data: JobFormData) => {
    setSaving(true)
    try {
      if (editId) await updateJob(editId, data)
      else await createJob(data)
      router.push('/admin/jobs')
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
          จัดการงานถ่ายทอดสด
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
          />
        </div>
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
