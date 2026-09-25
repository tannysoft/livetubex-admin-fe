'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowPathIcon, CheckCircleIcon, ChevronDownIcon, ClockIcon, ExclamationTriangleIcon, PaperAirplaneIcon, PlusIcon, SparklesIcon, StopIcon,
  TrashIcon, WrenchScrewdriverIcon, XCircleIcon,
} from '@heroicons/react/24/outline'
import FormListbox from '@/components/ui/FormListbox'
import FormCheckbox from '@/components/ui/FormCheckbox'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useBrand } from '@/components/BrandProvider'
import { useAuth } from '@/lib/auth-context'
import { AGENT_MODELS, getAgentSettings, type AgentEffort } from '@/lib/equipment/agent-settings'
import { appendTrace, type TraceEntry } from '@/lib/equipment/agent'
import { ALWAYS_CONFIRM, WRITE_TOOLS, describeAction, executeTool, type ToolOutcome } from '@/lib/system-agent/tools'
import { runTurn, systemAgentErrorMessage, type AgentMessage, type ContentBlock } from '@/lib/system-agent/run'
import {
  createAgentChat, deleteAgentChat, listAgentChats, loadAgentMessages, saveAgentMessages, type AgentChat, type StoredMessage, type ToolMeta,
} from '@/lib/system-agent/history'
import { formatDateTime } from '@/lib/utils'

/** แถวที่โชว์ในหน้าแชท (บทสนทนาจริงที่ส่ง API อยู่ใน messages แยกกัน) */
type FeedEntry =
  | { kind: 'user'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'text'; text: string }
  | {
    kind: 'tool'; id: string; name: string; input: Record<string, unknown>
    status: 'awaiting' | 'running' | 'done' | 'error' | 'declined'
    result?: string; link?: ToolOutcome['link']; progress?: string; trace?: TraceEntry[]
  }
  | { kind: 'error'; text: string }

const MAX_STEPS = 30

const TOOL_LABELS: Record<string, string> = {
  list_jobs: 'ค้นหางาน', get_job: 'ดูรายละเอียดงาน', list_accounting_statuses: 'ดูสถานะบัญชี', list_calendar: 'ดูปฏิทิน',
  list_plans: 'ค้นหาแผน', get_plan: 'ดูแผน', search_equipment: 'ค้นสต็อก', list_freelancers: 'ค้นหา Freelancer',
  create_job: 'สร้างงาน', update_job: 'แก้ไขงาน', set_job_accounting_status: 'ตั้งสถานะบัญชี', add_calendar_note: 'เพิ่มโน้ตปฏิทิน',
  create_plan: 'สร้างแผน', run_equipment_agent: 'จัดอุปกรณ์ + วาดผัง', send_job_details: 'ส่งรายละเอียดงานทาง LINE',
}

const EXAMPLES = [
  'สร้างงาน Concert ABC วันที่ 15-16 พ.ย. ที่อิมแพค อารีน่า ลูกค้า XYZ Entertainment',
  'งานเดือนหน้ามีอะไรบ้าง และงานไหนยังไม่วางบิล',
  'สร้างแผนให้งาน ATLAS แล้วจัดกล้อง 6 ตัว ATEM 2 M/E พร้อมวาดผังระบบ',
  'เปลี่ยนสถานะบัญชีงานที่เสร็จแล้วเดือนที่แล้วเป็นรับเงินแล้ว',
]

/** สร้างแถวที่โชว์จากประวัติที่บันทึกไว้ (ข้อความ API + สถานะ/ลิงก์ของ tool) */
function feedFromHistory(stored: StoredMessage[]): FeedEntry[] {
  const feed: FeedEntry[] = []
  for (const m of stored) {
    if (typeof m.content === 'string') {
      feed.push(m.role === 'user' ? { kind: 'user', text: m.content } : { kind: 'text', text: m.content })
      continue
    }
    for (const b of m.content) {
      if (b.type === 'thinking') feed.push({ kind: 'thinking', text: b.thinking })
      else if (b.type === 'text') feed.push(m.role === 'user' ? { kind: 'user', text: b.text } : { kind: 'text', text: b.text })
      else if (b.type === 'tool_use') feed.push({ kind: 'tool', id: b.id, name: b.name, input: b.input, status: 'done' })
      else if (b.type === 'tool_result') {
        const i = feed.findIndex((e) => e.kind === 'tool' && e.id === b.tool_use_id)
        const meta = m.meta?.[b.tool_use_id]
        if (i >= 0) {
          const t = feed[i] as Extract<FeedEntry, { kind: 'tool' }>
          feed[i] = { ...t, status: meta?.status ?? (b.is_error ? 'error' : 'done'), result: b.content, ...(meta?.link ? { link: meta.link } : {}) }
        }
      }
    }
  }
  return feed
}

/**
 * ผู้ช่วย AI ทั้งระบบ — แชทสั่งงาน: สร้าง/แก้งาน ปฏิทิน สถานะบัญชี สร้างแผน + ให้ผู้ช่วยจัดอุปกรณ์/วาดผัง ส่ง LINE
 * วนรอบที่หน้าเว็บ: Claude (ผ่าน function systemAgent) ขอ tool → รันที่นี่ (tool เขียนข้อมูลต้องกดอนุมัติ) → ส่งผลกลับ
 * ประวัติแชทเก็บใน Firestore (lib/system-agent/history.ts) — บันทึกข้อความ AI พร้อมผลของ tool ทีเดียว (ไม่ค้าง tool_use ที่ไม่มีผล)
 */
export default function SystemAgentPage() {
  const brand = useBrand()
  const { user } = useAuth()
  const [model, setModel] = useState('claude-sonnet-5')
  const [effort, setEffort] = useState<AgentEffort>('medium')
  const [autoApprove, setAutoApprove] = useState(false)
  const [input, setInput] = useState('')
  const [feed, setFeed] = useState<FeedEntry[]>([])
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [running, setRunning] = useState(false)
  const [usage, setUsage] = useState({ inputTokens: 0, outputTokens: 0 })
  const [chats, setChats] = useState<AgentChat[]>([])
  const [chatId, setChatId] = useState<string | null>(null)
  const [loadingChat, setLoadingChat] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [deleting, setDeleting] = useState<AgentChat | null>(null)
  const [saveError, setSaveError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const approvals = useRef(new Map<string, (ok: boolean) => void>())
  const bottomRef = useRef<HTMLDivElement>(null)
  // บันทึกแล้วถึงข้อความที่เท่าไร + สถานะ tool ต่อข้อความ (index → toolUseId → meta)
  const savedCount = useRef(0)
  const metaRef = useRef<Record<number, Record<string, ToolMeta>>>({})

  useEffect(() => {
    getAgentSettings().then((s) => { setModel(s.defaultModel); setEffort(s.defaultEffort) }).catch(() => {})
  }, [])
  useEffect(() => {
    if (!user) return
    listAgentChats(user.uid).then(setChats).catch((e) => console.error(e))
  }, [user])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [feed])

  const pushDelta = (kind: 'thinking' | 'text', text: string) => setFeed((f) => {
    const last = f[f.length - 1]
    if (last && last.kind === kind) return [...f.slice(0, -1), { ...last, text: last.text + text }]
    return [...f, { kind, text }]
  })
  const patchTool = (id: string, patch: Partial<Extract<FeedEntry, { kind: 'tool' }>> | ((t: Extract<FeedEntry, { kind: 'tool' }>) => Partial<Extract<FeedEntry, { kind: 'tool' }>>)) =>
    setFeed((f) => f.map((e) => (e.kind === 'tool' && e.id === id ? { ...e, ...(typeof patch === 'function' ? patch(e) : patch) } : e)))

  const decide = (id: string, ok: boolean) => {
    approvals.current.get(id)?.(ok)
    approvals.current.delete(id)
  }

  /** บันทึกข้อความที่ยังไม่ได้บันทึก — พังก็คุยต่อได้ แค่เตือน */
  const persist = async (id: string, msgs: AgentMessage[], addUsage?: { inputTokens: number; outputTokens: number }) => {
    try {
      await saveAgentMessages(id, msgs, savedCount.current, { meta: metaRef.current, addUsage })
      savedCount.current = msgs.length
      const now = new Date().toISOString()
      setChats((list) => list.map((c) => (c.id === id ? {
        ...c, updatedAt: now, messageCount: msgs.length,
        inputTokens: c.inputTokens + (addUsage?.inputTokens ?? 0), outputTokens: c.outputTokens + (addUsage?.outputTokens ?? 0),
      } : c)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
      setSaveError('')
    } catch (e) {
      console.error('save chat failed', e)
      setSaveError('บันทึกประวัติแชทไม่สำเร็จ — คุยต่อได้ แต่รอบนี้อาจไม่อยู่ในประวัติ')
    }
  }

  /** วนรอบจน Claude ตอบจบ (ไม่ขอ tool แล้ว) */
  const drive = async (id: string, start: AgentMessage[]) => {
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setRunning(true)
    let msgs = start
    let pendingUsage = { inputTokens: 0, outputTokens: 0 }
    const flushUsage = () => { const u = pendingUsage; pendingUsage = { inputTokens: 0, outputTokens: 0 }; return u }
    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        const turn = await runTurn({
          appName: brand.appName, messages: msgs, model, effort, signal: ctrl.signal,
          onEvent: (e) => pushDelta(e.type, e.text),
        })
        setUsage((u) => ({ inputTokens: u.inputTokens + turn.usage.inputTokens, outputTokens: u.outputTokens + turn.usage.outputTokens }))
        pendingUsage = { inputTokens: pendingUsage.inputTokens + turn.usage.inputTokens, outputTokens: pendingUsage.outputTokens + turn.usage.outputTokens }
        msgs = [...msgs, { role: 'assistant', content: turn.content }]
        setMessages(msgs)
        const uses = turn.content.filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use')
        if (!uses.length) { await persist(id, msgs, flushUsage()); break }
        if (turn.stop_reason === 'max_tokens') throw new Error('คำตอบยาวเกินจนถูกตัด — ลองสั่งเป็นขั้นเล็กลง')

        const results: ContentBlock[] = []
        const meta: Record<string, ToolMeta> = {}
        for (const tu of uses) {
          const needsApproval = WRITE_TOOLS.has(tu.name) && (!autoApprove || ALWAYS_CONFIRM.has(tu.name))
          setFeed((f) => [...f, { kind: 'tool', id: tu.id, name: tu.name, input: tu.input, status: needsApproval ? 'awaiting' : 'running' }])
          if (needsApproval) {
            const ok = await new Promise<boolean>((resolve) => approvals.current.set(tu.id, resolve))
            if (!ok) {
              patchTool(tu.id, { status: 'declined' })
              meta[tu.id] = { status: 'declined' }
              results.push({ type: 'tool_result', tool_use_id: tu.id, content: 'ผู้ใช้ไม่อนุมัติ action นี้ — ยังไม่ได้ทำ', is_error: true })
              continue
            }
            patchTool(tu.id, { status: 'running' })
          }
          if (ctrl.signal.aborted) throw Object.assign(new Error('หยุดแล้ว'), { name: 'AbortError' })
          try {
            const out = await executeTool(tu.name, tu.input, {
              userEmail: user?.email ?? undefined,
              signal: ctrl.signal,
              onProgress: (text) => patchTool(tu.id, { progress: text }),
              onAgentEvent: (e) => patchTool(tu.id, (t) => ({ trace: appendTrace(t.trace ?? [], e) })),
            })
            patchTool(tu.id, { status: out.isError ? 'error' : 'done', result: out.content, link: out.link, progress: undefined })
            meta[tu.id] = { status: out.isError ? 'error' : 'done', ...(out.link ? { link: out.link } : {}) }
            results.push({ type: 'tool_result', tool_use_id: tu.id, content: out.content.slice(0, 60_000), ...(out.isError ? { is_error: true } : {}) })
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            patchTool(tu.id, { status: 'error', result: msg, progress: undefined })
            meta[tu.id] = { status: 'error' }
            results.push({ type: 'tool_result', tool_use_id: tu.id, content: `ผิดพลาด: ${msg}`, is_error: true })
          }
        }
        msgs = [...msgs, { role: 'user', content: results }]
        metaRef.current[msgs.length - 1] = meta
        setMessages(msgs)
        // ข้อความ AI (tool_use) + ผลของ tool บันทึกคู่กัน
        await persist(id, msgs, flushUsage())
      }
    } catch (err) {
      setFeed((f) => [...f, { kind: 'error', text: systemAgentErrorMessage(err) }])
      // บทสนทนาต้องจบด้วยคำตอบของ tool_use ทุกตัว ไม่งั้นรอบหน้า API ปฏิเสธ → ตัดรอบที่ค้างทิ้ง
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant' && Array.isArray(last.content) && last.content.some((b) => b.type === 'tool_use')) msgs = msgs.slice(0, -1)
      setMessages(msgs)
      await persist(id, msgs, flushUsage())
    } finally {
      for (const [tid] of approvals.current) decide(tid, false)
      abortRef.current = null
      setRunning(false)
    }
  }

  const send = async (text = input) => {
    const t = text.trim()
    if (!t || running || !user) return
    setInput('')
    setFeed((f) => [...f, { kind: 'user', text: t }])
    // ข้อความ user ต่อกัน 2 อันไม่ได้ (เช่น รอบก่อน error) → รวมเข้าอันเดิม (บันทึกทับข้อความนั้น)
    const last = messages[messages.length - 1]
    const merged = last?.role === 'user' && typeof last.content === 'string'
    const next: AgentMessage[] = merged
      ? [...messages.slice(0, -1), { role: 'user', content: `${last.content}\n\n${t}` }]
      : [...messages, { role: 'user', content: t }]
    if (merged) savedCount.current = Math.min(savedCount.current, next.length - 1)
    setMessages(next)
    let id = chatId
    if (!id) {
      try {
        id = await createAgentChat({ uid: user.uid, email: user.email ?? undefined, title: t, model })
        const now = new Date().toISOString()
        setChats((list) => [{ id: id!, title: t.slice(0, 80), ownerUid: user.uid, inputTokens: 0, outputTokens: 0, messageCount: 0, createdAt: now, updatedAt: now }, ...list])
        setChatId(id)
      } catch (e) {
        console.error(e)
        setFeed((f) => [...f, { kind: 'error', text: 'สร้างแชทไม่สำเร็จ (ยังไม่ได้ deploy firestore rules?)' }])
        return
      }
    }
    void drive(id, next)
  }

  const stop = () => {
    abortRef.current?.abort()
    for (const [id] of approvals.current) decide(id, false)
  }

  const newChat = () => {
    if (running) return
    setChatId(null); setFeed([]); setMessages([]); setUsage({ inputTokens: 0, outputTokens: 0 })
    savedCount.current = 0; metaRef.current = {}; setShowHistory(false); setSaveError('')
  }

  const openChat = async (c: AgentChat) => {
    if (running || c.id === chatId) { setShowHistory(false); return }
    setLoadingChat(true)
    setShowHistory(false)
    try {
      const stored = await loadAgentMessages(c.id)
      setChatId(c.id)
      setMessages(stored.map(({ role, content }) => ({ role, content })))
      setFeed(feedFromHistory(stored))
      metaRef.current = Object.fromEntries(stored.filter((m) => m.meta).map((m) => [m.seq, m.meta!]))
      savedCount.current = stored.length
      setUsage({ inputTokens: c.inputTokens, outputTokens: c.outputTokens })
      setSaveError('')
    } catch (e) {
      console.error(e)
      setFeed([{ kind: 'error', text: 'โหลดแชทไม่สำเร็จ' }])
    } finally {
      setLoadingChat(false)
    }
  }

  const removeChat = async (c: AgentChat) => {
    await deleteAgentChat(c.id)
    setChats((list) => list.filter((x) => x.id !== c.id))
    if (c.id === chatId) newChat()
  }

  const historyList = (
    <div className="space-y-1">
      <button onClick={newChat} disabled={running} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-brand border border-brand/30 hover:bg-brand-soft disabled:opacity-40">
        <PlusIcon className="w-4 h-4" /> แชทใหม่
      </button>
      {chats.length === 0 && <p className="px-2 py-4 text-xs text-gray-400 text-center">ยังไม่มีประวัติแชท</p>}
      {chats.map((c) => (
        <div key={c.id} className={`group flex items-center gap-1 rounded-xl ${c.id === chatId ? 'bg-brand-soft' : 'hover:bg-gray-50'}`}>
          <button onClick={() => void openChat(c)} disabled={running} className="flex-1 min-w-0 text-left px-3 py-2 disabled:cursor-not-allowed">
            <span className={`block text-sm truncate ${c.id === chatId ? 'text-gray-900 font-medium' : 'text-gray-700'}`}>{c.title}</span>
            <span className="block text-[11px] text-gray-400">{formatDateTime(c.updatedAt)}</span>
          </button>
          <button onClick={() => setDeleting(c)} disabled={running} className="shrink-0 p-1.5 mr-1 rounded-lg text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500 disabled:hidden" aria-label="ลบแชท">
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )

  return (
    <div className="flex gap-4 h-[calc(100dvh-7rem)] lg:h-[calc(100dvh-4rem)]">
      <aside className="hidden lg:flex flex-col w-60 shrink-0">
        <p className="px-1 pb-2 text-xs font-semibold text-gray-400">ประวัติแชท</p>
        <div className="flex-1 overflow-y-auto">{historyList}</div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col max-w-4xl">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><SparklesIcon className="w-6 h-6 text-brand" /> ผู้ช่วย AI</h1>
            <p className="text-gray-500 mt-1 text-sm">สั่งงานทั้งระบบ — สร้าง/แก้งาน ปฏิทิน สถานะบัญชี สร้างแผน จัดอุปกรณ์ วาดผัง ส่ง LINE · การแก้ข้อมูลต้องกดอนุมัติก่อนทุกครั้ง</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <FormListbox value={model} onChange={setModel} options={AGENT_MODELS.map((m) => ({ value: m.id, label: m.label }))} buttonClassName="w-44 px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white" />
            <FormListbox value={effort} onChange={(v) => setEffort(v as AgentEffort)} options={[{ value: 'low', label: 'คิดเร็ว' }, { value: 'medium', label: 'คิดปานกลาง' }, { value: 'high', label: 'คิดละเอียด' }]} buttonClassName="w-32 px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white" />
            <button onClick={() => setShowHistory((v) => !v)} className="lg:hidden flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 bg-white hover:bg-gray-50">
              <ClockIcon className="w-4 h-4" /> ประวัติ
            </button>
            <button onClick={newChat} disabled={running || feed.length === 0} className="lg:hidden flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-40">
              <ArrowPathIcon className="w-4 h-4" /> แชทใหม่
            </button>
          </div>
        </div>

        {showHistory && <div className="lg:hidden mb-3 max-h-72 overflow-y-auto bg-white rounded-2xl border border-gray-100 shadow-sm p-2">{historyList}</div>}

        <div className="flex-1 overflow-y-auto bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          {loadingChat && <p className="text-sm text-gray-400 text-center py-8">กำลังโหลดแชท…</p>}
          {!loadingChat && feed.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-8">
              <SparklesIcon className="w-10 h-10 text-brand" />
              <p className="text-sm text-gray-500 max-w-md">พิมพ์สิ่งที่ต้องการได้เลย ผู้ช่วยจะค้นข้อมูลในระบบเอง และขออนุมัติก่อนสร้างหรือแก้อะไร</p>
              <div className="grid gap-2 sm:grid-cols-2 max-w-2xl w-full">
                {EXAMPLES.map((ex) => (
                  <button key={ex} onClick={() => void send(ex)} className="text-left text-sm px-3 py-2.5 rounded-xl border border-gray-200 text-gray-700 hover:border-brand hover:bg-brand-soft">{ex}</button>
                ))}
              </div>
            </div>
          )}
          {!loadingChat && feed.map((e, i) => <FeedRow key={i} entry={e} onDecide={decide} />)}
          {running && feed[feed.length - 1]?.kind !== 'tool' && (
            <div className="flex items-center gap-2 text-xs text-gray-400"><span className="w-2 h-2 rounded-full bg-brand animate-pulse" /> กำลังคิด…</div>
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); void send() }} className="mt-3 space-y-2">
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }}
              rows={2}
              placeholder="สั่งงาน เช่น สร้างงาน… / แก้วันงาน… / จัดอุปกรณ์ให้แผน…  (Enter ส่ง · Shift+Enter ขึ้นบรรทัด)"
              className="flex-1 px-4 py-3 rounded-2xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-white"
            />
            {running ? (
              <button type="button" onClick={stop} className="shrink-0 flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-gray-900 text-white text-sm font-medium">
                <StopIcon className="w-4 h-4" /> หยุด
              </button>
            ) : (
              <button type="submit" disabled={!input.trim() || loadingChat} className="shrink-0 flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-brand text-white text-sm font-medium hover:bg-brand-dark disabled:opacity-40">
                <PaperAirplaneIcon className="w-4 h-4" /> ส่ง
              </button>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-gray-400">
            <FormCheckbox size="sm" checked={autoApprove} onChange={setAutoApprove} label={<span className="text-xs text-gray-600">อนุมัติอัตโนมัติ (ยกเว้นการส่ง LINE)</span>} />
            {saveError && <span className="text-amber-600">{saveError}</span>}
            {usage.inputTokens > 0 && <span>token: เข้า {usage.inputTokens.toLocaleString()} · ออก {usage.outputTokens.toLocaleString()}</span>}
          </div>
        </form>
      </div>

      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) void removeChat(deleting); setDeleting(null) }}
        title="ลบแชท"
        message={`ลบแชท "${deleting?.title ?? ''}" และข้อความทั้งหมด? (ข้อมูลที่ผู้ช่วยสร้าง/แก้ไปแล้วไม่ถูกลบ)`}
        confirmLabel="ลบ"
        danger
      />
    </div>
  )
}

function FeedRow({ entry, onDecide }: { entry: FeedEntry; onDecide: (id: string, ok: boolean) => void }) {
  const [open, setOpen] = useState(false)
  switch (entry.kind) {
    case 'user':
      return <div className="flex justify-end"><p className="max-w-[85%] rounded-2xl rounded-br-md bg-brand text-white px-4 py-2.5 text-sm whitespace-pre-wrap">{entry.text}</p></div>
    case 'text':
      return <p className="max-w-[90%] rounded-2xl rounded-bl-md bg-gray-50 px-4 py-2.5 text-sm text-gray-800 whitespace-pre-wrap">{entry.text}</p>
    case 'thinking':
      return (
        <button onClick={() => setOpen((o) => !o)} className="block text-left max-w-[90%] text-xs text-gray-400 hover:text-gray-600">
          <span className="inline-flex items-center gap-1"><ChevronDownIcon className={`w-3 h-3 transition-transform ${open ? '' : '-rotate-90'}`} /> ความคิด</span>
          {open && <span className="block mt-1 whitespace-pre-wrap border-l-2 border-gray-200 pl-2">{entry.text}</span>}
        </button>
      )
    case 'error':
      return <p className="flex items-center gap-1.5 text-sm text-red-600"><ExclamationTriangleIcon className="w-4 h-4 shrink-0" /> {entry.text}</p>
    case 'tool': {
      const write = WRITE_TOOLS.has(entry.name)
      const label = TOOL_LABELS[entry.name] ?? entry.name
      if (!write) {
        // tool อ่าน: บรรทัดเดียวจางๆ กดดูผลได้
        return (
          <div className="text-xs text-gray-400">
            <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 hover:text-gray-600">
              {entry.status === 'running' ? <span className="w-3 h-3 rounded-full border-2 border-gray-300 border-t-transparent animate-spin" /> : entry.status === 'error' ? <XCircleIcon className="w-3.5 h-3.5 text-red-400" /> : <WrenchScrewdriverIcon className="w-3.5 h-3.5" />}
              {label}{typeof entry.input.query === 'string' && entry.input.query ? ` “${entry.input.query}”` : ''}
              {entry.link && <Link href={entry.link.href} className="text-brand hover:underline ml-1" onClick={(e) => e.stopPropagation()}>{entry.link.label}</Link>}
            </button>
            {open && entry.result && <pre className="mt-1 max-h-60 overflow-auto rounded-lg bg-gray-50 p-2 text-[11px] text-gray-600 whitespace-pre-wrap break-all">{prettyJson(entry.result)}</pre>}
          </div>
        )
      }
      const tone = entry.status === 'done' ? 'border-green-200 bg-green-50/50' : entry.status === 'error' ? 'border-red-200 bg-red-50/40' : entry.status === 'declined' ? 'border-gray-200 bg-gray-50 opacity-70' : 'border-amber-200 bg-amber-50/60'
      const lastTrace = entry.trace?.filter((t) => t.kind === 'tool').slice(-1)[0]
      return (
        <div className={`max-w-[90%] rounded-2xl border px-4 py-3 text-sm space-y-2 ${tone}`}>
          <div className="flex items-center gap-2 font-medium text-gray-900">
            {entry.status === 'done' && <CheckCircleIcon className="w-5 h-5 text-green-600" />}
            {entry.status === 'error' && <XCircleIcon className="w-5 h-5 text-red-600" />}
            {entry.status === 'running' && <span className="w-4 h-4 rounded-full border-2 border-brand border-t-transparent animate-spin" />}
            {entry.status === 'awaiting' && <ExclamationTriangleIcon className="w-5 h-5 text-amber-600" />}
            {label}
            <span className="text-xs font-normal text-gray-500">
              {entry.status === 'awaiting' ? 'รออนุมัติ' : entry.status === 'running' ? (entry.progress ?? 'กำลังทำ…') : entry.status === 'declined' ? 'ไม่อนุมัติ' : entry.status === 'error' ? 'ไม่สำเร็จ' : 'เรียบร้อย'}
            </span>
          </div>
          <p className="text-xs text-gray-700 whitespace-pre-wrap">{describeAction(entry.name, entry.input)}</p>
          {entry.status === 'running' && lastTrace?.kind === 'tool' && <p className="text-[11px] text-gray-400 truncate">… {lastTrace.name} {lastTrace.detail}</p>}
          {entry.status === 'error' && entry.result && <p className="text-xs text-red-600">{entry.result}</p>}
          {entry.status === 'awaiting' && (
            <div className="flex gap-2">
              <button onClick={() => onDecide(entry.id, true)} className="px-4 py-1.5 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark">อนุมัติ</button>
              <button onClick={() => onDecide(entry.id, false)} className="px-4 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 bg-white hover:bg-gray-50">ไม่อนุมัติ</button>
            </div>
          )}
          {entry.status === 'done' && entry.link && <Link href={entry.link.href} className="inline-block text-xs text-brand hover:underline">{entry.link.label} →</Link>}
        </div>
      )
    }
  }
}

function prettyJson(s: string): string {
  try { return JSON.stringify(JSON.parse(s), null, 1) } catch { return s }
}
