'use client'

import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { ChevronDownIcon, Cog6ToothIcon, CheckIcon } from '@heroicons/react/20/solid'
import { accountingPillStyle, type AccountingStatusDef } from '@/lib/job-accounting'

/** ป้ายสถานะบัญชี (สีตามที่ตั้ง) — id ที่ถูกลบไปแล้ว = ไม่ระบุ */
export function AccountingPill({ status, placeholder = 'ไม่ระบุ' }: { status?: AccountingStatusDef; placeholder?: string }) {
  if (!status) return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap bg-gray-50 text-gray-400 border border-dashed border-gray-200">{placeholder}</span>
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap" style={accountingPillStyle(status.color)}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: status.color }} />
      {status.label}
    </span>
  )
}

/** กดป้ายแล้วเลือกสถานะใหม่ได้ทันที + ลิงก์ไปจัดการรายการสถานะ */
export default function AccountingStatusMenu({ statuses, value, onChange, onManage, disabled }: {
  statuses: AccountingStatusDef[]
  value?: string
  onChange: (id: string) => void
  onManage?: () => void
  disabled?: boolean
}) {
  const current = statuses.find((s) => s.id === value)
  return (
    <Menu>
      <MenuButton disabled={disabled} className="inline-flex items-center gap-0.5 rounded-full hover:brightness-95 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" title="เปลี่ยนสถานะบัญชี">
        <AccountingPill status={current} />
        <ChevronDownIcon className="w-3.5 h-3.5 text-gray-400" />
      </MenuButton>
      <MenuItems anchor="bottom start" className="z-50 mt-1 w-56 rounded-xl bg-white shadow-lg ring-1 ring-black/5 p-1 text-sm focus:outline-none">
        {statuses.map((s) => (
          <MenuItem key={s.id}>
            <button onClick={() => onChange(s.id)} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left data-[focus]:bg-gray-50">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="flex-1 truncate text-gray-800">{s.label}</span>
              {s.id === value && <CheckIcon className="w-4 h-4 text-gray-500" />}
            </button>
          </MenuItem>
        ))}
        <MenuItem>
          <button onClick={() => onChange('')} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-gray-500 data-[focus]:bg-gray-50">
            <span className="w-3 h-3 rounded-full shrink-0 border border-dashed border-gray-300" />
            <span className="flex-1">ไม่ระบุ</span>
            {!current && <CheckIcon className="w-4 h-4 text-gray-500" />}
          </button>
        </MenuItem>
        {onManage && (
          <>
            <div className="my-1 border-t border-gray-100" />
            <MenuItem>
              <button onClick={onManage} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-gray-600 data-[focus]:bg-gray-50">
                <Cog6ToothIcon className="w-4 h-4" /> แก้ชื่อ/สีสถานะ…
              </button>
            </MenuItem>
          </>
        )}
      </MenuItems>
    </Menu>
  )
}
