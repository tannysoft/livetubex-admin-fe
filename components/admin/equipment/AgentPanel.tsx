'use client'

import FormCheckbox from '@/components/ui/FormCheckbox'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  SparklesIcon, ExclamationTriangleIcon, XCircleIcon, QuestionMarkCircleIcon, Cog6ToothIcon, LightBulbIcon,
  WrenchScrewdriverIcon, CheckCircleIcon, ChevronRightIcon,
} from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import FormListbox from '@/components/ui/FormListbox'
import DiagramPreview from '@/components/admin/equipment/DiagramPreview'
import { changedDiagrams, diffItems } from '@/lib/equipment/plan-diff'
import {
  agentErrorMessage, appendTrace, mergeStagedDrafts, runEquipmentAgent, type AgentDraft, type AgentTurn, type TraceEntry,
} from '@/lib/equipment/agent'
import {
  AGENT_EFFORTS, AGENT_MODELS, DEFAULT_AGENT_EFFORT, DEFAULT_AGENT_MODEL, DEFAULT_PHASE_MODELS, DEFAULT_AGENT_RULES, effectiveSystemPrompt, getAgentSettings,
  type AgentEffort, type AgentSettings,
} from '@/lib/equipment/agent-settings'
import type { EquipmentPlan, PlanDiagram, PlanItem, PlanLayout } from '@/lib/types'

interface AgentPanelProps {
  isOpen: boolean
  onClose: () => void
  plan: EquipmentPlan
  /** ใช้ร่าง → แทนที่ items + diagrams ของแผนทั้งชุด (เข้า autosave ตามปกติ) */
  onApply: (items: PlanItem[], diagrams: PlanDiagram[], layouts: PlanLayout[]) => void | Promise<void>
}

const EXAMPLES = [
  'จัดของงานนี้ 4 กล้อง สตรีม YouTube บันทึก PGM และมีอินเตอร์คอมให้ทีมกล้อง',
  'วาดผังระบบ Video จากของที่อยู่ในรายการตอนนี้',
  'ตั้งปลายทางให้ทุกรายการที่ยังว่าง',
  'เพิ่มกล้องอีก 2 ตัวบนอัฒจันทร์ แล้วโยงเข้าสวิตเชอร์',
]

/**
 * ผู้ช่วย AI — สั่งเป็นภาษาคน แล้วได้ "ร่าง" กลับมาให้ตรวจ (ยังไม่บันทึก)
 * สั่งแก้ต่อได้หลายรอบ แต่ละรอบใช้ร่างล่าสุดเป็นฐาน กด "ใช้ร่างนี้" ถึงจะเข้าแผนจริง
 */
export default function AgentPanel({ isOpen, onClose, plan, onApply }: AgentPanelProps) {
  const [instruction, setInstruction] = useState('')
  const [settings, setSettings] = useState<AgentSettings | null>(null)
  const [model, setModel] = useState('')
  const [effort, setEffort] = useState<AgentEffort | ''>('')
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<AgentTurn[]>([])
  const [draft, setDraft] = useState<AgentDraft | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  /** ความคิด + tool ที่เรียกของรอบล่าสุด (stream สดระหว่างทำงาน) */
  const [trace, setTrace] = useState<TraceEntry[]>([])
  /** คำสั่งแรกแบ่ง 2 ขั้น: จัดของ → โยงผัง (แต่ละขั้นได้เวลาเต็มของ function) — คำสั่งแก้ร่างต่อทำรอบเดียว */
  const [staged, setStaged] = useState(true)
  /** ป้ายขั้นที่กำลังทำ เช่น "ขั้น 1/2 จัดของ" */
  const [phaseLabel, setPhaseLabel] = useState('')

  // โหลดตั้งค่าทุกครั้งที่เปิด — เพิ่งแก้ prompt/กฎในหน้าตั้งค่ามาจะได้ค่าใหม่
  useEffect(() => {
    if (!isOpen) return
    let alive = true
    getAgentSettings()
      .catch((): AgentSettings => ({ systemPrompt: '', rules: DEFAULT_AGENT_RULES, defaultModel: DEFAULT_AGENT_MODEL, defaultEffort: DEFAULT_AGENT_EFFORT, phaseModels: { ...DEFAULT_PHASE_MODELS } }))
      .then((s) => {
        if (!alive) return
        setSettings(s)
        setModel((m) => m || s.defaultModel)
        setEffort((e) => e || s.defaultEffort)
      })
    return () => { alive = false }
  }, [isOpen])

  useEffect(() => {
    if (!running) return
    const started = Date.now()
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(t)
  }, [running])

  const reset = () => {
    setDraft(null)
    setHistory([])
    setInstruction('')
    setError('')
    setPreviewId(null)
    setTrace([])
  }

  const run = async () => {
    const text = instruction.trim()
    if (!text || running || !settings) return
    setRunning(true)
    setElapsed(0)
    setError('')
    setTrace([])
    const common = {
      plan,
      model: model || settings.defaultModel,
      effort: effort || settings.defaultEffort,
      systemPrompt: effectiveSystemPrompt(settings),
      rules: settings.rules,
      onEvent: (e: Parameters<typeof appendTrace>[1]) => setTrace((t) => appendTrace(t, e)),
    }
    const base = draft
      ? { items: draft.items, diagrams: draft.diagrams, layouts: draft.layouts }
      : { items: plan.items, diagrams: plan.diagrams, layouts: plan.layouts ?? [] }
    const done = (result: AgentDraft, summary: string) => {
      setDraft(result)
      setHistory((h) => [...h, { role: 'user', text }, { role: 'assistant', text: summary }])
      setInstruction('')
      setPreviewId(changedDiagrams(plan.diagrams, result.diagrams)[0]?.diagram.id ?? null)
    }
    // ขั้นแรกผ่านแล้ว — ถ้าขั้นโยงผังพัง ยังเก็บร่างจัดของไว้ให้สั่งต่อได้
    let first: AgentDraft | null = null
    try {
      if (staged && !draft) {
        setPhaseLabel('ขั้น 1/2 จัดของ')
        setTrace([{ kind: 'phase', label: 'ขั้น 1/2 — จัดของ' }])
        first = await runEquipmentAgent({ ...common, model: settings.phaseModels.items || common.model, base, instruction: text, history, phase: 'items' })
        setPhaseLabel('ขั้น 2/2 โยงผัง')
        setTrace((t) => [...t, { kind: 'phase', label: 'ขั้น 2/2 — วาดผังระบบ' }])
        const second = await runEquipmentAgent({
          ...common,
          model: settings.phaseModels.wiring || common.model,
          base: { items: first.items, diagrams: first.diagrams, layouts: first.layouts },
          instruction: text,
          history: [...history, { role: 'user', text }, { role: 'assistant', text: first.summary }],
          phase: 'wiring',
        })
        const merged = mergeStagedDrafts(first, second)
        done(merged, merged.summary)
      } else {
        setPhaseLabel('')
        const result = await runEquipmentAgent({ ...common, base, instruction: text, history })
        done(result, result.summary)
      }
    } catch (err) {
      if (first) {
        done(first, first.summary)
        setError(`ขั้นโยงผังไม่สำเร็จ (${agentErrorMessage(err)}) — ร่างจัดของยังอยู่ สั่ง "วาดผังระบบ Video จากรายการในร่าง" ต่อได้`)
      } else {
        setError(agentErrorMessage(err))
      }
    } finally {
      setRunning(false)
      setPhaseLabel('')
    }
  }

  const apply = async () => {
    if (!draft) return
    await onApply(draft.items, draft.diagrams, draft.layouts)
    reset()
    onClose()
  }

  const itemChanges = draft ? diffItems(plan.items, draft.items) : null
  const diagramChanges = draft ? changedDiagrams(plan.diagrams, draft.diagrams) : []
  const preview = diagramChanges.find((c) => c.diagram.id === previewId)?.diagram ?? diagramChanges[0]?.diagram
  const errors = draft?.issues.filter((i) => i.level === 'error') ?? []
  const warnings = draft?.issues.filter((i) => i.level === 'warning') ?? []

  return (
    <Modal isOpen={isOpen} onClose={() => { if (!running) onClose() }} title="ผู้ช่วย AI จัดอุปกรณ์ + ร่างผังระบบ" size="4xl">
      <div className="space-y-4">
        {history.length > 0 && (
          <div className="space-y-2">
            {history.map((t, i) => (
              <div key={i} className={t.role === 'user' ? 'flex justify-end' : ''}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${t.role === 'user' ? 'bg-brand-soft text-gray-900' : 'bg-gray-50 text-gray-800 border border-gray-100'}`}>
                  {t.text}
                </div>
              </div>
            ))}
          </div>
        )}

        {running && <ThinkingLog trace={trace} live elapsed={elapsed} />}
        {!running && trace.length > 0 && (
          <details className="group rounded-xl border border-gray-100">
            <summary className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-gray-500 cursor-pointer select-none list-none">
              <ChevronRightIcon className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
              <LightBulbIcon className="w-4 h-4" /> ดูความคิดและขั้นตอนของผู้ช่วย ({trace.filter((t) => t.kind === 'tool').length} ขั้น)
            </summary>
            <div className="border-t border-gray-100"><ThinkingLog trace={trace} /></div>
          </details>
        )}

        {draft && (
          <div className="space-y-3">
            {draft.stoppedEarly && (
              <p className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
                <ExclamationTriangleIcon className="w-4 h-4 mt-0.5 shrink-0" /> {draft.stoppedEarly}
              </p>
            )}
            {draft.questions.length > 0 && (
              <div className="rounded-xl border border-sky-200 bg-sky-50/60 px-4 py-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-sky-800"><QuestionMarkCircleIcon className="w-4 h-4" /> ผู้ช่วยอยากให้ตัดสินใจ</p>
                <ul className="mt-1.5 space-y-1 text-sm text-sky-900 list-disc pl-5">
                  {draft.questions.map((q, i) => <li key={i}>{q}</li>)}
                </ul>
                <p className="mt-1.5 text-xs text-sky-700">ตอบในช่องด้านล่างแล้วกดส่ง ผู้ช่วยจะแก้ร่างต่อให้</p>
              </div>
            )}
            {(errors.length > 0 || warnings.length > 0) && (
              <ul className="space-y-1 text-sm">
                {errors.map((i, k) => <li key={`e${k}`} className="flex items-start gap-1.5 text-red-600"><XCircleIcon className="w-4 h-4 mt-0.5 shrink-0" />{i.message}</li>)}
                {warnings.map((i, k) => <li key={`w${k}`} className="flex items-start gap-1.5 text-amber-700"><ExclamationTriangleIcon className="w-4 h-4 mt-0.5 shrink-0" />{i.message}</li>)}
              </ul>
            )}

            {itemChanges && (itemChanges.added.length + itemChanges.removed.length + itemChanges.changed.length > 0) && (
              <div className="rounded-xl border border-gray-100">
                <p className="px-4 py-2 text-xs font-semibold text-gray-500 border-b border-gray-100">
                  รายการอุปกรณ์ — เพิ่ม {itemChanges.added.length} · แก้ {itemChanges.changed.length} · เอาออก {itemChanges.removed.length}
                </p>
                <ul className="max-h-48 overflow-auto divide-y divide-gray-50 text-sm">
                  {itemChanges.added.map((it) => (
                    <li key={it.id} className="px-4 py-1.5 flex gap-2">
                      <span className="text-green-600 font-semibold w-4">+</span>
                      <span className="flex-1 text-gray-900">{it.name} ×{it.quantity}{!it.equipmentId && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px]">นอกสต็อก</span>}</span>
                      <span className="text-gray-500">{it.toLocation || '—'}</span>
                    </li>
                  ))}
                  {itemChanges.changed.map(({ before, after }) => (
                    <li key={after.id} className="px-4 py-1.5 flex gap-2">
                      <span className="text-sky-600 font-semibold w-4">~</span>
                      <span className="flex-1 text-gray-900">{after.name}</span>
                      <span className="text-gray-500">
                        {before.quantity !== after.quantity && <>×{before.quantity} → ×{after.quantity} </>}
                        {(before.toLocation ?? '') !== (after.toLocation ?? '') && <>{before.toLocation || '—'} → {after.toLocation || '—'}</>}
                      </span>
                    </li>
                  ))}
                  {itemChanges.removed.map((it) => (
                    <li key={it.id} className="px-4 py-1.5 flex gap-2 text-gray-400 line-through">
                      <span className="text-red-500 font-semibold w-4 no-underline">−</span>
                      <span className="flex-1">{it.name} ×{it.quantity}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {draft.placed > 0 && (
              <p className="rounded-xl border border-gray-100 px-4 py-2 text-sm text-gray-700">
                <span className="text-xs font-semibold text-gray-500 mr-2">ผังวาง 3D</span>
                วาง/ย้าย {draft.placed} ตำแหน่งใน “{draft.layouts[0]?.name}” ({draft.layouts[0]?.venue.name}) — ตำแหน่งเป็นค่าตั้งต้นตามโซน ลากปรับต่อได้
              </p>
            )}

            {diagramChanges.length > 0 && preview && (
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-100 overflow-x-auto">
                  {diagramChanges.map((c) => (
                    <button
                      key={c.diagram.id}
                      onClick={() => setPreviewId(c.diagram.id)}
                      className={`shrink-0 px-3 py-1 rounded-lg text-xs font-medium ${c.diagram.id === preview.id ? 'bg-brand-soft text-gray-900' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                      {c.diagram.name}{c.isNew ? ' (ใหม่)' : ''} <span className="text-gray-400">+{c.addedNodes} กล่อง +{c.addedEdges} สาย</span>
                    </button>
                  ))}
                </div>
                <DiagramPreview diagram={preview} />
              </div>
            )}
            <p className="text-[11px] text-gray-400">
              {modelLabel(draft.model)} · ใช้ {draft.steps} รอบ · token เข้า {draft.usage.inputTokens.toLocaleString()} / ออก {draft.usage.outputTokens.toLocaleString()} · ตำแหน่งกล่องจัดอัตโนมัติ ลากแก้ได้หลังใช้ร่าง
            </p>
          </div>
        )}

        {!draft && history.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => setInstruction(ex)} className="px-3 py-1.5 rounded-full border border-gray-200 text-xs text-gray-600 hover:border-brand hover:text-gray-900 text-left">
                {ex}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run() }}
            rows={3}
            disabled={running}
            placeholder={draft ? 'สั่งแก้ร่างต่อ เช่น "เปลี่ยน CAM 3 เป็นส่งไร้สาย", "ตอบ: เช่า HyperDeck เพิ่ม 1 ตัว"' : 'บอกโจทย์งาน เช่น จำนวนกล้อง สตรีม/บันทึก เสียง อินเตอร์คอม จุดวางกล้อง'}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand disabled:bg-gray-50"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-60">
              <FormListbox
                value={model}
                onChange={setModel}
                disabled={running}
                options={modelOptions(model)}
                buttonClassName="!py-1.5"
              />
            </div>
            {!model.startsWith('claude-haiku') && (
              <div className="w-32" title="ระดับความคิด — เร็ว/สมดุล/ละเอียด (ละเอียด = ช้าที่สุด)">
                <FormListbox
                  value={effort || DEFAULT_AGENT_EFFORT}
                  onChange={(v) => setEffort(v as AgentEffort)}
                  disabled={running}
                  options={AGENT_EFFORTS.map((e) => ({ value: e.id, label: `คิด: ${e.label}` }))}
                  buttonClassName="!py-1.5"
                />
              </div>
            )}
            {!draft && (
              <div title="งานใหญ่: จัดของให้เสร็จก่อน แล้วค่อยวาดผังระบบเป็นอีกรอบ — แต่ละขั้นได้เวลาเต็ม ไม่หมดเวลากลางคัน">
                <FormCheckbox
                  size="sm"
                  checked={staged}
                  onChange={setStaged}
                  disabled={running}
                  label={<span className="text-xs text-gray-600">
                แบ่งเป็น 2 ขั้น (จัดของ → โยงผัง)
                {staged && settings && (settings.phaseModels.items || settings.phaseModels.wiring) && (
                  <span className="text-gray-400">
                    · {modelLabel(settings.phaseModels.items || model)} → {modelLabel(settings.phaseModels.wiring || model)}
                  </span>
                )}
                  </span>}
                />
              </div>
            )}
            <Link href="/admin/equipment/agent-settings" title="แก้ system prompt / กฎของทีม / รุ่นเริ่มต้น" className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
              <Cog6ToothIcon className="w-4 h-4" />
            </Link>
            <div className="flex-1" />
            {draft && !running && (
              <button onClick={reset} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl">ทิ้งร่าง</button>
            )}
            <button
              onClick={run}
              disabled={running || !instruction.trim() || !settings}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border border-brand text-brand hover:bg-brand-soft disabled:opacity-50"
            >
              <SparklesIcon className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
              {running ? `กำลังจัด…${phaseLabel ? ` (${phaseLabel})` : ''} ${elapsed} วิ` : draft ? 'สั่งแก้ต่อ' : 'ให้ผู้ช่วยจัด'}
            </button>
            {draft && !running && (
              <button onClick={apply} className="px-5 py-2 bg-brand text-white text-sm font-medium rounded-xl hover:bg-brand-dark">
                ใช้ร่างนี้
              </button>
            )}
          </div>
          {running && <p className="text-xs text-gray-400">ผู้ช่วยกำลังเลือกของ เช็กของชนงานอื่น และโยงสาย — งานใหญ่ใช้เวลาหลายนาที (สูงสุดราว 13 นาที)</p>}
          {settings && (
            <p className="text-xs text-gray-400">
              {settings.systemPrompt.trim() ? 'ใช้ system prompt ที่แก้ไว้' : 'ใช้ system prompt ค่าเริ่มต้น'}
              {' · '}{ruleCount(settings.rules) ? `กฎของทีม ${ruleCount(settings.rules)} ข้อ` : 'ไม่มีกฎของทีม'}
            </p>
          )}
          {!draft && !running && <p className="text-xs text-gray-400">ผลลัพธ์เป็นร่างให้ตรวจก่อน ยังไม่แก้แผนจนกว่าจะกด “ใช้ร่างนี้” · port ในสต็อกเป็นค่าประมาณ ตรวจผังก่อนใช้งานจริง</p>}
        </div>
      </div>
    </Modal>
  )
}

/**
 * ความคิดของผู้ช่วย (สรุปจาก thinking ของโมเดล) + tool ที่เรียกตามลำดับ
 * live = กำลังทำงาน → เลื่อนลงล่างสุดเองเมื่อมีข้อความใหม่ (ถ้าผู้ใช้ไม่ได้เลื่อนขึ้นไปอ่าน)
 */
function ThinkingLog({ trace, live = false, elapsed = 0 }: { trace: TraceEntry[]; live?: boolean; elapsed?: number }) {
  const box = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  useEffect(() => {
    const el = box.current
    if (live && el && stick.current) el.scrollTop = el.scrollHeight
  }, [trace, live])
  return (
    <div
      ref={box}
      onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40 }}
      className={`${live ? 'max-h-72 rounded-xl border border-gray-100' : 'max-h-96'} overflow-auto px-4 py-3 space-y-2 text-sm`}
    >
      {trace.map((t, i) => {
        if (t.kind === 'thinking') {
          return (
            <p key={i} className="flex gap-2 text-gray-500 italic whitespace-pre-wrap">
              <LightBulbIcon className="w-4 h-4 mt-0.5 shrink-0 not-italic" />
              <span>{t.text}</span>
            </p>
          )
        }
        if (t.kind === 'phase') {
          return <p key={i} className="pt-1 text-xs font-semibold text-gray-500 border-b border-gray-100 pb-1">{t.label}</p>
        }
        if (t.kind === 'text') return <p key={i} className="pl-6 text-gray-800 whitespace-pre-wrap">{t.text}</p>
        if (t.kind === 'review') {
          return (
            <div key={i} className="flex gap-2 text-amber-700">
              <ExclamationTriangleIcon className="w-4 h-4 mt-0.5 shrink-0" />
              <span>ระบบตรวจพบปัญหา ส่งกลับให้ผู้ช่วยแก้: {t.errors.slice(0, 3).join(' · ')}{t.errors.length > 3 ? ` และอีก ${t.errors.length - 3} ข้อ` : ''}</span>
            </div>
          )
        }
        return (
          <div key={i} className="flex gap-2 text-xs" title={t.preview}>
            {t.ok === undefined
              ? <WrenchScrewdriverIcon className="w-4 h-4 shrink-0 text-gray-400 animate-pulse" />
              : t.ok
                ? <CheckCircleIcon className="w-4 h-4 shrink-0 text-green-600" />
                : <XCircleIcon className="w-4 h-4 shrink-0 text-red-500" />}
            <span className="font-mono text-gray-700">{t.name}</span>
            {t.detail && <span className="text-gray-400 truncate">{t.detail}</span>}
          </div>
        )
      })}
      {live && <WorkingIndicator trace={trace} elapsed={elapsed} />}
    </div>
  )
}

/** รุ่นในรายการ + รุ่นที่ตั้งเองในหน้าตั้งค่า (model ID อื่น) */
function modelOptions(current: string) {
  const opts = AGENT_MODELS.map((m) => ({ value: m.id, label: m.label }))
  if (current && !opts.some((o) => o.value === current)) opts.push({ value: current, label: current })
  return opts
}

function modelLabel(id: string): string {
  return id.split(' → ').map((part) => AGENT_MODELS.find((m) => m.id === part)?.label ?? part).join(' → ')
}

/** นับข้อจากบรรทัดที่ขึ้นต้นด้วย - หรือ • (ไม่มีเลย แต่มีข้อความ = 1 ข้อ) */
function ruleCount(rules: string): number {
  const lines = rules.split('\n').filter((l) => /^\s*[-•*]/.test(l))
  return lines.length || (rules.trim() ? 1 : 0)
}

/** tool ที่กำลังรอผล → คำที่โชว์ (ไม่มีในนี้ = ใช้คำทั่วไปวนไป) */
const TOOL_VERBS: Record<string, string> = {
  inventory_overview: 'กำลังดูสต็อก',
  search_inventory: 'กำลังค้นสต็อก',
  get_ports: 'กำลังเช็ก port',
  list_plan: 'กำลังอ่านร่าง',
  add_items: 'กำลังจัดของ',
  add_external_items: 'กำลังเพิ่มของเช่า',
  update_items: 'กำลังแก้รายการ',
  remove_items: 'กำลังเอาของออก',
  create_diagram: 'กำลังสร้างผัง',
  add_nodes: 'กำลังวางกล่องในผัง',
  connect: 'กำลังโยงสาย',
  disconnect: 'กำลังถอดสาย',
  place_3d: 'กำลังวางผัง 3D',
  swap_positions: 'กำลังสลับตำแหน่งกล้อง',
  update_node: 'กำลังแก้กล่องในผัง',
  validate: 'กำลังตรวจร่าง',
  finish: 'กำลังสรุป',
}

/** คำตอนโมเดลคิด (ยังไม่เรียก tool) — วนเปลี่ยนทุก ~2.5 วิ ให้รู้ว่ายังไม่ค้าง */
const THINKING_VERBS = ['Thinking', 'กำลังคิด', 'กำลังไล่สัญญาณ', 'กำลังเลือกอุปกรณ์', 'กำลังวางแผน', 'Pondering', 'กำลังชั่งใจ', 'กำลังต่อจิ๊กซอว์']

/** สัญลักษณ์หมุนแบบ Claude — เดินหน้าแล้วถอยกลับ ให้ดูเหมือนหายใจ */
const SPINNER = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢']

function WorkingIndicator({ trace, elapsed }: { trace: TraceEntry[]; elapsed: number }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 120)
    return () => clearInterval(t)
  }, [])
  // tool ล่าสุดที่ยังไม่มีผล = กำลังทำอยู่ · ไม่งั้นโมเดลกำลังคิด
  const pending = [...trace].reverse().find((t) => t.kind === 'tool' && t.ok === undefined)
  const toolVerb = pending?.kind === 'tool' ? TOOL_VERBS[pending.name] : undefined
  const verb = toolVerb ?? THINKING_VERBS[Math.floor((tick * 120) / 2500) % THINKING_VERBS.length]
  const toolCount = trace.filter((t) => t.kind === 'tool').length
  return (
    <p className="flex items-center gap-2 pl-0.5 text-sm" aria-live="polite">
      <span className="w-4 text-center text-brand motion-reduce:hidden" aria-hidden>{SPINNER[tick % SPINNER.length]}</span>
      <span className="text-shimmer font-medium">{verb}…</span>
      <span className="text-xs text-gray-400 tabular-nums">
        ({elapsed} วิ{toolCount ? ` · ${toolCount} ขั้น` : ''})
      </span>
    </p>
  )
}
