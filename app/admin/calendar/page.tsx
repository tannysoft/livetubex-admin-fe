'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ChevronLeftIcon, ChevronRightIcon, PlusIcon, VideoCameraIcon, PencilSquareIcon, TrashIcon, CheckIcon, MagnifyingGlassIcon, MapPinIcon,
} from '@heroicons/react/24/outline'
import GoogleCalendarButton, { GoogleAddedBadge } from '@/components/admin/GoogleCalendarButton'
import Modal from '@/components/ui/Modal'
import FormDatePicker from '@/components/ui/FormDatePicker'
import { Skeleton } from '@/components/ui/Skeleton'
import { getJobsWithBudget } from '@/lib/firebase-utils'
import { getAccountingStatuses, setJobAccountingStatus, type AccountingStatusDef } from '@/lib/job-accounting'
import AccountingStatusMenu, { AccountingPill } from '@/components/admin/AccountingStatusMenu'
import {
  CALENDAR_COLORS, addCalendarEntry, addJobToCalendar, deleteCalendarEntry, setGoogleAdded, getCalendarEntries, updateCalendarEntry,
} from '@/lib/calendar'
import { THAI_MONTHS, formatDate, formatDatePill, jobStatusColor, jobStatusLabel, thaiYear } from '@/lib/utils'
import type { CalendarEntry, Job } from '@/lib/types'

const WEEKDAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']
const MAX_CHIPS = 3
/** แถบงานในตาราง: สูง 18 + ช่องไฟ 2 · เริ่มใต้เลขวัน (padding 4 + วงกลม 24 + 2) */
const LANE_H = 20
const LANE_TOP = 30

interface Segment { item: Item; c0: number; c1: number; lane: number; contLeft: boolean; contRight: boolean }

/**
 * ตัดรายการเป็นท่อนละสัปดาห์แล้วจัดเลน — งานหลายวันเป็นแถบเดียวพาดข้ามช่องวัน (ขึ้นสัปดาห์ใหม่ = ท่อนใหม่)
 * เรียง: เริ่มก่อน → ยาวกว่า → งานก่อนโน้ต แล้วใส่เลนแรกที่ว่าง (แถบเดิมจึงอยู่เลนเดิมตลอดสัปดาห์)
 */
function weekSegments(week: string[], items: Item[]): Segment[] {
  const ws = week[0], we = week[6]
  const segs = items
    .filter((it) => it.start <= we && it.end >= ws)
    .map((it) => ({
      item: it,
      c0: it.start < ws ? 0 : week.indexOf(it.start),
      c1: it.end > we ? 6 : week.indexOf(it.end),
      lane: 0,
      contLeft: it.start < ws,
      contRight: it.end > we,
    }))
    .sort((a, b) => a.c0 - b.c0 || (b.c1 - b.c0) - (a.c1 - a.c0) || (a.item.job ? 0 : 1) - (b.item.job ? 0 : 1) || a.item.title.localeCompare(b.item.title))
  const laneEnd: number[] = []
  for (const sg of segs) {
    let l = laneEnd.findIndex((end) => end < sg.c0)
    if (l < 0) { l = laneEnd.length; laneEnd.push(sg.c1) } else laneEnd[l] = sg.c1
    sg.lane = l
  }
  return segs
}
const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand'

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** รายการที่โชว์บนปฏิทิน — งานอ่านชื่อ/วันจาก jobs สด โน้ตใช้ค่าของตัวเอง */
interface Item {
  entry: CalendarEntry
  job?: Job
  title: string
  start: string
  end: string
  /** สีแถบ — undefined = สีแบรนด์ (งานที่ไม่ได้ตั้งสี) */
  color?: string
}

function toItem(entry: CalendarEntry, jobs: Map<string, Job>): Item | null {
  if (entry.type === 'job') {
    const job = entry.jobId ? jobs.get(entry.jobId) : undefined
    if (!job?.date) return null // งานถูกลบ/ไม่มีวัน — ไม่โชว์บนตาราง (ยังลบออกได้จากรายการด้านล่าง)
    return { entry, job, title: job.title, start: job.date, end: job.endDate && job.endDate > job.date ? job.endDate : job.date }
  }
  if (!entry.date) return null
  return { entry, title: entry.title || 'โน้ต', start: entry.date, end: entry.endDate && entry.endDate > entry.date ? entry.endDate : entry.date }
}

type Editing =
  | { kind: 'note'; entry?: CalendarEntry; date: string }
  | { kind: 'job'; entry: CalendarEntry }

/**
 * ปฏิทินงาน — ดึงงานจาก "งานถ่ายทอดสด" มาวางบนปฏิทิน (เลือกเองว่างานไหนขึ้น) + โน้ตอิสระ
 * กดวันว่าง = เพิ่มโน้ตวันนั้น · กดรายการ = แก้โน้ต/เอาออก
 */
export default function CalendarPage() {
  const today = ymd(new Date())
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const [jobs, setJobs] = useState<Job[]>([])
  const [entries, setEntries] = useState<CalendarEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [dayOpen, setDayOpen] = useState<string | null>(null)
  const [acctStatuses, setAcctStatuses] = useState<AccountingStatusDef[]>([])

  useEffect(() => {
    Promise.all([getJobsWithBudget(), getCalendarEntries(), getAccountingStatuses().catch(() => [])])
      .then(([j, e, st]) => { setJobs(j); setEntries(e); setAcctStatuses(st) })
      .catch((e) => { console.error(e); setError('โหลดปฏิทินไม่สำเร็จ') })
      .finally(() => setLoading(false))
  }, [])

  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs])
  const items = useMemo(() => {
    const acct = new Map(acctStatuses.map((st) => [st.id, st.color]))
    return entries.map((e) => toItem(e, jobById)).filter((x): x is Item => !!x).map((it) => ({
      ...it,
      // งาน = สีของสถานะบัญชี (ไม่ระบุ = สีแบรนด์) · โน้ต = สีที่เลือก
      color: it.job ? acct.get(it.job.accountingStatus ?? '') : it.entry.color ?? CALENDAR_COLORS[0].value,
    }))
  }, [entries, jobById, acctStatuses])

  const changeAccounting = async (job: Job, id: string) => {
    const prev = job.accountingStatus
    const put = (v: string | undefined) => setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, accountingStatus: v } : j)))
    put(id || undefined)
    try { await setJobAccountingStatus(job.id, id) } catch (e) { console.error(e); put(prev) }
  }
  const orphans = entries.filter((e) => e.type === 'job' && !(e.jobId && jobById.get(e.jobId)?.date))

  // ตาราง 6 สัปดาห์ เริ่มวันอาทิตย์
  const first = new Date(cursor.y, cursor.m, 1)
  const gridStart = new Date(cursor.y, cursor.m, 1 - first.getDay())
  const days = Array.from({ length: 42 }, (_, i) => ymd(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i)))
  const monthKey = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}`
  const onDay = (day: string) => items
    .filter((it) => it.start <= day && day <= it.end)
    .sort((a, b) => (a.entry.type === b.entry.type ? a.start.localeCompare(b.start) : a.entry.type === 'job' ? -1 : 1))
  const monthItems = items
    .filter((it) => it.start.slice(0, 7) <= monthKey && it.end.slice(0, 7) >= monthKey)
    .sort((a, b) => a.start.localeCompare(b.start))

  const shift = (n: number) => setCursor(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() } })

  const onSaved = (e: CalendarEntry) => setEntries((list) => (list.some((x) => x.id === e.id) ? list.map((x) => (x.id === e.id ? e : x)) : [...list, e]))
  const onRemoved = (id: string) => setEntries((list) => list.filter((x) => x.id !== id))
  const openItem = (it: Item) => setEditing(it.entry.type === 'job' ? { kind: 'job', entry: it.entry } : { kind: 'note', entry: it.entry, date: it.start })

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ปฏิทินงาน</h1>
          <p className="text-gray-500 mt-1">ดึงงานจากรายการงานถ่ายทอดสดมาวาง และจดโน้ตต่างๆ ตามวัน</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEditing({ kind: 'note', date: today })} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50">
            <PencilSquareIcon className="w-4 h-4" /> เพิ่มโน้ต
          </button>
          <button onClick={() => setShowPicker(true)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium bg-brand text-white hover:bg-brand-dark">
            <PlusIcon className="w-4 h-4" /> เพิ่มงานจากรายการงาน
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <button onClick={() => shift(-1)} aria-label="เดือนก่อน" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"><ChevronLeftIcon className="w-5 h-5" /></button>
          <h2 className="text-lg font-semibold text-gray-900 min-w-[170px] text-center">{THAI_MONTHS[cursor.m]} {thaiYear(cursor.y)}</h2>
          <button onClick={() => shift(1)} aria-label="เดือนถัดไป" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"><ChevronRightIcon className="w-5 h-5" /></button>
          <button onClick={() => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }) }} className="ml-1 px-3 py-1.5 rounded-lg border border-gray-200 text-sm hover:bg-gray-50">วันนี้</button>
          <div className="ml-auto flex items-center gap-3 text-xs text-gray-500 flex-wrap justify-end">
            <span className="hidden sm:inline-flex items-center gap-3 flex-wrap">
              {acctStatuses.map((st) => (
                <span key={st.id} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: st.color }} /> {st.label}</span>
              ))}
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand" /> งาน (ไม่ระบุบัญชี)</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> โน้ต</span>
            </span>
            <span className="hidden sm:inline-flex items-center gap-1"><CheckIcon className="w-3.5 h-3.5 stroke-[3] text-gray-500" /> ลง Google แล้ว</span>
          </div>
        </div>

        {loading ? (
          <div className="p-4"><Skeleton className="h-[480px] w-full rounded-xl" /></div>
        ) : (
          <div>
            <div className="grid grid-cols-7">
              {WEEKDAYS.map((w, i) => (
                <div key={w} className={`px-2 py-1.5 text-xs font-semibold text-center border-b border-gray-100 ${i === 0 ? 'text-gray-400' : 'text-gray-500'}`}>{w}</div>
              ))}
            </div>
            {Array.from({ length: 6 }, (_, w) => days.slice(w * 7, w * 7 + 7)).map((week) => {
              const segs = weekSegments(week, items)
              return (
                <div key={week[0]} className="relative grid grid-cols-7">
                  {week.map((day, weekday) => {
                    const inMonth = day.slice(0, 7) === monthKey
                    const hidden = segs.filter((sg) => sg.lane >= MAX_CHIPS && sg.c0 <= weekday && weekday <= sg.c1).length
                    return (
                      <div
                        key={day}
                        onClick={() => setEditing({ kind: 'note', date: day })}
                        className={`group min-h-[96px] sm:min-h-[112px] border-b border-r border-gray-100 p-1 cursor-pointer hover:bg-gray-50/70 ${weekday === 6 ? 'border-r-0' : ''} ${inMonth ? '' : 'bg-gray-50/60'}`}
                      >
                        <div className="flex items-center justify-between px-1">
                          {/* ทุกวันกล่อง 6×6 เท่ากัน — วงกลมวันนี้ไม่ดันแถวให้สูงกว่าวันอื่น */}
                          <span className={`w-6 h-6 -ml-1 rounded-full flex items-center justify-center text-xs tabular-nums ${day === today ? 'bg-brand text-white font-semibold' : inMonth ? (weekday === 0 ? 'text-gray-400' : 'text-gray-700') : 'text-gray-300'}`}>
                            {Number(day.slice(8))}
                          </span>
                          <PlusIcon className="w-3.5 h-3.5 text-gray-300 opacity-0 group-hover:opacity-100" />
                        </div>
                        {/* ที่ว่างให้แถบงาน (วางทับด้วย absolute ด้านล่าง) */}
                        <div style={{ height: Math.min(MAX_CHIPS, segs.reduce((m, sg) => (sg.c0 <= weekday && weekday <= sg.c1 ? Math.max(m, sg.lane + 1) : m), 0)) * LANE_H + 2 }} />
                        {hidden > 0 && (
                          <button onClick={(e) => { e.stopPropagation(); setDayOpen(day) }} className="relative w-full text-left px-1.5 text-[11px] text-gray-500 hover:text-gray-800">
                            +{hidden} รายการ
                          </button>
                        )}
                      </div>
                    )
                  })}
                  {segs.filter((sg) => sg.lane < MAX_CHIPS).map((sg) => (
                    <SpanBar key={sg.item.entry.id} seg={sg} onClick={() => openItem(sg.item)} />
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* รายการของเดือน — อ่านง่ายบนมือถือที่ช่องวันเล็ก */}
      {!loading && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <p className="px-5 py-3 text-sm font-semibold text-gray-800 border-b border-gray-100">รายการเดือน{THAI_MONTHS[cursor.m]} ({monthItems.length})</p>
          {monthItems.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400">ยังไม่มีงานหรือโน้ตในเดือนนี้ — กด “เพิ่มงานจากรายการงาน” หรือกดวันในปฏิทินเพื่อจดโน้ต</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {monthItems.map((it) => (
                <li key={it.entry.id}>
                  <button onClick={() => openItem(it)} className="w-full flex items-start gap-3 px-5 py-3 text-left hover:bg-gray-50">
                    <span className="shrink-0 w-24 text-xs text-gray-500 pt-0.5 tabular-nums">{it.start === it.end ? formatDatePill(it.start) : `${formatDatePill(it.start)} – ${formatDatePill(it.end)}`}</span>
                    <span className="shrink-0 w-2.5 h-2.5 rounded-full mt-1.5" style={{ background: it.color ?? 'var(--brand)' }} />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">{it.title}</span>
                        {it.job && <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${jobStatusColor(it.job.status)}`}>{jobStatusLabel(it.job.status)}</span>}
                        {it.job && acctStatuses.length > 0 && <AccountingPill status={acctStatuses.find((st) => st.id === it.job!.accountingStatus)} />}
                        <GoogleAddedBadge addedAt={it.entry.googleAddedAt} />
                      </span>
                      {it.job?.location && <span className="flex items-center gap-1 text-xs text-gray-500 mt-0.5"><MapPinIcon className="w-3.5 h-3.5" />{it.job.location}</span>}
                      {it.entry.note && <span className="block text-xs text-gray-600 mt-0.5 whitespace-pre-wrap">{it.entry.note}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {orphans.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-500 flex items-center gap-2 flex-wrap">
              งานที่ถูกลบหรือไม่มีวันที่ {orphans.length} รายการ
              <button
                onClick={async () => { for (const o of orphans) { await deleteCalendarEntry(o.id); onRemoved(o.id) } }}
                className="text-red-600 hover:underline"
              >
                เอาออกจากปฏิทิน
              </button>
            </div>
          )}
        </div>
      )}

      {showPicker && (
        <JobPicker
          jobs={jobs}
          onCalendar={new Set(entries.filter((e) => e.type === 'job').map((e) => e.jobId!))}
          month={monthKey}
          onClose={() => setShowPicker(false)}
          onAdded={(list) => { setEntries((cur) => [...cur, ...list]); setShowPicker(false) }}
        />
      )}
      {editing && (
        <EntryModal
          key={editing.entry?.id ?? `new-${editing.kind === 'note' ? editing.date : ''}`}
          editing={editing}
          job={editing.kind === 'job' && editing.entry.jobId ? jobById.get(editing.entry.jobId) : undefined}
          onClose={() => setEditing(null)}
          onSaved={(e) => { onSaved(e); setEditing(null) }}
          onRemoved={(id) => { onRemoved(id); setEditing(null) }}
          statuses={acctStatuses}
          onAccounting={changeAccounting}
          onGoogle={(e, at) => {
            const next = { ...e }
            if (at) next.googleAddedAt = at; else delete next.googleAddedAt
            setEntries((list) => list.map((x) => (x.id === e.id ? next : x)))
            setEditing((cur) => (cur?.kind === 'job' && cur.entry.id === e.id ? { kind: 'job', entry: next } : cur))
          }}
        />
      )}
      {dayOpen && (
        <Modal isOpen onClose={() => setDayOpen(null)} title={formatDate(dayOpen)} size="md">
          <div className="space-y-1.5">
            {onDay(dayOpen).map((it) => (
              <Chip key={it.entry.id} item={it} day={dayOpen} weekday={0} large onClick={() => { setDayOpen(null); openItem(it) }} />
            ))}
            <button onClick={() => { const d = dayOpen; setDayOpen(null); setEditing({ kind: 'note', date: d }) }} className="w-full mt-2 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-gray-300 text-sm text-gray-600 hover:border-brand hover:text-brand">
              <PlusIcon className="w-4 h-4" /> เพิ่มโน้ตวันนี้
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

/** แถบบนตารางเดือน — ตำแหน่ง absolute ตามคอลัมน์/เลน · ต่อจากสัปดาห์ก่อน/ไปสัปดาห์หน้า = ขอบฝั่งนั้นไม่มน */
function SpanBar({ seg, onClick }: { seg: Segment; onClick: () => void }) {
  const { item, c0, c1, lane, contLeft, contRight } = seg
  const color = item.color
  const inset = 4
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      title={item.title}
      className={`absolute h-[18px] flex items-center gap-1 px-1.5 text-[11px] text-left text-white hover:brightness-110 ${color ? '' : 'bg-brand'} ${contLeft ? 'rounded-l-none' : 'rounded-l-md'} ${contRight ? 'rounded-r-none' : 'rounded-r-md'}`}
      style={{
        top: LANE_TOP + lane * LANE_H,
        left: `calc(${(c0 / 7) * 100}% + ${contLeft ? 0 : inset}px)`,
        width: `calc(${((c1 - c0 + 1) / 7) * 100}% - ${(contLeft ? 0 : inset) + (contRight ? 0 : inset)}px)`,
        ...(color ? { background: color } : {}),
      }}
    >
      {item.job && <VideoCameraIcon className="w-3 h-3 shrink-0" />}
      <span className="truncate">{contLeft ? '↳ ' : ''}{item.title}</span>
      {item.entry.googleAddedAt && <CheckIcon className="w-3 h-3 shrink-0 ml-auto stroke-[3]" aria-label="ลง Google Calendar แล้ว" />}
    </button>
  )
}

/** แถบรายการในช่องวัน — งาน = สีแบรนด์, โน้ต = สีที่เลือก · วันต่อเนื่องของงานหลายวันจางลง (ชื่อโชว์วันแรก/ต้นสัปดาห์) */
function Chip({ item, day, weekday, onClick, large }: { item: Item; day: string; weekday: number; onClick: () => void; large?: boolean }) {
  const cont = item.start !== day && weekday !== 0 && !large
  const color = item.color
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      title={item.title}
      className={`w-full flex items-center gap-1 rounded-md text-left truncate ${large ? 'px-3 py-2 text-sm' : 'px-1.5 py-0.5 text-[11px]'} ${color ? '' : 'bg-brand'} text-white ${cont ? 'opacity-60' : ''} hover:brightness-110`}
      style={color ? { background: color } : undefined}
    >
      {item.job && <VideoCameraIcon className={`${large ? 'w-4 h-4' : 'w-3 h-3'} shrink-0`} />}
      <span className="truncate">{cont ? '↳ ' : ''}{item.title}</span>
      {item.entry.googleAddedAt && !cont && <CheckIcon className={`${large ? 'w-4 h-4' : 'w-3 h-3'} shrink-0 ml-auto stroke-[3]`} aria-label="ลง Google Calendar แล้ว" />}
    </button>
  )
}

/** เลือกงานจาก jobs มาวางบนปฏิทิน — งานที่อยู่บนปฏิทินแล้วไม่โชว์ · เรียงงานเดือนที่ดูอยู่ก่อน */
function JobPicker({ jobs, onCalendar, month, onClose, onAdded }: {
  jobs: Job[]; onCalendar: Set<string>; month: string; onClose: () => void; onAdded: (e: CalendarEntry[]) => void
}) {
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const kw = q.trim().toLowerCase()
  const list = jobs
    .filter((j) => !onCalendar.has(j.id) && j.status !== 'cancelled')
    .filter((j) => !kw || [j.title, j.location, j.clientName].some((v) => v?.toLowerCase().includes(kw)))
    .sort((a, b) => {
      const am = (a.date ?? '').startsWith(month) ? 0 : 1
      const bm = (b.date ?? '').startsWith(month) ? 0 : 1
      return am - bm || (b.date ?? '').localeCompare(a.date ?? '')
    })
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const add = async () => {
    setSaving(true)
    try {
      const added: CalendarEntry[] = []
      for (const id of picked) added.push(await addJobToCalendar(id))
      onAdded(added)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="เพิ่มงานจากรายการงานถ่ายทอดสด" size="lg">
      <div className="space-y-3">
        <label className="relative block">
          <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่องาน, สถานที่, ลูกค้า" className={`${inputCls} pl-9`} />
        </label>
        <ul className="max-h-[50vh] overflow-y-auto divide-y divide-gray-50 border border-gray-100 rounded-xl">
          {list.length === 0 && <li className="px-4 py-8 text-center text-sm text-gray-400">ไม่มีงานที่ยังไม่อยู่บนปฏิทิน</li>}
          {list.map((j) => (
            <li key={j.id}>
              <label className="flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50">
                <input type="checkbox" checked={picked.has(j.id)} onChange={() => toggle(j.id)} className="mt-1 accent-[var(--brand)]" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-gray-900">{j.title}</span>
                  <span className="block text-xs text-gray-500">
                    {j.date ? `${formatDate(j.date)}${j.endDate && j.endDate !== j.date ? ` – ${formatDate(j.endDate)}` : ''}` : 'ไม่มีวันที่'}
                    {j.location ? ` · ${j.location}` : ''}
                  </span>
                </span>
                <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${jobStatusColor(j.status)}`}>{jobStatusLabel(j.status)}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-end gap-2">
          <span className="mr-auto text-xs text-gray-500">เลือก {picked.size} งาน</span>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100">ยกเลิก</button>
          <button onClick={add} disabled={picked.size === 0 || saving} className="px-4 py-2 rounded-xl text-sm font-medium bg-brand text-white hover:bg-brand-dark disabled:opacity-40">
            {saving ? 'กำลังเพิ่ม...' : 'เพิ่มลงปฏิทิน'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** แก้โน้ต (ใหม่/เดิม) หรือแก้งานบนปฏิทิน (โน้ตของงาน + เอาออก) */
function EntryModal({ editing, job, onClose, onSaved, onRemoved, onGoogle, statuses, onAccounting }: {
  editing: Editing; job?: Job; onClose: () => void; onSaved: (e: CalendarEntry) => void; onRemoved: (id: string) => void
  onGoogle: (e: CalendarEntry, at: string | undefined) => void
  statuses: AccountingStatusDef[]
  onAccounting: (job: Job, statusId: string) => void
}) {
  const entry = editing.entry
  const isJob = editing.kind === 'job'
  const [title, setTitle] = useState(entry?.title ?? '')
  const [date, setDate] = useState(entry?.date ?? (editing.kind === 'note' ? editing.date : ''))
  const [endDate, setEndDate] = useState(entry?.endDate ?? '')
  const [note, setNote] = useState(entry?.note ?? '')
  const [color, setColor] = useState(entry?.color ?? CALENDAR_COLORS[0].value)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    if (!isJob && !title.trim()) { setErr('ใส่หัวข้อโน้ต'); return }
    if (!isJob && !date) { setErr('เลือกวันที่'); return }
    setSaving(true)
    try {
      const fields = isJob
        ? { note: note.trim() }
        : { title: title.trim(), date, endDate: endDate && endDate > date ? endDate : '', note: note.trim(), color }
      if (entry) {
        await updateCalendarEntry(entry.id, fields)
        const next = { ...entry, ...fields, updatedAt: new Date().toISOString() } as CalendarEntry
        for (const k of Object.keys(fields) as (keyof typeof fields)[]) if (!fields[k]) delete (next as unknown as Record<string, unknown>)[k]
        onSaved(next)
      } else {
        onSaved(await addCalendarEntry({ type: 'note', ...fields }))
      }
    } catch (e) {
      console.error(e)
      setErr('บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!entry) return
    setSaving(true)
    try { await deleteCalendarEntry(entry.id); onRemoved(entry.id) } finally { setSaving(false) }
  }

  return (
    <Modal isOpen onClose={onClose} title={isJob ? 'งานบนปฏิทิน' : entry ? 'แก้โน้ต' : 'เพิ่มโน้ต'} size="md">
      <div className="space-y-4">
        {isJob ? (
          <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm space-y-1">
            {job ? (
              <>
                <p className="font-semibold text-gray-900">{job.title}</p>
                <p className="text-gray-600">{formatDate(job.date)}{job.endDate && job.endDate !== job.date ? ` – ${formatDate(job.endDate)}` : ''}{job.location ? ` · ${job.location}` : ''}</p>
                {job.clientName && <p className="text-gray-500 text-xs">ลูกค้า: {job.clientName}</p>}
                <div className="flex items-center gap-2 pt-1">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${jobStatusColor(job.status)}`}>{jobStatusLabel(job.status)}</span>
                  <Link href={`/admin/jobs/new?id=${job.id}`} className="text-xs text-brand hover:underline">แก้ไขงาน</Link>
                  {entry && <GoogleCalendarButton job={job} addedAt={entry.googleAddedAt} onChange={(at) => onGoogle(entry, at)} />}
                  {entry && <GoogleAddedBadge addedAt={entry.googleAddedAt} onRemove={() => setGoogleAdded(job.id, false).then(() => onGoogle(entry, undefined))} />}
                </div>
                {statuses.length > 0 && (
                  <div className="flex items-center gap-2 pt-1.5">
                    <span className="text-xs text-gray-500">สถานะบัญชี (= สีบนปฏิทิน)</span>
                    {/* เปลี่ยนแล้วบันทึกทันที (ไม่ต้องกดบันทึกของหน้าต่างนี้) */}
                    <AccountingStatusMenu statuses={statuses} value={job.accountingStatus} onChange={(id) => onAccounting(job, id)} />
                  </div>
                )}
                <p className="text-[11px] text-gray-400 pt-1">ชื่อ/วัน/สถานที่มาจากรายการงาน — กด “แก้ไขงาน” แล้วปฏิทินเปลี่ยนตาม</p>
              </>
            ) : <p className="text-gray-500">งานนี้ถูกลบหรือไม่มีวันที่แล้ว</p>}
          </div>
        ) : null}
        {!isJob && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">หัวข้อ *</label>
              <input autoFocus className={inputCls} value={title} onChange={(e) => { setTitle(e.target.value); setErr('') }} placeholder="เช่น ส่งของคืนร้านเช่า, ประชุมลูกค้า" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">วันที่ *</label>
                <FormDatePicker value={date} onChange={(v) => { setDate(v ?? ''); setErr('') }} />
              </div>
              <div>
                <label className="flex items-center justify-between text-sm font-medium text-gray-700 mb-1.5">
                  ถึงวันที่
                  {endDate && <button type="button" onClick={() => setEndDate('')} className="text-xs font-normal text-gray-400 hover:text-gray-700">ล้าง (วันเดียว)</button>}
                </label>
                <FormDatePicker value={endDate} onChange={(v) => setEndDate(v ?? '')} minDate={date || undefined} placeholder="วันเดียว" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">สี</label>
              <div className="flex gap-2">
                {CALENDAR_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setColor(c.value)}
                    title={c.label}
                    className={`w-7 h-7 rounded-full ring-offset-2 ${color === c.value ? 'ring-2 ring-gray-900' : ''}`}
                    style={{ background: c.value }}
                  />
                ))}
              </div>
            </div>
          </>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">{isJob ? 'โน้ตของงานนี้' : 'รายละเอียด'}</label>
          <textarea className={inputCls} rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder={isJob ? 'เช่น เข้าโหลดของ 06:00, ติดต่อคุณ...' : ''} />
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex items-center gap-2">
          {entry && (
            <button onClick={remove} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-red-600 hover:bg-red-50 disabled:opacity-40">
              <TrashIcon className="w-4 h-4" /> {isJob ? 'เอาออกจากปฏิทิน' : 'ลบโน้ต'}
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100">ยกเลิก</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-medium bg-brand text-white hover:bg-brand-dark disabled:opacity-40">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
