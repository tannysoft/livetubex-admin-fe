'use client'

import { useMemo, useState } from 'react'
import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react'
import { CheckIcon, ChevronDownIcon, UserIcon } from '@heroicons/react/20/solid'
import type { Freelancer } from '@/lib/types'

/** ค้นได้ทั้งชื่อจริง / ชื่อเล่น / ชื่อ LINE / เบอร์ — ไม่สนตัวพิมพ์และช่องว่าง */
const norm = (s?: string) => (s ?? '').toLowerCase().replace(/[\s-]+/g, '')

const labelOf = (f: Freelancer) => (f.nickname ? `${f.name} (${f.nickname})` : f.name)

/** เลือก freelancer แบบพิมพ์ค้นได้ — ใช้แทน dropdown ยาวๆ */
export default function FreelancerSelect({ freelancers, value, onChange, placeholder = 'พิมพ์ค้นหาชื่อ / ชื่อเล่น…' }: {
  freelancers: Freelancer[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const selected = useMemo(() => freelancers.find((f) => f.id === value) ?? null, [freelancers, value])

  // คนที่ยังใช้งานอยู่ขึ้นก่อน แล้วเรียงตามชื่อ
  const sorted = useMemo(
    () => [...freelancers].sort((a, b) =>
      Number(b.isActive !== false) - Number(a.isActive !== false) || a.name.localeCompare(b.name, 'th')),
    [freelancers],
  )
  const filtered = useMemo(() => {
    const q = norm(query)
    if (!q) return sorted
    return sorted.filter((f) => [f.name, f.nickname, f.lineDisplayName, f.phone].some((v) => norm(v).includes(q)))
  }, [sorted, query])

  return (
    <Combobox
      value={selected}
      onChange={(f: Freelancer | null) => { if (f) onChange(f.id) }}
      onClose={() => setQuery('')}
    >
      <div className="relative">
        <div className="relative flex items-center rounded-xl border border-gray-200 bg-white shadow-sm transition-all focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/30">
          <ComboboxInput
            className="w-full px-3 py-2.5 pr-10 rounded-xl text-sm bg-transparent focus:outline-none placeholder:text-gray-400"
            displayValue={(f: Freelancer | null) => (f ? labelOf(f) : '')}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
          />
          <ComboboxButton className="absolute right-2 inset-y-0 flex items-center px-1.5 text-gray-400 hover:text-gray-600">
            <ChevronDownIcon className="w-4 h-4" />
          </ComboboxButton>
        </div>

        <ComboboxOptions
          transition
          anchor="bottom start"
          className="z-[200] max-h-72 w-[var(--input-width)] overflow-auto rounded-xl border border-gray-200 bg-white py-1 text-sm shadow-lg [--anchor-gap:4px] origin-top transition duration-150 ease-out data-closed:scale-95 data-closed:opacity-0"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-gray-400 text-xs">ไม่พบชื่อ &quot;{query.trim()}&quot;</div>
          ) : (
            filtered.map((f) => (
              <ComboboxOption
                key={f.id}
                value={f}
                className="group flex items-center gap-3 px-3 py-2 cursor-pointer data-focus:bg-brand-soft"
              >
                {f.linePictureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.linePictureUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0 bg-gray-100" />
                ) : (
                  <span className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <UserIcon className="w-4 h-4 text-gray-400" />
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">
                    {f.name}
                    {f.nickname && <span className="text-gray-500 font-normal"> ({f.nickname})</span>}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {[f.position, f.lineDisplayName && `LINE: ${f.lineDisplayName}`, f.isActive === false && 'ปิดใช้งาน']
                      .filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
                <CheckIcon className="w-4 h-4 text-brand invisible group-data-selected:visible flex-shrink-0" />
              </ComboboxOption>
            ))
          )}
        </ComboboxOptions>
      </div>
    </Combobox>
  )
}
