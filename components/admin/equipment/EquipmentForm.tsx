'use client'

import { useEffect, useRef, useState } from 'react'
import FormListbox from '@/components/ui/FormListbox'
import SuggestInput from '@/components/ui/SuggestInput'
import type { Equipment, EquipmentCategory, EquipmentStatus } from '@/lib/types'
import type { EquipmentInput } from '@/lib/equipment/equipment'
import { DEFAULT_PORTS, EQUIPMENT_CATEGORIES, EQUIPMENT_STATUSES, categoryLabel } from '@/lib/equipment/constants'
import { CATALOG_BRANDS, searchCatalog, type CatalogProduct } from '@/lib/equipment/catalog'
import { formatCurrency } from '@/lib/utils'

interface EquipmentFormProps {
  defaultValues?: Equipment
  /** ที่เก็บที่เคยใช้ — autocomplete ให้พิมพ์ซ้ำได้ตรงกัน */
  locationOptions: string[]
  /** ผู้ให้เช่าที่เคยกรอก + ผู้ขายในระบบบัญชี */
  vendorOptions?: string[]
  /** พาร์ทเนอร์ที่เคยกรอก + ผู้ขายในระบบบัญชี */
  partnerOptions?: string[]
  onSubmit: (data: EquipmentInput) => Promise<void>
  onCancel: () => void
  isLoading: boolean
}

const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand'

const toLines = (ports?: string[]) => (ports ?? []).join('\n')
const fromLines = (text: string) => text.split('\n').map((s) => s.trim()).filter(Boolean)

export default function EquipmentForm({ defaultValues, locationOptions, vendorOptions = [], partnerOptions = [], onSubmit, onCancel, isLoading }: EquipmentFormProps) {
  const d = defaultValues
  const [name, setName] = useState(d?.name ?? '')
  const [category, setCategory] = useState<EquipmentCategory>(d?.category ?? 'camera')
  const [brand, setBrand] = useState(d?.brand ?? '')
  const [model, setModel] = useState(d?.model ?? '')
  const [serialNumber, setSerialNumber] = useState(d?.serialNumber ?? '')
  const [quantity, setQuantity] = useState(String(d?.quantity ?? 1))
  const [storageLocation, setStorageLocation] = useState(d?.storageLocation ?? '')
  const [status, setStatus] = useState<EquipmentStatus>(d?.status ?? 'available')
  const [inputs, setInputs] = useState(toLines(d?.inputs ?? DEFAULT_PORTS.camera.inputs))
  const [outputs, setOutputs] = useState(toLines(d?.outputs ?? DEFAULT_PORTS.camera.outputs))
  const [ios, setIos] = useState(toLines(d?.ios ?? DEFAULT_PORTS.camera.ios))
  const [notes, setNotes] = useState(d?.notes ?? '')
  const [ownership, setOwnership] = useState<'owned' | 'rental' | 'partner'>(d?.ownership ?? 'owned')
  const [rentalVendor, setRentalVendor] = useState(d?.rentalVendor ?? '')
  const [partnerName, setPartnerName] = useState(d?.partnerName ?? '')
  const [rentalRate, setRentalRate] = useState(d?.rentalRate != null ? String(d.rentalRate) : '')
  const [price, setPrice] = useState(d?.price != null ? String(d.price) : '')
  const [priceNote, setPriceNote] = useState('')
  const [error, setError] = useState('')

  // autocomplete จากแค็ตตาล็อกผลิตภัณฑ์ (ดู CATALOG_BRANDS)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [suggestIdx, setSuggestIdx] = useState(0)
  const nameBoxRef = useRef<HTMLDivElement>(null)
  const suggestions = suggestOpen && name.trim().length >= 2 ? searchCatalog(name, 12) : []

  useEffect(() => {
    if (!suggestOpen) return
    const onDown = (e: PointerEvent) => {
      if (!nameBoxRef.current?.contains(e.target as Node)) setSuggestOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [suggestOpen])

  /** เลือกจากแค็ตตาล็อก → เติมยี่ห้อ/รุ่น/หมวด/port ทั้งชุด (แก้ต่อได้ทุกช่อง) */
  const applyProduct = (pr: CatalogProduct) => {
    setName(pr.name)
    setBrand(pr.brand)
    setModel(pr.model ?? pr.name)
    setCategory(pr.category)
    setInputs(toLines(pr.inputs))
    setOutputs(toLines(pr.outputs))
    setIos(toLines(pr.ios))
    // ราคาจากแค็ตตาล็อกเป็นค่าประมาณ — ทับเฉพาะตอนยังไม่ได้กรอกเอง
    if (pr.price != null && !price.trim()) {
      setPrice(String(pr.price))
      setPriceNote(pr.priceNote ? `ราคาโดยประมาณ · ${pr.priceNote}` : 'ราคาโดยประมาณจากแค็ตตาล็อก — แก้เป็นราคาที่ซื้อจริงได้')
    }
    setSuggestOpen(false)
  }

  const onNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestIdx((i) => Math.min(i + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSuggestIdx((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); applyProduct(suggestions[suggestIdx] ?? suggestions[0]) }
    else if (e.key === 'Escape') setSuggestOpen(false)
  }

  const changeCategory = (next: EquipmentCategory) => {
    // ยังไม่ได้แก้ port เอง (ยังเป็นค่า default ของหมวดเดิม) → เปลี่ยนตามหมวดใหม่ให้
    const prev = DEFAULT_PORTS[category]
    if (inputs === toLines(prev.inputs) && outputs === toLines(prev.outputs) && ios === toLines(prev.ios)) {
      setInputs(toLines(DEFAULT_PORTS[next].inputs))
      setOutputs(toLines(DEFAULT_PORTS[next].outputs))
      setIos(toLines(DEFAULT_PORTS[next].ios))
    }
    setCategory(next)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const qty = Math.floor(Number(quantity))
    if (!name.trim()) { setError('กรุณากรอกชื่ออุปกรณ์'); return }
    if (!Number.isFinite(qty) || qty < 1) { setError('จำนวนต้องเป็น 1 ขึ้นไป'); return }
    setError('')
    await onSubmit({
      name: name.trim(),
      category,
      brand: brand.trim(),
      model: model.trim(),
      serialNumber: serialNumber.trim(),
      quantity: qty,
      storageLocation: storageLocation.trim(),
      status,
      inputs: fromLines(inputs),
      outputs: fromLines(outputs),
      ios: fromLines(ios),
      notes: notes.trim(),
      ownership,
      rentalVendor: ownership === 'rental' ? rentalVendor.trim() : '',
      partnerName: ownership === 'partner' ? partnerName.trim() : '',
      rentalRate: ownership !== 'owned' ? Math.max(0, Number(rentalRate) || 0) : 0,
      price: Math.max(0, Number(price) || 0),
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {([['owned', 'ของบริษัท'], ['rental', 'ของเช่า'], ['partner', 'ของพาร์ทเนอร์']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setOwnership(key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${ownership === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {ownership === 'partner' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-sky-50/60 border border-sky-200">
          <Field label="พาร์ทเนอร์">
            <SuggestInput className={inputCls} value={partnerName} onChange={setPartnerName} options={partnerOptions} placeholder="เช่น Windblue" hint="จากพาร์ทเนอร์ที่เคยกรอก + ผู้ขายในระบบบัญชี" />
          </Field>
          <Field label="ค่าใช้จ่าย / ชิ้น / วัน (ถ้ามีข้อตกลง)">
            <input className={inputCls} type="number" min={0} value={rentalRate} onChange={(e) => setRentalRate(e.target.value)} placeholder="0 = ไม่มีค่าใช้จ่าย" />
          </Field>
        </div>
      )}
      {ownership === 'rental' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-amber-50/60 border border-amber-200">
          <Field label="ผู้ให้เช่า">
            <SuggestInput className={inputCls} value={rentalVendor} onChange={setRentalVendor} options={vendorOptions} placeholder="ชื่อร้าน / บริษัท" hint="จากผู้ให้เช่าที่เคยกรอก + ผู้ขายในระบบบัญชี" />
          </Field>
          <Field label="ราคาเช่า / ชิ้น / วัน (ก่อน VAT)">
            <input className={inputCls} type="number" min={0} value={rentalRate} onChange={(e) => setRentalRate(e.target.value)} placeholder="0" />
          </Field>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="ชื่ออุปกรณ์ *" className="sm:col-span-2">
          <div ref={nameBoxRef} className="relative">
            <input
              className={inputCls}
              value={name}
              onChange={(e) => { setName(e.target.value); setSuggestOpen(true); setSuggestIdx(0) }}
              onFocus={() => setSuggestOpen(true)}
              onKeyDown={onNameKeyDown}
              placeholder="พิมพ์ชื่อรุ่น เช่น ATEM Mini, Mars 400S, Solidcom, T5V, Scarlett — เลือกจากรายการเพื่อเติม port/ราคาให้"
              autoComplete="off"
              autoFocus
            />
            {suggestions.length > 0 && (
              <ul className="absolute z-[210] left-0 right-0 mt-1 max-h-72 overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                {suggestions.map((pr, i) => {
                  const ports = (pr.inputs?.length ?? 0) + (pr.outputs?.length ?? 0) + (pr.ios?.length ?? 0)
                  return (
                    <li key={`${pr.brand}-${pr.name}`}>
                      <button
                        type="button"
                        onMouseEnter={() => setSuggestIdx(i)}
                        onClick={() => applyProduct(pr)}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-left ${i === suggestIdx ? 'bg-brand-soft' : 'hover:bg-gray-50'}`}
                      >
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-gray-900 truncate">{pr.name}</span>
                          <span className="block text-[11px] text-gray-400 truncate">{pr.brand} · {categoryLabel(pr.category)}{ports ? ` · ${ports} port` : ''}</span>
                        </span>
                        {pr.price != null && <span className="shrink-0 text-xs text-gray-500 tabular-nums">~{formatCurrency(pr.price)}</span>}
                      </button>
                    </li>
                  )
                })}
                <li className="px-3 pt-1.5 pb-1 text-[10px] text-gray-400 border-t border-gray-100 mt-1">{CATALOG_BRANDS.join(' · ')} — port และราคาเป็นค่าประมาณตั้งต้น ตรวจกับของจริงอีกครั้ง</li>
              </ul>
            )}
          </div>
        </Field>
        <Field label="หมวด">
          <FormListbox value={category} onChange={(v) => changeCategory(v as EquipmentCategory)} options={EQUIPMENT_CATEGORIES} />
        </Field>
        <Field label="สถานะ">
          <FormListbox value={status} onChange={(v) => setStatus(v as EquipmentStatus)} options={EQUIPMENT_STATUSES} />
        </Field>
        <Field label="ยี่ห้อ">
          <input className={inputCls} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Sony, Blackmagic…" />
        </Field>
        <Field label="รุ่น">
          <input className={inputCls} value={model} onChange={(e) => setModel(e.target.value)} />
        </Field>
        <Field label="Serial Number">
          <input className={inputCls} value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
        </Field>
        <Field label={ownership === 'owned' ? 'จำนวน' : 'จำนวนที่เอามาได้สูงสุด'}>
          <input className={inputCls} type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </Field>
        <Field label={ownership === 'owned' ? 'ที่เก็บประจำ' : 'รับของที่'}>
          <SuggestInput className={inputCls} value={storageLocation} onChange={setStorageLocation} options={locationOptions} placeholder="เช่น ห้องเก็บของ A ชั้น 2, รถ OB, Flight case #3" hint="ที่เก็บที่เคยกรอกในคลัง" />
        </Field>
        <Field label={ownership === 'owned' ? 'ราคาซื้อ / มูลค่าต่อชิ้น (บาท)' : 'มูลค่าต่อชิ้น (บาท) — ไว้ประกัน/ประเมินความเสียหาย'}>
          <input className={inputCls} type="number" min={0} value={price} onChange={(e) => { setPrice(e.target.value); setPriceNote('') }} placeholder="0 = ไม่ระบุ" />
          {priceNote && <p className="mt-1 text-[11px] text-amber-600">{priceNote}</p>}
        </Field>
        <Field label="Port ขาเข้า (บรรทัดละ 1 port)">
          <textarea className={`${inputCls} font-mono`} rows={4} value={inputs} onChange={(e) => setInputs(e.target.value)} />
        </Field>
        <Field label="Port ขาออก (บรรทัดละ 1 port)">
          <textarea className={`${inputCls} font-mono`} rows={4} value={outputs} onChange={(e) => setOutputs(e.target.value)} />
        </Field>
        <Field label="Port เข้า-ออกในตัวเดียว ⇄ (บรรทัดละ 1 port)" className="sm:col-span-2">
          <textarea className={`${inputCls} font-mono`} rows={2} value={ios} onChange={(e) => setIos(e.target.value)} placeholder="เช่น 12G-SDI 1, LAN 1 — port ที่รับและส่งได้ในช่องเดียว" />
        </Field>
        <p className="sm:col-span-2 -mt-2 text-xs text-gray-400">Port ใช้เป็นแม่แบบตอนวางอุปกรณ์ลงผังโยง — แก้เฉพาะผังทีหลังได้ · port เข้า-ออกโยงได้ทั้งสองทาง</p>
        <Field label="หมายเหตุ" className="sm:col-span-2">
          <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">ยกเลิก</button>
        <button type="submit" disabled={isLoading} className="px-5 py-2.5 bg-brand text-white text-sm font-medium rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-60">
          {isLoading ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </div>
    </form>
  )
}

function Field({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  )
}
