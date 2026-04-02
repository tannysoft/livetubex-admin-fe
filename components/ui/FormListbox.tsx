'use client'

import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react'
import { ChevronDownIcon } from '@heroicons/react/20/solid'

export type FormListboxOption = { value: string; label: string }

type FormListboxProps = {
  value: string
  onChange: (next: string) => void
  options: FormListboxOption[]
  placeholder?: string
  /** Merged into ListboxButton (e.g. `w-28 shrink-0` for compact prefix) */
  buttonClassName?: string
  disabled?: boolean
  invalid?: boolean
}

export default function FormListbox({
  value,
  onChange,
  options,
  placeholder = 'เลือก…',
  buttonClassName = '',
  disabled = false,
  invalid = false,
}: FormListboxProps) {
  const selected = options.find((o) => o.value === value)
  const display = selected?.label ?? placeholder
  const isPlaceholder = value === ''

  return (
    <Listbox value={value} onChange={onChange} disabled={disabled} invalid={invalid}>
      <div className="relative">
        <ListboxButton
          className={[
            'relative flex w-full items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-sm shadow-sm transition-all',
            'focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727]',
            'data-disabled:cursor-not-allowed data-disabled:opacity-50',
            'data-invalid:border-red-400 data-invalid:focus:ring-red-200',
            isPlaceholder ? 'text-gray-500' : 'text-gray-900',
            buttonClassName,
          ].join(' ')}
        >
          <span className="block min-w-0 flex-1 truncate">{display}</span>
          <ChevronDownIcon className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
        </ListboxButton>
        <ListboxOptions
          anchor="bottom start"
          transition
          className="z-[200] max-h-60 w-[var(--button-width)] overflow-auto rounded-xl border border-gray-200 bg-white py-1 text-sm shadow-lg outline-1 -outline-offset-1 outline-black/5 [--anchor-gap:4px] origin-top transition duration-150 ease-out data-closed:scale-95 data-closed:opacity-0"
        >
          {options.map((opt) => (
            <ListboxOption
              key={opt.value === '' ? '__empty' : opt.value}
              value={opt.value}
              className="flex cursor-pointer select-none items-center px-3 py-2 text-gray-900 data-focus:bg-red-50 data-focus:outline-none data-selected:font-semibold data-selected:text-[#f73727]"
            >
              <span className="block truncate">{opt.label}</span>
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  )
}
