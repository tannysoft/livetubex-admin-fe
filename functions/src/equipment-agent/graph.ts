import { Annotation, END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph'
import { ChatAnthropic } from '@langchain/anthropic'
import { AIMessage, AIMessageChunk, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import { SYSTEM_PROMPT } from './prompt'
import { buildTools, type FinishResult } from './tools'
import type { Issue, Workspace } from './workspace'

export const DEFAULT_MODEL = 'claude-sonnet-5'

/**
 * เหตุการณ์ระหว่างทำงาน — ส่งสดให้หน้าเว็บผ่าน callable streaming (sendChunk)
 * ⚠️ ฝาแฝดของ AgentEvent ใน lib/equipment/agent.ts
 */
export type AgentEvent =
  | { type: 'step'; step: number }
  | { type: 'thinking'; step: number; text: string }
  | { type: 'text'; step: number; text: string }
  | { type: 'tool'; step: number; name: string; detail: string }
  | { type: 'tool_result'; step: number; name: string; ok: boolean; preview: string }
  | { type: 'review'; errors: string[] }

/** รุ่นก่อน 4.6 ยังไม่มี adaptive thinking → ใช้ budget_tokens */
function thinkingConfig(model: string) {
  if (LEGACY_MODEL.test(model) || /^claude-opus-4-5/.test(model)) {
    return { type: 'enabled' as const, budget_tokens: 4096 }
  }
  // display ตั้งเองเสมอ — รุ่นใหม่ค่าเริ่มต้นเป็น omitted (ข้อความความคิดว่าง)
  return { type: 'adaptive' as const, display: 'summarized' as const }
}

export interface AgentRunResult {
  summary: string
  questions: string[]
  issues: Issue[]
  steps: number
  usage: { inputTokens: number; outputTokens: number }
  stoppedEarly?: string
  model: string
}

/** กันงานค้างจน callable timeout (900s) — เหลือเวลาไว้ตรวจและส่งผลกลับ */
const TIME_BUDGET_MS = 780_000
/** รอบที่ระบบตรวจแล้วส่งกลับให้ agent แก้เอง ก่อนยอมส่งร่างที่ยังมีปัญหาให้คนดู */
const MAX_REVIEW_ROUNDS = 2
const RECURSION_LIMIT = 150
/**
 * รอบที่โมเดลหยุดโดยยังไม่เรียก finish (คิดยาวจนชน maxTokens / ตอบข้อความเฉยๆ) แล้วระบบสะกิดให้ทำต่อ
 * ไม่มีตัวนี้ = graph เข้าใจว่าจบ ส่งร่างว่างกลับไป ("ผู้ช่วยไม่ได้ส่งสรุปกลับมา")
 */
const MAX_NUDGES = 3

/**
 * all = ทำทั้งหมดในรอบเดียว (คำสั่งแก้ร่างต่อ) · items = ขั้น 1 จัดของ · wiring = ขั้น 2 วาดผังโยงจากรายการที่จัดแล้ว
 * ⚠️ ฝาแฝดของ AgentPhase ใน lib/equipment/agent.ts
 */
export type AgentPhase = 'all' | 'items' | 'wiring'

/** ⚠️ ฝาแฝดของ AgentEffort ใน lib/equipment/agent-settings.ts */
export type AgentEffort = 'low' | 'medium' | 'high'

/** รุ่นเก่า/Haiku ไม่รับ output_config.effort (ส่งไป = 400) — ใช้ regex เดียวกับ thinkingConfig */
const LEGACY_MODEL = /^claude-(haiku-4|sonnet-4-5|opus-4-1|opus-4-0|sonnet-4-0|3)/

const DIAGRAM_TOOLS = new Set([
  'create_diagram', 'clear_diagram', 'delete_diagram', 'add_nodes', 'update_node', 'add_ports', 'remove_nodes', 'connect', 'disconnect',
])

const PHASE_NOTES: Record<Exclude<AgentPhase, 'all'>, string> = {
  items: [
    '[ขั้นที่ 1/2 — จัดของเท่านั้น]',
    'เลือกของ + เลนส์ + ปลายทาง + ผังวาง 3D (place_3d) แล้ว validate และ finish',
    'ยังไม่ต้องวาดผังโยง (tool ผังปิดอยู่ในขั้นนี้) ขั้นถัดไประบบจะให้วาดผังจากรายการนี้เอง',
    'เตรียมของที่ต้องใช้ตอนโยงสายให้ครบในรายการเลย เช่น converter, fiber, DA, เครื่องบันทึก',
    'จัดชุดกล้องให้ครบ: เลนส์ + ขาตั้ง + converter/fiber ฝั่งกล้อง (attachTo กล้อง 1 แถวต่อกล้อง) · converter ที่เป็นชุด TX+RX ในรายการเดียวไม่ต้องหาตัวรับเพิ่ม — เขียน note ว่า RX วางที่ไหน · converter ไฟเบอร์ที่ 1 ชิ้น = 1 ฝั่ง (เช่น Mini Converter Optical Fiber) → 2 แถวต่อกล้อง: TX attachTo กล้อง + RX ปลายทาง Control Room · wireless ที่ระบุให้กล้องตัวไหน และ gimbal/Ronin ของกล้อง mirrorless → attachTo กล้องนั้น · กล้องพาร์ทเนอร์ใช้ขาตั้ง/ของเสริมของพาร์ทเนอร์เจ้าเดียวกันก่อน',
    'summary ของขั้นนี้: สรุปรายการที่จัดและของที่ขาด/ต้องเช่า',
  ].join('\n'),
  wiring: [
    '[ขั้นที่ 2/2 — วาดผังโยง]',
    'รายการอุปกรณ์จัดเสร็จแล้วในขั้นที่ 1 (อยู่ใน "ร่างปัจจุบัน") อย่าจัดใหม่หรือเอาของออก',
    'วาดผังโยงตามคำสั่งจากรายการนี้ เพิ่มของได้เฉพาะที่ขาดจริงสำหรับการโยงสาย (เช่น converter) และบอกใน summary',
    'รวบงานให้น้อยรอบ: add_nodes ทุกกล่องของผังในครั้งเดียว แล้ว connect ทุกเส้นของผังในครั้งเดียว',
    'ถ้าคำสั่งไม่ต้องการผังโยงเลย ให้ finish ทันที',
    'summary ของขั้นนี้: สรุปเฉพาะผังที่วาดและจุดที่ต้องตรวจ (ไม่ต้องสรุปรายการของซ้ำ)',
  ].join('\n'),
}

const State = Annotation.Root({
  ...MessagesAnnotation.spec,
  finished: Annotation<boolean>({ reducer: (_a, b) => b, default: () => false }),
  reviewRounds: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }),
  nudges: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }),
  next: Annotation<'agent' | 'end'>({ reducer: (_a, b) => b, default: () => 'agent' }),
})

/**
 * Graph:  agent ──(tool calls)──▶ tools ──▶ agent …
 *           │ (ไม่มี tool call)       │ (เรียก finish)
 *           ▼                         ▼
 *         review ◀────────────────────┘
 *           │ มี ✗ และยังไม่เกินรอบ → กลับ agent พร้อมรายการปัญหา
 *           ▼
 *          END
 */
export async function runAgentGraph(opts: {
  ws: Workspace
  apiKey: string
  model: string
  /** ว่าง = SYSTEM_PROMPT ตั้งต้น */
  systemPrompt?: string
  /** กฎการต่อสายของทีม — ต่อท้าย prompt เป็นบล็อกแยก */
  rules?: string
  instruction: string
  history: { role: 'user' | 'assistant'; text: string }[]
  /** รับเหตุการณ์ระหว่างทำงาน (ความคิด / tool ที่เรียก) — ไม่ส่ง = ไม่ stream */
  onEvent?: (e: AgentEvent) => void
  /** แบ่งงานใหญ่เป็นขั้น — หน้าเว็บเรียก items แล้วตามด้วย wiring (แต่ละขั้นได้เวลาเต็มของตัวเอง) */
  phase?: AgentPhase
  effort?: AgentEffort
}): Promise<AgentRunResult> {
  const { ws } = opts
  const started = Date.now()
  let finish: FinishResult | null = null
  let steps = 0
  let stoppedEarly: string | undefined
  const usage = { inputTokens: 0, outputTokens: 0 }
  const emit = (e: AgentEvent) => { try { opts.onEvent?.(e) } catch { /* client หลุดไม่ทำให้งานล้ม */ } }

  const phase = opts.phase ?? 'all'
  // ขั้นจัดของ: ปิด tool ผังโยง — โมเดลจะได้ไม่เผลอวาดผังจนเวลาหมดก่อนจัดของเสร็จ
  const tools = buildTools(ws, (r) => { finish = r }).filter((t) => phase !== 'items' || !DIAGRAM_TOOLS.has(t.name))
  const toolByName = new Map<string, (typeof tools)[number]>(tools.map((t) => [t.name, t]))
  const model = new ChatAnthropic({
    model: opts.model,
    apiKey: opts.apiKey,
    // thinking กิน output token ด้วย — งานใหญ่ (10+ กล้อง) คิดรอบเดียวเกิน 16k ได้ ชนแล้วรอบนั้นไม่มี tool call เลย
    maxTokens: 32000,
    thinking: thinkingConfig(opts.model),
    // effort ต่ำลง = คิดสั้นลง เรียก tool รวบรอบมากขึ้น — ตัวแปรหลักของความเร็ว (ค่าเริ่มต้นของ API คือ high)
    ...(LEGACY_MODEL.test(opts.model) ? {} : { outputConfig: { effort: opts.effort ?? 'medium' } }),
  }).bindTools(tools)

  // system + tools คงที่ทุกรอบของงานนี้ → cache ไว้ ลดค่า input token ของรอบถัดๆ ไปมาก
  // กฎของทีมอยู่บล็อกสุดท้ายพร้อม cache breakpoint → cache ทั้ง prompt + กฎ
  const rules = opts.rules?.trim()
  const system = new SystemMessage({
    content: [
      { type: 'text', text: opts.systemPrompt?.trim() || SYSTEM_PROMPT, ...(rules ? {} : { cache_control: { type: 'ephemeral' } }) },
      ...(rules ? [{
        type: 'text' as const,
        text: `## กฎการต่อสายของทีม — ต้องทำตามเสมอ และมาก่อนแนวทางทั่วไปด้านบน\n${rules}`,
        cache_control: { type: 'ephemeral' as const },
      }] : []),
    ],
  })

  const timeUp = () => Date.now() - started > TIME_BUDGET_MS

  const agent = async (s: typeof State.State) => {
    steps += 1
    const step = steps
    emit({ type: 'step', step })
    // stream เพื่อส่งความคิดทีละช่วงให้หน้าเว็บ — รวม chunk เป็นข้อความเดียวเก็บลง state
    // (thinking block + signature ต้องอยู่ครบ ไม่งั้นรอบถัดไปที่มี tool_result โดน API ปฏิเสธ)
    let res: AIMessageChunk | undefined
    // automatic caching: cache ทั้งบทสนทนาถึงข้อความล่าสุด รอบถัดไปอ่านจาก cache — เร็วขึ้นและถูกลงมาก
    // (บทสนทนายาวขึ้นทุกรอบ ถ้าไม่ cache ต้องประมวลผล tool result เก่าทั้งหมดใหม่ทุกรอบ)
    const callOptions = { cache_control: { type: 'ephemeral' } } as unknown as Parameters<typeof model.stream>[1]
    for await (const chunk of await model.stream([system, ...s.messages], callOptions)) {
      res = res ? res.concat(chunk) : chunk
      if (!Array.isArray(chunk.content)) {
        if (typeof chunk.content === 'string' && chunk.content) emit({ type: 'text', step, text: chunk.content })
        continue
      }
      for (const block of chunk.content as { type?: string; thinking?: string; text?: string }[]) {
        if (block.type === 'thinking' && block.thinking) emit({ type: 'thinking', step, text: block.thinking })
        else if (block.type === 'text' && block.text) emit({ type: 'text', step, text: block.text })
      }
    }
    if (!res) throw new Error('โมเดลไม่ตอบกลับ')
    usage.inputTokens += res.usage_metadata?.input_tokens ?? 0
    usage.outputTokens += res.usage_metadata?.output_tokens ?? 0

    // ชน maxTokens = คำตอบถูกตัดกลางคัน (thinking ไม่มี signature / tool_use JSON ไม่ครบ) ส่งกลับ API ไม่ได้
    // → ทิ้งทั้งก้อน แทนด้วยข้อความสั้นๆ แล้วสะกิดให้ลงมือทีละส่วน
    const truncated = (res.additional_kwargs as { stop_reason?: string } | undefined)?.stop_reason === 'max_tokens'
    const stalled = truncated || !res.tool_calls?.length
    if (stalled && finish == null && s.nudges < MAX_NUDGES && !timeUp()) {
      const text = truncated ? '' : textOf(res.content)
      return {
        nudges: s.nudges + 1,
        messages: [
          new AIMessage(text || '(คำตอบยาวเกินจนถูกตัด)'),
          new HumanMessage(truncated
            ? 'คำตอบที่แล้วยาวเกินจนถูกตัดก่อนเรียก tool — อย่าวางแผนทั้งงานในหัวก่อน ลงมือเรียก tool ทีละส่วนเลย (เช่น add_items กล้อง → เลนส์ → converter/สวิตเชอร์ → ผังโยง) แล้วจบด้วย finish'
            : 'ยังไม่ได้เรียก finish ร่างจึงยังไม่ถูกส่งให้ผู้ใช้ — ทำงานต่อด้วย tool ให้ครบตามคำสั่ง แล้วเรียก finish (เรื่องที่ต้องถามผู้ใช้ให้ใส่ใน questions ของ finish)'),
        ],
      }
    }
    if (truncated) {
      // สะกิดครบแล้วยังถูกตัด — เก็บแค่ข้อความ (ถ้ามี) ให้ graph ไปตรวจแล้วจบ
      stoppedEarly = 'ผู้ช่วยคิดยาวเกินจนถูกตัดหลายรอบ — ร่างอาจยังไม่ครบ ลองแบ่งคำสั่งให้เล็กลง'
      return { messages: [new AIMessage(textOf(res.content) || '(คำตอบยาวเกินจนถูกตัด)')] }
    }
    return { messages: [new AIMessage({
      content: res.content,
      tool_calls: res.tool_calls,
      usage_metadata: res.usage_metadata,
      response_metadata: res.response_metadata,
      id: res.id,
    })] }
  }

  const runTools = async (s: typeof State.State) => {
    const last = s.messages[s.messages.length - 1] as AIMessage
    const out: BaseMessage[] = []
    for (const call of last.tool_calls ?? []) {
      emit({ type: 'tool', step: steps, name: call.name, detail: describeArgs(call.args) })
      const t = toolByName.get(call.name)
      let content: string
      try {
        content = t ? String(await (t as { invoke: (a: unknown) => Promise<unknown> }).invoke(call.args)) : `ไม่มี tool ชื่อ ${call.name}`
      } catch (err) {
        // args ผิด schema ฯลฯ — ส่งกลับให้ agent แก้เอง ไม่ล้มทั้งงาน
        content = `✗ เรียก ${call.name} ไม่สำเร็จ: ${err instanceof Error ? err.message.slice(0, 500) : String(err)}`
      }
      emit({ type: 'tool_result', step: steps, name: call.name, ok: !content.startsWith('✗'), preview: content.slice(0, 160) })
      out.push(new ToolMessage({ content, tool_call_id: call.id ?? '', name: call.name }))
    }
    // ใกล้หมดเวลา → บอกโมเดลให้รีบปิดงาน ไม่งั้นถูกตัดกลางคันทั้งที่ยังไม่ได้โยงสาย/finish
    const elapsed = Date.now() - started
    if (finish == null && elapsed > TIME_BUDGET_MS * 0.7 && out.length) {
      const left = Math.max(0, Math.round((TIME_BUDGET_MS - elapsed) / 1000))
      const lastMsg = out[out.length - 1] as ToolMessage
      out[out.length - 1] = new ToolMessage({
        content: `${lastMsg.content}\n\n⏱ เหลือเวลาราว ${left} วินาที — ทำส่วนที่สำคัญที่สุดให้เสร็จ (โยงสายหลัก) รวบหลาย tool ในรอบเดียว แล้วเรียก finish ระบุสิ่งที่ยังไม่ได้ทำใน summary`,
        tool_call_id: lastMsg.tool_call_id,
        name: lastMsg.name,
      })
    }
    return { messages: out, finished: finish != null }
  }

  const review = async (s: typeof State.State) => {
    const errors = ws.validate().filter((i) => i.level === 'error')
    if (errors.length > 0 && s.reviewRounds < MAX_REVIEW_ROUNDS && !timeUp()) {
      emit({ type: 'review', errors: errors.map((e) => e.message) })
      finish = null
      return {
        next: 'agent' as const,
        finished: false,
        reviewRounds: s.reviewRounds + 1,
        messages: [new HumanMessage(
          `ระบบตรวจร่างแล้วพบปัญหาที่ต้องแก้ก่อนส่ง:\n${errors.map((e) => `✗ ${e.message}`).join('\n')}\nแก้ให้เรียบร้อยแล้วเรียก finish อีกครั้ง`,
        )],
      }
    }
    return { next: 'end' as const }
  }

  const graph = new StateGraph(State)
    .addNode('agent', agent)
    .addNode('tools', runTools)
    .addNode('review', review)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', (s) => {
      const last = s.messages[s.messages.length - 1]
      if (last instanceof HumanMessage) return 'agent' // ถูกสะกิดให้ทำต่อ
      return (last as AIMessage).tool_calls?.length ? 'tools' : 'review'
    }, ['agent', 'tools', 'review'])
    .addConditionalEdges('tools', (s) => {
      if (s.finished) return 'review'
      if (timeUp()) { stoppedEarly = 'ใช้เวลานานเกินกำหนด — ส่งร่างเท่าที่ทำได้ สั่ง "ทำต่อ" เพื่อให้ผู้ช่วยทำส่วนที่เหลือจากร่างนี้'; return 'review' }
      return 'agent'
    }, ['agent', 'review'])
    .addConditionalEdges('review', (s) => (s.next === 'agent' ? 'agent' : END), ['agent', END])
    .compile()

  const messages: BaseMessage[] = [
    ...opts.history.map((h) => (h.role === 'user' ? new HumanMessage(h.text) : new AIMessage(h.text))),
    new HumanMessage([
      'ข้อมูลแผน:',
      `ชื่องาน: ${ws.plan.title}`,
      `วันที่: ${ws.plan.date ?? '(ไม่ระบุ)'}${ws.plan.endDate && ws.plan.endDate !== ws.plan.date ? ` ถึง ${ws.plan.endDate}` : ''}`,
      `สถานที่: ${ws.plan.location || '(ไม่ระบุ)'}`,
      `ระบบภาพ: ${ws.plan.videoSystem || '(ไม่ระบุ — ถามผู้ใช้ถ้าสำคัญต่อการเลือก converter)'}`,
      `การบันทึก: ${ws.plan.recordingSystem || '(ไม่ระบุ)'}`,
      ws.plan.fohFeeds ? `ส่งภาพให้ทีม Visual (FOH):\n${ws.plan.fohFeeds}` : 'ส่งภาพให้ทีม Visual (FOH): (ไม่มี)',
      ws.plan.notes ? `หมายเหตุของแผน: ${ws.plan.notes}` : '',
      '',
      // ให้รายการสต็อกไปเลย — ไม่ต้องเสียรอบ (รอโมเดลรอบละหลายวินาที) ไปกับ inventory_overview/search_inventory
      ws.inventoryCatalog(),
      '',
      'ร่างปัจจุบัน:',
      ws.listPlan(),
      '',
      'คำสั่งจากผู้ใช้:',
      opts.instruction,
      ...(phase === 'all' ? [] : ['', PHASE_NOTES[phase]]),
    ].filter((l) => l !== null).join('\n')),
  ]

  let lastText = ''
  try {
    const final = await graph.invoke({ messages }, { recursionLimit: RECURSION_LIMIT })
    const lastAi = [...final.messages].reverse().find((m) => m instanceof AIMessage || m.getType?.() === 'ai')
    lastText = lastAi ? textOf(lastAi.content) : ''
  } catch (err) {
    // พังตั้งแต่เรียกโมเดลครั้งแรก (key ผิด, ชื่อ model ผิด, rate limit) → ยังไม่มีร่าง ส่ง error ให้ผู้ใช้เห็นตรงๆ
    if (steps <= 1) throw err
    // เกินจำนวนรอบ ฯลฯ — ร่างที่ทำไปแล้วยังใช้ได้ ส่งกลับพร้อมเตือน
    stoppedEarly = `หยุดก่อนเสร็จ: ${describeApiError(err)?.message ?? (err instanceof Error ? err.message.slice(0, 200) : String(err))}`
  }

  const done = finish as FinishResult | null
  if (!done && !stoppedEarly) stoppedEarly = 'ผู้ช่วยหยุดก่อนเรียก finish — ร่างอาจยังไม่ครบ ลองสั่ง "ทำต่อ" หรือแบ่งคำสั่งให้เล็กลง'
  return {
    summary: done?.summary || lastText || 'ผู้ช่วยไม่ได้ส่งสรุปกลับมา — ตรวจร่างด้านล่าง',
    questions: done?.questions ?? [],
    issues: ws.validate(),
    steps,
    usage,
    model: opts.model,
    ...(stoppedEarly ? { stoppedEarly } : {}),
  }
}

/** ข้อความของ AI message — content เป็น array (thinking/text/tool_use) เมื่อเปิด thinking */
function textOf(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .filter((b): b is { type: 'text'; text: string } => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')
    .trim()
}

/** สรุป args ของ tool ให้คนอ่านสั้นๆ — ไม่ส่ง JSON ก้อนใหญ่ไปหน้าเว็บ */
function describeArgs(args: unknown): string {
  if (!args || typeof args !== 'object') return ''
  const parts: string[] = []
  for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
    if (Array.isArray(v)) parts.push(`${k}: ${v.length} รายการ`)
    else if (v && typeof v === 'object') parts.push(k)
    else if (v !== undefined && v !== '') parts.push(`${k}: ${String(v).slice(0, 40)}`)
  }
  return parts.join(' · ').slice(0, 160)
}

/**
 * error จาก Anthropic API → ข้อความภาษาไทยที่บอกสาเหตุจริง (อ่านจาก status + error.type ของ SDK ไม่เดาจากข้อความ)
 * คืน null = ไม่รู้จัก ให้ผู้เรียกใช้ข้อความกลาง
 */
export function describeApiError(err: unknown): { code: 'failed-precondition' | 'resource-exhausted' | 'invalid-argument' | 'unavailable'; message: string } | null {
  const e = err as { status?: number; error?: { error?: { type?: string; message?: string } } }
  const status = e?.status
  const type = e?.error?.error?.type
  const detail = e?.error?.error?.message ?? ''
  if (/credit balance/i.test(detail)) {
    return { code: 'failed-precondition', message: 'เครดิต Anthropic API หมด — เติมเครดิตที่ console.anthropic.com (Plans & Billing) แล้วลองใหม่' }
  }
  if (status === 401 || type === 'authentication_error') return { code: 'failed-precondition', message: 'API key ของ Anthropic ใช้ไม่ได้ — ตรวจ ANTHROPIC_API_KEY ใน Secret Manager' }
  if (status === 403 || type === 'permission_error') return { code: 'failed-precondition', message: 'API key นี้ไม่มีสิทธิ์ใช้รุ่นที่เลือก — ลองรุ่นอื่นในหน้าตั้งค่าผู้ช่วย AI' }
  if (status === 404 || type === 'not_found_error') return { code: 'invalid-argument', message: 'ใช้รุ่นที่เลือกไม่ได้ — ตรวจชื่อรุ่นในหน้าตั้งค่าผู้ช่วย AI' }
  if (status === 429 || type === 'rate_limit_error') return { code: 'resource-exhausted', message: 'ใช้งานผู้ช่วย AI ถี่เกินโควตา — รอสักครู่แล้วลองใหม่' }
  if (status === 529 || type === 'overloaded_error') return { code: 'unavailable', message: 'ระบบ AI หนาแน่นชั่วคราว — ลองใหม่อีกครั้ง' }
  if (status === 400 && detail) return { code: 'invalid-argument', message: `คำขอไปยัง AI ไม่ผ่าน: ${detail.slice(0, 200)}` }
  return null
}
