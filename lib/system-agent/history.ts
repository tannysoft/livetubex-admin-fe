import {
  collection, deleteDoc, doc, getDocs, increment, query, setDoc, updateDoc, where, writeBatch, orderBy,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { AgentMessage, ContentBlock } from './run'

/**
 * ประวัติแชทผู้ช่วย AI (/admin/agent) — Firestore
 * `agentChats/{chatId}` = หัวแชท (เจ้าของ ชื่อ เวลา token) · `agentChats/{chatId}/messages/{seq}` = 1 ข้อความต่อเอกสาร
 * เนื้อหาเก็บเป็น JSON string: content ของ Claude มี array ซ้อน/ค่าที่ Firestore ไม่รับ และต้องส่งกลับ API แบบไม่ผิดเพี้ยน
 * (thinking + signature) · rules: เห็น/แก้ได้เฉพาะแชทของตัวเอง
 */

export interface AgentChat {
  id: string
  title: string
  ownerUid: string
  ownerEmail?: string
  model?: string
  inputTokens: number
  outputTokens: number
  messageCount: number
  createdAt: string
  updatedAt: string
}

/** สถานะ/ลิงก์ของ tool ที่หน้าเว็บโชว์ — ไม่ได้ส่ง API (เก็บคู่กับข้อความ tool_result) */
export interface ToolMeta {
  status: 'done' | 'error' | 'declined'
  link?: { href: string; label: string }
}

export interface StoredMessage extends AgentMessage {
  seq: number
  meta?: Record<string, ToolMeta>
}

const CHATS = 'agentChats'
/** เอกสาร Firestore ≤ 1 MiB — เผื่อ overhead */
const MAX_DOC_CHARS = 700_000
const seqId = (n: number) => String(n).padStart(6, '0')

export async function listAgentChats(uid: string): Promise<AgentChat[]> {
  // ไม่ orderBy ใน query (ต้องมี composite index) — เรียงเองที่นี่
  const snap = await getDocs(query(collection(db, CHATS), where('ownerUid', '==', uid)))
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as AgentChat))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function createAgentChat(args: { uid: string; email?: string; title: string; model: string }): Promise<string> {
  const ref = doc(collection(db, CHATS))
  const now = new Date().toISOString()
  await setDoc(ref, {
    title: args.title.slice(0, 80), ownerUid: args.uid, ...(args.email ? { ownerEmail: args.email } : {}), model: args.model,
    inputTokens: 0, outputTokens: 0, messageCount: 0, createdAt: now, updatedAt: now,
  })
  return ref.id
}

export async function loadAgentMessages(chatId: string): Promise<StoredMessage[]> {
  const snap = await getDocs(query(collection(db, CHATS, chatId, 'messages'), orderBy('seq')))
  return snap.docs.map((d) => {
    const x = d.data() as { seq: number; role: 'user' | 'assistant'; content: string; meta?: string }
    return { seq: x.seq, role: x.role, content: JSON.parse(x.content), ...(x.meta ? { meta: JSON.parse(x.meta) } : {}) }
  })
}

/** ตัดข้อความที่ยาวเกินเอกสารเดียว — ตัดผลของ tool ก่อน (ความคิด/tool_use ต้องคงเดิม ไม่งั้น API ปฏิเสธ) */
function fitContent(content: AgentMessage['content']): string {
  let json = JSON.stringify(content)
  if (json.length <= MAX_DOC_CHARS || typeof content === 'string') return json.slice(0, MAX_DOC_CHARS)
  const blocks = content.map((b): ContentBlock => (b.type === 'tool_result' ? { ...b, content: b.content.slice(0, 20_000) + '\n…(ตัดเพื่อเก็บประวัติ)' } : b))
  json = JSON.stringify(blocks)
  return json
}

/**
 * บันทึกข้อความตั้งแต่ index `from` ถึงท้าย (เขียนทับด้วย seq เดิม — ข้อความ user ที่ถูกรวมก็อัปเดตได้)
 * แล้วอัปเดตหัวแชท (เวลา, จำนวนข้อความ, token ที่เพิ่ม)
 */
export async function saveAgentMessages(
  chatId: string,
  messages: AgentMessage[],
  from: number,
  opts: { meta?: Record<number, Record<string, ToolMeta>>; addUsage?: { inputTokens: number; outputTokens: number } } = {},
): Promise<void> {
  const batch = writeBatch(db)
  for (let i = Math.max(0, from); i < messages.length; i++) {
    const m = messages[i]
    const meta = opts.meta?.[i]
    batch.set(doc(db, CHATS, chatId, 'messages', seqId(i)), {
      seq: i, role: m.role, content: fitContent(m.content), ...(meta && Object.keys(meta).length ? { meta: JSON.stringify(meta) } : {}),
      createdAt: new Date().toISOString(),
    })
  }
  batch.update(doc(db, CHATS, chatId), {
    updatedAt: new Date().toISOString(),
    messageCount: messages.length,
    ...(opts.addUsage ? { inputTokens: increment(opts.addUsage.inputTokens), outputTokens: increment(opts.addUsage.outputTokens) } : {}),
  })
  await batch.commit()
}

export async function renameAgentChat(chatId: string, title: string): Promise<void> {
  await updateDoc(doc(db, CHATS, chatId), { title: title.slice(0, 80) })
}

/** ลบแชท + ข้อความทั้งหมด (subcollection ไม่หายตาม doc แม่) */
export async function deleteAgentChat(chatId: string): Promise<void> {
  const snap = await getDocs(collection(db, CHATS, chatId, 'messages'))
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(db)
    for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref)
    await batch.commit()
  }
  await deleteDoc(doc(db, CHATS, chatId))
}
