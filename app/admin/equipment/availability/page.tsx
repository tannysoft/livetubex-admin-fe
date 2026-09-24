'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarDaysIcon, CubeIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import FormListbox from '@/components/ui/FormListbox'
import FormDatePicker from '@/components/ui/FormDatePicker'
import FormCheckbox from '@/components/ui/FormCheckbox'
import { Skeleton } from '@/components/ui/Skeleton'
import { getEquipmentList } from '@/lib/equipment/equipment'
import { getEquipmentPlans } from '@/lib/equipment/plans'
import { usageInRange, type RangeUsage } from '@/lib/equipment/availability'
import { CATEGORY_COLORS, EQUIPMENT_CATEGORIES, PLAN_STATUSES } from '@/lib/equipment/constants'
import { formatDate, formatDatePill } from '@/lib/utils'
import type { Equipment, EquipmentPlan } from '@/lib/types'

type Ownership = '' | 'owned' | 'partner' | 'rental'

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDays(s: string, n: number): string {
  const d = new Date(s + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return ymd(d)
}
function rangeLabel(start: string, end: string): string {
  return start === end ? formatDate(start) : `${formatDatePill(start)} – ${formatDate(end)}`
}

interface Row { eq: Equipment; total: number; booked: number; left: number; usage?: RangeUsage }

/**
 * ของเหลือในคลังตามช่วงวันที่ — หักของที่แผนอื่นจองไว้ (แผนที่ยังไม่เก็บกลับ)
 * ช่วงหลายวัน = ดูวันที่ใช้มากที่สุด เพราะแผนคนละวันไม่แย่งของกัน
 */
export default function EquipmentAvailabilityPage() {
  const today = ymd(new Date())
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [allPlans, setAllPlans] = useState<EquipmentPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(today)
  const [ownership, setOwnership] = useState<Ownership>('')
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [onlyBooked, setOnlyBooked] = useState(false)

  useEffect(() => {
    Promise.all([getEquipmentList(), getEquipmentPlans()])
      .then(([eq, plans]) => { setEquipment(eq); setAllPlans(plans) })
      .finally(() => setLoading(false))
  }, [])

  const setRange = (s: string, e: string) => { setStart(s); setEnd(e < s ? s : e) }

  // แผนที่กำลังจะมา — กดแล้วดูของเหลือช่วงวันงานนั้น
  const upcoming = useMemo(() => allPlans
    .filter((p) => p.date && p.status !== 'returned' && (p.endDate || p.date) >= today)
    .sort((a, b) => a.date!.localeCompare(b.date!))
    .slice(0, 8), [allPlans, today])

  const { usage, plans } = useMemo(
    () => usageInRange(allPlans, { start, end: end < start ? start : end }),
    [allPlans, start, end],
  )

  const rows: Row[] = useMemo(() => equipment
    .filter((e) => e.status !== 'retired')
    .map((eq) => {
      const u = usage.get(eq.id)
      const booked = u?.peak ?? 0
      // ส่งซ่อม = ใช้ไม่ได้ทั้งรายการ
      const left = eq.status === 'repair' ? 0 : eq.quantity - booked
      return { eq, total: eq.quantity, booked, left, usage: u }
    }), [equipment, usage])

  const keyword = search.trim().toLowerCase()
  const filtered = rows.filter(({ eq, booked }) => {
    if (ownership && (eq.ownership ?? 'owned') !== ownership) return false
    if (category && eq.category !== category) return false
    if (onlyBooked && booked === 0) return false
    if (!keyword) return true
    return [eq.code, eq.name, eq.brand, eq.model, eq.partnerName, eq.rentalVendor].some((v) => v?.toLowerCase().includes(keyword))
  })
  const groups = EQUIPMENT_CATEGORIES
    .map((c) => ({ ...c, rows: filtered.filter((r) => r.eq.category === c.value).sort((a, b) => a.eq.code.localeCompare(b.eq.code)) }))
    .filter((g) => g.rows.length > 0)

  const bookedCount = rows.filter((r) => r.booked > 0).length
  const outCount = rows.filter((r) => r.booked > 0 && r.left === 0).length
  const overCount = rows.filter((r) => r.left < 0).length
  const outsideItems = plans.reduce((s, p) => s + p.items.filter((i) => !i.equipmentId).length, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ของเหลือในคลัง</h1>
        <p className="text-gray-500 mt-1">เลือกวันที่ แล้วดูว่าหลังหักของที่แผนงานจองไว้ ยังเหลืออะไรบ้าง</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="w-44">
            <span className="block text-xs font-semibold text-gray-500 mb-1.5">ตั้งแต่วันที่</span>
            <FormDatePicker value={start} onChange={(v) => v && setRange(v, end)} />
          </div>
          <div className="w-44">
            <span className="block text-xs font-semibold text-gray-500 mb-1.5">ถึงวันที่</span>
            <FormDatePicker value={end} onChange={(v) => v && setRange(start, v)} minDate={start} />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setRange(today, today)} className="px-3 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50">วันนี้</button>
            <button onClick={() => setRange(addDays(today, 1), addDays(today, 1))} className="px-3 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50">พรุ่งนี้</button>
            <button onClick={() => setRange(today, addDays(today, 6))} className="px-3 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50">7 วันข้างหน้า</button>
          </div>
        </div>
        {upcoming.length > 0 && (
          <div>
            <span className="block text-xs font-semibold text-gray-500 mb-1.5">ดูตามวันงานที่กำลังจะมา</span>
            <div className="flex gap-2 flex-wrap">
              {upcoming.map((p) => {
                const s = p.date!, e = p.endDate && p.endDate >= s ? p.endDate : s
                const active = s === start && e === end
                return (
                  <button
                    key={p.id}
                    onClick={() => setRange(s, e)}
                    className={`text-left px-3 py-2 rounded-xl border text-sm transition-colors ${active ? 'border-brand bg-brand-soft' : 'border-gray-200 hover:bg-gray-50'}`}
                  >
                    <span className="block font-medium text-gray-900 max-w-[220px] truncate">{p.title}</span>
                    <span className="block text-xs text-gray-500">{rangeLabel(s, e)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="แผนงานในช่วงนี้" value={plans.length} />
            <Stat label="รายการที่ถูกจอง" value={bookedCount} />
            <Stat label="จองหมดแล้ว" value={outCount} tone={outCount > 0 ? 'amber' : undefined} />
            <Stat label="จองเกินจำนวน" value={overCount} tone={overCount > 0 ? 'red' : undefined} />
          </div>

          {plans.length > 0 ? (
            <div className="flex gap-2 flex-wrap items-center text-sm">
              <CalendarDaysIcon className="w-4 h-4 text-gray-400" />
              {plans.map((p) => {
                const st = PLAN_STATUSES.find((s) => s.value === p.status)
                return (
                  <Link key={p.id} href={`/admin/equipment/plans/edit?id=${p.id}`} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-gray-200 hover:border-brand">
                    <span className="font-medium text-gray-800">{p.title}</span>
                    <span className="text-xs text-gray-500">{rangeLabel(p.date!, p.endDate && p.endDate >= p.date! ? p.endDate : p.date!)}</span>
                    {st && <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${st.color}`}>{st.label}</span>}
                  </Link>
                )
              })}
              {outsideItems > 0 && <span className="text-xs text-gray-400">· ของนอกคลังในแผน {outsideItems} แถวไม่นับ</span>}
            </div>
          ) : (
            <p className="text-sm text-gray-500">ไม่มีแผนงานในช่วง {rangeLabel(start, end)} — ของทุกชิ้นว่าง</p>
          )}

          <div className="flex gap-3 flex-wrap items-center">
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              {([['', 'ทั้งหมด'], ['owned', 'ของบริษัท'], ['partner', 'พาร์ทเนอร์'], ['rental', 'ของเช่า']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setOwnership(key)} className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${ownership === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[200px]">
              <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาชื่อ, รหัส, รุ่น, พาร์ทเนอร์"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
              />
            </div>
            <div className="w-52">
              <FormListbox value={category} onChange={setCategory} options={[{ value: '', label: 'ทุกหมวด' }, ...EQUIPMENT_CATEGORIES]} />
            </div>
            <FormCheckbox checked={onlyBooked} onChange={setOnlyBooked} label="เฉพาะที่ถูกจอง" />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {groups.length === 0 ? (
              <div className="py-16 text-center">
                <CubeIcon className="w-10 h-10 text-gray-300 mx-auto" />
                <p className="text-gray-400 text-sm mt-3">ไม่พบอุปกรณ์ที่ตรงกับเงื่อนไข</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-gray-500 border-b border-gray-100">
                      <th className="px-5 py-3">อุปกรณ์</th>
                      <th className="px-3 py-3 text-right">ทั้งหมด</th>
                      <th className="px-3 py-3 text-right">จอง</th>
                      <th className="px-3 py-3 text-right">เหลือ</th>
                      <th className="px-3 py-3 w-40" />
                      <th className="px-5 py-3">แผนที่ใช้</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <Fragment key={g.value}>
                        <tr className="bg-gray-50/70">
                          <td colSpan={6} className="px-5 py-2 text-xs font-semibold text-gray-600">
                            <span className="inline-block w-2 h-2 rounded-full mr-2 align-middle" style={{ background: CATEGORY_COLORS[g.value] }} />
                            {g.label} <span className="text-gray-400 font-normal">({g.rows.length})</span>
                          </td>
                        </tr>
                        {g.rows.map((r) => <AvailabilityRow key={r.eq.id} row={r} multiDay={start !== end} />)}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {start !== end && (
            <p className="text-xs text-gray-400">ช่วงหลายวัน: &quot;จอง&quot; คือวันที่ใช้มากที่สุดในช่วง — แผนที่อยู่คนละวันไม่แย่งของกัน</p>
          )}
        </>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'amber' | 'red' }) {
  const color = tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : 'text-gray-900'
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  )
}

function AvailabilityRow({ row, multiDay }: { row: Row; multiDay: boolean }) {
  const { eq, total, booked, left, usage } = row
  const own = eq.ownership ?? 'owned'
  const repair = eq.status === 'repair'
  const pct = total > 0 ? Math.min(100, (booked / total) * 100) : 0
  const leftColor = left < 0 ? 'text-red-600' : left === 0 ? 'text-amber-600' : 'text-green-700'
  const barColor = left < 0 ? 'bg-red-500' : left === 0 ? 'bg-amber-500' : 'bg-brand'
  return (
    <tr className="border-b border-gray-50 align-top">
      <td className="px-5 py-2.5">
        <p className="font-medium text-gray-900">
          {eq.name}
          {own !== 'owned' && (
            <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium align-middle ${own === 'partner' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
              {own === 'partner' ? `พาร์ทเนอร์${eq.partnerName ? ` · ${eq.partnerName}` : ''}` : `ของเช่า${eq.rentalVendor ? ` · ${eq.rentalVendor}` : ''}`}
            </span>
          )}
          {repair && <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium align-middle bg-red-100 text-red-700">ส่งซ่อม</span>}
        </p>
        <p className="text-[11px] text-gray-400 font-mono">{eq.code}</p>
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{total}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{booked || '—'}</td>
      <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${leftColor}`}>
        {left < 0 ? `เกิน ${-left}` : left}
      </td>
      <td className="px-3 py-3">
        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      </td>
      <td className="px-5 py-2.5 text-xs text-gray-600">
        {usage?.plans.length ? (
          <div className="space-y-0.5">
            {usage.plans.map((p) => (
              <Link key={p.id} href={`/admin/equipment/plans/edit?id=${p.id}`} className="block hover:text-brand">
                {p.title} <span className="text-gray-400">× {p.quantity}{multiDay ? ` · ${rangeLabel(p.start, p.end)}` : ''}</span>
              </Link>
            ))}
          </div>
        ) : <span className="text-gray-300">—</span>}
      </td>
    </tr>
  )
}
