'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { ArrowRightIcon, TrashIcon, CubeIcon, PlusIcon, LinkSlashIcon, CalendarDaysIcon } from '@heroicons/react/24/outline'
import FormListbox from '@/components/ui/FormListbox'
import FormCheckbox from '@/components/ui/FormCheckbox'
import SuggestInput from '@/components/ui/SuggestInput'
import { CATEGORY_COLORS, EQUIPMENT_CATEGORIES } from '@/lib/equipment/constants'
import { ORIGIN_LABEL, isRentalItem, itemCost, itemOrigin } from '@/lib/equipment/rental-cost'
import { clipItemRange, daysIn, planRange } from '@/lib/equipment/availability'
import { formatCurrency, formatDatePill } from '@/lib/utils'
import type { EquipmentCategory, PlanItem } from '@/lib/types'
import { camTag, sortByCam } from '@/lib/equipment/item-groups'

interface PlanItemsTableProps {
  items: PlanItem[]
  onChange: (items: PlanItem[]) => void
  /** ผู้ให้เช่า/พาร์ทเนอร์ที่รู้จัก (จากคลัง + ผู้ขายในบัญชี) — autocomplete ช่องผู้รับเงิน */
  vendorOptions?: string[]
  /** ที่เก็บ/ปลายทางที่รู้จัก (จากคลัง) — เพิ่มจากที่พิมพ์ในแผนนี้ */
  locationOptions?: string[]
  /** กด "+ เลนส์" ที่แถวกล้อง → เปิด picker เลือกเลนส์มาจับคู่ (ไม่ส่ง = ไม่มีปุ่ม) */
  onAddLens?: (camera: PlanItem) => void
  /** วันงาน — งานหลายวันถึงจะกำหนด "วันที่ใช้" รายแถวได้ (ไม่ล็อกคิวเกินวันที่ใช้จริง) */
  planDate?: string
  planEndDate?: string
}

const cellInput = 'w-full px-2 py-1 rounded-lg border border-transparent bg-transparent text-sm hover:border-gray-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand'

/** รายการจัดของ — แก้ในตารางได้ทุกช่อง จัดกลุ่มตามหมวด */
export default function PlanItemsTable({ items, onChange, vendorOptions = [], locationOptions = [], onAddLens, planDate, planEndDate }: PlanItemsTableProps) {
  const [bulkTo, setBulkTo] = useState('')
  // ── วันที่ใช้รายแถว (เฉพาะงานหลายวัน) ──
  const pr = planRange({ date: planDate, endDate: planEndDate })
  const planDays = pr ? daysIn(pr) : []
  const multiDay = planDays.length > 1
  const [dateOpen, setDateOpen] = useState<Set<string>>(() => new Set())
  const toggleDate = (id: string) =>
    setDateOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const rangeOf = (it: PlanItem) => (pr ? clipItemRange(it, pr) : null)
  const isPartial = (it: PlanItem) => { const r = rangeOf(it); return !!r && !!pr && (r.start !== pr.start || r.end !== pr.end) }
  const rangeText = (it: PlanItem) => {
    const r = rangeOf(it)
    if (!r) return ''
    return r.start === r.end ? `เฉพาะ ${formatDatePill(r.start)}` : `${formatDatePill(r.start)} – ${formatDatePill(r.end)}`
  }
  /** ตั้งวันที่ใช้ — ทั้งงาน = ล้างค่า · ของที่ติดกล้อง (ที่วันตรงกับกล้องเดิม) เปลี่ยนตาม · ของเช่า: จำนวนวันเช่าตามวันที่ใช้ */
  const setItemDates = (it: PlanItem, from: string, to: string) => {
    if (!pr) return
    const start = from < pr.start ? pr.start : from
    const end = to < start ? start : to > pr.end ? pr.end : to
    const whole = start === pr.start && end === pr.end
    const prev = rangeOf(it)
    const days = daysIn({ start, end }).length
    const apply = (x: PlanItem): PlanItem => ({
      ...x,
      useFrom: whole ? undefined : start,
      useTo: whole ? undefined : end,
      ...(isRentalItem(x) && !x.expenseId ? { rentalDays: days } : {}),
    })
    onChange(items.map((x) => {
      if (x.id === it.id) return apply(x)
      const r = rangeOf(x)
      if (x.attachedTo === it.id && prev && r && r.start === prev.start && r.end === prev.end) return apply(x)
      return x
    }))
  }
  /** แถวพาร์ทเนอร์ที่กดเปิดแถวต้นทุนไว้ (ปกติพับเพราะไม่คิดเงิน) */
  const [costOpen, setCostOpen] = useState<Set<string>>(() => new Set())

  /** แถวต้นทุนโชว์เมื่อ: ของเช่า, หรือพาร์ทเนอร์ที่ยังไม่ใส่ชื่อ/มีค่าใช้จ่าย/ลงบัญชีแล้ว/กดเปิดเอง */
  // แถวต้นทุนพับไว้ใต้ป้าย (กดป้ายเพื่อเปิด) — เปิดค้างเองเฉพาะที่ยังกรอกไม่ครบ: ไม่มีชื่อผู้ให้เช่า/พาร์ทเนอร์ หรือของเช่าที่ยังไม่ใส่ราคา
  const costIncomplete = (it: PlanItem) =>
    !it.rentalVendor?.trim() || (itemOrigin(it) === 'rental' && it.unitCost == null)
  const showCostRow = (it: PlanItem) => isRentalItem(it) && (costIncomplete(it) || costOpen.has(it.id))
  const toggleCost = (id: string) =>
    setCostOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const patch = (id: string, data: Partial<PlanItem>) =>
    onChange(items.map((it) => (it.id === id ? { ...it, ...data } : it)))

  // ── จับคู่ (เลนส์ → กล้อง) ── แถวลูกโชว์ใต้แถวแม่ · แม่หายไปแล้ว = กลับเป็นแถวปกติในหมวดของตัวเอง
  const ids = new Set(items.map((i) => i.id))
  const isChild = (it: PlanItem) => !!it.attachedTo && it.attachedTo !== it.id && ids.has(it.attachedTo)
  const childrenOf = (id: string) => items.filter((c) => c.attachedTo === id && isChild(c))
  const cameras = items.filter((i) => i.category === 'camera' && !isChild(i))
  const cameraLabel = (c: PlanItem) => `${camTag(c) ? `${camTag(c)} · ` : ''}${c.name || 'กล้อง'}${c.code ? ` (${c.code})` : ''}`

  const attach = (it: PlanItem, parentId: string) => {
    const parent = items.find((p) => p.id === parentId)
    // ติดกล้องไหน ปลายทางตามกล้องนั้น (ถ้ายังไม่ได้ตั้งเอง)
    patch(it.id, parentId
      ? { attachedTo: parentId, ...(!it.toLocation && parent?.toLocation ? { toLocation: parent.toLocation } : {}) }
      : { attachedTo: undefined })
  }

  /** เปลี่ยนปลายทางกล้อง → เลนส์ที่ติดอยู่ (ปลายทางว่างหรือเดิมตรงกับกล้อง) ย้ายตาม */
  const setToLocation = (it: PlanItem, to: string) => {
    const prev = it.toLocation ?? ''
    onChange(items.map((x) => {
      if (x.id === it.id) return { ...x, toLocation: to }
      if (x.attachedTo === it.id && (x.toLocation ?? '') === prev) return { ...x, toLocation: to }
      return x
    }))
  }

  /** ลบแถว — ของที่ติดอยู่ยังอยู่ในแผน แค่ถอดคู่ */
  const remove = (id: string) =>
    onChange(items.filter((x) => x.id !== id).map((x) => (x.attachedTo === id ? { ...x, attachedTo: undefined } : x)))

  const locations = [...new Set([...items.flatMap((i) => [i.fromLocation, i.toLocation]).filter((l): l is string => !!l), ...locationOptions])].sort()
  const vendors = [...new Set([...items.map((i) => i.rentalVendor).filter((v): v is string => !!v), ...vendorOptions])].sort()
  const emptyToCount = items.filter((i) => !i.toLocation).length

  const applyBulk = () => {
    const to = bulkTo.trim()
    if (!to) return
    onChange(items.map((it) => (it.toLocation ? it : { ...it, toLocation: to })))
    setBulkTo('')
  }

  if (items.length === 0) {
    return (
      <div className="py-16 text-center">
        <CubeIcon className="w-10 h-10 text-gray-300 mx-auto" />
        <p className="text-gray-400 text-sm mt-3">ยังไม่มีอุปกรณ์ในแผนนี้</p>
        <p className="text-gray-400 text-xs mt-1">กด “เพิ่มจากคลัง” เพื่อเลือกของที่จะใช้</p>
      </div>
    )
  }

  const groups = EQUIPMENT_CATEGORIES
    .map((c) => ({ ...c, rows: sortByCam(items.filter((i) => i.category === c.value && !isChild(i))) }))
    .filter((g) => g.rows.length > 0)

  /** ใต้ชื่อ: วันที่ใช้ — ใช้ไม่เต็มงาน = ป้ายวัน (กดแก้) · เต็มงาน = ลิงก์จางๆ โผล่ตอนชี้แถว */
  const dateControl = (it: PlanItem) => {
    if (!multiDay) return null
    const partial = isPartial(it)
    return (
      <button
        type="button"
        onClick={() => toggleDate(it.id)}
        className={partial
          ? 'inline-flex items-center gap-1 px-1.5 py-px rounded bg-violet-100 text-violet-700 text-[11px] font-medium hover:bg-violet-200'
          : `inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-700 ${dateOpen.has(it.id) ? '' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
      >
        <CalendarDaysIcon className="w-3 h-3" /> {partial ? rangeText(it) : 'ใช้ทั้งงาน — กำหนดวัน'}
      </button>
    )
  }

  /** ใต้ชื่อ: กล้อง = ปุ่มเพิ่มเลนส์ · เลนส์ที่ยังไม่จับคู่ = เลือกกล้อง · แถวที่ติดกล้องอยู่ = ปุ่มถอดคู่ */
  const pairControls = (it: PlanItem, child: boolean) => {
    if (child) {
      return (
        <button type="button" onClick={() => attach(it, '')} className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 focus:opacity-100">
          <LinkSlashIcon className="w-3 h-3" /> ถอดออกจากกล้อง
        </button>
      )
    }
    if (it.category === 'camera' && onAddLens) {
      const lenses = childrenOf(it.id).filter((c) => c.category === 'lens').length
      return (
        <button type="button" onClick={() => onAddLens(it)} className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline">
          <PlusIcon className="w-3 h-3" /> {lenses ? 'เพิ่มเลนส์' : 'เลือกเลนส์'}
        </button>
      )
    }
    // ชุดกล้อง: เลนส์ + ขาตั้ง/gimbal + converter ฝั่งกล้อง + ส่งภาพไร้สาย จับคู่กับกล้องได้
    if (['lens', 'support', 'converter', 'wireless'].includes(it.category) && cameras.length > 0) {
      return (
        <div className="w-52">
          <FormListbox
            value=""
            onChange={(v) => v && attach(it, v)}
            options={[{ value: '', label: 'ยังไม่จับคู่ — ใส่กับกล้อง…' }, ...cameras.map((c) => ({ value: c.id, label: cameraLabel(c) }))]}
            buttonClassName="!py-0.5 !text-xs !shadow-none"
          />
        </div>
      )
    }
    return null
  }

  /** บรรทัดรองใต้ชื่อ: รหัส · จับคู่กล้อง · วันที่ใช้ — รวมบรรทัดเดียว แถวไม่สูงเกิน */
  const metaLine = (it: PlanItem, child: boolean) => (
    <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap mt-0.5 min-h-[18px]">
      {it.code && <span className="text-[11px] text-gray-400">{it.code}</span>}
      {pairControls(it, child)}
      {dateControl(it)}
    </div>
  )

  /** ป้าย เช่า/พาร์ทเนอร์ · ผู้ให้เช่า · ยอด — กดเพื่อเปิด/ปิดแถวต้นทุน */
  const costBadge = (it: PlanItem, className = '') => {
    if (!isRentalItem(it)) return null
    const partner = itemOrigin(it) === 'partner'
    const cost = itemCost(it)
    return (
      <button
        type="button"
        onClick={() => toggleCost(it.id)}
        disabled={costIncomplete(it)}
        title={showCostRow(it) ? 'ซ่อนแถวค่าใช้จ่าย' : partner ? 'แก้ชื่อพาร์ทเนอร์ / ใส่ค่าใช้จ่าย' : 'แก้ผู้ให้เช่า / ราคา / จำนวนวัน'}
        className={`px-1.5 py-0.5 rounded text-[10px] font-medium align-middle whitespace-nowrap disabled:cursor-default ${partner ? 'bg-sky-100 text-sky-700 hover:bg-sky-200' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'} ${className}`}
      >
        {ORIGIN_LABEL[itemOrigin(it)]}{it.rentalVendor?.trim() ? ` · ${it.rentalVendor.trim()}` : ''}
        {(cost > 0 || !partner) && !costIncomplete(it) && ` · ${formatCurrency(cost)}`}
        {it.expenseId && ' · ลงบัญชีแล้ว'}
      </button>
    )
  }

  const renderRow = (it: PlanItem, child: boolean) => (
    <>
    <tr className={`group ${it.packed ? 'bg-green-50/40' : child ? 'bg-gray-50/40' : ''}`}>
      <td className="pl-5 pr-2 py-1 text-center">
        <FormCheckbox size="sm" className="justify-center" checked={!!it.packed} onChange={(v) => patch(it.id, { packed: v })} />
      </td>
      <td className={`px-2 py-1 ${child ? 'pl-8 relative' : ''}`}>
        {child && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 text-base leading-none select-none" aria-hidden>↳</span>}
        {it.equipmentId ? (
          <div className="px-2">
            <p className="font-medium text-gray-900 leading-snug">
              {camTag(it) && <span className="mr-1.5 px-1.5 py-0.5 rounded text-[11px] font-bold align-middle bg-gray-900 text-white tabular-nums">{camTag(it)}</span>}
              {it.name}
              {costBadge(it, 'ml-1.5')}
            </p>
            {metaLine(it, child)}
          </div>
        ) : (
          // ของนอกคลัง (เช่า/ยืม) — แก้ชื่อและหมวดได้เอง
          <div>
          <div className="flex items-center gap-1.5">
            {camTag(it) && <span className="shrink-0 px-1.5 py-0.5 rounded text-[11px] font-bold bg-gray-900 text-white tabular-nums">{camTag(it)}</span>}
            <input className={`${cellInput} font-medium`} value={it.name} placeholder="ชื่ออุปกรณ์ (นอกคลัง)" onChange={(e) => patch(it.id, { name: e.target.value })} />
            {costBadge(it, 'shrink-0')}
            <div className={`${child ? 'w-28' : 'w-36'} shrink-0`}>
              <FormListbox
                value={it.category}
                onChange={(v) => patch(it.id, { category: v as EquipmentCategory })}
                options={EQUIPMENT_CATEGORIES}
                buttonClassName="!py-1.5 !shadow-none"
              />
            </div>
          </div>
          <div className="px-2">{metaLine(it, child)}</div>
          </div>
        )}
      </td>
      <td className="px-2 py-1">
        <input
          type="number"
          min={1}
          className={`${cellInput} text-right tabular-nums`}
          disabled={!!it.expenseId}
          value={it.quantity}
          onChange={(e) => patch(it.id, { quantity: Math.max(1, Math.floor(Number(e.target.value)) || 1) })}
        />
      </td>
      <td className="px-2 py-1">
        <SuggestInput className={cellInput} options={locations} value={it.fromLocation ?? ''} placeholder="—" onChange={(v) => patch(it.id, { fromLocation: v })} />
      </td>
      <td className="text-gray-300"><ArrowRightIcon className="w-4 h-4" /></td>
      <td className="px-2 py-1">
        <SuggestInput className={cellInput} options={locations} value={it.toLocation ?? ''} placeholder="ระบุปลายทาง" onChange={(v) => setToLocation(it, v)} />
      </td>
      <td className="px-2 py-1">
        <input className={cellInput} value={it.note ?? ''} placeholder="—" onChange={(e) => patch(it.id, { note: e.target.value })} />
      </td>
      <td className="px-2 py-1 text-center">
        <FormCheckbox size="sm" className="justify-center" checked={!!it.returned} onChange={(v) => patch(it.id, { returned: v })} />
      </td>
      <td className="pr-5 py-1">
        <button title="เอาออกจากแผน" onClick={() => remove(it.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
          <TrashIcon className="w-4 h-4" />
        </button>
      </td>
    </tr>
    {multiDay && dateOpen.has(it.id) && (() => {
      const r = rangeOf(it)!
      const opts = planDays.map((d) => ({ value: d, label: formatDatePill(d) }))
      return (
        <tr className="bg-violet-50/40">
          <td />
          <td colSpan={8} className="px-2 pb-2 pt-0.5">
            <div className="flex items-center gap-2 flex-wrap px-2 text-xs text-gray-600">
              <span className="font-semibold text-violet-700">ใช้วันที่</span>
              <div className="w-32"><FormListbox value={r.start} onChange={(v) => setItemDates(it, v, r.end < v ? v : r.end)} options={opts} buttonClassName="!py-1 !text-xs !shadow-none" /></div>
              <span>ถึง</span>
              <div className="w-32"><FormListbox value={r.end} onChange={(v) => setItemDates(it, r.start, v)} options={opts.filter((o) => o.value >= r.start)} buttonClassName="!py-1 !text-xs !shadow-none" /></div>
              {isPartial(it) && (
                <button type="button" onClick={() => setItemDates(it, pr!.start, pr!.end)} className="text-gray-500 underline underline-offset-2 hover:text-gray-800">ใช้ทั้งงาน</button>
              )}
              <span className="text-gray-400">วันอื่นว่างให้งานอื่นจองได้{isRentalItem(it) ? ' · จำนวนวันเช่าตามนี้' : ''}</span>
              <button type="button" onClick={() => toggleDate(it.id)} className="ml-auto text-gray-400 hover:text-gray-700">ปิด</button>
            </div>
          </td>
        </tr>
      )
    })()}
    {showCostRow(it) && (
      // ของเช่า/นอกคลัง → แถวต้นทุน: ยอด = ราคา × จำนวน × วัน (ก่อน VAT)
      <tr className={itemOrigin(it) === 'partner' ? 'bg-sky-50/40' : 'bg-amber-50/40'}>
        <td />
        <td colSpan={8} className="px-2 pb-2 pt-0.5">
          <div className="flex items-center gap-2 flex-wrap px-2 text-xs text-gray-600">
            <span className={`font-semibold ${itemOrigin(it) === 'partner' ? 'text-sky-700' : 'text-amber-700'}`}>{itemOrigin(it) === 'partner' ? 'พาร์ทเนอร์' : 'ค่าเช่า'}</span>
            <div className="w-44">
              <SuggestInput
                className={`${cellInput} !bg-white !border-gray-200 !py-1`}
                options={vendors}
                disabled={!!it.expenseId}
                value={it.rentalVendor ?? ''}
                placeholder={itemOrigin(it) === 'partner' ? 'ชื่อพาร์ทเนอร์' : 'ผู้ให้เช่า'}
                onChange={(v) => patch(it.id, { rentalVendor: v })}
              />
            </div>
            <input
              type="number" min={0}
              className={`${cellInput} !w-28 !bg-white !border-gray-200 !py-1 text-right tabular-nums`}
              disabled={!!it.expenseId}
              value={it.unitCost ?? ''}
              placeholder={itemOrigin(it) === 'partner' ? '0 = ไม่คิดเงิน' : 'ราคา/ชิ้น/วัน'}
              onChange={(e) => patch(it.id, { unitCost: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })}
            />
            <span>× {it.quantity} ชิ้น ×</span>
            <input
              type="number" min={1}
              className={`${cellInput} !w-16 !bg-white !border-gray-200 !py-1 text-right tabular-nums`}
              disabled={!!it.expenseId}
              value={it.rentalDays ?? 1}
              onChange={(e) => patch(it.id, { rentalDays: Math.max(1, Math.floor(Number(e.target.value)) || 1) })}
            />
            <span>วัน =</span>
            <b className="text-gray-900 tabular-nums">{formatCurrency(itemCost(it))}</b>
            {it.expenseId && (
              <Link href={`/admin/accounting/expenses/new?id=${it.expenseId}`} className="ml-auto px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium hover:underline">
                ลงบัญชีแล้ว {it.expenseCode}
              </Link>
            )}
          </div>
        </td>
      </tr>
    )}
    </>
  )

  return (
    <div>
      {emptyToCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-5 py-3 bg-gray-50 border-b border-gray-100 text-sm">
          <span className="text-gray-600">ยังไม่ระบุปลายทาง {emptyToCount} รายการ — ตั้งทั้งหมดเป็น</span>
          <div className="w-52">
            <SuggestInput
              value={bulkTo}
              onChange={setBulkTo}
              onEnter={applyBulk}
              options={locations}
              placeholder="เช่น รถ OB"
              className="w-full px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
          </div>
          <button onClick={applyBulk} className="px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand-soft rounded-lg transition-colors">ใช้</button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead>
            <tr className="text-left text-xs font-semibold text-gray-500 border-b border-gray-100">
              <th className="pl-5 pr-2 py-3 w-14 text-center">จัดแล้ว</th>
              <th className="px-2 py-3">อุปกรณ์</th>
              <th className="px-2 py-3 w-16 text-right">จำนวน</th>
              <th className="px-2 py-3 w-[13%]">หยิบจาก</th>
              <th className="w-6" />
              <th className="px-2 py-3 w-[17%]">โยกไป</th>
              <th className="px-2 py-3 w-[25%]">หมายเหตุ</th>
              <th className="px-2 py-3 w-14 text-center">เก็บกลับ</th>
              <th className="pr-5 w-10" />
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.value} className="divide-y divide-gray-50">
              <tr className="bg-gray-50/70">
                <td colSpan={9} className="px-5 py-1.5 text-xs font-semibold text-gray-600">
                  <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: CATEGORY_COLORS[group.value] }} />
                  {group.label} <span className="text-gray-400 font-normal">({group.rows.length})</span>
                </td>
              </tr>
              {group.rows.map((it) => (
                <Fragment key={it.id}>
                  {renderRow(it, false)}
                  {childrenOf(it.id).map((c) => <Fragment key={c.id}>{renderRow(c, true)}</Fragment>)}
                </Fragment>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  )
}
