'use client'

import { useEffect, useState } from 'react'
import {
  PlusIcon, PencilIcon, TrashIcon, MagnifyingGlassIcon, CubeIcon, DocumentDuplicateIcon,
} from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import FormListbox from '@/components/ui/FormListbox'
import { Skeleton } from '@/components/ui/Skeleton'
import EquipmentForm from '@/components/admin/equipment/EquipmentForm'
import {
  getEquipmentList, createEquipment, updateEquipment, deleteEquipment, type EquipmentInput,
} from '@/lib/equipment/equipment'
import { CATEGORY_COLORS, EQUIPMENT_CATEGORIES, EQUIPMENT_STATUSES, categoryLabel } from '@/lib/equipment/constants'
import { getActiveVendors } from '@/lib/accounting/vendors'
import { formatCurrency } from '@/lib/utils'
import type { Equipment } from '@/lib/types'

type FormState = { mode: 'create' | 'edit' | 'duplicate'; item?: Equipment } | null

export default function EquipmentInventoryPage() {
  const [items, setItems] = useState<Equipment[]>([])
  // ชื่อผู้ขายจากระบบบัญชี — ให้ผู้ให้เช่า/พาร์ทเนอร์สะกดตรงกับ Expense ตอนลงบัญชี
  const [vendorNames, setVendorNames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [ownership, setOwnership] = useState<'' | 'owned' | 'rental' | 'partner'>('')
  const [form, setForm] = useState<FormState>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Equipment | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [list, vendors] = await Promise.all([
        getEquipmentList(),
        getActiveVendors().catch(() => []),  // ยังไม่ได้ตั้งระบบบัญชีก็ให้คลังใช้ได้
      ])
      setItems(list)
      setVendorNames(vendors.map((v) => v.name))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSubmit = async (data: EquipmentInput) => {
    setSaving(true)
    try {
      if (form?.mode === 'edit' && form.item) await updateEquipment(form.item.id, data)
      else await createEquipment(data)
      setForm(null)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await deleteEquipment(deleteTarget.id)
    setDeleteTarget(null)
    await load()
  }

  const keyword = search.trim().toLowerCase()
  const filtered = items.filter((it) => {
    if (category && it.category !== category) return false
    if (ownership && (it.ownership ?? 'owned') !== ownership) return false
    if (!keyword) return true
    return [it.code, it.name, it.brand, it.model, it.serialNumber, it.storageLocation, it.rentalVendor, it.partnerName]
      .some((v) => v?.toLowerCase().includes(keyword))
  })

  const locationOptions = [...new Set(items.map((i) => i.storageLocation).filter((l): l is string => !!l))].sort()
  const vendorOptions = [...new Set([...items.map((i) => i.rentalVendor).filter((v): v is string => !!v), ...vendorNames])].sort()
  const partnerOptions = [...new Set([...items.map((i) => i.partnerName).filter((v): v is string => !!v), ...vendorNames])].sort()
  const totalValue = items.filter((i) => !i.ownership || i.ownership === 'owned').reduce((sum, i) => sum + (i.price ?? 0) * (i.quantity || 0), 0)
  const rentalCount = items.filter((i) => i.ownership === 'rental').length
  const partnerCount = items.filter((i) => i.ownership === 'partner').length
  const totalPieces = items.filter((i) => !i.ownership || i.ownership === 'owned').reduce((sum, i) => sum + (i.quantity || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">คลังอุปกรณ์</h1>
          <p className="text-gray-500 mt-1">
            ของบริษัท {items.length - rentalCount - partnerCount} รายการ ({totalPieces.toLocaleString()} ชิ้น)
            {totalValue > 0 && <> มูลค่ารวม ~{formatCurrency(totalValue)}</>} · ของเช่า {rentalCount} · ของพาร์ทเนอร์ {partnerCount}
          </p>
        </div>
        <button
          onClick={() => setForm({ mode: 'create' })}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand text-white text-sm font-medium rounded-xl hover:bg-brand-dark transition-colors"
        >
          <PlusIcon className="w-4 h-4" /> เพิ่มอุปกรณ์
        </button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {([['', 'ทั้งหมด'], ['owned', 'ของบริษัท'], ['rental', 'ของเช่า'], ['partner', 'พาร์ทเนอร์']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setOwnership(key)} className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${ownership === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[220px]">
          <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ, รหัส, รุ่น, S/N, ที่เก็บ, ผู้ให้เช่า"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
          />
        </div>
        <div className="w-56">
          <FormListbox value={category} onChange={setCategory} options={[{ value: '', label: 'ทุกหมวด' }, ...EQUIPMENT_CATEGORIES]} />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <CubeIcon className="w-10 h-10 text-gray-300 mx-auto" />
            <p className="text-gray-400 text-sm mt-3">{items.length === 0 ? 'ยังไม่มีอุปกรณ์ในคลัง' : 'ไม่พบอุปกรณ์ที่ตรงกับเงื่อนไข'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500 border-b border-gray-100">
                  <th className="px-5 py-3">รหัส</th>
                  <th className="px-3 py-3">อุปกรณ์</th>
                  <th className="px-3 py-3">หมวด</th>
                  <th className="px-3 py-3 text-right">จำนวน</th>
                  <th className="px-3 py-3 text-right">ราคา/ชิ้น</th>
                  <th className="px-3 py-3">ที่เก็บ / ผู้ให้เช่า / พาร์ทเนอร์</th>
                  <th className="px-3 py-3">สถานะ</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((it) => {
                  const status = EQUIPMENT_STATUSES.find((s) => s.value === it.status)
                  return (
                    <tr key={it.id} className="hover:bg-gray-50/60">
                      <td className="px-5 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">{it.code}</td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-gray-900">
                          {it.name}
                          {it.ownership === 'rental' && <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-medium align-middle">ของเช่า</span>}
                          {it.ownership === 'partner' && <span className="ml-2 px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 text-[10px] font-medium align-middle">พาร์ทเนอร์</span>}
                        </p>
                        <p className="text-xs text-gray-400">
                          {[it.brand, it.model].filter(Boolean).join(' ')}
                          {it.serialNumber ? ` · S/N ${it.serialNumber}` : ''}
                        </p>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-gray-700">
                          <span className="w-2 h-2 rounded-full" style={{ background: CATEGORY_COLORS[it.category] }} />
                          {categoryLabel(it.category)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{it.quantity}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-600 whitespace-nowrap">{it.price ? formatCurrency(it.price) : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-3 text-gray-600">
                        {it.ownership === 'rental'
                          ? <>{it.rentalVendor || '—'}<span className="block text-xs text-gray-400">{formatCurrency(it.rentalRate ?? 0)} / ชิ้น / วัน</span></>
                          : it.ownership === 'partner'
                            ? <>{it.partnerName || '—'}<span className="block text-xs text-gray-400">{it.rentalRate ? `${formatCurrency(it.rentalRate)} / ชิ้น / วัน` : 'ไม่มีค่าใช้จ่าย'}</span></>
                            : it.storageLocation || '—'}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${status?.color ?? ''}`}>{status?.label ?? it.status}</span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button title="ทำสำเนา" onClick={() => setForm({ mode: 'duplicate', item: it })} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                            <DocumentDuplicateIcon className="w-4 h-4" />
                          </button>
                          <button title="แก้ไข" onClick={() => setForm({ mode: 'edit', item: it })} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                            <PencilIcon className="w-4 h-4" />
                          </button>
                          <button title="ลบ" onClick={() => setDeleteTarget(it)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={!!form}
        onClose={() => setForm(null)}
        title={form?.mode === 'edit' ? `แก้ไขอุปกรณ์ — ${form.item?.code}` : 'เพิ่มอุปกรณ์'}
        size="xl"
      >
        {form && (
          <EquipmentForm
            // สำเนา = ตั้งต้นจากของเดิม แต่ S/N ต้องกรอกใหม่ (ไม่ซ้ำกันอยู่แล้ว)
            defaultValues={form.mode === 'duplicate' && form.item ? { ...form.item, serialNumber: '' } : form.item}
            locationOptions={locationOptions}
            vendorOptions={vendorOptions}
            partnerOptions={partnerOptions}
            onSubmit={handleSubmit}
            onCancel={() => setForm(null)}
            isLoading={saving}
          />
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="ลบอุปกรณ์"
        message={`ต้องการลบ "${deleteTarget?.name}" ออกจากคลังใช่หรือไม่? แผนจัดของที่เคยใช้อุปกรณ์นี้จะยังเก็บชื่อไว้ตามเดิม`}
        confirmLabel="ลบ"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
        danger
      />
    </div>
  )
}
