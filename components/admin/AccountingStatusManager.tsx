'use client'

import { useState } from 'react'
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import { ACCOUNTING_COLOR_PRESETS, DEFAULT_ACCOUNTING_STATUSES, saveAccountingStatuses, type AccountingStatusDef } from '@/lib/job-accounting'
import { AccountingPill } from './AccountingStatusMenu'

/** modal แก้สถานะบัญชี (จากหน้างานถ่ายทอดสด) — ตัวแก้เดียวกับหน้า master data /admin/accounting-statuses */
export default function AccountingStatusManager({ statuses, usage, onClose, onSaved }: {
  statuses: AccountingStatusDef[]
  /** จำนวนงานต่อสถานะ — เตือนก่อนลบ */
  usage: Map<string, number>
  onClose: () => void
  onSaved: (list: AccountingStatusDef[]) => void
}) {
  return (
    <Modal isOpen onClose={onClose} title="สถานะทางบัญชี" size="md">
      <AccountingStatusEditor statuses={statuses} usage={usage} onSaved={onSaved} onCancel={onClose} />
    </Modal>
  )
}

/** แก้รายการสถานะบัญชี: ชื่อ, สี (ชุดสี + เลือกเอง), ลำดับ, เพิ่ม/ลบ — id คงเดิมตอนแก้ชื่อ งานที่ตั้งไว้จึงไม่หลุด */
export function AccountingStatusEditor({ statuses, usage, onSaved, onCancel }: {
  statuses: AccountingStatusDef[]
  usage: Map<string, number>
  onSaved: (list: AccountingStatusDef[]) => void
  /** ไม่ส่ง = ไม่มีปุ่มยกเลิก (หน้า master data) */
  onCancel?: () => void
}) {
  const [list, setList] = useState(statuses)
  const [colorOpen, setColorOpen] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const patch = (id: string, p: Partial<AccountingStatusDef>) => setList((l) => l.map((s) => (s.id === id ? { ...s, ...p } : s)))
  const move = (i: number, d: number) => setList((l) => { const n = [...l]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n })
  const remove = (s: AccountingStatusDef) => {
    const n = usage.get(s.id) ?? 0
    if (n > 0 && !confirm(`มี ${n} งานใช้สถานะ "${s.label}" อยู่ — ลบแล้วงานเหล่านั้นจะเป็น "ไม่ระบุ" ต่อไหม`)) return
    setList((l) => l.filter((x) => x.id !== s.id))
  }
  const add = () => {
    const color = ACCOUNTING_COLOR_PRESETS.find((c) => !list.some((s) => s.color === c)) ?? ACCOUNTING_COLOR_PRESETS[0]
    setList((l) => [...l, { id: Math.random().toString(36).slice(2, 10), label: '', color }])
  }

  const save = async () => {
    const clean = list.map((s) => ({ ...s, label: s.label.trim() }))
    if (clean.some((s) => !s.label)) { setErr('ใส่ชื่อสถานะให้ครบ'); return }
    setSaving(true)
    try {
      await saveAccountingStatuses(clean)
      setList(clean)
      onSaved(clean)
    } catch (e) {
      console.error(e)
      setErr('บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
      <div className="space-y-3">
        <ul className="space-y-2">
          {list.map((s, i) => (
            <li key={s.id} className="rounded-xl border border-gray-100 p-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setColorOpen(colorOpen === s.id ? null : s.id)}
                  className="w-8 h-8 rounded-lg shrink-0 ring-1 ring-black/10"
                  style={{ background: s.color }}
                  title="เปลี่ยนสี"
                />
                <input
                  value={s.label}
                  onChange={(e) => { patch(s.id, { label: e.target.value }); setErr('') }}
                  placeholder="ชื่อสถานะ เช่น วางบิลแล้ว"
                  className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                />
                <span className="hidden sm:inline text-[11px] text-gray-400 w-12 text-right tabular-nums">{usage.get(s.id) ?? 0} งาน</span>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="เลื่อนขึ้น"><ArrowUpIcon className="w-4 h-4" /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="เลื่อนลง"><ArrowDownIcon className="w-4 h-4" /></button>
                <button type="button" onClick={() => remove(s)} className="p-1 text-gray-400 hover:text-red-600" aria-label="ลบ"><TrashIcon className="w-4 h-4" /></button>
              </div>
              {colorOpen === s.id && (
                <div className="flex items-center gap-1.5 flex-wrap mt-2 pl-10">
                  {ACCOUNTING_COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => patch(s.id, { color: c })}
                      className={`w-6 h-6 rounded-full ring-offset-2 ${s.color === c ? 'ring-2 ring-gray-900' : ''}`}
                      style={{ background: c }}
                    />
                  ))}
                  <label className="relative w-6 h-6 rounded-full border border-dashed border-gray-300 flex items-center justify-center text-[10px] text-gray-500 cursor-pointer" title="เลือกสีเอง">
                    +
                    <input type="color" value={s.color} onChange={(e) => patch(s.id, { color: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" />
                  </label>
                  <span className="ml-2"><AccountingPill status={{ ...s, label: s.label || 'ตัวอย่าง' }} /></span>
                </div>
              )}
            </li>
          ))}
        </ul>
        <button type="button" onClick={add} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-gray-300 text-sm text-gray-600 hover:border-brand hover:text-brand">
          <PlusIcon className="w-4 h-4" /> เพิ่มสถานะ
        </button>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setList(DEFAULT_ACCOUNTING_STATUSES)} className="text-xs text-gray-400 hover:text-gray-700">คืนค่าเริ่มต้น</button>
          <div className="flex-1" />
          {onCancel && <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100">ยกเลิก</button>}
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-medium bg-brand text-white hover:bg-brand-dark disabled:opacity-40">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>
  )
}
