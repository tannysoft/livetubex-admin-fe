import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'
import type { EquipmentPlan, PlanDiagram, PlanItem, PlanLayout } from '../types'
import { autoLayoutDiagram } from './diagram'
import { formatFullLabel } from './video-format'
import { recordingsLabel } from './recording-format'
import { fohAgentText } from './foh-feeds'
import type { AgentEffort } from './agent-settings'
import { applyAgentLayout, layoutAgentText, type ZonePlacement } from './layout-zones'

/**
 * ผู้ช่วย AI จัดอุปกรณ์ + ร่างผังระบบ — Cloud Function `equipmentAgent` (LangGraph.js + Claude)
 * ฝั่ง server คืน "ร่าง" (items + diagrams ทั้งชุด) ไม่เขียน Firestore — ผู้ใช้กดใช้ร่างแล้วค่อยเข้า autosave
 */
export interface AgentTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface AgentIssue {
  level: 'error' | 'warning'
  message: string
}

/**
 * เหตุการณ์ระหว่างผู้ช่วยทำงาน (stream มาจาก function) — ใช้แสดง "ความคิด" + tool ที่เรียก
 * ⚠️ ฝาแฝดของ AgentEvent ใน functions/src/equipment-agent/graph.ts
 */
export type AgentEvent =
  | { type: 'step'; step: number }
  | { type: 'thinking'; step: number; text: string }
  | { type: 'text'; step: number; text: string }
  | { type: 'tool'; step: number; name: string; detail: string }
  | { type: 'tool_result'; step: number; name: string; ok: boolean; preview: string }
  | { type: 'review'; errors: string[] }

/** แถวที่หน้าเว็บแสดง — ต่อ delta ของความคิด/ข้อความที่มาติดกันเป็นก้อนเดียว */
export type TraceEntry =
  | { kind: 'thinking'; step: number; text: string }
  | { kind: 'text'; step: number; text: string }
  | { kind: 'tool'; step: number; name: string; detail: string; ok?: boolean; preview?: string }
  | { kind: 'review'; errors: string[] }
  /** คั่นระหว่างขั้น (โหมดแบ่งขั้น) — กันข้อความของ step เลขเดียวกันคนละขั้นต่อกันเป็นก้อนเดียว */
  | { kind: 'phase'; label: string }

/**
 * all = ทำทั้งหมดในรอบเดียว · items = ขั้น 1 จัดของ (ปิด tool ผังระบบ) · wiring = ขั้น 2 วาดผังจากรายการที่จัดแล้ว
 * ⚠️ ฝาแฝดของ AgentPhase ใน functions/src/equipment-agent/graph.ts
 */
export type AgentPhase = 'all' | 'items' | 'wiring'

export function appendTrace(trace: TraceEntry[], e: AgentEvent): TraceEntry[] {
  const last = trace[trace.length - 1]
  switch (e.type) {
    case 'step': return trace
    case 'thinking':
    case 'text':
      if (last && (last.kind === 'thinking' || last.kind === 'text') && last.kind === e.type && last.step === e.step) {
        return [...trace.slice(0, -1), { ...last, text: last.text + e.text }]
      }
      return [...trace, e.type === 'thinking' ? { kind: 'thinking', step: e.step, text: e.text } : { kind: 'text', step: e.step, text: e.text }]
    case 'tool': return [...trace, { kind: 'tool', step: e.step, name: e.name, detail: e.detail }]
    case 'tool_result': {
      // จับคู่กับแถว tool ล่าสุดที่ชื่อตรงกันและยังไม่มีผล
      for (let i = trace.length - 1; i >= 0; i--) {
        const t = trace[i]
        if (t.kind === 'tool' && t.name === e.name && t.ok === undefined) {
          const next = trace.slice()
          next[i] = { ...t, ok: e.ok, preview: e.preview }
          return next
        }
      }
      return trace
    }
    case 'review': return [...trace, { kind: 'review', errors: e.errors }]
  }
}

export interface AgentDraft {
  items: PlanItem[]
  diagrams: PlanDiagram[]
  /** ผังวาง 3D หลังวางตามโซน (เปลี่ยนเฉพาะผังแรก / สร้างใหม่ถ้ายังไม่มี) */
  layouts: PlanLayout[]
  /** จำนวนวัตถุที่ผู้ช่วยวาง/ย้ายในผังวาง */
  placed: number
  summary: string
  questions: string[]
  issues: AgentIssue[]
  steps: number
  usage: { inputTokens: number; outputTokens: number }
  stoppedEarly?: string
  /** model ที่ใช้จริง */
  model: string
}

interface RawResult extends Omit<AgentDraft, 'layouts' | 'placed'> {
  newDiagramIds: string[]
  newNodeIds: string[]
  placements?: ZonePlacement[]
}

export async function runEquipmentAgent(args: {
  plan: Pick<EquipmentPlan, 'id' | 'title' | 'date' | 'endDate' | 'location' | 'notes' | 'videoFormat' | 'recordings' | 'fohFeeds'>
  base: { items: PlanItem[]; diagrams: PlanDiagram[]; layouts: PlanLayout[] }
  instruction: string
  history: AgentTurn[]
  model: string
  /** prompt ที่ใช้จริง (ค่าที่แก้ไว้ หรือค่าเริ่มต้น) — ดู effectiveSystemPrompt() */
  systemPrompt: string
  rules: string
  /** รับความคิด/ขั้นตอนสดๆ ระหว่างทำงาน */
  onEvent?: (e: AgentEvent) => void
  signal?: AbortSignal
  phase?: AgentPhase
  effort?: AgentEffort
}): Promise<AgentDraft> {
  // agent วนหลายรอบ ใช้เวลาได้ถึงหลายนาที — timeout ฝั่ง client ต้องยาวกว่า function (900s)
  const call = httpsCallable<unknown, RawResult, AgentEvent>(functions, 'equipmentAgent', { timeout: 930_000 })
  const { plan, base } = args
  const payload = {
    plan: {
      id: plan.id, title: plan.title, date: plan.date, endDate: plan.endDate, location: plan.location, notes: plan.notes,
      // ส่งเป็นข้อความพร้อมระดับ SDI ที่คำนวณแล้ว — server ไม่ต้องรู้กติกา
      videoSystem: plan.videoFormat ? formatFullLabel(plan.videoFormat) : undefined,
      recordingSystem: recordingsLabel(plan.recordings, plan.videoFormat) || undefined,
      fohFeeds: fohAgentText(plan.fohFeeds, plan.videoFormat) || undefined,
      layoutSummary: layoutAgentText(base.layouts) || undefined,
      items: base.items, diagrams: base.diagrams,
    },
    instruction: args.instruction,
    history: args.history,
    model: args.model,
    systemPrompt: args.systemPrompt,
    rules: args.rules,
    phase: args.phase ?? 'all',
    effort: args.effort,
  }
  // stream: function ส่งความคิด/tool ที่เรียกมาเรื่อยๆ แล้วค่อยได้ร่างตอนจบ
  const res = await call.stream(payload, { signal: args.signal })
  for await (const e of res.stream) args.onEvent?.(e)
  const r = await res.data
  // server ไม่วางพิกัด → จัดตรงนี้: ผังใหม่/ถูกล้าง = จัดทั้งผัง, ผังเดิม = จัดเฉพาะกล่องใหม่ต่อใต้ของเดิม
  const newDiagrams = new Set(r.newDiagramIds)
  const newNodes = new Set(r.newNodeIds)
  const diagrams = r.diagrams.map((d) => (newDiagrams.has(d.id) ? autoLayoutDiagram(d) : autoLayoutDiagram(d, newNodes)))
  // ผังวาง 3D: server ส่งมาแค่โซน → แปลงเป็นพิกัดตามขนาดสถานที่ตรงนี้ (มีโต๊ะ FOH เสมอ)
  const placements = r.placements ?? []
  const layouts = applyAgentLayout(base.layouts, placements, plan, r.items)
  return {
    items: r.items, diagrams, layouts, placed: placements.length, summary: r.summary, questions: r.questions ?? [], issues: r.issues ?? [],
    steps: r.steps, usage: r.usage, model: r.model ?? args.model, ...(r.stoppedEarly ? { stoppedEarly: r.stoppedEarly } : {}),
  }
}

/**
 * รวมผล 2 ขั้น (จัดของ → โยงผัง) เป็นร่างเดียว — ร่าง/ผลตรวจใช้ของขั้นหลัง (ต่อยอดจากขั้นแรกแล้ว)
 * ส่วนสรุป/คำถาม/จำนวนรอบ/token รวมของทั้งสองขั้น
 */
export function mergeStagedDrafts(first: AgentDraft, second: AgentDraft): AgentDraft {
  const stopped = [first.stoppedEarly && `ขั้นจัดของ: ${first.stoppedEarly}`, second.stoppedEarly && `ขั้นโยงผัง: ${second.stoppedEarly}`]
    .filter(Boolean).join(' · ')
  return {
    ...second,
    placed: first.placed + second.placed,
    // คนละรุ่นต่อขั้น → "รุ่น1 → รุ่น2" (modelLabel ใน AgentPanel แยกให้)
    model: first.model === second.model ? second.model : `${first.model} → ${second.model}`,
    summary: `【จัดของ】\n${first.summary}\n\n【ผังระบบ】\n${second.summary}`,
    questions: [...new Set([...first.questions, ...second.questions])],
    steps: first.steps + second.steps,
    usage: {
      inputTokens: first.usage.inputTokens + second.usage.inputTokens,
      outputTokens: first.usage.outputTokens + second.usage.outputTokens,
    },
    ...(stopped ? { stoppedEarly: stopped } : {}),
  }
}

/** แปลง error ของ callable เป็นข้อความที่คนอ่านรู้เรื่อง */
export function agentErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string }
  if (e?.code === 'functions/not-found') return 'ยังไม่ได้ deploy ฟังก์ชันผู้ช่วย AI (equipmentAgent)'
  if (e?.code === 'functions/deadline-exceeded') return 'ผู้ช่วยใช้เวลานานเกินไป — ลองแบ่งคำสั่งให้เล็กลง'
  return e?.message || 'ผู้ช่วย AI ทำงานไม่สำเร็จ'
}
