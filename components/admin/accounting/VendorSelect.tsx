'use client'

import { useEffect, useMemo, useState } from 'react'
import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react'
import { ChevronDownIcon, PlusIcon, BuildingOffice2Icon, UserIcon, UsersIcon } from '@heroicons/react/24/outline'
import type { Vendor, VendorType } from '@/lib/types'
import { getActiveVendors } from '@/lib/accounting/vendors'

interface Props {
  value: string | null
  onChange: (vendor: Vendor | null) => void
  onCreateNew?: () => void
  reloadKey?: number
  invalid?: boolean
  allowEmpty?: boolean
}

const typeIcon: Record<VendorType, typeof BuildingOffice2Icon> = {
  company: BuildingOffice2Icon,
  individual: UserIcon,
  freelancer: UsersIcon,
}

export default function VendorSelect({ value, onChange, onCreateNew, reloadKey, invalid, allowEmpty }: Props) {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    getActiveVendors().then((list) => {
      if (alive) {
        setVendors(list.sort((a, b) => a.name.localeCompare(b.name, 'th')))
        setLoading(false)
      }
    })
    return () => { alive = false }
  }, [reloadKey])

  const selected = useMemo(() => vendors.find((v) => v.id === value) ?? null, [vendors, value])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return vendors
    return vendors.filter((v) =>
      v.name.toLowerCase().includes(q) ||
      v.code.toLowerCase().includes(q) ||
      (v.taxId ?? '').includes(q),
    )
  }, [vendors, query])

  return (
    <Combobox value={selected} onChange={(v: Vendor | null) => onChange(v)} onClose={() => setQuery('')}>
      <div className="relative">
        <div className={`relative flex items-center rounded-xl border bg-white shadow-sm transition-all ${
          invalid ? 'border-red-400' : 'border-gray-200 focus-within:border-[#f73727] focus-within:ring-2 focus-within:ring-[#f73727]/30'
        }`}>
          <ComboboxInput
            className="w-full px-3 py-2.5 pr-10 rounded-xl text-sm bg-transparent focus:outline-none placeholder:text-gray-400"
            displayValue={(v: Vendor | null) => v ? `${v.name} (${v.code})` : ''}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={loading ? 'กำลังโหลด...' : allowEmpty ? 'เลือกผู้ขาย (ไม่บังคับ)' : 'ค้นหาผู้ขาย'}
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
              เพิ่มผู้ขายใหม่
            </button>
          )}
          {allowEmpty && (
            <ComboboxOption value={null} className="px-3 py-2.5 cursor-pointer text-gray-500 italic data-focus:bg-gray-50">
              — ไม่ระบุผู้ขาย —
            </ComboboxOption>
          )}

          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-gray-400 text-xs">ไม่พบผู้ขาย</div>
          ) : (
            filtered.map((v) => {
              const Icon = typeIcon[v.type]
              return (
                <ComboboxOption
                  key={v.id}
                  value={v}
                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer data-focus:bg-red-50 data-selected:bg-red-50"
                >
                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{v.name}</div>
                    <div className="text-xs text-gray-500 flex items-center gap-2 truncate">
                      <span className="font-mono">{v.code}</span>
                      {v.taxId && <span>· {v.taxId}</span>}
                    </div>
                  </div>
                </ComboboxOption>
              )
            })
          )}
        </ComboboxOptions>
      </div>
    </Combobox>
  )
}
