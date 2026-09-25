import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'
import { AGENT_TOOLS } from './tools'

/**
 * บทสนทนากับผู้ช่วย AI ทั้งระบบ — รูปแบบ message ของ Anthropic Messages API
 * content ของ assistant ต้องเก็บ "ทั้งก้อน" (thinking + signature + tool_use) แล้วส่งกลับไปตามเดิมทุกรอบ
 */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; signature: string }
  | { type: 'redacted_thinking'; data: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

export interface TurnResult {
  content: ContentBlock[]
  stop_reason: string | null
  usage: { inputTokens: number; outputTokens: number }
  model: string
}

export type TurnEvent = { type: 'thinking'; text: string } | { type: 'text'; text: string }

const WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']

/** วันนี้ตามเวลาเครื่อง (แอดมินอยู่ไทย) — ใส่ใน prompt ให้เข้าใจ "พรุ่งนี้", "เสาร์นี้", ปี พ.ศ. */
function todayLine(): string {
  const d = new Date()
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return `วันนี้: วัน${WEEKDAYS[d.getDay()]} ${iso} (พ.ศ. ${d.getFullYear() + 543}) เขตเวลา Asia/Bangkok`
}

export function systemPrompt(appName: string): string {
  return [
    `คุณคือผู้ช่วย AI ของระบบ "${appName}" — ระบบจัดการงานถ่ายทอดสด (OB/Live) ของบริษัท ผู้ใช้คือแอดมิน`,
    todayLine(),
    '',
    'สิ่งที่ทำได้ผ่าน tool: ค้น/สร้าง/แก้งานถ่ายทอดสด, ตั้งสถานะทางบัญชี, ดู/เพิ่มโน้ตในปฏิทินงาน, ค้น/สร้างแผนจัดอุปกรณ์,',
    'สั่งผู้ช่วยจัดอุปกรณ์ + วาดผังระบบ/ผังวาง 3D ของแผน (run_equipment_agent), ค้นสต็อก, ส่งรายละเอียดงานให้ freelancer ทาง LINE',
    '',
    'หลักการ:',
    '- ตอบภาษาไทย สั้น ตรง ใช้คำในแอป: "งานถ่ายทอดสด", "แผน", "ผังระบบ" (ไม่ใช่ผังโยง), "ผังวาง 3D", "สต็อก"',
    '- ห้ามเดา id — หา jobId/planId/freelancerId ด้วย tool ค้นหาก่อนเสมอ ถ้าเจอหลายรายการที่อาจใช่ ให้ถามผู้ใช้',
    '- ผู้ใช้พูดปี พ.ศ. (เช่น 2569) ให้แปลงเป็น ค.ศ. (−543) · "เสาร์นี้"/"เดือนหน้า" คิดจากวันนี้',
    '- ก่อนสร้างงาน ต้องรู้ชื่องาน วันที่ สถานที่ และลูกค้า — ขาดข้อไหนให้ถามก่อน (ถามครั้งเดียวรวมทุกข้อ) อย่าแต่งข้อมูลเอง',
    '- tool ที่แก้ข้อมูลจะมีการ์ดให้ผู้ใช้กดอนุมัติเอง ไม่ต้องถามยืนยันซ้ำในข้อความ — เรียก tool ได้เลยเมื่อข้อมูลครบ',
    '- ถ้าผลของ tool บอกว่าผู้ใช้ไม่อนุมัติ ให้หยุดทำเรื่องนั้นแล้วถามว่าต้องการแก้อย่างไร',
    '- งานที่ต่อกันหลายขั้น (เช่น สร้างงาน → สร้างแผน → จัดอุปกรณ์) ทำต่อเนื่องได้เลยโดยใช้ id จากผลขั้นก่อน',
    '- run_equipment_agent ใช้เวลาหลายนาทีและเปลี่ยนแผนจริง — เรียกเมื่อผู้ใช้ขอให้จัดของ/วาดผังเท่านั้น ส่ง instruction ที่มีรายละเอียดตามที่ผู้ใช้บอกให้ครบ',
    '- ไม่รู้ = บอกว่าไม่รู้ ห้ามแต่งตัวเลขหรือรายการที่ไม่ได้มาจาก tool',
    '- จบงานให้สรุปสั้นๆ ว่าทำอะไรไปแล้ว',
  ].join('\n')
}

/** เรียก Claude 1 รอบผ่าน function systemAgent (stream ความคิด/ข้อความสด) */
export async function runTurn(args: {
  appName: string
  messages: AgentMessage[]
  model: string
  effort: 'low' | 'medium' | 'high'
  onEvent?: (e: TurnEvent) => void
  signal?: AbortSignal
}): Promise<TurnResult> {
  const call = httpsCallable<unknown, TurnResult, TurnEvent>(functions, 'systemAgent', { timeout: 320_000 })
  const res = await call.stream(
    { system: systemPrompt(args.appName), tools: AGENT_TOOLS, messages: args.messages, model: args.model, effort: args.effort },
    { signal: args.signal },
  )
  for await (const e of res.stream) args.onEvent?.(e)
  return res.data
}

export function systemAgentErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string; name?: string }
  if (e?.name === 'AbortError') return 'หยุดแล้ว'
  if (e?.code === 'functions/not-found') return 'ยังไม่ได้ deploy ฟังก์ชันผู้ช่วย AI (systemAgent)'
  if (e?.code === 'functions/deadline-exceeded') return 'AI ใช้เวลานานเกินไป ลองใหม่อีกครั้ง'
  return e?.message || 'ผู้ช่วย AI ทำงานไม่สำเร็จ'
}
