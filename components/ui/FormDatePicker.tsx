'use client'

import { useMemo } from 'react'
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { DayPicker } from 'react-day-picker'
import { format, isValid, parse, startOfDay } from 'date-fns'
import { th } from 'date-fns/locale'
import { CalendarDaysIcon } from '@heroicons/react/20/solid'
import type { Matcher } from 'react-day-picker'

import 'react-day-picker/style.css'

function fromYmdLocal(s: string): Date | undefined {
  if (!s) return undefined
  const d = parse(s, 'yyyy-MM-dd', new Date())
  return isValid(d) ? startOfDay(d) : undefined
}

function toYmdLocal(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export type FormDatePickerProps = {
  value: string
  onChange: (isoYmd: string) => void
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
  /** รวมเข้ากับปุ่ม (เช่น class เดียวกับ input) */
  buttonClassName?: string
  id?: string
  /** ให้เลือกวันที่ก่อน minDate ไม่ได้ */
  minDate?: Date | string
  /** แสดงปุ่มล้างค่า (ใช้กับฟิลด์ไม่บังคับ) */
  allowClear?: boolean
}

export default function FormDatePicker({
  value,
  onChange,
  placeholder = 'เลือกวันที่',
  disabled = false,
  invalid = false,
  buttonClassName = '',
  id,
  minDate,
  allowClear = false,
}: FormDatePickerProps) {
  const selected = useMemo(() => fromYmdLocal(value), [value])

  const minD = useMemo(() => {
    if (minDate == null || minDate === '') return undefined
    if (typeof minDate === 'string') return fromYmdLocal(minDate)
    return startOfDay(minDate)
  }, [minDate])

  const disabledMatchers = useMemo(() => {
    const list: Matcher[] = []
    if (minD) list.push({ before: minD })
    return list
  }, [minD])

  const label = selected ? format(selected, 'd MMM yyyy', { locale: th }) : placeholder

  return (
    <Popover className="relative">
      <PopoverButton
        type="button"
        disabled={disabled}
        id={id}
        className={[
          'relative flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-sm shadow-sm transition-all',
          'focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727]',
          'data-disabled:cursor-not-allowed data-disabled:opacity-50',
          'data-invalid:border-red-400 data-invalid:focus:ring-red-200',
          selected ? 'text-gray-900' : 'text-gray-500',
          buttonClassName,
        ].join(' ')}
        data-invalid={invalid || undefined}
      >
        <CalendarDaysIcon className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </PopoverButton>

      <PopoverPanel
        anchor="bottom start"
        transition
        className="z-[250] mt-1 rounded-xl border border-gray-200 bg-white p-2 shadow-lg outline-1 -outline-offset-1 outline-black/5 [--anchor-gap:4px] origin-top transition duration-150 ease-out data-closed:scale-95 data-closed:opacity-0"
      >
        {({ close }) => (
          <div className="flex flex-col gap-2">
            <DayPicker
              mode="single"
              required={false}
              selected={selected}
              onSelect={(d) => {
                onChange(d ? toYmdLocal(d) : '')
                close()
              }}
              locale={th}
              captionLayout="dropdown"
              fromYear={2000}
              toYear={2035}
              defaultMonth={selected ?? new Date()}
              disabled={disabledMatchers.length ? disabledMatchers : undefined}
              className="livetube-day-picker"
            />
            {allowClear && selected && (
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  close()
                }}
                className="rounded-lg px-2 py-1.5 text-center text-xs font-medium text-gray-600 hover:bg-gray-100"
              >
                ล้างวันที่
              </button>
            )}
          </div>
        )}
      </PopoverPanel>
    </Popover>
  )
}
