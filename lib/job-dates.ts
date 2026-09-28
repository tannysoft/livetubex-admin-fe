import type { Job } from './types'
import { THAI_MONTHS_SHORT } from './utils'

/**
 * วันงานแบบเว้นวันได้ (เช่น 22–23 และ 25)
 * `Job.dates` = วันงานจริงเรียงแล้ว — **เก็บเฉพาะเมื่อไม่ติดกัน** · `date`/`endDate` = วันแรก/วันสุดท้ายเสมอ
 * (โค้ดที่ใช้ช่วงวัน เช่น กรองตามเดือน ยังถูก) — จุดที่ต้องรู้วันจริงให้ใช้ `jobDays()` / `jobDateRuns()`
 */

type JobDateFields = Pick<Job, 'date' | 'endDate' | 'dates'>

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** วันทั้งหมดในช่วง (รวมหัวท้าย) */
export function datesInRange(start: string, end?: string): string[] {
  if (!start) return []
  const out: string[] = []
  const cur = new Date(start + 'T00:00:00')
  const last = new Date((end && end > start ? end : start) + 'T00:00:00')
  while (cur <= last && out.length < 400) {
    out.push(ymd(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

/** วันงานจริงของงาน (เว้นวัน = ตาม dates, ไม่งั้น = ทุกวันในช่วง) */
export function jobDays(job: JobDateFields): string[] {
  if (job.dates?.length) return [...new Set(job.dates)].sort()
  return datesInRange(job.date, job.endDate)
}

function nextDay(d: string): string {
  const x = new Date(d + 'T00:00:00')
  x.setDate(x.getDate() + 1)
  return ymd(x)
}

/** รวมวันที่ติดกันเป็นช่วง: [22,23,25] → [{22,23},{25,25}] */
export function dateRuns(days: string[]): { start: string; end: string }[] {
  const sorted = [...new Set(days)].sort()
  const runs: { start: string; end: string }[] = []
  for (const d of sorted) {
    const last = runs[runs.length - 1]
    if (last && nextDay(last.end) === d) last.end = d
    else runs.push({ start: d, end: d })
  }
  return runs
}

export const jobDateRuns = (job: JobDateFields) => dateRuns(jobDays(job))

/** งานนี้เว้นวันไหม */
export const hasDateGaps = (job: JobDateFields) => jobDateRuns(job).length > 1

/**
 * รายการวัน (จากตัวเลือกหลายวัน) → field ที่เก็บใน jobs
 * ติดกัน = ช่วงธรรมดา (`dates: []` = ลบ field ตอนแก้งาน) · เว้นวัน = เก็บ dates ด้วย
 */
export function normalizeJobDates(days: string[]): { date: string; endDate: string; dates: string[] } {
  const sorted = [...new Set(days.filter(Boolean))].sort()
  if (!sorted.length) return { date: '', endDate: '', dates: [] }
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const gaps = dateRuns(sorted).length > 1
  return { date: first, endDate: last > first ? last : '', dates: gaps ? sorted : [] }
}

const part = (d: string) => {
  const x = new Date(d + 'T00:00:00')
  return { day: x.getDate(), month: x.getMonth(), year: x.getFullYear() + 543 }
}

/**
 * "22–23, 25 ก.ย. 2569" · ข้ามเดือน "30 ก.ย. – 2 ต.ค. 2569" · ข้ามปีใส่ปีทุกช่วง
 * ใช้แทน `formatDate(date) – formatDate(endDate)` ทุกที่ที่โชว์วันงาน
 */
export function formatDateRuns(runs: { start: string; end: string }[], opts: { shortYear?: boolean } = {}): string {
  if (!runs.length) return ''
  const yr = (y: number) => (opts.shortYear ? String(y % 100).padStart(2, '0') : String(y))
  const years = new Set(runs.flatMap((r) => [part(r.start).year, part(r.end).year]))
  const multiYear = years.size > 1
  const fmt = (d: string, withMonth: boolean, withYear: boolean) => {
    const p = part(d)
    return `${p.day}${withMonth ? ` ${THAI_MONTHS_SHORT[p.month]}` : ''}${withYear ? ` ${yr(p.year)}` : ''}`
  }
  const out: string[] = []
  runs.forEach((r, i) => {
    const s = part(r.start)
    const e = part(r.end)
    const next = runs[i + 1] ? part(runs[i + 1].start) : null
    // ใส่เดือนท้ายช่วง เมื่อช่วงถัดไปอยู่คนละเดือน (หรือเป็นช่วงสุดท้าย)
    const closeMonth = !next || next.month !== e.month || next.year !== e.year
    const withYear = multiYear ? closeMonth : !next
    if (r.start === r.end) {
      out.push(fmt(r.start, closeMonth, withYear))
    } else {
      const sameMonth = s.month === e.month && s.year === e.year
      out.push(sameMonth
        ? `${s.day}–${fmt(r.end, closeMonth, withYear)}`
        : `${fmt(r.start, true, multiYear && s.year !== e.year)} – ${fmt(r.end, true, withYear)}`)
    }
  })
  return out.join(', ')
}

export const formatJobDates = (job: JobDateFields, opts?: { shortYear?: boolean }) => (job.date ? formatDateRuns(jobDateRuns(job), opts) : '')
