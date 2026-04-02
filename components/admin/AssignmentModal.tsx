'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { getFreelancers, createAssignment, deleteAssignment } from '@/lib/firebase-utils'
import type { Freelancer, Job, JobAssignment } from '@/lib/types'
import { formatCurrency, assignmentStatusLabel } from '@/lib/utils'
import { TrashIcon, UserPlusIcon } from '@heroicons/react/24/outline'

type FormData = {
  freelancerId: string
  role: string
  fee: number
  notes?: string
}

interface AssignmentModalProps {
  isOpen: boolean
  onClose: () => void
  job: Job
  assignments: JobAssignment[]
  onRefresh: () => void
}

export default function AssignmentModal({ isOpen, onClose, job, assignments, onRefresh }: AssignmentModalProps) {
  const [freelancers, setFreelancers] = useState<Freelancer[]>([])
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    defaultValues: { role: '', fee: 0, freelancerId: '', notes: '' },
  })

  useEffect(() => {
    getFreelancers().then(setFreelancers)
  }, [])

  const onSubmit = async (data: FormData) => {
    setSaving(true)
    try {
      const freelancer = freelancers.find((f) => f.id === data.freelancerId)
      await createAssignment({
        jobId: job.id,
        freelancerId: data.freelancerId,
        role: data.role,
        fee: data.fee,
        status: 'invited',
        notes: data.notes,
        jobTitle: job.title,
        freelancerName: freelancer?.name ?? '',
      })
      reset()
      onRefresh()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    await deleteAssignment(id)
    onRefresh()
  }

  const inputCls = 'w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727]'

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={`มอบหมายงาน: ${job.title}`} size="xl">
        <div className="space-y-5">
          {/* Current assignments */}
          {assignments.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Freelancer ที่มอบหมายแล้ว</p>
              <div className="space-y-2">
                {assignments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{a.freelancerName}</p>
                      <p className="text-xs text-gray-500">{a.role} · {formatCurrency(a.fee)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">{assignmentStatusLabel(a.status)}</span>
                      <button
                        onClick={() => setDeleteId(a.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add form */}
          <form onSubmit={handleSubmit(onSubmit)} className="border-t border-gray-100 pt-4 space-y-3">
            <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <UserPlusIcon className="w-4 h-4" /> เพิ่ม Freelancer
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <select {...register('freelancerId')} className={inputCls}>
                  <option value="">-- เลือก Freelancer --</option>
                  {freelancers.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
                {errors.freelancerId && <p className="text-xs text-red-500 mt-1">{errors.freelancerId.message}</p>}
              </div>
              <div>
                <input {...register('role')} className={inputCls} placeholder="หน้าที่ เช่น ช่างกล้อง" />
                {errors.role && <p className="text-xs text-red-500 mt-1">{errors.role.message}</p>}
              </div>
              <div>
                <input type="number" {...register('fee', { valueAsNumber: true })} className={inputCls} placeholder="ค่าจ้าง (บาท)" min="0" />
                {errors.fee && <p className="text-xs text-red-500 mt-1">{errors.fee.message}</p>}
              </div>
              <div className="col-span-2">
                <input {...register('notes')} className={inputCls} placeholder="หมายเหตุ (ถ้ามี)" />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-[#f73727] text-white text-sm font-medium rounded-xl hover:bg-red-600 transition-colors disabled:opacity-60 flex items-center gap-2"
              >
                {saving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                เพิ่ม
              </button>
            </div>
          </form>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && handleDelete(deleteId)}
        title="ลบการมอบหมาย"
        message="ต้องการลบการมอบหมายงานนี้ใช่หรือไม่?"
        confirmLabel="ลบ"
        danger
      />
    </>
  )
}
