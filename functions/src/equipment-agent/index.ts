import * as admin from 'firebase-admin'
import { HttpsError } from 'firebase-functions/v2/https'
import { DEFAULT_MODEL, describeApiError, runAgentGraph, type AgentEvent, type AgentEffort, type AgentPhase } from './graph'
import { Workspace, clipRange, type OtherPlanUsage } from './workspace'
import type { AgentPlanInput, Equipment, PlanItem } from './types'

export interface EquipmentAgentRequest {
  plan: AgentPlanInput
  instruction: string
  history?: { role: 'user' | 'assistant'; text: string }[]
  /** model ID ของ Anthropic เช่น claude-sonnet-5 — ไม่ส่ง/รูปแบบผิด = DEFAULT_MODEL */
  model?: string
  systemPrompt?: string
  rules?: string
  /** ขั้นของงาน — ไม่ส่ง = all (ทำทั้งหมดในรอบเดียว) */
  phase?: AgentPhase
  /** ระดับความคิด — ไม่ส่ง/ค่าผิด = medium */
  effort?: AgentEffort
}

const MAX_INSTRUCTION = 4000
const MAX_PROMPT = 30000
const MAX_RULES = 8000
/** ตรงกับ MODEL_ID_PATTERN ใน lib/equipment/agent-settings.ts */
const MODEL_ID_PATTERN = /^claude-[a-z0-9.-]+$/

/** ตรวจ payload แบบหยาบ — ข้อมูลมาจากหน้าเว็บของ admin เอง แต่กัน payload เพี้ยน/ใหญ่เกิน */
function parseRequest(data: unknown): EquipmentAgentRequest {
  const d = data as Partial<EquipmentAgentRequest> | null
  const instruction = typeof d?.instruction === 'string' ? d.instruction.trim() : ''
  if (!instruction) throw new HttpsError('invalid-argument', 'ต้องมีคำสั่ง')
  if (instruction.length > MAX_INSTRUCTION) throw new HttpsError('invalid-argument', `คำสั่งยาวเกิน ${MAX_INSTRUCTION} ตัวอักษร`)
  const plan = d?.plan
  if (!plan || typeof plan.id !== 'string' || !Array.isArray(plan.items) || !Array.isArray(plan.diagrams)) {
    throw new HttpsError('invalid-argument', 'ข้อมูลแผนไม่ครบ')
  }
  if (plan.items.length > 800 || plan.diagrams.length > 30) throw new HttpsError('invalid-argument', 'แผนใหญ่เกินกว่าที่ผู้ช่วยรองรับ')
  const history = (Array.isArray(d?.history) ? d!.history : [])
    .filter((h) => (h.role === 'user' || h.role === 'assistant') && typeof h.text === 'string')
    .slice(-12)
    .map((h) => ({ role: h.role, text: h.text.slice(0, 4000) }))
  const text = (v: unknown, max: number, label: string) => {
    if (v == null) return undefined
    if (typeof v !== 'string') throw new HttpsError('invalid-argument', `${label} ต้องเป็นข้อความ`)
    if (v.length > max) throw new HttpsError('invalid-argument', `${label} ยาวเกิน ${max} ตัวอักษร`)
    return v
  }
  return {
    plan, instruction, history,
    model: typeof d?.model === 'string' && MODEL_ID_PATTERN.test(d.model) ? d.model : DEFAULT_MODEL,
    systemPrompt: text(d?.systemPrompt, MAX_PROMPT, 'system prompt'),
    rules: text(d?.rules, MAX_RULES, 'กฎของทีม'),
    phase: d?.phase === 'items' || d?.phase === 'wiring' ? d.phase : 'all',
    effort: d?.effort === 'low' || d?.effort === 'medium' || d?.effort === 'high' ? d.effort : 'medium',
  }
}

function planRange(p: { date?: string; endDate?: string }): [string, string] | null {
  if (!p.date) return null
  return [p.date, p.endDate && p.endDate >= p.date ? p.endDate : p.date]
}

/** ฝาแฝดของ usageByEquipment() ใน lib/equipment/availability.ts — แผนอื่นที่วันทับกันและยังไม่ returned */
async function loadOtherUsage(plan: AgentPlanInput): Promise<OtherPlanUsage> {
  const mine = planRange(plan)
  const usage: OtherPlanUsage = { bookings: new Map(), plans: new Map(), noDate: !mine }
  if (!mine) return usage
  const snap = await admin.firestore().collection('equipmentPlans').get()
  for (const doc of snap.docs) {
    if (doc.id === plan.id) continue
    const p = doc.data() as { title?: string; date?: string; endDate?: string; status?: string; items?: PlanItem[] }
    if (p.status === 'returned') continue
    const r = planRange(p)
    if (!r || r[0] > mine[1] || mine[0] > r[1]) continue
    for (const it of p.items ?? []) {
      if (!it.equipmentId) continue
      // แถวที่ใช้ไม่เต็มงานจองเฉพาะวันที่ใช้ — ไม่ทับวันงานนี้ = ไม่นับ
      const ir = clipRange(it, { start: r[0], end: r[1] })
      if (ir.start > mine[1] || mine[0] > ir.end) continue
      const list = usage.bookings.get(it.equipmentId) ?? []
      list.push({ quantity: it.quantity || 0, start: ir.start, end: ir.end, title: p.title ?? doc.id })
      usage.bookings.set(it.equipmentId, list)
      const names = usage.plans.get(it.equipmentId) ?? []
      if (!names.includes(p.title ?? doc.id)) names.push(p.title ?? doc.id)
      usage.plans.set(it.equipmentId, names)
    }
  }
  return usage
}

export async function handleEquipmentAgent(data: unknown, apiKey: string, onEvent?: (e: AgentEvent) => void) {
  const req = parseRequest(data)
  if (!apiKey) throw new HttpsError('failed-precondition', 'ยังไม่ได้ตั้ง ANTHROPIC_API_KEY ใน Secret Manager')

  const [eqSnap, usage] = await Promise.all([
    admin.firestore().collection('equipment').get(),
    loadOtherUsage(req.plan),
  ])
  const equipment = eqSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Equipment))
  const ws = new Workspace(req.plan, equipment, usage)

  let result
  try {
    result = await runAgentGraph({
      ws, apiKey, model: req.model ?? DEFAULT_MODEL, systemPrompt: req.systemPrompt, rules: req.rules,
      instruction: req.instruction, history: req.history ?? [], onEvent, phase: req.phase, effort: req.effort,
    })
  } catch (err) {
    console.error('equipmentAgent failed', err)
    const known = describeApiError(err)
    if (known) throw new HttpsError(known.code, known.message)
    throw new HttpsError('internal', 'ผู้ช่วย AI ทำงานไม่สำเร็จ')
  }

  return {
    items: ws.items,
    diagrams: ws.diagrams,
    newDiagramIds: [...ws.newDiagramIds],
    newNodeIds: [...ws.newNodeIds],
    placements: ws.placements,
    ...result,
  }
}
