'use client'

import { Controller, useForm } from 'react-hook-form'
import { Switch } from '@headlessui/react'
import FormListbox from '@/components/ui/FormListbox'
import type { Freelancer } from '@/lib/types'

type FormData = {
  namePrefix: string
  firstName: string
  lastName: string
  phone: string
  email: string
  bankAccount: string
  bankName: string
  lineUserId: string
  lineDisplayName: string
  isActive: boolean
}

interface FreelancerFormProps {
  defaultValues?: Partial<Freelancer>
  onSubmit: (data: Omit<Freelancer, 'id' | 'createdAt' | 'totalEarned'>) => Promise<void>
  onCancel: () => void
  isLoading?: boolean
}

const bankOptions = [
  'ธนาคารกสิกรไทย (KBANK)',
  'ธนาคารไทยพาณิชย์ (SCB)',
  'ธนาคารกรุงเทพ (BBL)',
  'ธนาคารกรุงไทย (KTB)',
  'ธนาคารกรุงศรีอยุธยา (BAY)',
  'ธนาคารทหารไทยธนชาต (TTB)',
  'ธนาคารออมสิน (GSB)',
  'ธนาคาร ธ.ก.ส.',
  'ธนาคารซีไอเอ็มบี (CIMB)',
  'ธนาคารยูโอบี (UOB)',
]

const namePrefixOptions = [
  { value: 'นาย', label: 'นาย' },
  { value: 'นาง', label: 'นาง' },
  { value: 'นางสาว', label: 'นางสาว' },
]

const bankListboxOptions = [
  { value: '', label: '-- เลือกธนาคาร --' },
  ...bankOptions.map((b) => ({ value: b, label: b })),
]

export default function FreelancerForm({ defaultValues, onSubmit, onCancel, isLoading }: FreelancerFormProps) {
  const isEditMode = !!defaultValues?.id

  const { register, control, handleSubmit, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      namePrefix: defaultValues?.namePrefix ?? 'นาย',
      firstName: defaultValues?.firstName ?? '',
      lastName: defaultValues?.lastName ?? '',
      phone: defaultValues?.phone ?? '',
      email: defaultValues?.email ?? '',
      bankAccount: defaultValues?.bankAccount ?? '',
      bankName: defaultValues?.bankName ?? '',
      lineUserId: defaultValues?.lineUserId ?? '',
      lineDisplayName: defaultValues?.lineDisplayName ?? '',
      isActive: defaultValues?.isActive ?? true,
    },
  })

  const handleFormSubmit = (data: FormData) => {
    const fullName = `${data.namePrefix}${data.firstName} ${data.lastName}`
    const lineUserId = isEditMode ? (defaultValues?.lineUserId ?? data.lineUserId) : data.lineUserId
    const lineDisplayName = isEditMode ? (defaultValues?.lineDisplayName ?? data.lineDisplayName) : data.lineDisplayName
    return onSubmit({
      namePrefix: data.namePrefix,
      firstName: data.firstName,
      lastName: data.lastName,
      name: fullName,
      phone: data.phone,
      email: data.email,
      bankAccount: data.bankAccount,
      bankName: data.bankName,
      lineUserId,
      lineDisplayName,
      linePictureUrl: defaultValues?.linePictureUrl ?? '',
      idCardImageUrl: defaultValues?.idCardImageUrl ?? '',
      isActive: data.isActive,
    })
  }

  const inputBaseCls =
    'px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727] transition-all'
  const inputCls = `w-full ${inputBaseCls}`
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
  const errorCls = 'text-xs text-red-500 mt-1'

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

        {/* คำนำหน้า + ชื่อ — flex + w-full on sibling overflows grid; use flex-1 min-w-0 */}
        <div className="min-w-0">
          <label className={labelCls}>ชื่อ *</label>
          <div className="flex min-w-0 gap-2">
            <Controller
              name="namePrefix"
              control={control}
              rules={{ required: true }}
              render={({ field }) => (
                <FormListbox
                  value={field.value}
                  onChange={field.onChange}
                  options={namePrefixOptions}
                  buttonClassName="w-28 shrink-0"
                />
              )}
            />
            <input
              {...register('firstName', { required: 'กรุณากรอกชื่อ' })}
              className={`${inputBaseCls} min-w-0 flex-1`}
              placeholder="ชื่อ"
            />
          </div>
          {errors.firstName && <p className={errorCls}>{errors.firstName.message}</p>}
        </div>

        {/* นามสกุล */}
        <div className="min-w-0">
          <label className={labelCls}>นามสกุล *</label>
          <input
            {...register('lastName', { required: 'กรุณากรอกนามสกุล' })}
            className={inputCls}
            placeholder="นามสกุล"
          />
          {errors.lastName && <p className={errorCls}>{errors.lastName.message}</p>}
        </div>

        <div>
          <label className={labelCls}>เบอร์โทรศัพท์ *</label>
          <input {...register('phone')} className={inputCls} placeholder="0812345678" type="tel" />
          {errors.phone && <p className={errorCls}>{errors.phone.message}</p>}
        </div>

        <div>
          <label className={labelCls}>อีเมล</label>
          <input {...register('email')} className={inputCls} placeholder="email@example.com" type="email" />
          {errors.email && <p className={errorCls}>{errors.email.message}</p>}
        </div>

        <div>
          <label className={labelCls}>ธนาคาร *</label>
          <Controller
            name="bankName"
            control={control}
            rules={{ required: 'กรุณาเลือกธนาคาร' }}
            render={({ field }) => (
              <FormListbox
                value={field.value}
                onChange={field.onChange}
                options={bankListboxOptions}
                placeholder="-- เลือกธนาคาร --"
                buttonClassName={inputCls}
                invalid={!!errors.bankName}
              />
            )}
          />
          {errors.bankName && <p className={errorCls}>{errors.bankName.message}</p>}
        </div>

        <div>
          <label className={labelCls}>เลขบัญชีธนาคาร *</label>
          <input {...register('bankAccount')} className={inputCls} placeholder="000-0-00000-0" />
          {errors.bankAccount && <p className={errorCls}>{errors.bankAccount.message}</p>}
        </div>

        <div>
          <label className={labelCls}>Line User ID</label>
          <input
            {...register('lineUserId')}
            className={`${inputCls} ${isEditMode ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
            placeholder="U1234..."
            readOnly={isEditMode}
          />
          {isEditMode && <p className="text-xs text-gray-400 mt-1">Line User ID ไม่สามารถแก้ไขได้</p>}
        </div>

        <div>
          <label className={labelCls}>Line Display Name</label>
          <input
            {...register('lineDisplayName')}
            className={`${inputCls} ${isEditMode ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
            placeholder="ชื่อใน Line"
            readOnly={isEditMode}
          />
          {isEditMode && <p className="text-xs text-gray-400 mt-1">Line Display Name ไม่สามารถแก้ไขได้</p>}
        </div>

        <div className="sm:col-span-2 flex items-center gap-3">
          <Controller
            name="isActive"
            control={control}
            render={({ field: { value, onChange } }) => (
              <Switch
                checked={value}
                onChange={onChange}
                id="isActive"
                className="group relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-transparent bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:ring-offset-2 data-checked:bg-[#f73727] data-disabled:opacity-50"
              >
                <span className="pointer-events-none inline-block size-5 translate-x-0.5 rounded-full bg-white shadow transition duration-200 ease-in-out group-data-checked:translate-x-5" />
              </Switch>
            )}
          />
          <label htmlFor="isActive" className="text-sm text-gray-700 cursor-pointer">
            Active (สามารถรับงานได้)
          </label>
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
