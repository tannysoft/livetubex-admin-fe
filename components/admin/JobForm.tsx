'use client'

import { useForm } from 'react-hook-form'
import type { Job, JobStatus } from '@/lib/types'

type FormData = {
  title: string
  description: string
  date: string
  endDate?: string
  location: string
  clientName: string
  budget: number
  status: JobStatus
  notes?: string
}

export type JobFormData = FormData

interface JobFormProps {
  defaultValues?: Partial<Job>
  onSubmit: (data: FormData) => Promise<void>
  onCancel: () => void
  isLoading?: boolean
}

const statusOptions: { value: JobStatus; label: string }[] = [
  { value: 'draft', label: 'ร่าง' },
  { value: 'published', label: 'เปิดรับสมัคร' },
  { value: 'in_progress', label: 'กำลังดำเนินการ' },
  { value: 'completed', label: 'เสร็จสิ้น' },
  { value: 'cancelled', label: 'ยกเลิก' },
]

export default function JobForm({ defaultValues, onSubmit, onCancel, isLoading }: JobFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      title: defaultValues?.title ?? '',
      description: defaultValues?.description ?? '',
      date: defaultValues?.date?.slice(0, 10) ?? '',
      endDate: defaultValues?.endDate?.slice(0, 10) ?? '',
      location: defaultValues?.location ?? '',
      clientName: defaultValues?.clientName ?? '',
      budget: defaultValues?.budget ?? 0,
      status: (defaultValues?.status as JobStatus) ?? 'draft',
      notes: defaultValues?.notes ?? '',
    },
  })

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727] transition-all'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
  const errorCls = 'text-xs text-red-500 mt-1'

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls}>ชื่องาน *</label>
          <input {...register('title')} className={inputCls} placeholder="เช่น งานถ่ายทอดสด Concert XYZ" />
          {errors.title && <p className={errorCls}>{errors.title.message}</p>}
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls}>รายละเอียด *</label>
          <textarea {...register('description')} rows={3} className={inputCls} placeholder="รายละเอียดงาน..." />
          {errors.description && <p className={errorCls}>{errors.description.message}</p>}
        </div>

        <div>
          <label className={labelCls}>วันที่เริ่มงาน *</label>
          <input type="date" {...register('date')} className={inputCls} />
          {errors.date && <p className={errorCls}>{errors.date.message}</p>}
        </div>

        <div>
          <label className={labelCls}>วันที่สิ้นสุด</label>
          <input type="date" {...register('endDate')} className={inputCls} />
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls}>สถานที่ *</label>
          <input {...register('location')} className={inputCls} placeholder="เช่น อิมแพค อารีน่า เมืองทองธานี" />
          {errors.location && <p className={errorCls}>{errors.location.message}</p>}
        </div>

        <div>
          <label className={labelCls}>ชื่อลูกค้า / Event *</label>
          <input {...register('clientName')} className={inputCls} placeholder="ชื่อผู้ว่าจ้าง" />
          {errors.clientName && <p className={errorCls}>{errors.clientName.message}</p>}
        </div>

        <div>
          <label className={labelCls}>งบประมาณรวม (บาท) *</label>
          <input type="number" {...register('budget', { valueAsNumber: true })} className={inputCls} min="0" />
          {errors.budget && <p className={errorCls}>{errors.budget.message}</p>}
        </div>

        <div>
          <label className={labelCls}>สถานะ *</label>
          <select {...register('status')} className={inputCls}>
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls}>หมายเหตุ</label>
          <textarea {...register('notes')} rows={2} className={inputCls} placeholder="หมายเหตุเพิ่มเติม..." />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="px-6 py-2.5 text-sm font-medium text-white bg-[#f73727] rounded-xl hover:bg-red-600 transition-colors disabled:opacity-60 flex items-center gap-2"
        >
          {isLoading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          บันทึก
        </button>
      </div>
    </form>
  )
}
