import {
  createJob, getFreelancers, getJobWithBudget, getJobsWithBudget, sendJobDetails, updateJob,
} from '../firebase-utils'
import { addCalendarEntry, addJobToCalendar, CALENDAR_COLORS, getCalendarEntries } from '../calendar'
import { getAccountingStatuses, setJobAccountingStatus, type AccountingStatusDef } from '../job-accounting'
import { createEquipmentPlan, getEquipmentPlan, getEquipmentPlans, updateEquipmentPlan } from '../equipment/plans'
import { getEquipmentList } from '../equipment/equipment'
import { categoryLabel } from '../equipment/constants'
import { DEFAULT_VIDEO_FORMAT, VIDEO_PRESETS, formatShortLabel, formatFullLabel } from '../equipment/video-format'
import { mergeStagedDrafts, runEquipmentAgent, type AgentDraft, type AgentEvent } from '../equipment/agent'
import { effectiveSystemPrompt, getAgentSettings } from '../equipment/agent-settings'
import { createRevision, isModifiedSinceRevision } from '../equipment/revisions'
import { jobStatusLabel } from '../utils'
import type { Job, JobStatus } from '../types'

/**
 * tool ของผู้ช่วย AI ทั้งระบบ — นิยาม (ส่งให้ Claude ผ่าน function systemAgent) + ตัวรันที่หน้าเว็บ
 * รันในสิทธิ์แอดมินที่ login อยู่ ใช้ฟังก์ชันเดิมของแอป (กฎ budget → jobFinance, งานใหม่ลงปฏิทิน, revision ก่อนใช้ร่าง AI ฯลฯ)
 * tool ที่เขียนข้อมูล (WRITE_TOOLS) ต้องให้ผู้ใช้กดอนุมัติก่อน · ส่ง LINE (ALWAYS_CONFIRM) ต้องอนุมัติเสมอแม้เปิดอนุมัติอัตโนมัติ
 */

export interface AgentTool {
  name: string
  description: string
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
}

const JOB_STATUSES: JobStatus[] = ['draft', 'published', 'in_progress', 'completed', 'cancelled']
const date = (description: string) => ({ type: 'string', description: `${description} รูปแบบ YYYY-MM-DD (ค.ศ.)` })

export const AGENT_TOOLS: AgentTool[] = [
  // ── อ่าน ──────────────────────────────────────────────────────────────
  {
    name: 'list_jobs',
    description: 'ค้นหางานถ่ายทอดสด (เรียงวันใหม่→เก่า) คืน id ชื่อ วันที่ สถานที่ ลูกค้า สถานะงาน สถานะบัญชี ราคาขาย — ใช้หา jobId ก่อนแก้งานเสมอ',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'คำค้นในชื่องาน/สถานที่/ลูกค้า (ไม่ใส่ = ทั้งหมด)' },
        from: date('ตั้งแต่วันที่'),
        to: date('ถึงวันที่'),
        status: { type: 'string', enum: JOB_STATUSES },
        limit: { type: 'number', description: 'จำนวนสูงสุด (ค่าเริ่มต้น 30, สูงสุด 100)' },
      },
    },
  },
  {
    name: 'get_job',
    description: 'รายละเอียดงานเต็ม (รวมรายละเอียด/หมายเหตุ/ราคาขาย/สถานะบัญชี)',
    input_schema: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'] },
  },
  {
    name: 'list_accounting_statuses',
    description: 'รายการสถานะทางบัญชีที่ตั้งไว้ (id + ชื่อ)',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_calendar',
    description: 'รายการบนปฏิทินงานในช่วงวันที่ (งาน + โน้ต)',
    input_schema: { type: 'object', properties: { from: date('ตั้งแต่'), to: date('ถึง') }, required: ['from', 'to'] },
  },
  {
    name: 'list_plans',
    description: 'ค้นหาแผนจัดอุปกรณ์ OB คืน id ชื่อ วันที่ งานที่ผูก จำนวนรายการ/ผังระบบ/ผังวาง 3D',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' }, jobId: { type: 'string', description: 'เฉพาะแผนของงานนี้' } },
    },
  },
  {
    name: 'get_plan',
    description: 'สรุปแผน: รายการอุปกรณ์ (ชื่อ จำนวน ปลายทาง) ผังระบบ (ชื่อกล่อง จำนวนเส้น) ผังวาง 3D ระบบภาพ',
    input_schema: { type: 'object', properties: { planId: { type: 'string' } }, required: ['planId'] },
  },
  {
    name: 'search_equipment',
    description: 'ค้นอุปกรณ์ในสต็อก (ชื่อ ยี่ห้อ รุ่น หมวด จำนวน) — ไว้ตอบคำถาม การจัดของเข้าแผนให้ใช้ run_equipment_agent',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'list_freelancers',
    description: 'ค้นหา freelancer (id ชื่อ ชื่อ LINE มี LINE ไหม) — ใช้ก่อน send_job_details',
    input_schema: { type: 'object', properties: { query: { type: 'string' } } },
  },
  // ── เขียน (ต้องอนุมัติ) ────────────────────────────────────────────────
  {
    name: 'create_job',
    description: 'สร้างงานถ่ายทอดสดใหม่ (ลงปฏิทินงานให้อัตโนมัติ) — ถามผู้ใช้ก่อนถ้าไม่รู้ชื่องาน วันที่ สถานที่ หรือลูกค้า',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        date: date('วันเริ่มงาน'),
        endDate: date('วันสุดท้าย (งานหลายวัน)'),
        location: { type: 'string' },
        clientName: { type: 'string', description: 'ชื่อลูกค้า / Event' },
        docNumber: { type: 'string', description: 'เลขที่เอกสารอ้างอิง (ใบเสนอราคา/PO) ถ้าผู้ใช้บอก' },
        description: { type: 'string' },
        status: { type: 'string', enum: JOB_STATUSES, description: 'ค่าเริ่มต้น draft' },
        budget: { type: 'number', description: 'ราคาขาย (บาท) ถ้าผู้ใช้บอก' },
        accountingStatus: { type: 'string', description: 'id หรือชื่อสถานะบัญชี' },
        notes: { type: 'string' },
      },
      required: ['title', 'date', 'location', 'clientName'],
    },
  },
  {
    name: 'update_job',
    description: 'แก้ไขงาน ส่งเฉพาะ field ที่เปลี่ยน',
    input_schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        title: { type: 'string' }, date: date('วันเริ่ม'), endDate: date('วันสุดท้าย ("" = งานวันเดียว)'),
        location: { type: 'string' }, clientName: { type: 'string' }, docNumber: { type: 'string' }, description: { type: 'string' },
        status: { type: 'string', enum: JOB_STATUSES }, budget: { type: 'number' }, notes: { type: 'string' },
      },
      required: ['jobId'],
    },
  },
  {
    name: 'set_job_accounting_status',
    description: 'ตั้งสถานะทางบัญชีของงาน ("" = ไม่ระบุ)',
    input_schema: {
      type: 'object',
      properties: { jobId: { type: 'string' }, status: { type: 'string', description: 'id หรือชื่อสถานะ' } },
      required: ['jobId', 'status'],
    },
  },
  {
    name: 'add_calendar_note',
    description: 'เพิ่มโน้ตบนปฏิทินงาน',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' }, date: date('วันที่'), endDate: date('ถึงวันที่ (ไม่ใส่ = วันเดียว)'),
        note: { type: 'string' },
        color: { type: 'string', enum: CALENDAR_COLORS.map((c) => c.label), description: 'สีโน้ต' },
      },
      required: ['title', 'date'],
    },
  },
  {
    name: 'create_plan',
    description: 'สร้างแผนจัดอุปกรณ์ OB ใหม่ (ว่าง) — ผูกกับงานได้ ถ้าใส่ jobId ชื่อ/วัน/สถานที่ตั้งตามงานให้ · ระบบภาพเริ่มต้น 1080i50',
    input_schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        title: { type: 'string', description: 'ไม่ใส่ = ชื่องาน' },
        date: date('วันงาน'), endDate: date('วันสุดท้าย'), location: { type: 'string' }, notes: { type: 'string' },
        videoFormat: { type: 'string', enum: VIDEO_PRESETS.map((f) => `${formatShortLabel(f)}${f.range === 'SDR' ? '' : ` ${f.range}`}`) },
      },
    },
  },
  {
    name: 'run_equipment_agent',
    description: [
      'สั่งผู้ช่วยจัดอุปกรณ์ของแผน (ตัวเดียวกับปุ่ม "ผู้ช่วย AI" ในหน้าแผน): จัดของจากสต็อก เลนส์ ปลายทาง ผังวาง 3D และวาดผังระบบ',
      'แล้วนำร่างไปใช้กับแผนเลย (บันทึก revision ของเดิมไว้ก่อน ย้อนได้) — ใช้เวลาหลายนาที',
      'instruction เขียนเป็นภาษาคนแบบที่ผู้ใช้จะพิมพ์ในหน้าแผน เช่น "กล้อง 6 ตัว ATEM 2 M/E ส่ง FOH 2 จอ วาดผังระบบ"',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        instruction: { type: 'string' },
        staged: { type: 'boolean', description: 'แบ่ง 2 ขั้น จัดของ → วาดผัง (ค่าเริ่มต้น true เมื่อแผนยังว่าง)' },
      },
      required: ['planId', 'instruction'],
    },
  },
  {
    name: 'send_job_details',
    description: 'ส่งรายละเอียดงานให้ freelancer ทาง LINE (มีปุ่มดูแผนงานถ้าแผนเปิดแชร์) — ใช้โควตา LINE คนละ 1 ข้อความ',
    input_schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        freelancerIds: { type: 'array', items: { type: 'string' } },
        message: { type: 'string', description: 'ข้อความเพิ่มเติมจากแอดมิน' },
      },
      required: ['jobId', 'freelancerIds'],
    },
  },
]

export const WRITE_TOOLS = new Set([
  'create_job', 'update_job', 'set_job_accounting_status', 'add_calendar_note', 'create_plan', 'run_equipment_agent', 'send_job_details',
])
/** อนุมัติเสมอแม้เปิดอนุมัติอัตโนมัติ — ส่งออกไปหาคนนอกระบบ */
export const ALWAYS_CONFIRM = new Set(['send_job_details'])

// ── ตัวรัน ─────────────────────────────────────────────────────────────────

export interface ToolContext {
  userEmail?: string
  /** ความคืบหน้าของ tool ที่ใช้เวลานาน (run_equipment_agent) */
  onProgress?: (text: string) => void
  onAgentEvent?: (e: AgentEvent) => void
  signal?: AbortSignal
}

/** ผลที่หน้าเว็บโชว์ลิงก์ได้ + ข้อความ (JSON) ที่ส่งกลับให้ Claude */
export interface ToolOutcome {
  content: string
  isError?: boolean
  link?: { href: string; label: string }
}

type In = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const optStr = (v: unknown) => (typeof v === 'string' ? v.trim() : undefined)
const ISO = /^\d{4}-\d{2}-\d{2}$/
function needDate(v: unknown, label: string): string {
  const s = str(v)
  if (!ISO.test(s)) throw new Error(`${label} ต้องเป็น YYYY-MM-DD`)
  return s
}
const ok = (data: unknown, link?: ToolOutcome['link']): ToolOutcome => ({ content: JSON.stringify(data), ...(link ? { link } : {}) })

let statusCache: AccountingStatusDef[] | null = null
async function statuses() {
  statusCache ??= await getAccountingStatuses()
  return statusCache
}
async function resolveStatus(v: unknown): Promise<string> {
  const s = str(v)
  if (!s) return ''
  const list = await statuses()
  const hit = list.find((x) => x.id === s) ?? list.find((x) => x.label === s) ?? list.find((x) => x.label.includes(s))
  if (!hit) throw new Error(`ไม่พบสถานะบัญชี "${s}" — มี: ${list.map((x) => x.label).join(', ')}`)
  return hit.id
}

function jobRow(j: Job, st: AccountingStatusDef[]) {
  return {
    id: j.id, title: j.title, date: j.date, ...(j.endDate && j.endDate !== j.date ? { endDate: j.endDate } : {}),
    location: j.location, client: j.clientName, ...(j.docNumber ? { docNumber: j.docNumber } : {}), status: jobStatusLabel(j.status),
    accounting: st.find((x) => x.id === j.accountingStatus)?.label ?? 'ไม่ระบุ',
    ...(j.budget ? { budget: j.budget } : {}),
  }
}

function parseVideoFormat(v: unknown) {
  const s = str(v)
  if (!s) return DEFAULT_VIDEO_FORMAT
  const hit = VIDEO_PRESETS.find((f) => `${formatShortLabel(f)}${f.range === 'SDR' ? '' : ` ${f.range}`}` === s)
  if (!hit) throw new Error(`ระบบภาพ "${s}" ไม่รู้จัก`)
  return hit
}

export async function executeTool(name: string, input: In, ctx: ToolContext): Promise<ToolOutcome> {
  switch (name) {
    case 'list_jobs': {
      const q = str(input.query).toLowerCase()
      const from = str(input.from), to = str(input.to)
      const limit = Math.min(100, Math.max(1, Number(input.limit) || 30))
      const [jobs, st] = await Promise.all([getJobsWithBudget(), statuses()])
      const list = jobs
        .filter((j) => !q || [j.title, j.location, j.clientName, j.docNumber].some((x) => x?.toLowerCase().includes(q)))
        .filter((j) => !from || (j.endDate || j.date) >= from)
        .filter((j) => !to || j.date <= to)
        .filter((j) => !input.status || j.status === input.status)
      return ok({ total: list.length, jobs: list.slice(0, limit).map((j) => jobRow(j, st)) })
    }
    case 'get_job': {
      const j = await getJobWithBudget(str(input.jobId))
      if (!j) throw new Error('ไม่พบงาน')
      return ok({ ...jobRow(j, await statuses()), description: j.description, notes: j.notes, paymentCycle: j.paymentCycle })
    }
    case 'list_accounting_statuses':
      return ok((await statuses()).map((s) => ({ id: s.id, label: s.label })))
    case 'list_calendar': {
      const from = needDate(input.from, 'from'), to = needDate(input.to, 'to')
      const [entries, jobs] = await Promise.all([getCalendarEntries(), getJobsWithBudget()])
      const byId = new Map(jobs.map((j) => [j.id, j]))
      const rows = entries.flatMap((e) => {
        const j = e.type === 'job' && e.jobId ? byId.get(e.jobId) : undefined
        const start = j?.date ?? e.date
        const end = (j ? j.endDate : e.endDate) || start
        if (!start || start > to || (end ?? start) < from) return []
        return [{ type: e.type, title: j?.title ?? e.title, date: start, ...(end !== start ? { endDate: end } : {}), ...(e.note ? { note: e.note } : {}), ...(j ? { jobId: j.id } : {}) }]
      })
      return ok(rows.sort((a, b) => a.date!.localeCompare(b.date!)))
    }
    case 'list_plans': {
      const q = str(input.query).toLowerCase()
      const jobId = str(input.jobId)
      const plans = (await getEquipmentPlans())
        .filter((p) => !jobId || p.jobId === jobId)
        .filter((p) => !q || [p.title, p.jobTitle, p.location].some((x) => x?.toLowerCase().includes(q)))
      return ok(plans.slice(0, 50).map((p) => ({
        id: p.id, title: p.title, date: p.date, location: p.location, jobId: p.jobId, status: p.status,
        items: p.items.length, diagrams: p.diagrams.length, layouts: p.layouts?.length ?? 0,
      })))
    }
    case 'get_plan': {
      const p = await getEquipmentPlan(str(input.planId))
      if (!p) throw new Error('ไม่พบแผน')
      return ok({
        id: p.id, title: p.title, date: p.date, endDate: p.endDate, location: p.location, jobId: p.jobId, notes: p.notes,
        videoFormat: p.videoFormat ? formatFullLabel(p.videoFormat) : undefined,
        items: p.items.slice(0, 300).map((i) => ({ name: i.name, qty: i.quantity, to: i.toLocation, category: categoryLabel(i.category) })),
        diagrams: p.diagrams.map((d) => ({ name: d.name, nodes: d.nodes.map((n) => n.label).slice(0, 80), edges: d.edges.length })),
        layouts: (p.layouts ?? []).map((l) => ({ name: l.name, venue: l.venue.name, objects: l.objects.length, cables: l.cables?.length ?? 0 })),
      }, { href: `/admin/equipment/plans/edit?id=${p.id}`, label: 'เปิดแผน' })
    }
    case 'search_equipment': {
      const q = str(input.query).toLowerCase()
      const eq = await getEquipmentList()
      const hits = eq.filter((e) => e.status !== 'retired' && [e.name, e.brand, e.model, e.code].some((x) => x?.toLowerCase().includes(q)))
      return ok(hits.slice(0, 40).map((e) => ({ code: e.code, name: e.name, category: categoryLabel(e.category), qty: e.quantity, status: e.status, ownership: e.ownership ?? 'owned' })))
    }
    case 'list_freelancers': {
      const q = str(input.query).toLowerCase()
      const fl = (await getFreelancers()).filter((f) => f.isActive !== false)
      return ok(fl.filter((f) => !q || [f.name, f.lineDisplayName, f.phone].some((x) => x?.toLowerCase().includes(q)))
        .slice(0, 60).map((f) => ({ id: f.id, name: f.name, lineName: f.lineDisplayName, hasLine: !!f.lineUserId })))
    }

    case 'create_job': {
      const d = needDate(input.date, 'date')
      const end = optStr(input.endDate)
      if (end && !ISO.test(end)) throw new Error('endDate ต้องเป็น YYYY-MM-DD')
      const accountingStatus = await resolveStatus(input.accountingStatus)
      const data = {
        title: str(input.title), date: d, ...(end && end > d ? { endDate: end } : {}),
        location: str(input.location), clientName: str(input.clientName), description: str(input.description),
        status: (JOB_STATUSES.includes(input.status as JobStatus) ? input.status : 'draft') as JobStatus,
        budget: typeof input.budget === 'number' ? input.budget : 0,
        ...(accountingStatus ? { accountingStatus } : {}),
        ...(optStr(input.notes) ? { notes: str(input.notes) } : {}),
        ...(optStr(input.docNumber) ? { docNumber: str(input.docNumber) } : {}),
      }
      if (!data.title) throw new Error('ต้องมีชื่องาน')
      const id = await createJob(data)
      await addJobToCalendar(id).catch(() => {})
      return ok({ jobId: id, created: data.title, addedToCalendar: true }, { href: `/admin/jobs/new?id=${id}`, label: 'เปิดงาน' })
    }
    case 'update_job': {
      const jobId = str(input.jobId)
      const cur = await getJobWithBudget(jobId)
      if (!cur) throw new Error('ไม่พบงาน')
      const patch: Partial<Job> = {}
      for (const k of ['title', 'location', 'clientName', 'docNumber', 'description', 'notes'] as const) if (typeof input[k] === 'string') patch[k] = str(input[k])
      if (input.date !== undefined) patch.date = needDate(input.date, 'date')
      if (typeof input.endDate === 'string') {
        const e = str(input.endDate)
        if (e && !ISO.test(e)) throw new Error('endDate ต้องเป็น YYYY-MM-DD')
        patch.endDate = e && e > (patch.date ?? cur.date) ? e : ''
      }
      if (JOB_STATUSES.includes(input.status as JobStatus)) patch.status = input.status as JobStatus
      if (typeof input.budget === 'number') patch.budget = input.budget
      if (!Object.keys(patch).length) throw new Error('ไม่มี field ที่จะแก้')
      await updateJob(jobId, patch)
      return ok({ jobId, updated: Object.keys(patch) }, { href: `/admin/jobs/new?id=${jobId}`, label: 'เปิดงาน' })
    }
    case 'set_job_accounting_status': {
      const jobId = str(input.jobId)
      const id = await resolveStatus(input.status)
      await setJobAccountingStatus(jobId, id)
      return ok({ jobId, accounting: (await statuses()).find((s) => s.id === id)?.label ?? 'ไม่ระบุ' })
    }
    case 'add_calendar_note': {
      const d = needDate(input.date, 'date')
      const end = optStr(input.endDate)
      const color = CALENDAR_COLORS.find((c) => c.label === input.color)?.value ?? CALENDAR_COLORS[0].value
      const e = await addCalendarEntry({ type: 'note', title: str(input.title), date: d, endDate: end && end > d ? end : undefined, note: optStr(input.note), color })
      return ok({ noteId: e.id }, { href: '/admin/calendar', label: 'เปิดปฏิทิน' })
    }
    case 'create_plan': {
      const jobId = str(input.jobId)
      const job = jobId ? await getJobWithBudget(jobId) : null
      if (jobId && !job) throw new Error('ไม่พบงาน')
      const title = str(input.title) || job?.title || ''
      if (!title) throw new Error('ต้องมีชื่อแผน หรือ jobId')
      const d = optStr(input.date) || job?.date
      const id = await createEquipmentPlan({
        title,
        ...(job ? { jobId: job.id, jobTitle: job.title } : {}),
        date: d || undefined,
        endDate: optStr(input.endDate) || (job?.endDate && d === job.date ? job.endDate : undefined),
        location: optStr(input.location) || job?.location || undefined,
        notes: optStr(input.notes),
        videoFormat: parseVideoFormat(input.videoFormat),
        recordings: [],
        status: 'draft',
        items: [],
        diagrams: [],
      })
      return ok({ planId: id, title }, { href: `/admin/equipment/plans/edit?id=${id}`, label: 'เปิดแผน' })
    }
    case 'run_equipment_agent': {
      const planId = str(input.planId)
      const instruction = str(input.instruction)
      if (!instruction) throw new Error('ต้องมี instruction')
      const [plan, settings] = await Promise.all([getEquipmentPlan(planId), getAgentSettings()])
      if (!plan) throw new Error('ไม่พบแผน')
      const base = { items: plan.items, diagrams: plan.diagrams, layouts: plan.layouts ?? [] }
      const staged = typeof input.staged === 'boolean' ? input.staged : plan.items.length === 0
      const common = {
        plan, model: settings.defaultModel, effort: settings.defaultEffort, systemPrompt: effectiveSystemPrompt(settings), rules: settings.rules,
        onEvent: ctx.onAgentEvent, signal: ctx.signal,
      }
      let draft: AgentDraft
      if (staged) {
        ctx.onProgress?.('ขั้น 1/2 — จัดของ')
        const first = await runEquipmentAgent({ ...common, model: settings.phaseModels.items || common.model, base, instruction, history: [], phase: 'items' })
        ctx.onProgress?.('ขั้น 2/2 — วาดผังระบบ')
        const second = await runEquipmentAgent({
          ...common, model: settings.phaseModels.wiring || common.model,
          base: { items: first.items, diagrams: first.diagrams, layouts: first.layouts },
          instruction, history: [{ role: 'user', text: instruction }, { role: 'assistant', text: first.summary }], phase: 'wiring',
        })
        draft = mergeStagedDrafts(first, second)
      } else {
        ctx.onProgress?.('กำลังทำงาน')
        draft = await runEquipmentAgent({ ...common, base, instruction, history: [] })
      }
      // เหมือนกด "ใช้ร่างนี้" ในหน้าแผน: เก็บของเดิมเป็น revision ก่อน (ถ้ามีเนื้อหาและยังไม่ได้บันทึก)
      if ((plan.items.length || plan.diagrams.length) && isModifiedSinceRevision(plan)) {
        await createRevision(plan, { label: 'ก่อนใช้ร่าง AI', source: 'agent', createdBy: ctx.userEmail }).catch((e) => console.error(e))
      }
      await updateEquipmentPlan(planId, { items: draft.items, diagrams: draft.diagrams, layouts: draft.layouts })
      return ok({
        applied: true, summary: draft.summary, questions: draft.questions, issues: draft.issues.map((i) => `${i.level}: ${i.message}`),
        items: draft.items.length, diagrams: draft.diagrams.length, nodes: draft.diagrams.reduce((s, d) => s + d.nodes.length, 0),
        placed3d: draft.placed, ...(draft.stoppedEarly ? { stoppedEarly: draft.stoppedEarly } : {}),
        note: 'ถ้าเปิดหน้าแก้แผนนี้ค้างไว้ ให้รีเฟรชก่อนแก้ต่อ (ไม่งั้น autosave ของหน้านั้นจะทับ)',
      }, { href: `/admin/equipment/plans/edit?id=${planId}`, label: 'เปิดแผน' })
    }
    case 'send_job_details': {
      const ids = Array.isArray(input.freelancerIds) ? input.freelancerIds.filter((x): x is string => typeof x === 'string') : []
      if (!ids.length) throw new Error('ไม่ได้เลือก freelancer')
      const r = await sendJobDetails(str(input.jobId), ids, optStr(input.message))
      return ok(r)
    }
  }
  throw new Error(`ไม่รู้จัก tool ${name}`)
}

/** ข้อความสั้นๆ ของ action สำหรับการ์ดอนุมัติ */
export function describeAction(name: string, input: In): string {
  const f = (k: string, label: string) => (input[k] !== undefined && input[k] !== '' ? `${label}: ${Array.isArray(input[k]) ? (input[k] as unknown[]).length + ' คน' : String(input[k])}` : '')
  const lines = (arr: string[]) => arr.filter(Boolean).join('\n')
  switch (name) {
    case 'create_job': return lines(['สร้างงานใหม่', f('title', 'ชื่องาน'), f('date', 'วันที่'), f('endDate', 'ถึง'), f('location', 'สถานที่'), f('clientName', 'ลูกค้า'), f('docNumber', 'เลขที่เอกสาร'), f('status', 'สถานะ'), f('budget', 'ราคาขาย'), f('accountingStatus', 'สถานะบัญชี')])
    case 'update_job': return lines(['แก้ไขงาน', ...Object.keys(input).filter((k) => k !== 'jobId').map((k) => f(k, k))])
    case 'set_job_accounting_status': return lines(['ตั้งสถานะบัญชี', f('status', 'สถานะ')])
    case 'add_calendar_note': return lines(['เพิ่มโน้ตในปฏิทิน', f('title', 'หัวข้อ'), f('date', 'วันที่'), f('endDate', 'ถึง'), f('note', 'รายละเอียด')])
    case 'create_plan': return lines(['สร้างแผนจัดอุปกรณ์', f('title', 'ชื่อ'), f('jobId', 'งาน'), f('videoFormat', 'ระบบภาพ')])
    case 'run_equipment_agent': return lines(['ให้ผู้ช่วยจัดอุปกรณ์/วาดผัง แล้วใช้กับแผนเลย (บันทึก revision เดิมไว้)', f('instruction', 'คำสั่ง')])
    case 'send_job_details': return lines(['ส่งรายละเอียดงานทาง LINE', f('freelancerIds', 'ผู้รับ'), f('message', 'ข้อความ')])
  }
  return name
}
