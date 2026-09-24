'use client'

import { useState } from 'react'
import { MagnifyingGlassIcon, CheckIcon } from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import FormListbox from '@/components/ui/FormListbox'
import { CATEGORY_COLORS, EQUIPMENT_CATEGORIES, categoryLabel } from '@/lib/equipment/constants'
import { formatCurrency } from '@/lib/utils'
import type { Equipment } from '@/lib/types'
import type { Usage } from '@/lib/equipment/availability'

interface EquipmentPickerProps {
  isOpen: boolean
  onClose: () => void
  equipment: Equipment[]
  /** equipmentId ที่อยู่ในแผนแล้ว — โชว์ป้ายบอก ไม่ให้เพิ่มซ้ำ */
  existingIds: Set<string>
  /** จำนวนที่ถูกใช้ในแผนอื่นที่วันชนกัน (equipmentId → usage) — ไม่ส่ง = ไม่เช็ก */
  usage?: Map<string, Usage>
  /** แผนนี้ไม่มีวันที่ → เช็กชนไม่ได้ แสดงคำเตือน */
  noDate?: boolean
  onConfirm: (picked: { equipment: Equipment; quantity: number }[]) => void
  /** หัว modal — ไม่ส่ง = หัวปกติ */
  title?: string
  /** หมวดที่เลือกไว้ตอนเปิด (เช่น 'lens' ตอนเลือกเลนส์ให้กล้อง) — เปลี่ยนต้อง remount ด้วย key */
  initialCategory?: string
  /**
   * จำนวนที่แผนนี้ใช้อยู่แล้วต่อ equipmentId — ส่งมา = เลือกของที่อยู่ในแผนแล้วได้อีกแถว (เลนส์รุ่นเดียวกันคนละกล้อง)
   * โดยนับรวมกับที่ใช้แล้วตอนเช็กว่าง
   */
  inPlanQty?: Map<string, number>
  /** แท็บที่มา + คำค้นตอนเปิด (เช่น เปลี่ยนแถวของเช่าที่พิมพ์เอง → เปิดแท็บของเช่า ค้นชื่อเดิม) */
  initialOwnership?: '' | 'owned' | 'rental' | 'partner'
  initialSearch?: string
  /** เลือกได้ชิ้นเดียว (แทนแถวเดิม) — กดแล้วยืนยันทันที */
  single?: boolean
  /** ปุ่ม "เช่าเพิ่มนอกสต็อก" — ส่งคำค้นเป็นชื่อตั้งต้น (ไม่ส่ง = ไม่มีปุ่ม) */
  onExternal?: (name: string) => void
}

export default function EquipmentPicker({ isOpen, onClose, equipment, existingIds, usage, noDate, onConfirm, title, initialCategory = '', inPlanQty, initialOwnership = '', initialSearch = '', single, onExternal }: EquipmentPickerProps) {
  const [search, setSearch] = useState(initialSearch)
  const [category, setCategory] = useState(initialCategory)
  const [ownership, setOwnership] = useState<'' | 'owned' | 'rental' | 'partner'>(initialOwnership)
  const [picked, setPicked] = useState<Record<string, number>>({})

  const keyword = search.trim().toLowerCase()
  const list = equipment.filter((it) => {
    if (it.status === 'retired') return false
    if (category && it.category !== category) return false
    if (ownership && (it.ownership ?? 'owned') !== ownership) return false
    if (!keyword) return true
    return [it.code, it.name, it.brand, it.model, it.serialNumber, it.rentalVendor, it.partnerName].some((v) => v?.toLowerCase().includes(keyword))
  })

  const availableOf = (it: Equipment) => it.quantity - (usage?.get(it.id)?.used ?? 0) - (inPlanQty?.get(it.id) ?? 0)

  const toggle = (it: Equipment) => {
    if (single) {
      onConfirm([{ equipment: it, quantity: 1 }])
      close()
      return
    }
    setPicked((prev) => {
      const next = { ...prev }
      if (next[it.id]) delete next[it.id]
      else next[it.id] = 1
      return next
    })
  }

  const close = () => {
    setPicked({})
    setSearch('')
    onClose()
  }

  const confirm = () => {
    onConfirm(
      equipment.filter((e) => picked[e.id]).map((e) => ({ equipment: e, quantity: picked[e.id] })),
    )
    close()
  }

  const count = Object.keys(picked).length

  return (
    <Modal isOpen={isOpen} onClose={close} title={title ?? 'เพิ่มอุปกรณ์ — ของบริษัท / ของเช่า / พาร์ทเนอร์'} size="2xl">
      <div className="space-y-3">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {([['', 'ทั้งหมด'], ['owned', 'ของบริษัท'], ['rental', 'ของเช่า'], ['partner', 'พาร์ทเนอร์']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setOwnership(key)} className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${ownership === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ, รหัส, รุ่น"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
          </div>
          <div className="w-52">
            <FormListbox value={category} onChange={setCategory} options={[{ value: '', label: 'ทุกหมวด' }, ...EQUIPMENT_CATEGORIES]} />
          </div>
        </div>

        {noDate && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">แผนนี้ยังไม่มีวันที่ — ระบบเช็กไม่ได้ว่าของชนกับงานอื่นหรือไม่ ใส่วันที่ก่อนเพื่อให้เตือน</p>
        )}
        <ul className="border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-[50vh] overflow-y-auto">
          {list.length === 0 && <li className="py-10 text-center text-sm text-gray-400">ไม่พบอุปกรณ์</li>}
          {list.map((it) => {
            const inPlan = !inPlanQty && existingIds.has(it.id)
            const u = usage?.get(it.id)
            const available = availableOf(it)
            const usedHere = inPlanQty?.get(it.id) ?? 0
            const blocked = !inPlan && (!!u || usedHere > 0) && available <= 0
            const selected = !!picked[it.id]
            return (
              <li key={it.id} className={`flex items-center gap-3 px-3 py-2.5 ${inPlan || blocked ? 'opacity-60' : 'cursor-pointer hover:bg-gray-50'}`} onClick={() => !inPlan && !blocked && toggle(it)}>
                <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${selected ? 'bg-brand border-brand text-white' : 'border-gray-300'}`}>
                  {selected && <CheckIcon className="w-3.5 h-3.5" />}
                </span>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CATEGORY_COLORS[it.category] }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {it.name}
                    {it.ownership === 'rental' && <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-medium">ของเช่า</span>}
                    {it.ownership === 'partner' && <span className="ml-2 px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 text-[10px] font-medium">พาร์ทเนอร์</span>}
                    {it.status === 'repair' && <span className="ml-2 px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 text-[10px] font-medium">ส่งซ่อม</span>}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {it.code} · {categoryLabel(it.category)}
                    {it.ownership === 'rental'
                      ? ` · ${it.rentalVendor || 'ไม่ระบุผู้ให้เช่า'} · ${formatCurrency(it.rentalRate ?? 0)}/วัน`
                      : it.ownership === 'partner'
                        ? ` · ${it.partnerName || 'ไม่ระบุพาร์ทเนอร์'}${it.rentalRate ? ` · ${formatCurrency(it.rentalRate)}/วัน` : ''}`
                        : it.storageLocation ? ` · ${it.storageLocation}` : ''}
                  </p>
                  {u && (
                    <p className={`text-[11px] mt-0.5 ${blocked ? 'text-red-600' : 'text-amber-700'}`}>
                      {blocked ? 'ไม่ว่าง — ' : `ว่าง ${available}/${it.quantity} — `}
                      ใช้อยู่ในงานวันชนกัน: {u.plans.map((p) => `${p.title}${p.quantity > 1 ? ` ×${p.quantity}` : ''}`).join(', ')}
                    </p>
                  )}
                  {usedHere > 0 && (
                    <p className={`text-[11px] mt-0.5 ${blocked ? 'text-red-600' : 'text-gray-500'}`}>ใช้ในแผนนี้แล้ว {usedHere} ชิ้น{blocked ? ' — ไม่เหลือ' : ''}</p>
                  )}
                </div>
                {inPlan ? (
                  <span className="text-xs text-gray-400 shrink-0">อยู่ในรายการแล้ว</span>
                ) : blocked ? (
                  <span className="text-xs text-red-600 font-medium shrink-0">{u ? 'ชนงานอื่น' : 'ไม่เหลือ'}</span>
                ) : selected && it.quantity > 1 ? (
                  <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="number"
                      min={1}
                      max={available}
                      value={picked[it.id]}
                      onChange={(e) => {
                        const n = Math.max(1, Math.min(available, Math.floor(Number(e.target.value)) || 1))
                        setPicked((prev) => ({ ...prev, [it.id]: n }))
                      }}
                      className="w-16 px-2 py-1 rounded-lg border border-gray-200 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                    />
                    <span className="text-xs text-gray-400">/ {available}</span>
                  </div>
                ) : it.quantity > 1 ? (
                  <span className="text-xs text-gray-400 shrink-0">ว่าง {available}</span>
                ) : null}
              </li>
            )
          })}
        </ul>

        {single ? (
          <div className="flex items-center justify-between pt-1">
            <p className="text-sm text-gray-500">กดรายการเพื่อแทนแถวเดิม — จำนวน ปลายทาง การจับคู่กล้อง และหมายเหตุคงเดิม</p>
            <button onClick={close} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">ยกเลิก</button>
          </div>
        ) : (
        <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm text-gray-500">เลือกแล้ว {count} รายการ</p>
            {onExternal && (
              <button
                type="button"
                onClick={() => { onExternal(search.trim()); close() }}
                className="px-3 py-1.5 rounded-lg border border-dashed border-amber-400 text-sm font-medium text-amber-700 hover:bg-amber-50"
              >
                + เช่าเพิ่มนอกสต็อก{search.trim() ? ` “${search.trim()}”` : ''}
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={close} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">ยกเลิก</button>
            <button onClick={confirm} disabled={count === 0} className="px-5 py-2.5 bg-brand text-white text-sm font-medium rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50">
              เพิ่มเข้ารายการ
            </button>
          </div>
        </div>
        )}
      </div>
    </Modal>
  )
}
