'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  Field,
  Input,
  Label,
  Radio,
  RadioGroup,
  Textarea,
} from '@headlessui/react'
import {
  CheckCircleIcon,
  ChevronDownIcon,
  EnvelopeIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  LockClosedIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline'
import {
  DEFAULT_MAIL_SETTINGS,
  DEFAULT_TEMPLATES,
  EMAIL_TYPES,
  getMailSettings,
  isValidEmail,
  saveMailSettings,
  sendTestEmail,
  unknownVars,
  type EmailKey,
  type MailSettings,
} from '@/lib/mail-settings'
import { previewEmail } from '@/lib/email-preview'
import { useBrand } from '@/components/BrandProvider'
import FormCheckbox from '@/components/ui/FormCheckbox'
import FormListbox from '@/components/ui/FormListbox'
import Modal from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'

const inputCls =
  'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm shadow-sm transition-all focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30'

const PROVIDERS = [
  { value: 'resend' as const, title: 'Resend', desc: 'บริการส่งเมล ต้อง verify domain — ตั้ง RESEND_API_KEY' },
  { value: 'smtp' as const, title: 'SMTP', desc: 'ใช้ mail server เดิม เช่น Google Workspace — ตั้ง SMTP_PASSWORD' },
]

const TEMPLATE_FIELDS = [
  { f: 'subject' as const, label: 'หัวข้อเมล (subject)', multiline: false },
  { f: 'heading' as const, label: 'บรรทัดรองในแถบสีแบรนด์', multiline: false },
  { f: 'intro' as const, label: 'ย่อหน้านำ (ใส่ <strong> <br> ได้)', multiline: true },
  { f: 'footer' as const, label: 'ข้อความท้ายเมล', multiline: false },
]

export default function MailSettingsPage() {
  const brand = useBrand()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [data, setData] = useState<MailSettings>(DEFAULT_MAIL_SETTINGS)
  const [testTo, setTestTo] = useState('')
  const [testKey, setTestKey] = useState<EmailKey>('paymentRequestAdmin')
  const [previewKey, setPreviewKey] = useState<EmailKey | null>(null)
  const [appUrl, setAppUrl] = useState('')
  const [toast, setToast] = useState<{ type: 'ok' | 'fail'; message: string } | null>(null)

  useEffect(() => {
    getMailSettings()
      .then((s) => {
        setData(s)
        setAppUrl(window.location.origin)
      })
      .catch((e) => {
        console.error(e)
        setToast({ type: 'fail', message: 'โหลดค่าไม่สำเร็จ' })
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

  const patchTpl = (key: EmailKey, field: 'enabled' | 'subject' | 'heading' | 'intro' | 'footer', value: string | boolean) =>
    setData((prev) => ({
      ...prev,
      templates: { ...prev.templates, [key]: { ...prev.templates[key], [field]: value } },
    }))

  const preview = useMemo(() => {
    if (!previewKey) return null
    return previewEmail(previewKey, data.templates[previewKey], brand, appUrl)
  }, [previewKey, data.templates, brand, appUrl])

  const handleSave = async () => {
    if (data.fromEmail && !isValidEmail(data.fromEmail)) {
      setToast({ type: 'fail', message: 'อีเมลผู้ส่งไม่ถูกต้อง' })
      return
    }
    const badRecipient = data.adminRecipients.find((r) => !isValidEmail(r))
    if (badRecipient) {
      setToast({ type: 'fail', message: `อีเมลผู้รับไม่ถูกต้อง: ${badRecipient}` })
      return
    }
    if (data.provider === 'smtp' && (!data.smtp.host || !data.smtp.user)) {
      setToast({ type: 'fail', message: 'เลือก SMTP แล้วต้องกรอก host และ user' })
      return
    }
    setSaving(true)
    try {
      await saveMailSettings(data)
      setToast({ type: 'ok', message: 'บันทึกแล้ว — มีผลกับอีเมลฉบับถัดไป' })
    } catch (e) {
      console.error(e)
      setToast({ type: 'fail', message: 'บันทึกไม่สำเร็จ' })
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!isValidEmail(testTo)) {
      setToast({ type: 'fail', message: 'กรอกอีเมลผู้รับสำหรับทดสอบก่อน' })
      return
    }
    setTesting(true)
    try {
      const { provider } = await sendTestEmail(testTo.trim(), testKey)
      setToast({ type: 'ok', message: `ส่งเมลทดสอบผ่าน ${provider} แล้ว — ลองเช็กกล่องจดหมาย` })
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? 'ส่งไม่สำเร็จ'
      setToast({ type: 'fail', message: `ส่งไม่สำเร็จ: ${msg}` })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const fromPreview = `${data.fromName || `${brand.appName} Notify`} <${data.fromEmail || '(ยังไม่ได้ตั้งอีเมลผู้ส่ง)'}>`

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <EnvelopeIcon className="w-6 h-6 text-brand" />
          ตั้งค่าอีเมล
        </h1>
        <p className="text-gray-500 mt-1 text-sm">
          ช่องทางส่ง ผู้ส่ง และข้อความในอีเมลแต่ละประเภท — แก้แล้วมีผลกับอีเมลฉบับถัดไป
        </p>
      </div>

      {/* ── ช่องทางส่ง ──────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">ช่องทางส่ง</h2>

        <RadioGroup
          value={data.provider}
          onChange={(v) => setData({ ...data, provider: v })}
          className="grid sm:grid-cols-2 gap-3"
        >
          {PROVIDERS.map((o) => (
            <Radio
              key={o.value}
              value={o.value}
              className="cursor-pointer rounded-xl border-2 border-gray-200 p-4 transition-colors hover:border-gray-300 data-checked:border-brand data-checked:bg-brand-soft data-focus:outline-none data-focus:ring-2 data-focus:ring-brand/30"
            >
              {({ checked }) => (
                <>
                  <p className={`font-semibold ${checked ? 'text-brand' : 'text-gray-900'}`}>{o.title}</p>
                  <p className="text-xs text-gray-500 mt-1">{o.desc}</p>
                </>
              )}
            </Radio>
          ))}
        </RadioGroup>

        {data.provider === 'smtp' && (
          <div className="grid sm:grid-cols-2 gap-4 pt-2">
            <Field>
              <Label className="block text-sm font-medium text-gray-700 mb-1">SMTP host</Label>
              <Input
                value={data.smtp.host}
                onChange={(e) => setData({ ...data, smtp: { ...data.smtp, host: e.target.value } })}
                placeholder="smtp.gmail.com"
                className={inputCls}
              />
            </Field>
            <Field>
              <Label className="block text-sm font-medium text-gray-700 mb-1">Port</Label>
              <Input
                type="number"
                value={data.smtp.port}
                onChange={(e) => setData({ ...data, smtp: { ...data.smtp, port: Number(e.target.value) } })}
                className={inputCls}
              />
              <FormCheckbox
                size="sm"
                className="mt-2"
                checked={data.smtp.secure}
                onChange={(v) => setData({ ...data, smtp: { ...data.smtp, secure: v } })}
                label="SSL/TLS ตรง (port 465)"
                description="ไม่ติ๊ก = STARTTLS (587)"
              />
            </Field>
            <Field className="sm:col-span-2">
              <Label className="block text-sm font-medium text-gray-700 mb-1">Username</Label>
              <Input
                value={data.smtp.user}
                onChange={(e) => setData({ ...data, smtp: { ...data.smtp, user: e.target.value } })}
                placeholder="notify@example.com"
                className={inputCls}
              />
            </Field>
          </div>
        )}

        <div className="flex items-start gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600">
          <LockClosedIcon className="w-5 h-5 shrink-0 text-gray-400" />
          <div>
            รหัสผ่าน/API key ตั้งจากหน้านี้ไม่ได้โดยตั้งใจ — เป็นความลับ เก็บใน Secret Manager:
            <code className="block mt-1.5 px-2 py-1 bg-gray-900 text-gray-100 rounded-lg text-xs">
              firebase functions:secrets:set {data.provider === 'smtp' ? 'SMTP_PASSWORD' : 'RESEND_API_KEY'}
            </code>
            <span className="text-xs text-gray-400">ตั้งเสร็จต้อง deploy functions ใหม่หนึ่งครั้ง</span>
          </div>
        </div>
      </section>

      {/* ── ผู้ส่ง / ผู้รับ ─────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">ผู้ส่งและผู้รับ</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field>
            <Label className="block text-sm font-medium text-gray-700 mb-1">ชื่อผู้ส่ง</Label>
            <Input
              value={data.fromName}
              onChange={(e) => setData({ ...data, fromName: e.target.value })}
              placeholder={`(ว่าง = ${brand.appName} Notify)`}
              className={inputCls}
            />
          </Field>
          <Field>
            <Label className="block text-sm font-medium text-gray-700 mb-1">อีเมลผู้ส่ง</Label>
            <Input
              value={data.fromEmail}
              onChange={(e) => setData({ ...data, fromEmail: e.target.value })}
              placeholder="notify@example.com"
              invalid={!!data.fromEmail && !isValidEmail(data.fromEmail)}
              className={`${inputCls} data-invalid:border-red-400 data-invalid:focus:ring-red-200`}
            />
            <p className="text-xs text-gray-500 mt-1">โดเมนนี้ต้อง verify กับผู้ให้บริการแล้ว ไม่งั้นเมลจะตกหล่น</p>
          </Field>
          <Field>
            <Label className="block text-sm font-medium text-gray-700 mb-1">Reply-to (ถ้ามี)</Label>
            <Input
              value={data.replyTo}
              onChange={(e) => setData({ ...data, replyTo: e.target.value })}
              placeholder="support@example.com"
              className={inputCls}
            />
          </Field>
          <Field>
            <Label className="block text-sm font-medium text-gray-700 mb-1">อีเมล admin ที่รับแจ้งเตือน</Label>
            <Textarea
              value={data.adminRecipients.join('\n')}
              onChange={(e) => setData({ ...data, adminRecipients: e.target.value.split('\n').map((s) => s.trim()) })}
              rows={3}
              placeholder={'admin@example.com\naccount@example.com'}
              className={`${inputCls} font-mono text-xs`}
            />
            <p className="text-xs text-gray-500 mt-1">บรรทัดละ 1 อีเมล</p>
          </Field>
        </div>
        <p className="text-xs text-gray-500">
          ผู้รับจะเห็นผู้ส่งเป็น <span className="font-mono text-gray-700">{fromPreview}</span>
        </p>
      </section>

      {/* ── ข้อความในอีเมล ─────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-3">
        <div>
          <h2 className="font-semibold text-gray-900">ข้อความในอีเมล</h2>
          <p className="text-sm text-gray-500 mt-1">
            เลย์เอาต์ สีแบรนด์ และตารางข้อมูลถูกกำหนดโดยระบบ — แก้ได้เฉพาะข้อความ
            เพื่อไม่ให้เมลพังหรือเข้า spam
          </p>
        </div>

        {EMAIL_TYPES.map(({ key, label, desc, vars }) => {
          const tpl = data.templates[key]
          const bad = [...new Set([tpl.subject, tpl.heading, tpl.intro, tpl.footer].flatMap((t) => unknownVars(t, vars)))]

          return (
            <Disclosure key={key}>
              {({ open }) => (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 p-4 bg-gray-50">
                    <FormCheckbox
                      size="sm"
                      checked={tpl.enabled}
                      onChange={(v) => patchTpl(key, 'enabled', v)}
                    />
                    <DisclosureButton className="flex-1 text-left min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 rounded-lg">
                      <p className={`text-sm font-medium ${tpl.enabled ? 'text-gray-900' : 'text-gray-400'}`}>
                        {label} {!tpl.enabled && <span className="text-xs">(ปิดอยู่)</span>}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{desc}</p>
                    </DisclosureButton>

                    {bad.length > 0 && (
                      <ExclamationTriangleIcon
                        className="w-4 h-4 text-red-500 shrink-0"
                        title={`ตัวแปรไม่รู้จัก: ${bad.join(', ')}`}
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => setPreviewKey(key)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-brand hover:bg-brand-soft rounded-lg transition-colors shrink-0"
                    >
                      <EyeIcon className="w-4 h-4" />
                      ดูตัวอย่าง
                    </button>

                    <DisclosureButton className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0">
                      <ChevronDownIcon className={`w-5 h-5 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </DisclosureButton>
                  </div>

                  <DisclosurePanel className="p-4 space-y-3 border-t border-gray-100">
                    {TEMPLATE_FIELDS.map(({ f, label: l, multiline }) => (
                      <Field key={f}>
                        <Label className="block text-xs font-medium text-gray-600 mb-1">{l}</Label>
                        {multiline ? (
                          <Textarea
                            value={tpl[f]}
                            onChange={(e) => patchTpl(key, f, e.target.value)}
                            rows={2}
                            className={inputCls}
                          />
                        ) : (
                          <Input value={tpl[f]} onChange={(e) => patchTpl(key, f, e.target.value)} className={inputCls} />
                        )}
                      </Field>
                    ))}

                    <div>
                      <p className="text-xs text-gray-500 mb-1.5">ตัวแปรที่ใช้ได้ (กดเพื่อคัดลอก):</p>
                      <div className="flex flex-wrap gap-1.5">
                        {vars.map((varName) => (
                          <button
                            key={varName}
                            type="button"
                            onClick={() => navigator.clipboard.writeText(`{{${varName}}}`)}
                            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-mono text-gray-700 transition-colors"
                          >
                            {`{{${varName}}}`}
                          </button>
                        ))}
                      </div>
                      {bad.length > 0 && (
                        <p className="text-xs text-red-500 mt-2">
                          ตัวแปรที่ไม่มีในเมลประเภทนี้: {bad.map((b) => `{{${b}}}`).join(', ')} — ตอนส่งจริงจะกลายเป็นค่าว่าง
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setData((prev) => ({
                          ...prev,
                          templates: { ...prev.templates, [key]: { ...DEFAULT_TEMPLATES[key], enabled: tpl.enabled } },
                        }))
                      }
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      คืนค่าเริ่มต้นของเมลนี้
                    </button>
                  </DisclosurePanel>
                </div>
              )}
            </Disclosure>
          )
        })}
      </section>

      {/* ── ทดสอบ ──────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-3">
        <h2 className="font-semibold text-gray-900">ส่งเมลทดสอบ</h2>
        <p className="text-sm text-gray-500">
          ส่งด้วยค่าที่<span className="font-medium text-gray-700">บันทึกไว้แล้ว</span> — แก้อะไรอยู่ให้กดบันทึกก่อน
          (ต่างจาก &quot;ดูตัวอย่าง&quot; ที่ใช้ค่าบนจอทันที) ข้อมูลในเมลเป็นค่าตัวอย่าง ไม่ใช่รายการจริง
        </p>
        <div className="flex flex-wrap items-start gap-2">
          <Input
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="อีเมลผู้รับ"
            className={`${inputCls} flex-1 min-w-[200px]`}
          />
          <div className="w-full sm:w-64">
            <FormListbox
              value={testKey}
              onChange={(v) => setTestKey(v as EmailKey)}
              options={EMAIL_TYPES.map((t) => ({ value: t.key, label: t.label }))}
            />
          </div>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-sm font-medium rounded-xl hover:bg-gray-50 disabled:opacity-60 transition-colors"
          >
            <PaperAirplaneIcon className="w-4 h-4" />
            {testing ? 'กำลังส่ง…' : 'ส่งทดสอบ'}
          </button>
        </div>
      </section>

      {/* ── save ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand text-white text-sm font-medium rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50"
        >
          {saving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          บันทึก
        </button>
        {toast && (
          <span className={`flex items-center gap-1.5 text-sm ${toast.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
            {toast.type === 'ok' ? (
              <CheckCircleIcon className="w-4 h-4 shrink-0" />
            ) : (
              <ExclamationCircleIcon className="w-4 h-4 shrink-0" />
            )}
            {toast.message}
          </span>
        )}
      </div>

      {/* ── Preview modal ──────────────────────────────────────── */}
      <Modal
        isOpen={previewKey !== null}
        onClose={() => setPreviewKey(null)}
        title={EMAIL_TYPES.find((t) => t.key === previewKey)?.label ?? 'ตัวอย่างอีเมล'}
        size="2xl"
      >
        {preview && (
          <div className="space-y-3">
            <dl className="text-sm rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              <div className="flex gap-3 px-3 py-2">
                <dt className="w-16 shrink-0 text-gray-500">จาก</dt>
                <dd className="min-w-0 flex-1 text-gray-900 font-mono text-xs break-all">{fromPreview}</dd>
              </div>
              <div className="flex gap-3 px-3 py-2">
                <dt className="w-16 shrink-0 text-gray-500">หัวข้อ</dt>
                <dd className="min-w-0 flex-1 text-gray-900 font-medium">{preview.subject}</dd>
              </div>
            </dl>

            {/* iframe: กัน CSS ของอีเมลรั่วมาชนกับหน้าแอดมิน และเห็นผลใกล้เคียงของจริง */}
            <iframe
              title="ตัวอย่างอีเมล"
              srcDoc={preview.html}
              sandbox=""
              className="w-full h-[52vh] rounded-xl border border-gray-200 bg-gray-50"
            />

            <p className="text-xs text-gray-500">
              ตัวเลข ชื่อ และตารางเป็น<span className="font-medium">ค่าตัวอย่าง</span> —
              ตัวอย่างนี้ใช้ค่าที่กำลังแก้บนจอ ยังไม่ได้บันทึก
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
