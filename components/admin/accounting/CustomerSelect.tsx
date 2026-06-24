'use client'

import { useEffect, useMemo, useState } from 'react'
import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react'
import { ChevronDownIcon, PlusIcon, BuildingOffice2Icon, UserIcon } from '@heroicons/react/24/outline'
import type { Customer } from '@/lib/types'
import { getActiveCustomers } from '@/lib/accounting/customers'

interface Props {
  value: string | null
  onChange: (customer: Customer | null) => void
  onCreateNew?: () => void
  reloadKey?: number   // bump to force reload (after create-new)
  invalid?: boolean
}

export default function CustomerSelect({ value, onChange, onCreateNew, reloadKey, invalid }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    getActiveCustomers().then((list) => {
      if (alive) {
        setCustomers(list.sort((a, b) => a.name.localeCompare(b.name, 'th')))
        setLoading(false)
      }
    })
    return () => { alive = false }
  }, [reloadKey])

  const selected = useMemo(() => customers.find((c) => c.id === value) ?? null, [customers, value])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return customers
    return customers.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      (c.taxId ?? '').includes(q),
    )
  }, [customers, query])

  return (
    <Combobox
      value={selected}
      onChange={(c: Customer | null) => onChange(c)}
      onClose={() => setQuery('')}
    >
      <div className="relative">
        <div className={`relative flex items-center rounded-xl border bg-white shadow-sm transition-all ${
          invalid ? 'border-red-400' : 'border-gray-200 focus-within:border-[#f73727] focus-within:ring-2 focus-within:ring-[#f73727]/30'
        }`}>
          <ComboboxInput
            className="w-full px-3 py-2.5 pr-10 rounded-xl text-sm bg-transparent focus:outline-none placeholder:text-gray-400"
            displayValue={(c: Customer | null) => c ? `${c.name}${c.code ? ` (${c.code})` : ''}` : ''}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={loading ? 'กำลังโหลด...' : 'ค้นหาลูกค้า หรือเลือกจากรายการ'}
            disabled={loading}
          />
          <ComboboxButton className="absolute right-2 inset-y-0 flex items-center px-1.5 text-gray-400 hover:text-gray-600">
            <ChevronDownIcon className="w-4 h-4" />
          </ComboboxButton>
        </div>

        <ComboboxOptions
          anchor="bottom start"
          className="z-[200] max-h-72 w-[var(--input-width)] overflow-auto rounded-xl border border-gray-200 bg-white py-1 text-sm shadow-lg [--anchor-gap:4px] origin-top transition duration-150 ease-out data-closed:scale-95 data-closed:opacity-0"
        >
          {onCreateNew && (
            <button
              type="button"
              onClick={onCreateNew}
              className="w-full flex items-center gap-2 px-3 py-2 text-[#f73727] hover:bg-red-50 transition-colors border-b border-gray-100"
            >
              <PlusIcon className="w-4 h-4" />
              เพิ่มลูกค้าใหม่
            </button>
          )}

          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-gray-400 text-xs">ไม่พบลูกค้าที่ตรงกับคำค้น</div>
          ) : (
            filtered.map((c) => (
              <ComboboxOption
                key={c.id}
                value={c}
                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer data-focus:bg-red-50 data-selected:bg-red-50"
              >
                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  {c.type === 'company'
                    ? <BuildingOffice2Icon className="w-4 h-4 text-gray-500" />
                    : <UserIcon className="w-4 h-4 text-gray-500" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">{c.name}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-2 truncate">
                    <span className="font-mono">{c.code}</span>
                    {c.taxId && <span>· {c.taxId}</span>}
                  </div>
                </div>
              </ComboboxOption>
            ))
          )}
        </ComboboxOptions>
      </div>
    </Combobox>
  )
}
