'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  ArrowDownTrayIcon, ArrowPathIcon, CheckCircleIcon, EyeIcon, EyeSlashIcon, LockClosedIcon, MagnifyingGlassIcon, MapPinIcon, CalendarDaysIcon,
} from '@heroicons/react/24/outline'
import Logo from '@/components/ui/Logo'
import ZoomPan from '@/components/ui/ZoomPan'
import { Skeleton } from '@/components/ui/Skeleton'
import DiagramGraph from '@/components/admin/equipment/DiagramGraph'
import AtemExportModal from '@/components/admin/equipment/AtemExportModal'
import { SIGNAL_TYPES } from '@/lib/equipment/constants'
import { NOTE_MAX_LINES, diagramBounds, wrapNote } from '@/lib/equipment/diagram'
import { camLabels, camTag, groupItems, isCamOnlyNote, type CamLabels, type GroupBy } from '@/lib/equipment/item-groups'
import { formatFullLabel } from '@/lib/equipment/video-format'
import RecordingList from '@/components/admin/equipment/RecordingList'
import { fohSummary } from '@/lib/equipment/foh-feeds'
import { LABEL_SCALE, useLabelSize, useLensLines } from '@/lib/equipment/lens-lines'
import LabelSizePicker from '@/components/admin/equipment/LabelSizePicker'
import { itemUseLabel } from '@/lib/equipment/availability'
import { fetchSharedPlan, shareErrorMessage, type SharedPlan, type SharedPlanItem } from '@/lib/equipment/plan-share'
import { formatDate, formatDateTime } from '@/lib/utils'
import type { PlanDiagram, PlanLayout } from '@/lib/types'

type Tab = 'items' | 'diagrams' | 'layouts'

const storageKey = (shareId: string) => `planShare:${shareId}`

/** รหัสผ่านจำไว้ในแท็บนี้ (sessionStorage) — รีเฟรชไม่ต้องพิมพ์ใหม่ ปิดแท็บแล้วหาย */
function readSaved(shareId: string): string {
  try { return sessionStorage.getItem(storageKey(shareId)) ?? '' } catch { return '' }
}
function writeSaved(shareId: string, password: string | null) {
  try {
    if (password) sessionStorage.setItem(storageKey(shareId), password)
    else sessionStorage.removeItem(storageKey(shareId))
  } catch { /* private mode — แค่ต้องพิมพ์รหัสใหม่ตอนรีเฟรช */ }
}

function SharedPlanPage() {
  const shareId = useSearchParams().get('s') ?? ''
  const [password, setPassword] = useState('')
  const [plan, setPlan] = useState<SharedPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('items')

  const load = async (pw: string) => {
    if (!shareId || !pw) return
    setLoading(true)
    setError('')
    try {
      const p = await fetchSharedPlan(shareId, pw)
      setPlan(p)
      writeSaved(shareId, pw)
      document.title = p.title
    } catch (err) {
      writeSaved(shareId, null)
      setError(shareErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // เคยใส่รหัสในแท็บนี้แล้ว → เปิดให้เลย (ระหว่างนั้นโชว์ skeleton ไม่ใช่ฟอร์มรหัส)
  const [booting, setBooting] = useState(true)
  useEffect(() => {
    let alive = true
    Promise.resolve(readSaved(shareId))
      .then(async (saved) => {
        if (!saved || !shareId) return
        const p = await fetchSharedPlan(shareId, saved)
        if (!alive) return
        setPassword(saved)
        setPlan(p)
        document.title = p.title
      })
      .catch(() => writeSaved(shareId, null)) // รหัสเปลี่ยนแล้ว/ลิงก์ปิด → กลับไปถามรหัส
      .finally(() => { if (alive) setBooting(false) })
    return () => { alive = false }
  }, [shareId])

  if (!shareId) {
    return <CenterMessage title="ลิงก์ไม่ครบ" text="เปิดจากลิงก์ที่ได้รับอีกครั้ง" />
  }

  if (!plan && booting) {
    return <div className="p-4 space-y-3"><Skeleton className="h-20 w-full rounded-2xl" /><Skeleton className="h-96 w-full rounded-2xl" /></div>
  }

  if (!plan) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-8"><Logo width={170} height={26} href="" /></div>
          <form
            onSubmit={(e) => { e.preventDefault(); void load(password) }}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4"
          >
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-brand-soft text-brand flex items-center justify-center shrink-0">
                <LockClosedIcon className="w-5 h-5" />
              </span>
              <div>
                <h1 className="font-semibold text-gray-900">แผนงานสำหรับทีมงาน</h1>
                <p className="text-xs text-gray-500">ใส่รหัสผ่านที่ได้รับเพื่อดูรายการอุปกรณ์และผัง</p>
              </div>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
              placeholder="รหัสผ่าน"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-3 bg-brand text-white font-medium rounded-xl active:bg-brand-dark disabled:opacity-50"
            >
              {loading ? 'กำลังเปิด…' : 'เปิดดูแผน'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  const diagrams = plan.diagrams.filter((d) => d.nodes.length > 0)
  const layouts = plan.layouts.filter((l) => l.objects.length > 0)
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'items', label: 'อุปกรณ์', count: plan.items.length },
    { id: 'diagrams', label: 'ผังโยง', count: diagrams.length },
    ...(layouts.length ? [{ id: 'layouts' as const, label: 'ผังวาง', count: layouts.length }] : []),
  ]

  // ไม่โชว์ Rev — ป้าย revision เป็นของภายใน (เช่น "ก่อนใช้ร่าง AI") ทีมหน้างานดูแค่ว่าอัปเดตล่าสุดเมื่อไร
  const revLine = plan.updatedAt ? `อัปเดต ${formatDateTime(plan.updatedAt)}` : ''

  return (
    <div className="pb-[env(safe-area-inset-bottom)]">
      {/* desktop: ชื่อ + วัน/สถานที่/Rev อยู่แถวเดียว ประหยัดความสูงให้ผัง */}
      <header className="bg-white border-b border-gray-100 px-4 pt-4 pb-3 lg:px-6 lg:py-2.5">
        <div className="flex items-start lg:items-center justify-between gap-3">
          <div className="min-w-0 lg:flex lg:items-baseline lg:gap-5">
            <h1 className="text-lg font-bold leading-snug lg:truncate">{plan.title}</h1>
            <div className="mt-1 lg:mt-0 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 lg:flex-nowrap lg:shrink-0">
              {plan.date && (
                <span className="inline-flex items-center gap-1">
                  <CalendarDaysIcon className="w-3.5 h-3.5" />
                  {formatDate(plan.date)}{plan.endDate && plan.endDate !== plan.date ? ` – ${formatDate(plan.endDate)}` : ''}
                </span>
              )}
              {plan.location && <span className="inline-flex items-center gap-1"><MapPinIcon className="w-3.5 h-3.5" />{plan.location}</span>}
              {revLine && <span className="hidden lg:inline text-gray-400">{revLine}</span>}
            </div>
          </div>
          <button
            onClick={() => void load(password)}
            disabled={loading}
            aria-label="โหลดใหม่"
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-gray-500 active:bg-gray-100"
          >
            <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {revLine && <p className="mt-1.5 text-[11px] text-gray-400 lg:hidden">{revLine}</p>}
      </header>

      <nav className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100 px-2 lg:px-4">
        <div className="flex">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 lg:flex-none lg:px-5 py-3 lg:py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-brand text-gray-900' : 'border-transparent text-gray-500'}`}
            >
              {t.label} <span className="text-xs text-gray-400">{t.count}</span>
            </button>
          ))}
        </div>
      </nav>

      {tab === 'items' && <ItemsTab plan={plan} />}
      {tab === 'diagrams' && <DiagramsTab diagrams={diagrams} />}
      {tab === 'layouts' && <LayoutsTab layouts={layouts} />}
    </div>
  )
}

// ── แท็บรายการอุปกรณ์ ────────────────────────────────────────────────────────

function ItemsTab({ plan }: { plan: SharedPlan }) {
  const [groupBy, setGroupBy] = useState<GroupBy>('destination')
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const items = useMemo(() => {
    if (!q) return plan.items
    const hit = (i: SharedPlanItem) => [i.name, i.code, i.toLocation, i.fromLocation, i.note].some((v) => v?.toLowerCase().includes(q))
    // เจอเลนส์ → โชว์กล้องของมันด้วย (และกลับกัน) จะได้เห็นเป็นชุด
    const ids = new Set(plan.items.filter(hit).map((i) => i.id))
    return plan.items.filter((i) => ids.has(i.id) || (i.attachedTo && ids.has(i.attachedTo)))
  }, [plan.items, q])
  const labels = useMemo(() => camLabels(plan), [plan])
  const groups = groupItems(items, groupBy, labels)
  const totalQty = plan.items.reduce((s, i) => s + (i.quantity || 0), 0)

  const info = [
    plan.videoFormat && { label: 'ระบบภาพ', value: formatFullLabel(plan.videoFormat) },
    fohSummary(plan.fohFeeds) && { label: 'ส่งทีม Visual (FOH)', value: fohSummary(plan.fohFeeds) },
  ].filter(Boolean) as { label: string; value: string }[]
  const hasRecordings = (plan.recordings ?? []).some((r) => r.codec)

  return (
    <div className="px-3 py-3 space-y-3 lg:px-6 lg:py-4">
      {(info.length > 0 || hasRecordings || plan.notes) && (
        <section className="bg-white rounded-2xl border border-gray-100 px-4 py-3 space-y-1.5 text-sm lg:flex lg:flex-wrap lg:gap-x-8 lg:gap-y-1 lg:space-y-0">
          {info.map((r) => (
            <p key={r.label}><span className="text-gray-500">{r.label}:</span> <b className="font-semibold">{r.value}</b></p>
          ))}
          {hasRecordings && (
            <div className="flex gap-1.5 lg:basis-full">
              <span className="text-gray-500 shrink-0">บันทึก:</span>
              <RecordingList recordings={plan.recordings} main={plan.videoFormat} compact />
            </div>
          )}
          {plan.notes && <p className="text-gray-700 whitespace-pre-wrap pt-1 border-t border-gray-100 lg:basis-full lg:mt-1">{plan.notes}</p>}
        </section>
      )}

      <div className="flex items-center gap-2">
        <label className="relative flex-1 lg:flex-none lg:w-96">
          <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาอุปกรณ์"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </label>
        <div className="flex rounded-xl border border-gray-200 bg-white p-0.5 text-xs font-medium shrink-0">
          {([['destination', 'ปลายทาง'], ['category', 'หมวด']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setGroupBy(id)}
              className={`px-3 py-2 rounded-lg ${groupBy === id ? 'bg-brand-soft text-gray-900' : 'text-gray-500'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="hidden lg:block ml-auto text-xs text-gray-500">ทั้งหมด {plan.items.length} รายการ · {totalQty} ชิ้น</p>
      </div>
      <p className="text-xs text-gray-500 px-1 lg:hidden">ทั้งหมด {plan.items.length} รายการ · {totalQty} ชิ้น</p>

      {groups.length === 0 && <p className="py-10 text-center text-sm text-gray-400">{q ? 'ไม่พบอุปกรณ์ที่ค้นหา' : 'ยังไม่มีรายการอุปกรณ์'}</p>}
      {/* desktop: กลุ่มเรียงเป็นคอลัมน์ (masonry) ใช้ความกว้างแทนการเลื่อนยาว */}
      <div className="space-y-3 lg:space-y-0 lg:columns-2 2xl:columns-3 lg:gap-3">
      {groups.map((g) => (
        <section key={g.title} className="bg-white rounded-2xl border border-gray-100 overflow-hidden lg:break-inside-avoid lg:mb-3">
          <h2 className="px-4 py-2.5 text-sm font-semibold bg-gray-50/80 border-b border-gray-100 flex justify-between">
            <span>{g.title}</span>
            <span className="text-gray-400 font-normal">{g.rows.reduce((s, r) => s + (r.item.quantity || 0), 0)} ชิ้น</span>
          </h2>
          <ul className="divide-y divide-gray-50">
            {g.rows.map(({ item, child }) => (
              <ItemRow key={item.id} item={item} child={child} groupBy={groupBy} useLabel={itemUseLabel(item, plan)} cardTags={g.rows.map((r) => camTag(r.item, labels)).filter(Boolean)} cardTitle={g.title} labels={labels} />
            ))}
          </ul>
        </section>
      ))}
      </div>
    </div>
  )
}

const NOTE_KIND_PREFIX = /^(เลนส์|ขาตั้งกล้อง|ขาตั้ง|gimbal|wireless|lens|tripod)(?=[\s,(]|$)/i
const NOTE_FILLER = new Set(['ที่', 'ของ', 'จาก', 'กับ', 'และ', 'ใช้', '+'])
const NOTE_RENTAL_WORDS = new Set(['เช่า', 'ที่เช่า', 'เช่ามา', 'ยืม', 'พาร์ทเนอร์'])
const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * ตัดส่วนของหมายเหตุที่การ์ดโชว์อยู่แล้ว — เบอร์กล้องที่มีป้ายในการ์ดนี้ (CAM1 / CAM 1), ชื่ออุปกรณ์ซ้ำ,
 * ชื่อผู้ให้เช่า/พาร์ทเนอร์ที่อยู่ในป้าย ("ของ Windblue") แล้วเก็บวงเล็บ/เครื่องหมายที่ค้าง · เหลือว่าง = ไม่โชว์
 * แก้แค่ตอนแสดงผล — หมายเหตุในแผนไม่เปลี่ยน
 */
function tidyNote(note: string | undefined, item: SharedPlanItem, cardTags: string[], cardTitle = ''): string {
  let t = (note ?? '').trim()
  if (!t) return ''
  for (const tag of new Set(cardTags)) t = t.replace(new RegExp(`\\bcam\\s*-?\\s*${tag.slice(4)}(?!\\d)`, 'gi'), ' ')
  const names = [item.name, item.name.replace(/\s*\([^)]*\)\s*/g, ' ').trim()].filter((n) => n.length >= 4)
  for (const n of names) t = t.replace(new RegExp(escapeRe(n), 'gi'), ' ')
  // "เจ้าเดียวกับ GH7" / "ของเจ้าเดียวกัน" — ป้ายเจ้าของบอกอยู่แล้ว
  t = t.replace(/(ของ\s*)?เจ้าเดียว(กัน)?(\s*กับ\s*[^\s,()·]+)?/g, ' ')
  const from = item.fromLocation?.trim()
  if (from && (item.origin === 'rental' || item.origin === 'partner')) t = t.replace(new RegExp(`(ของ\\s*)?${escapeRe(from)}`, 'gi'), ' ')
  let prev = ''
  while (prev !== t) {
    prev = t
    t = t
      .replace(/\(\s*[-–—:·,]?\s*\)/g, ' ')            // วงเล็บว่าง
      .replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
      .replace(/\s+([,，])/g, '$1')
      .replace(/^[\s\-–—:·,]+|[\s\-–—:·,]+$/g, '')      // เครื่องหมายค้างหัว/ท้าย
      .replace(/\s+(ติด|ของ|ใส่กับ|สำหรับ|ที่|กับ)$/, '')     // คำเชื่อมที่ค้างหลังตัดเบอร์กล้อง ("TX ติด CAM5" → "TX")
      .replace(NOTE_KIND_PREFIX, '')                        // ชนิดของที่ชื่อบอกอยู่แล้ว ("เลนส์ 16x" → "16x")
      .replace(/^\(([^()]*)\)$/, '$1')                     // เหลือแต่วงเล็บทั้งก้อน → แกะออก
      .replace(/\s{2,}/g, ' ')
  }
  // ทุกคำรู้อยู่แล้วจากการ์ด (ชื่อของ · ป้ายเช่า/พาร์ทเนอร์ · หัวการ์ด) = ไม่มีข้อมูลใหม่
  // เช่น เลนส์ "Fujinon Box Lens 76x" [เช่า · SJ Grip Service] ในการ์ด "จุดกล้อง 3 (TELE 76x)" → "TELE 76x (SJ Grip)" ไม่ต้องโชว์
  const known = [item.name, item.fromLocation, item.toLocation, cardTitle].filter(Boolean).join(' ').toLowerCase()
  const outside = item.origin === 'rental' || item.origin === 'partner'
  const isKnown = (w: string) => NOTE_FILLER.has(w) || (outside && NOTE_RENTAL_WORDS.has(w)) || known.includes(w)
  const allKnown = (x: string) => x.toLowerCase().split(/[\s,()·:/\-–—]+/).filter(Boolean).every(isKnown)
  t = t.replace(/\s*\(([^()]*)\)/g, (m, inner: string) => (allKnown(inner) ? '' : m)).replace(/^[\s\-–—:·,]+/, '').trim()
  return allKnown(t) ? '' : t
}

/**
 * แถวอุปกรณ์หน้าแชร์ — ชื่อ + ป้าย + รหัส / หมายเหตุ · หยิบจาก (ไม่มี = บรรทัดเดียว)
 * ตัดที่ซ้ำ: หมวด (ดูจากชื่อได้), หมายเหตุที่มีแค่เบอร์กล้อง, "หยิบจาก" ของเช่า/พาร์ทเนอร์ (อยู่ในป้ายแล้ว)
 */
function ItemRow({ item, child, groupBy, useLabel, cardTags, cardTitle, labels }: { item: SharedPlanItem; child: boolean; groupBy: GroupBy; useLabel: string; cardTags: string[]; cardTitle: string; labels: CamLabels }) {
  const outside = item.origin === 'rental' || item.origin === 'partner'
  const from = item.fromLocation?.trim()
  const where = groupBy === 'destination'
    ? (!outside && from ? `จาก ${from}` : '')
    : [outside ? '' : from, item.toLocation].filter(Boolean).join(' → ')
  const note = isCamOnlyNote(item.note) ? '' : tidyNote(item.note, item, cardTags, cardTitle)
  const tag = camTag(item, labels)
  return (
    <li className={`px-4 py-2 ${child ? 'pl-9 bg-gray-50/40' : ''}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 leading-snug">
            {child && <span className="text-gray-400 mr-1">↳</span>}
            {tag && <span className="mr-1.5 px-1.5 py-0.5 rounded text-[11px] font-bold align-middle bg-gray-900 text-white tabular-nums">{tag}</span>}
            {item.name}
            {item.origin === 'rental' && <Badge className="bg-amber-100 text-amber-800">เช่า{from ? ` · ${from}` : ''}</Badge>}
            {item.origin === 'partner' && <Badge className="bg-sky-100 text-sky-800">{from || 'พาร์ทเนอร์'}</Badge>}
            {useLabel && <Badge className="bg-violet-100 text-violet-800">{useLabel}</Badge>}
            {/* รหัสต่อท้ายบรรทัดชื่อ — ไม่กินบรรทัดเอง เมื่อไม่มีหมายเหตุแถวเหลือบรรทัดเดียว */}
            {item.code && <span className="ml-1.5 align-middle text-[11px] font-normal text-gray-400 whitespace-nowrap">{item.code}</span>}
          </p>
          {(note || where) && (
            <p className="text-xs text-gray-600 mt-0.5 leading-snug">{[note, where].filter(Boolean).join(' · ')}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums">×{item.quantity}</p>
          {item.packed && <p className="inline-flex items-center gap-0.5 text-[11px] text-green-600"><CheckCircleIcon className="w-3.5 h-3.5" />จัดแล้ว</p>}
        </div>
      </div>
    </li>
  )
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={`ml-1.5 align-middle px-1.5 py-0.5 rounded text-[10px] font-medium ${className}`}>{children}</span>
}

// ── แท็บผังโยง ───────────────────────────────────────────────────────────────

function Chips<T extends { id: string; name: string }>({ list, active, onPick }: { list: T[]; active: string; onPick: (id: string) => void }) {
  if (list.length < 2) return null
  return (
    <div className="flex gap-2 overflow-x-auto px-3 lg:px-6 py-2 -mb-1 [scrollbar-width:none]">
      {list.map((d) => (
        <button
          key={d.id}
          onClick={() => onPick(d.id)}
          className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm border ${d.id === active ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200'}`}
        >
          {d.name}
        </button>
      ))}
    </div>
  )
}

function DiagramsTab({ diagrams }: { diagrams: PlanDiagram[] }) {
  const [activeId, setActiveId] = useState(diagrams[0]?.id ?? '')
  const [atemFor, setAtemFor] = useState<string | null>(null)
  const diagram = diagrams.find((d) => d.id === activeId) ?? diagrams[0]
  if (!diagram) return <p className="py-16 text-center text-sm text-gray-400">ยังไม่มีผังโยง</p>
  // ทีมหน้างานโหลดไฟล์ตั้งค่า ATEM ไป Restore ที่เครื่องเองได้ (ชื่อ input / AUX / Multiview จากผัง)
  const switchers = diagram.nodes.filter((n) => n.category === 'switcher' && n.inputs.length > 0)
  const atemNode = switchers.find((n) => n.id === atemFor)
  const b = diagramBounds(diagram, 30)
  const used = SIGNAL_TYPES.filter((s) => diagram.edges.some((e) => e.signal === s.value))
  const longNotes = diagram.nodes.filter((n) => wrapNote(n.note, 999).length > NOTE_MAX_LINES)
  return (
    <div>
      <Chips list={diagrams} active={diagram.id} onPick={setActiveId} />
      {switchers.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-3 lg:px-6 pt-2 [scrollbar-width:none]">
          {switchers.map((n) => (
            <button
              key={n.id}
              onClick={() => setAtemFor(n.id)}
              className="shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium bg-gray-900 text-white hover:bg-gray-800"
            >
              <ArrowDownTrayIcon className="w-4 h-4" /> Download XML ATEM{switchers.length > 1 ? ` · ${n.label}` : ''}
            </button>
          ))}
        </div>
      )}
      {atemNode && <AtemExportModal key={atemNode.id} isOpen onClose={() => setAtemFor(null)} diagram={diagram} switcher={atemNode} />}
      <div className="px-3 pt-2 lg:px-6">
        {/* key = รีเซ็ตซูมเมื่อเปลี่ยนผัง · ผังใหญ่ซูมได้ลึกขึ้น · desktop หัวเตี้ยกว่า ผังได้ความสูงเพิ่ม */}
        <ZoomPan key={diagram.id} maxScale={Math.max(6, b.w / 250)} className="h-[calc(100dvh-190px)] lg:h-[calc(100dvh-150px)] min-h-[360px] bg-white rounded-2xl border border-gray-100">
          <svg viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} preserveAspectRatio="xMidYMid meet" className="w-full h-full">
            <DiagramGraph diagram={diagram} />
          </svg>
        </ZoomPan>
      </div>
      <div className="px-4 lg:px-6 py-2 flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-6">
        <p className="text-[11px] text-gray-400 text-center lg:text-left lg:order-last lg:ml-auto">
          <span className="lg:hidden">บีบ 2 นิ้วเพื่อซูม · ลากเพื่อเลื่อน · แตะ 2 ครั้งเพื่อซูมเร็ว</span>
          <span className="hidden lg:inline">ล้อเมาส์เพื่อซูม · ลากเพื่อเลื่อน · ดับเบิลคลิกเพื่อซูมเร็ว</span>
        </p>
      {used.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-600">
          {used.map((s) => (
            <span key={s.value} className="inline-flex items-center gap-1.5">
              <svg width="26" height="8" aria-hidden><line x1="1" y1="4" x2="25" y2="4" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash} /></svg>
              {s.label}
            </span>
          ))}
        </div>
      )}
      </div>
      {longNotes.length > 0 && (
        <section className="mx-3 lg:mx-6 mb-4 bg-white rounded-2xl border border-gray-100 px-4 py-3 text-sm space-y-1.5">
          <h3 className="font-semibold text-gray-900">หมายเหตุฉบับเต็ม</h3>
          <div className="space-y-1.5 lg:space-y-0 lg:columns-2 lg:gap-8">
            {longNotes.map((n) => <p key={n.id} className="whitespace-pre-wrap text-gray-700 lg:break-inside-avoid lg:mb-1.5"><b>{n.label}:</b> {n.note}</p>)}
          </div>
        </section>
      )}
    </div>
  )
}

// ── แท็บผังวาง (วาด 3D สด — ซูมแล้วคม) ──────────────────────────────────────

// three.js ก้อนใหญ่ — โหลดเฉพาะตอนเปิดแท็บนี้ และห้าม prerender
const LayoutViewer = dynamic(() => import('@/components/admin/equipment/LayoutViewer'), {
  ssr: false,
  loading: () => <Skeleton className="h-[calc(100dvh-230px)] lg:h-[calc(100dvh-190px)] min-h-[320px] w-full rounded-2xl" />,
})

function LayoutsTab({ layouts }: { layouts: PlanLayout[] }) {
  const [activeId, setActiveId] = useState(layouts[0]?.id ?? '')
  const [view, setView] = useState<'top' | 'perspective'>('top')
  const [lensLines, setLensLines] = useLensLines()
  const [labelSize] = useLabelSize()
  const layout = layouts.find((l) => l.id === activeId) ?? layouts[0]

  if (!layout) return null
  return (
    <div>
      <Chips list={layouts} active={layout.id} onPick={setActiveId} />
      <div className="px-3 pt-2 space-y-2 lg:px-6">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-xl border border-gray-200 bg-white p-0.5 text-xs font-medium w-fit">
            {([['top', 'มุมบน'], ['perspective', 'มุมเอียง']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setView(id)} className={`px-4 py-2 rounded-lg ${view === id ? 'bg-brand-soft text-gray-900' : 'text-gray-500'}`}>{label}</button>
            ))}
          </div>
          <button
            onClick={() => setLensLines(!lensLines)}
            aria-pressed={lensLines}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium ${lensLines ? 'border-brand bg-brand-soft text-gray-900' : 'border-gray-200 bg-white text-gray-500'}`}
          >
            {lensLines ? <EyeIcon className="w-4 h-4" /> : <EyeSlashIcon className="w-4 h-4" />} แนวเลนส์
          </button>
          <LabelSizePicker className="!rounded-xl !p-1" />
        </div>
        <LayoutViewer
          layout={layout}
          view={view}
          lensLines={lensLines}
          labelScale={LABEL_SCALE[labelSize]}
          className="h-[calc(100dvh-230px)] lg:h-[calc(100dvh-190px)] min-h-[320px] bg-white rounded-2xl border border-gray-100"
        />
        <p className="text-[11px] text-gray-400 text-center">
          {view === 'top' ? 'ลากเพื่อเลื่อน' : 'ลากเพื่อหมุน · 2 นิ้วเพื่อเลื่อน'} · บีบ/ล้อเมาส์เพื่อซูม · {layout.venue.name} · ขนาดสถานที่เป็นค่าประมาณ ใช้ดูตำแหน่งคร่าวๆ
        </p>
      </div>
    </div>
  )
}

function CenterMessage({ title, text }: { title: string; text: string }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
      <Logo width={150} height={23} href="" />
      <h1 className="mt-8 font-semibold text-gray-900">{title}</h1>
      <p className="mt-1 text-sm text-gray-500">{text}</p>
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6"><Skeleton className="h-40 w-full rounded-2xl" /></div>}>
      <SharedPlanPage />
    </Suspense>
  )
}
