'use client'

import { Controller, useForm } from 'react-hook-form'
import FormListbox from '@/components/ui/FormListbox'
import FormCheckbox from '@/components/ui/FormCheckbox'
import type { Customer, CustomerType } from '@/lib/types'

export type CustomerFormData = {
  name: string
  type: CustomerType
  taxId?: string
  branch?: string
  address: string
  phone?: string
  email?: string
  contactPerson?: string
  notes?: string
  isActive: boolean
}

interface Props {
  defaultValues?: Partial<Customer>
  onSubmit: (data: CustomerFormData) => Promise<void>
  onCancel: () => void
  isLoading?: boolean
}

const typeOptions: { value: CustomerType; label: string }[] = [
  { value: 'company', label: 'นิติบุคคล (บริษัท/ห้างฯ)' },
  { value: 'individual', label: 'บุคคลธรรมดา' },
]

export default function CustomerForm({ defaultValues, onSubmit, onCancel, isLoading }: Props) {
  const {
    register,
    control,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomerFormData>({
    defaultValues: {
      name: defaultValues?.name ?? '',
      type: (defaultValues?.type as CustomerType) ?? 'company',
      taxId: defaultValues?.taxId ?? '',
      branch: defaultValues?.branch ?? 'สำนักงานใหญ่',
      address: defaultValues?.address ?? '',
      phone: defaultValues?.phone ?? '',
      email: defaultValues?.email ?? '',
      contactPerson: defaultValues?.contactPerson ?? '',
      notes: defaultValues?.notes ?? '',
      isActive: defaultValues?.isActive ?? true,
    },
  })

  const type = watch('type')

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727] transition-all'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
  const errorCls = 'text-xs text-red-500 mt-1'

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>ประเภทลูกค้า *</label>
          <Controller
            name="type"
            control={control}
            render={({ field }) => (
              <FormListbox
                value={field.value}
                onChange={(v) => field.onChange(v as CustomerType)}
                options={typeOptions}
                buttonClassName={inputCls}
              />
            )}
          />
        </div>

        <div>
          <label className={labelCls}>
            {type === 'company' ? 'เลขประจำตัวผู้เสียภาษี' : 'เลขบัตรประชาชน'}
          </label>
          <input
            {...register('taxId', {
              pattern: { value: /^[0-9]{0,13}$/, message: 'ต้องเป็นตัวเลข 13 หลัก' },
            })}
            className={inputCls}
            placeholder="13 หลัก"
            maxLength={13}
          />
          {errors.taxId && <p className={errorCls}>{errors.taxId.message}</p>}
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls}>
            {type === 'company' ? 'ชื่อบริษัท *' : 'ชื่อ-นามสกุล *'}
          </label>
          <input
            {...register('name', { required: 'กรุณากรอกชื่อ' })}
            className={inputCls}
            placeholder={type === 'company' ? 'บริษัท ABC จำกัด' : 'นาย ก ขข'}
          />
          {errors.name && <p className={errorCls}>{errors.name.message}</p>}
        </div>

        {type === 'company' && (
          <div className="sm:col-span-2">
            <label className={labelCls}>สาขา</label>
            <input
              {...register('branch')}
              className={inputCls}
              placeholder='เช่น "สำนักงานใหญ่" หรือ "สาขา 00001"'
            />
          </div>
        )}

        <div className="sm:col-span-2">
          <label className={labelCls}>ที่อยู่ *</label>
          <textarea
            {...register('address', { required: 'กรุณากรอกที่อยู่' })}
            rows={3}
            className={inputCls}
            placeholder="ที่อยู่เต็ม (รวมแขวง/เขต/จังหวัด/รหัสไปรษณีย์)"
          />
          {errors.address && <p className={errorCls}>{errors.address.message}</p>}
        </div>

        <div>
          <label className={labelCls}>ผู้ติดต่อ</label>
          <input {...register('contactPerson')} className={inputCls} placeholder="ชื่อผู้ติดต่อ" />
        </div>

        <div>
          <label className={labelCls}>เบอร์โทร</label>
          <input {...register('phone')} className={inputCls} placeholder="02-xxx-xxxx" />
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls}>อีเมล</label>
          <input type="email" {...register('email')} className={inputCls} placeholder="contact@company.com" />
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls}>หมายเหตุ</label>
          <textarea {...register('notes')} rows={2} className={inputCls} placeholder="หมายเหตุภายใน" />
        </div>

        <div className="sm:col-span-2">
          <Controller
            name="isActive"
            control={control}
            render={({ field }) => (
              <FormCheckbox
                checked={field.value}
                onChange={field.onChange}
                label="ใช้งานอยู่"
              />
            )}
          />
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
