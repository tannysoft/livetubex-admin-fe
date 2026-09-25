import Anthropic from '@anthropic-ai/sdk'
import { HttpsError } from 'firebase-functions/v2/https'

/**
 * ผู้ช่วย AI ของทั้งระบบ (/admin/agent) — function นี้เป็นแค่ "ตัวกลาง" เรียก Claude ทีละ 1 รอบ
 *
 * tool ทั้งหมดรันที่หน้าเว็บในสิทธิ์ของแอดมินที่ login อยู่ (ใช้ฟังก์ชันเดิมของแอป — createJob, createEquipmentPlan,
 * runEquipmentAgent ฯลฯ กฎธุรกิจจึงไม่ซ้ำสองที่) → client ส่ง system prompt + tools + บทสนทนามา
 * server ใส่ API key เรียกรอบเดียว stream ความคิด/ข้อความกลับ แล้วคืน content ทั้งก้อน (รวม thinking + signature
 * ที่ต้องส่งกลับไปครบในรอบถัดไป) — client รัน tool_use แล้วเรียกรอบต่อไปเอง
 */

export interface SystemAgentRequest {
  system: string
  tools: Anthropic.Tool[]
  messages: Anthropic.MessageParam[]
  model?: string
  effort?: 'low' | 'medium' | 'high'
}

export type SystemAgentEvent =
  | { type: 'thinking'; text: string }
  | { type: 'text'; text: string }

const MODEL_ID_PATTERN = /^claude-[a-z0-9.-]+$/
const DEFAULT_MODEL = 'claude-sonnet-5'
/** รุ่นเก่า/Haiku ไม่รับ adaptive thinking / output_config.effort — ตรงกับ graph.ts ของ equipment agent */
const LEGACY_MODEL = /^claude-(haiku-4|sonnet-4-5|opus-4-1|opus-4-0|sonnet-4-0|3)/
const MAX_BODY_BYTES = 900_000
const MAX_MESSAGES = 200
const MAX_TOOLS = 40

function parse(data: unknown): Required<Omit<SystemAgentRequest, 'effort'>> & { effort: SystemAgentRequest['effort'] } {
  const d = (data ?? {}) as Partial<SystemAgentRequest>
  if (JSON.stringify(d).length > MAX_BODY_BYTES) throw new HttpsError('invalid-argument', 'บทสนทนายาวเกินไป — เริ่มแชทใหม่')
  if (typeof d.system !== 'string' || !d.system.trim()) throw new HttpsError('invalid-argument', 'ไม่มี system prompt')
  if (!Array.isArray(d.messages) || d.messages.length === 0 || d.messages.length > MAX_MESSAGES) {
    throw new HttpsError('invalid-argument', 'บทสนทนาไม่ถูกต้อง')
  }
  if (d.messages[0]?.role !== 'user') throw new HttpsError('invalid-argument', 'ข้อความแรกต้องเป็นของผู้ใช้')
  const tools = Array.isArray(d.tools) ? d.tools : []
  if (tools.length > MAX_TOOLS) throw new HttpsError('invalid-argument', 'tool มากเกินไป')
  // รับเฉพาะ field ของ custom tool — กันส่ง server tool / field แปลกๆ เข้า API
  const cleanTools = tools.map((t) => {
    if (typeof t?.name !== 'string' || typeof t?.description !== 'string' || typeof t?.input_schema !== 'object') {
      throw new HttpsError('invalid-argument', 'รูปแบบ tool ไม่ถูกต้อง')
    }
    return { name: t.name, description: t.description, input_schema: t.input_schema } as Anthropic.Tool
  })
  return {
    system: d.system,
    tools: cleanTools,
    messages: d.messages,
    model: typeof d.model === 'string' && MODEL_ID_PATTERN.test(d.model) ? d.model : DEFAULT_MODEL,
    effort: d.effort === 'low' || d.effort === 'medium' || d.effort === 'high' ? d.effort : 'medium',
  }
}

export async function handleSystemAgent(data: unknown, apiKey: string, onEvent?: (e: SystemAgentEvent) => void) {
  const req = parse(data)
  if (!apiKey) throw new HttpsError('failed-precondition', 'ยังไม่ได้ตั้ง ANTHROPIC_API_KEY ใน Secret Manager')
  const client = new Anthropic({ apiKey })
  const legacy = LEGACY_MODEL.test(req.model)

  // system + tools คงที่ทั้งบทสนทนา → cache ไว้ (breakpoint ที่ tool ตัวสุดท้าย + system)
  const tools = req.tools.map((t, i) => (i === req.tools.length - 1 ? { ...t, cache_control: { type: 'ephemeral' as const } } : t))

  try {
    const stream = client.messages.stream({
      model: req.model,
      max_tokens: 16000,
      system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
      tools,
      messages: req.messages,
      // display ต้องตั้งเอง — รุ่นใหม่ค่าเริ่มต้นเป็น omitted (ข้อความความคิดว่าง)
      thinking: legacy ? { type: 'enabled', budget_tokens: 4096 } : { type: 'adaptive', display: 'summarized' },
      ...(legacy ? {} : { output_config: { effort: req.effort } }),
      // automatic caching: บทสนทนายาวขึ้นทุกรอบ (tool result เก่า) — รอบถัดไปอ่านจาก cache
      cache_control: { type: 'ephemeral' },
    })
    if (onEvent) {
      stream.on('thinking', (delta) => onEvent({ type: 'thinking', text: delta }))
      stream.on('text', (delta) => onEvent({ type: 'text', text: delta }))
    }
    const msg = await stream.finalMessage()
    return {
      content: msg.content,
      stop_reason: msg.stop_reason,
      usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
      model: req.model,
    }
  } catch (err) {
    console.error('systemAgent failed', err)
    if (err instanceof Anthropic.APIError) {
      if (err.status === 401) throw new HttpsError('failed-precondition', 'ANTHROPIC_API_KEY ไม่ถูกต้อง')
      if (err.status === 404) throw new HttpsError('invalid-argument', `ไม่พบรุ่น ${req.model}`)
      if (err.status === 429) throw new HttpsError('resource-exhausted', 'เรียก AI ถี่เกินไป ลองใหม่อีกครั้ง')
      if (err.status === 529 || err.status === 503) throw new HttpsError('unavailable', 'AI ไม่ว่างชั่วคราว ลองใหม่อีกครั้ง')
      if (err.status === 400) throw new HttpsError('invalid-argument', `คำขอไม่ถูกต้อง: ${err.message.slice(0, 300)}`)
    }
    throw new HttpsError('internal', 'ผู้ช่วย AI ทำงานไม่สำเร็จ')
  }
}
