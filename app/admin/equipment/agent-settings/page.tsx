'use client'

import FormListbox from '@/components/ui/FormListbox'
import { Radio, RadioGroup } from '@headlessui/react'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeftIcon, ArrowUturnLeftIcon, CheckCircleIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { Skeleton } from '@/components/ui/Skeleton'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import {
  AGENT_EFFORTS, AGENT_MODELS, AGENT_TOOL_NAMES, DEFAULT_AGENT_EFFORT, type AgentEffort, DEFAULT_AGENT_RULES, DEFAULT_SYSTEM_PROMPT, MODEL_ID_PATTERN,
  getAgentSettings, saveAgentSettings, type AgentSettings,
} from '@/lib/equipment/agent-settings'

const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand'
const MAX_PROMPT = 30000
const MAX_RULES = 8000

/**
 * ตั้งค่าผู้ช่วย AI จัดอุปกรณ์ — รุ่นเริ่มต้น, กฎการต่อสายของทีม, system prompt ของ LangGraph agent
 * บันทึกที่ settings/equipmentAgent · ส่งไปกับทุกคำสั่ง (server ไม่เก็บ prompt เอง)
 */
export default function AgentSettingsPage() {
  const [settings, setSettings] = useState<AgentSettings | null>(null)
  const [prompt, setPrompt] = useState('')
  const [rules, setRules] = useState('')
  const [model, setModel] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [effort, setEffort] = useState<AgentEffort>(DEFAULT_AGENT_EFFORT)
  const [phaseModels, setPhaseModels] = useState({ items: '', wiring: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [confirmReset, setConfirmReset] = useState<'prompt' | 'rules' | null>(null)

  useEffect(() => {
    let alive = true
    getAgentSettings()
      .then((s) => {
        if (!alive) return
        setSettings(s)
        setPrompt(s.systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT)
        setRules(s.rules)
        const known = AGENT_MODELS.some((m) => m.id === s.defaultModel)
        setModel(known ? s.defaultModel : 'custom')
        setCustomModel(known ? '' : s.defaultModel)
        setEffort(s.defaultEffort)
        setPhaseModels(s.phaseModels)
      })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'โหลดตั้งค่าไม่สำเร็จ') })
    return () => { alive = false }
  }, [])

  const chosenModel = model === 'custom' ? customModel.trim() : model
  const promptIsDefault = prompt.trim() === DEFAULT_SYSTEM_PROMPT.trim()
  const dirty = !!settings && (
    prompt.trim() !== (settings.systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT).trim()
    || rules !== settings.rules
    || chosenModel !== settings.defaultModel
    || effort !== settings.defaultEffort
    || phaseModels.items !== settings.phaseModels.items || phaseModels.wiring !== settings.phaseModels.wiring
  )
  // ชื่อ tool ที่หายไปจาก prompt ที่แก้ — ไม่ใช่ error (โมเดลยังเห็นคำอธิบาย tool) แต่มักแปลว่าลบขั้นตอนสำคัญทิ้ง
  const missingTools = promptIsDefault ? [] : ['search_inventory', 'add_items', 'connect', 'validate', 'finish'].filter((t) => !prompt.includes(t))

  const save = async () => {
    if (!settings) return
    if (!MODEL_ID_PATTERN.test(chosenModel)) { setError('model ID ต้องขึ้นต้นด้วย claude- และมีแต่ a-z 0-9 . -'); return }
    if (!prompt.trim()) { setError('system prompt ว่างไม่ได้ — กดคืนค่าเริ่มต้นแทน'); return }
    if (prompt.length > MAX_PROMPT) { setError(`system prompt ยาวเกิน ${MAX_PROMPT.toLocaleString()} ตัวอักษร`); return }
    if (rules.length > MAX_RULES) { setError(`กฎของทีมยาวเกิน ${MAX_RULES.toLocaleString()} ตัวอักษร`); return }
    setSaving(true)
    setError('')
    try {
      const next: AgentSettings = { systemPrompt: promptIsDefault ? '' : prompt, rules, defaultModel: chosenModel, defaultEffort: effort, phaseModels }
      await saveAgentSettings(next)
      setSettings(next)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  if (!settings) {
    return (
      <div className="space-y-4">
        {error ? <p className="text-sm text-red-600">{error}</p> : Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <Link href="/admin/equipment/plans" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeftIcon className="w-4 h-4" /> แผนจัดอุปกรณ์
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><SparklesIcon className="w-6 h-6 text-brand" /> ตั้งค่าผู้ช่วย AI</h1>
            <p className="text-gray-500 mt-1">รุ่นที่ใช้, กฎการต่อสายของทีม และ system prompt ของผู้ช่วยจัดอุปกรณ์ + ร่างผังระบบ</p>
          </div>
          <div className="flex items-center gap-3">
            {saved && <span className="flex items-center gap-1 text-sm text-green-600"><CheckCircleIcon className="w-4 h-4" /> บันทึกแล้ว</span>}
            <button onClick={save} disabled={saving || !dirty} className="px-5 py-2.5 bg-brand text-white text-sm font-medium rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50">
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {/* รุ่น */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <div>
          <h2 className="font-semibold text-gray-900">รุ่นเริ่มต้น</h2>
          <p className="text-xs text-gray-500 mt-0.5">ใช้ทุกครั้งที่เปิดผู้ช่วย — เปลี่ยนเฉพาะครั้งได้จาก dropdown ในหน้าต่างผู้ช่วย</p>
        </div>
        <RadioGroup value={model} onChange={setModel} aria-label="รุ่นเริ่มต้น" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[...AGENT_MODELS.map((m) => ({ id: m.id, label: m.label, hint: m.hint })), { id: 'custom', label: 'รุ่นอื่น (ใส่ model ID เอง)', hint: 'สำหรับรุ่นใหม่ที่ยังไม่อยู่ในรายการ' }].map((m) => (
            <RadioCard key={m.id} value={m.id} label={m.label} hint={m.hint} mono={m.id !== 'custom' ? m.id : undefined} />
          ))}
        </RadioGroup>
        {model === 'custom' && (
          <input className={`${inputCls} font-mono`} value={customModel} onChange={(e) => setCustomModel(e.target.value)} placeholder="เช่น claude-sonnet-5" />
        )}
      </section>

      {/* รุ่นต่อขั้น */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <div>
          <h2 className="font-semibold text-gray-900">รุ่นแยกตามขั้น (โหมดแบ่ง 2 ขั้น)</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            ใช้รุ่นเร็วจัดของ + วางผัง 3D แล้วใช้รุ่นแม่นโยงผัง — “ตามที่เลือก” = ใช้รุ่นใน dropdown ของหน้าต่างผู้ช่วย · คำสั่งแก้ร่างต่อใช้รุ่นใน dropdown เสมอ
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([['items', 'ขั้น 1 — จัดของ + วางผัง 3D'], ['wiring', 'ขั้น 2 — โยงผัง']] as const).map(([key, label]) => (
            <div key={key}>
              <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
              <FormListbox
                value={phaseModels[key]}
                onChange={(v) => setPhaseModels((p) => ({ ...p, [key]: v }))}
                options={[
                  { value: '', label: 'ตามที่เลือกในหน้าต่างผู้ช่วย' },
                  ...AGENT_MODELS.map((m) => ({ value: m.id, label: m.label })),
                  // model ID ที่ไม่อยู่ในรายการ (ตั้งไว้ก่อน) — ยังโชว์ค่าเดิม
                  ...(phaseModels[key] && !AGENT_MODELS.some((m) => m.id === phaseModels[key]) ? [{ value: phaseModels[key], label: phaseModels[key] }] : []),
                ]}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ระดับความคิด */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <div>
          <h2 className="font-semibold text-gray-900">ระดับความคิดเริ่มต้น</h2>
          <p className="text-xs text-gray-500 mt-0.5">ยิ่งคิดละเอียดยิ่งช้า — ส่วนใหญ่ “สมดุล” พอ ใช้ “ละเอียด” เมื่อผลออกมาพลาด · Haiku 4.5 ไม่มีตัวเลือกนี้</p>
        </div>
        <RadioGroup value={effort} onChange={setEffort} aria-label="ระดับความคิดเริ่มต้น" className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {AGENT_EFFORTS.map((e) => <RadioCard key={e.id} value={e.id} label={e.label} hint={e.hint} />)}
        </RadioGroup>
      </section>

      {/* กฎของทีม */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-gray-900">กฎการต่อสายของทีม</h2>
            <p className="text-xs text-gray-500 mt-0.5">ต่อท้าย system prompt ทุกครั้ง และสั่งให้มาก่อนแนวทางทั่วไป — เขียนเป็นข้อๆ ขึ้นต้นด้วย “-” อ้างชื่ออุปกรณ์ให้ตรงกับชื่อในสต็อก</p>
          </div>
          {rules !== DEFAULT_AGENT_RULES && (
            <button onClick={() => setConfirmReset('rules')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg">
              <ArrowUturnLeftIcon className="w-3.5 h-3.5" /> ใช้กฎตั้งต้น
            </button>
          )}
        </div>
        <textarea className={`${inputCls} font-mono text-[13px] leading-relaxed`} rows={8} value={rules} onChange={(e) => setRules(e.target.value)} placeholder="- กล้อง … ต้องต่อผ่าน … ก่อนเข้าสวิตเชอร์" />
        <p className="text-[11px] text-gray-400 text-right">{rules.length.toLocaleString()} / {MAX_RULES.toLocaleString()}</p>
      </section>

      {/* system prompt */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              System prompt
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${promptIsDefault ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-700'}`}>
                {promptIsDefault ? 'ค่าเริ่มต้น' : 'แก้ไขแล้ว'}
              </span>
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">ข้อมูลแผน, ร่างปัจจุบัน และคำสั่งของผู้ใช้ถูกต่อให้เองทุกครั้ง ไม่ต้องใส่ในนี้ · ถ้าไม่แก้ จะได้ค่าเริ่มต้นเวอร์ชันใหม่อัตโนมัติเมื่ออัปเดตระบบ</p>
          </div>
          {!promptIsDefault && (
            <button onClick={() => setConfirmReset('prompt')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg">
              <ArrowUturnLeftIcon className="w-3.5 h-3.5" /> คืนค่าเริ่มต้น
            </button>
          )}
        </div>
        <textarea className={`${inputCls} font-mono text-[13px] leading-relaxed`} rows={28} value={prompt} onChange={(e) => setPrompt(e.target.value)} spellCheck={false} />
        <div className="flex items-start justify-between gap-3 text-[11px]">
          {/* ชื่อ tool ติดกันไม่มีช่องว่าง = คำเดียวยาวทั้งแถว ตัดบรรทัดไม่ได้ → ต้องเป็น flex-wrap */}
          <div className="flex flex-wrap items-center gap-1 min-w-0 text-gray-400">
            <span className="mr-0.5">tool ที่ผู้ช่วยเรียกได้:</span>
            {AGENT_TOOL_NAMES.map((t) => <code key={t} className="px-1 py-0.5 rounded bg-gray-100 text-gray-600 break-all">{t}</code>)}
          </div>
          <p className="text-gray-400 shrink-0 tabular-nums">{prompt.length.toLocaleString()} / {MAX_PROMPT.toLocaleString()}</p>
        </div>
        {missingTools.length > 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
            prompt ที่แก้ไม่ได้พูดถึง {missingTools.join(', ')} — ผู้ช่วยอาจข้ามขั้นตอนนั้น (โดยเฉพาะ validate / finish ที่ใช้ตรวจและส่งร่าง)
          </p>
        )}
      </section>

      <ConfirmDialog
        isOpen={!!confirmReset}
        title={confirmReset === 'prompt' ? 'คืนค่า system prompt' : 'ใช้กฎตั้งต้น'}
        message={confirmReset === 'prompt' ? 'ข้อความที่แก้ไว้จะถูกแทนด้วยค่าเริ่มต้น (มีผลเมื่อกดบันทึก)' : 'กฎที่เขียนไว้จะถูกแทนด้วยกฎตั้งต้น (มีผลเมื่อกดบันทึก)'}
        confirmLabel="คืนค่า"
        onConfirm={() => {
          if (confirmReset === 'prompt') setPrompt(DEFAULT_SYSTEM_PROMPT)
          else setRules(DEFAULT_AGENT_RULES)
          setConfirmReset(null)
        }}
        onClose={() => setConfirmReset(null)}
      />
    </div>
  )
}

/** ตัวเลือกแบบการ์ด (HeadlessUI Radio) — วงกลมซ้าย + ชื่อ + คำอธิบาย */
function RadioCard({ value, label, hint, mono }: { value: string; label: string; hint: string; mono?: string }) {
  return (
    <Radio
      value={value}
      className="group flex items-start gap-3 rounded-xl border border-gray-200 p-3 cursor-pointer transition-colors hover:border-gray-300 data-checked:border-brand data-checked:bg-brand-soft focus:outline-none data-focus:ring-2 data-focus:ring-brand/30"
    >
      <span className="mt-0.5 flex w-4 h-4 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white group-data-checked:border-brand">
        <span className="w-2 h-2 rounded-full bg-brand opacity-0 group-data-checked:opacity-100" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        <span className="block text-xs text-gray-500">{hint}</span>
        {mono && <span className="block text-[11px] text-gray-400 font-mono mt-0.5">{mono}</span>}
      </span>
    </Radio>
  )
}
