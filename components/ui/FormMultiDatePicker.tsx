'use client'

import { useMemo } from 'react'
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { DayPicker } from 'react-day-picker'
import { format, isValid, parse, startOfDay } from 'date-fns'
import { th } from 'date-fns/locale'
import { CalendarDaysIcon } from '@heroicons/react/20/solid'
import { dateRuns, formatDateRuns } from '@/lib/job-dates'

import 'react-day-picker/style.css'

/**
 * เลือกหลายวัน (เว้นวันได้) — กดวันในปฏิทินเพื่อเพิ่ม/เอาออก · ค่า = YYYY-MM-DD[] เรียงแล้ว
 * ปุ่มโชว์แบบย่อ "22–23, 25 ก.ย. 2569" · หน้าตาเดียวกับ FormDatePicker
 */
export default function FormMultiDatePicker({ value, onChange, placeholder = 'เลือกวัน', invalid = false, buttonClassName = '', id }: {
  value: string[]
  onChange: (days: string[]) => void
  placeholder?: string
  invalid?: boolean
  buttonClassName?: string
  id?: string
}) {
  const selected = useMemo(
    () => value.map((s) => parse(s, 'yyyy-MM-dd', new Date())).filter(isValid).map((d) => startOfDay(d)),
    [value],
  )
  const label = value.length ? formatDateRuns(dateRuns(value)) : placeholder

  return (
    <Popover className="relative">
      <PopoverButton
        type="button"
        id={id}
        className={[
          'relative flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-sm shadow-sm transition-all',
          'focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand',
          'data-invalid:border-red-400 data-invalid:focus:ring-red-200',
          value.length ? 'text-gray-900' : 'text-gray-500',
          buttonClassName,
        ].join(' ')}
        data-invalid={invalid || undefined}
      >
        <CalendarDaysIcon className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {value.length > 1 && <span className="shrink-0 text-xs text-gray-400">{value.length} วัน</span>}
      </PopoverButton>

      <PopoverPanel
        anchor="bottom start"
        transition
        className="z-[250] mt-1 rounded-xl border border-gray-200 bg-white p-2 shadow-lg outline-1 -outline-offset-1 outline-black/5 [--anchor-gap:4px] origin-top transition duration-150 ease-out data-closed:scale-95 data-closed:opacity-0"
      >
        {({ close }) => (
          <div className="flex flex-col gap-2">
            <DayPicker
              mode="multiple"
              selected={selected}
              onSelect={(days) => onChange((days ?? []).map((d) => format(d, 'yyyy-MM-dd')).sort())}
              locale={th}
              captionLayout="dropdown"
              fromYear={2000}
              toYear={2035}
              defaultMonth={selected[0] ?? new Date()}
              className="brand-day-picker"
            />
            <p className="px-2 text-[11px] text-gray-500">กดวันเพื่อเพิ่ม/เอาออก — เลือกได้หลายวัน เว้นวันได้</p>
            <div className="flex gap-2">
              {value.length > 0 && (
                <button type="button" onClick={() => onChange([])} className="flex-1 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">
                  ล้าง
                </button>
              )}
              <button type="button" onClick={() => close()} className="flex-1 rounded-lg bg-brand px-2 py-1.5 text-xs font-medium text-white hover:bg-brand-dark">
                เสร็จ
              </button>
            </div>
          </div>
        )}
      </PopoverPanel>
    </Popover>
  )
}
