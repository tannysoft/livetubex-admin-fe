'use client'

import { useEffect, useState } from 'react'
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  MapPinIcon,
  CalendarIcon,
  UserGroupIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Badge from '@/components/ui/Badge'
import JobForm from '@/components/admin/JobForm'
import AssignmentModal from '@/components/admin/AssignmentModal'
import {
  getJobs,
  createJob,
  updateJob,
  deleteJob,
  getAssignmentsByJob,
} from '@/lib/firebase-utils'
import type { Job, JobAssignment } from '@/lib/types'
import { formatCurrency, formatDate, jobStatusColor, jobStatusLabel } from '@/lib/utils'

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [editJob, setEditJob] = useState<Job | null>(null)
  const [deleteJobId, setDeleteJobId] = useState<string | null>(null)
  const [assignJob, setAssignJob] = useState<Job | null>(null)
  const [assignments, setAssignments] = useState<JobAssignment[]>([])
  const [saving, setSaving] = useState(false)

  const loadJobs = async () => {
    setLoading(true)
    try {
      const data = await getJobs()
      setJobs(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadJobs()
  }, [])

  const openAssign = async (job: Job) => {
    setAssignJob(job)
    const a = await getAssignmentsByJob(job.id)
    setAssignments(a)
  }

  const refreshAssignments = async () => {
    if (!assignJob) return
    const a = await getAssignmentsByJob(assignJob.id)
    setAssignments(a)
  }

  const handleCreate = async (data: Parameters<typeof createJob>[0]) => {
    setSaving(true)
    try {
      await createJob(data)
      setCreateOpen(false)
      loadJobs()
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async (data: Parameters<typeof createJob>[0]) => {
    if (!editJob) return
    setSaving(true)
    try {
      await updateJob(editJob.id, data)
      setEditJob(null)
      loadJobs()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    await deleteJob(id)
    loadJobs()
  }

  const filtered = jobs.filter(
    (j) =>
      j.title.toLowerCase().includes(search.toLowerCase()) ||
      j.location.toLowerCase().includes(search.toLowerCase()) ||
      j.clientName.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">จัดการงานถ่ายทอดสด</h1>
          <p className="text-gray-500 mt-1">{jobs.length} งานทั้งหมด</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#f73727] text-white text-sm font-medium rounded-xl hover:bg-red-600 transition-colors shadow-md shadow-red-200"
        >
          <PlusIcon className="w-4 h-4" />
          เพิ่มงานใหม่
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่องาน สถานที่ หรือลูกค้า..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727] bg-white"
        />
      </div>

      {/* Job cards */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-[#f73727] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg font-medium">ไม่พบงาน</p>
          <p className="text-sm mt-1">ลองเปลี่ยนคำค้นหา หรือเพิ่มงานใหม่</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map((job) => (
            <div
              key={job.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{job.title}</h3>
                    <Badge label={jobStatusLabel(job.status)} colorClass={jobStatusColor(job.status)} />
                  </div>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">{job.description}</p>
                  <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <CalendarIcon className="w-3.5 h-3.5" />
                      {formatDate(job.date)}{job.endDate ? ` – ${formatDate(job.endDate)}` : ''}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPinIcon className="w-3.5 h-3.5" />
                      {job.location}
                    </span>
                    <span className="font-medium text-gray-600">{job.clientName}</span>
                    <span className="font-semibold text-[#f73727]">{formatCurrency(job.budget)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => openAssign(job)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
                  >
                    <UserGroupIcon className="w-3.5 h-3.5" />
                    มอบหมาย
                  </button>
                  <button
                    onClick={() => setEditJob(job)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteJobId(job.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="เพิ่มงานถ่ายทอดสดใหม่" size="xl">
        <JobForm
          onSubmit={handleCreate}
          onCancel={() => setCreateOpen(false)}
          isLoading={saving}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={!!editJob} onClose={() => setEditJob(null)} title="แก้ไขข้อมูลงาน" size="xl">
        {editJob && (
          <JobForm
            defaultValues={editJob}
            onSubmit={handleEdit}
            onCancel={() => setEditJob(null)}
            isLoading={saving}
          />
        )}
      </Modal>

      {/* Delete Dialog */}
      <ConfirmDialog
        isOpen={!!deleteJobId}
        onClose={() => setDeleteJobId(null)}
        onConfirm={() => deleteJobId && handleDelete(deleteJobId)}
        title="ลบงาน"
        message="ต้องการลบงานนี้ใช่หรือไม่? ข้อมูลจะถูกลบถาวร"
        confirmLabel="ลบ"
        danger
      />

      {/* Assignment Modal */}
      {assignJob && (
        <AssignmentModal
          isOpen={!!assignJob}
          onClose={() => setAssignJob(null)}
          job={assignJob}
          assignments={assignments}
          onRefresh={refreshAssignments}
        />
      )}
    </div>
  )
}
