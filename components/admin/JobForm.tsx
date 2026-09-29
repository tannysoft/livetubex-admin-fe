'use client'

import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import FormListbox from '@/components/ui/FormListbox'
import FormMultiDatePicker from '@/components/ui/FormMultiDatePicker'
import { jobDays, normalizeJobDates } from '@/lib/job-dates'
import type { Job, JobStatus } from '@/lib/types'
import { generatePaymentCycleOptions } from '@/lib/utils'
import type { AccountingStatusDef } from '@/lib/job-accounting'
import { MagnifyingGlassIcon, MapPinIcon } from '@heroicons/react/24/outline'
import { cleanMapUrl, placeFromMapUrl, safeMapUrl } from '@/lib/job-map'
import MapSearchModal from '@/components/admin/MapSearchModal'
import SuggestInput from '@/components/ui/SuggestInput'
import { getJobPlaces, placeMapFor, placeSuggestions } from '@/lib/job-places'
import { getJobs } from '@/lib/firebase-utils'

type FormData = {
  title: string
  description: string
  date: string
  endDate?: string
  /** เว้นวัน = วันงานจริง · [] = ช่วงวันติดกัน (ตอนแก้งาน = ลบ field) */
  dates?: string[]
  location: string
  mapUrl?: string
  clientName: string
  docNumber?: string
  budget: number
  status: JobStatus
  paymentCycle?: string
  accountingStatus?: string
  notes?: string
}

export type JobFormData = FormData

interface JobFormProps {
  defaultValues?: Partial<Job>
  onSubmit: (data: FormData) => Promise<void>
  onCancel: () => void
  isLoading?: boolean
  /** รายการสถานะบัญชี — ไม่ส่ง = ไม่โชว์ช่อง */
  accountingStatuses?: AccountingStatusDef[]
}

const statusOptions: { value: JobStatus; label: string }[] = [
  { value: 'draft', label: 'ร่าง' },
  { value: 'published', label: 'เปิดรับสมัคร' },
  { value: 'in_progress', label: 'กำลังดำเนินการ' },
  { value: 'completed', label: 'เสร็จสิ้น' },
  { value: 'cancelled', label: 'ยกเลิก' },
]

export default function JobForm({ defaultValues, onSubmit, onCancel, isLoading, accountingStatuses }: JobFormProps) {
  const {
    register,
    control,
    watch,
    setValue,
    getValues,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      title: defaultValues?.title ?? '',
      description: defaultValues?.description ?? '',
      date: defaultValues?.date?.slice(0, 10) ?? '',
      endDate: defaultValues?.endDate?.slice(0, 10) ?? '',
      location: defaultValues?.location ?? '',
      mapUrl: defaultValues?.mapUrl ?? '',
      clientName: defaultValues?.clientName ?? '',
      docNumber: defaultValues?.docNumber ?? '',
      budget: defaultValues?.budget ?? 0,
      status: (defaultValues?.status as JobStatus) ?? 'draft',
      paymentCycle: defaultValues?.paymentCycle ?? '',
      accountingStatus: defaultValues?.accountingStatus ?? '',
      notes: defaultValues?.notes ?? '',
    },
  })

  // วันงาน = เลือกทีละวัน (ติดกันหรือเว้นวันก็ได้ เช่น 22–23 และ 25) → date/endDate/dates ตอนบันทึก
  // eslint-disable-next-line react-hooks/incompatible-library -- watch() ของ react-hook-form (โชว์ปุ่มเปิดลิงก์/ค้นใน Maps)
  const [mapUrlValue, locationValue] = watch(['mapUrl', 'location'])
  // สถานที่ที่เคยใช้ (บันทึกไว้ + งานเก่า) สำหรับ autocomplete
  const [places, setPlaces] = useState<{ names: string[]; mapOf: Map<string, string> }>({ names: [], mapOf: new Map() })
  useEffect(() => {
    let alive = true
    Promise.all([getJobPlaces().catch(() => []), getJobs().catch(() => [])])
      .then(([pl, jobs]) => { if (alive) setPlaces(placeSuggestions(pl, jobs)) })
    return () => { alive = false }
  }, [])
  const [mapSearch, setMapSearch] = useState(false)
  const fillLocationFrom = (url: string, name?: string) => {
    const n = name ?? placeFromMapUrl(url).name
    if (n && !getValues('location')?.trim()) setValue('location', n, { shouldDirty: true })
  }
  const [days, setDays] = useState<string[]>(() => (defaultValues?.date ? jobDays({ date: defaultValues.date.slice(0, 10), endDate: defaultValues.endDate?.slice(0, 10), dates: defaultValues.dates }) : []))

  const submit = (data: FormData) => {
    if (!days.length) {
      setError('date', { message: 'กรุณาเลือกวันงานอย่างน้อย 1 วัน' })
      return
    }
    return onSubmit({ ...data, ...normalizeJobDates(days) })
  }

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
  const errorCls = 'text-xs text-red-500 mt-1'

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
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

        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="job-dates">วันงาน *</label>
          <FormMultiDatePicker id="job-dates" value={days} onChange={(v) => { setDays(v); if (v.length) clearErrors('date') }} placeholder="เลือกวันงาน (กดได้หลายวัน)" buttonClassName={inputCls} invalid={!!errors.date} />
          {errors.date && <p className={errorCls}>{errors.date.message}</p>}
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls}>สถานที่ *</label>
          <Controller
            name="location"
            control={control}
            render={({ field }) => (
              <SuggestInput
                value={field.value}
                onChange={field.onChange}
                // เลือกสถานที่ที่เคยใช้ → เติมลิงก์ Google Maps ที่บันทึกไว้ให้
                onPick={(name) => { const m = placeMapFor(places.mapOf, name); if (m) setValue('mapUrl', m, { shouldDirty: true }) }}
                options={places.names}
                badge={(name) => (placeMapFor(places.mapOf, name) ? <MapPinIcon className="w-3.5 h-3.5 shrink-0 text-brand" aria-label="มีลิงก์แผนที่" /> : null)}
                placeholder="เช่น อิมแพค อารีน่า เมืองทองธานี"
                className={inputCls}
                hint="สถานที่ที่เคยใช้ · 📍 = มีลิงก์ Google Maps เลือกแล้วเติมให้"
              />
            )}
          />
          {errors.location && <p className={errorCls}>{errors.location.message}</p>}
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls}>ลิงก์ Google Maps</label>
          <div className="flex gap-2">
            <input
              {...register('mapUrl', {
                // เก็บแบบตัดพารามิเตอร์ติดตาม · ไม่ใช่ลิงก์ = คงค่าเดิมให้ validate ฟ้อง
                setValueAs: (v: string) => cleanMapUrl(v) || (v ?? '').trim(),
                validate: (v) => !v || !!safeMapUrl(v) || 'ลิงก์ไม่ถูกต้อง (ต้องขึ้นต้นด้วย https://)',
                // วางลิงก์หน้าสถานที่ แล้วช่องสถานที่ยังว่าง → เติมชื่อจากลิงก์
                onBlur: (e) => fillLocationFrom(e.target.value),
              })}
              className={`${inputCls} min-w-0 flex-1`}
              placeholder="วางลิงก์แชร์จาก Google Maps เช่น https://maps.app.goo.gl/..."
              inputMode="url"
            />
            {safeMapUrl(mapUrlValue) ? (
              <a href={safeMapUrl(mapUrlValue)} target="_blank" rel="noopener noreferrer" className="shrink-0 flex items-center gap-1 px-3 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">
                <MapPinIcon className="w-4 h-4" /> เปิดดู
              </a>
            ) : null}
            {/* ค้นบนแผนที่ในหน้าต่าง (iframe) แล้วเลือกตำแหน่ง → เติมลิงก์ให้ */}
            <button type="button" onClick={() => setMapSearch(true)} className="shrink-0 flex items-center gap-1 px-3 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">
              <MagnifyingGlassIcon className="w-4 h-4" /> ค้นหา
            </button>
          </div>
          {errors.mapUrl
            ? <p className={errorCls}>{errors.mapUrl.message}</p>
            : <p className="text-xs text-gray-400 mt-1">ส่งรายละเอียดงานทาง LINE จะมีปุ่ม “เปิดแผนที่” ให้ทีมงานกดนำทาง</p>}
          {mapSearch && (
            <MapSearchModal
              initialQuery={locationValue ?? ''}
              onPick={(url, name) => { setValue('mapUrl', url, { shouldDirty: true, shouldValidate: true }); fillLocationFrom(url, name) }}
              onClose={() => setMapSearch(false)}
            />
          )}
        </div>

        <div>
          <label className={labelCls}>ชื่อลูกค้า / Event *</label>
          <input {...register('clientName')} className={inputCls} placeholder="ชื่อผู้ว่าจ้าง" />
          {errors.clientName && <p className={errorCls}>{errors.clientName.message}</p>}
        </div>

        <div>
          <label className={labelCls}>เลขที่เอกสาร</label>
          <input {...register('docNumber', { setValueAs: (v: string) => v.trim() })} className={inputCls} placeholder="เช่น เลขใบเสนอราคา / PO" />
        </div>

        <div>
          <label className={labelCls}>งบประมาณรวม (บาท) *</label>
          <input type="number" {...register('budget', { valueAsNumber: true })} className={inputCls} min="0" />
          {errors.budget && <p className={errorCls}>{errors.budget.message}</p>}
        </div>

        <div>
          <label className={labelCls}>สถานะ *</label>
          <Controller
            name="status"
            control={control}
            render={({ field }) => (
              <FormListbox
                value={field.value}
                onChange={(v) => field.onChange(v as JobStatus)}
                options={statusOptions.map((o) => ({ value: o.value, label: o.label }))}
                buttonClassName={inputCls}
              />
            )}
          />
        </div>

        <div>
          <label className={labelCls}>รอบจ่ายเงินทีมงาน</label>
          <Controller
            name="paymentCycle"
            control={control}
            render={({ field }) => (
              <FormListbox
                value={field.value ?? ''}
                onChange={(v) => field.onChange(v)}
                options={[
                  { value: '', label: 'ยังไม่กำหนด' },
                  ...generatePaymentCycleOptions(),
                ]}
                buttonClassName={inputCls}
              />
            )}
          />
        </div>

        {accountingStatuses && accountingStatuses.length > 0 && (
          <div>
            <label className={labelCls}>สถานะทางบัญชี</label>
            <Controller
              name="accountingStatus"
              control={control}
              render={({ field }) => (
                <FormListbox
                  value={accountingStatuses.some((s) => s.id === field.value) ? field.value ?? '' : ''}
                  onChange={(v) => field.onChange(v)}
                  options={[{ value: '', label: 'ไม่ระบุ' }, ...accountingStatuses.map((s) => ({ value: s.id, label: s.label }))]}
                  buttonClassName={inputCls}
                />
              )}
            />
          </div>
        )}

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
          className="px-6 py-2.5 text-sm font-medium text-white bg-brand rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-60 flex items-center gap-2"
        >
          {isLoading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          บันทึก
        </button>
      </div>
    </form>
  )
}
