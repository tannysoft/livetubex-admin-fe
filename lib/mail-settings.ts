import { doc, getDoc, setDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from './firebase'

/**
 * ── ตั้งค่าอีเมล (whitelabel) ─────────────────────────────────────────────────
 * เก็บที่ `settings/mail` — admin-only (ครอบด้วยกฎ settings/{docId} ที่มีอยู่แล้ว)
 *
 * ⚠️ ห้ามเก็บ API key / รหัสผ่าน ที่นี่ — อยู่ใน Secret Manager เท่านั้น
 *    (RESEND_API_KEY, SMTP_PASSWORD) ที่เก็บได้คือค่าที่หลุดแล้วไม่เสียหาย
 *
 * ต้องให้ตรงกับ functions/src/mail.ts เสมอ — สองฝั่งอ่าน doc เดียวกัน
 */

export type EmailKey =
  | 'paymentRequestAdmin'
  | 'paymentRequestFreelancer'
  | 'payoutSuccess'
  | 'earningsReport'

export interface EmailTemplate {
  enabled: boolean
  subject: string
  heading: string
  intro: string
  footer: string
}

export interface SmtpSettings {
  host: string
  port: number
  secure: boolean
  user: string
}

export interface MailSettings {
  provider: 'resend' | 'smtp'
  fromName: string
  fromEmail: string
  replyTo: string
  adminRecipients: string[]
  smtp: SmtpSettings
  templates: Record<EmailKey, EmailTemplate>
  updatedAt?: string
}

/** ชื่อ + คำอธิบายของอีเมลแต่ละประเภท (เรียงตามที่อยากให้โชว์ในหน้า admin) */
export const EMAIL_TYPES: { key: EmailKey; label: string; desc: string; vars: string[] }[] = [
  {
    key: 'paymentRequestAdmin',
    label: 'แจ้ง Admin — มีคำขอเบิกจ่าย',
    desc: 'ส่งถึงอีเมล admin ทุกครั้งที่ freelancer ส่งคำขอเบิกเงิน',
    vars: ['appName', 'date', 'freelancerName', 'jobTitle', 'workDates', 'amount', 'tax', 'net', 'bankName', 'bankAccount', 'notes'],
  },
  {
    key: 'paymentRequestFreelancer',
    label: 'ยืนยันกับ Freelancer — ส่งคำขอแล้ว',
    desc: 'ส่งถึง freelancer ที่กรอกอีเมลไว้ ทันทีที่ส่งคำขอสำเร็จ',
    vars: ['appName', 'date', 'freelancerName', 'jobTitle', 'workDates', 'amount', 'tax', 'net'],
  },
  {
    key: 'payoutSuccess',
    label: 'แจ้ง Freelancer — โอนเงินสำเร็จ',
    desc: 'ส่งตอน admin ยืนยันการโอน (ควบคู่กับ LINE push)',
    vars: ['appName', 'date', 'freelancerName', 'totalNet', 'bankName', 'bankAccount', 'jobCount'],
  },
  {
    key: 'earningsReport',
    label: 'สรุปรายได้รายเดือน',
    desc: 'ส่งจากหน้ารายงานการจ่ายเงิน',
    vars: ['appName', 'date', 'freelancerName', 'period', 'totalGross', 'totalTax', 'totalNet', 'jobCount'],
  },
]

export const DEFAULT_TEMPLATES: Record<EmailKey, EmailTemplate> = {
  paymentRequestAdmin: {
    enabled: true,
    subject: '[{{appName}}] คำขอเบิกจ่าย — {{freelancerName}} — {{amount}}',
    heading: 'มีคำขอเบิกจ่ายเงินใหม่',
    intro: '<strong>{{freelancerName}}</strong> ส่งคำขอเบิกจ่ายเงินเข้ามาแล้ว กรุณาตรวจสอบและอนุมัติ',
    footer: 'ส่งเมื่อ {{date}}',
  },
  paymentRequestFreelancer: {
    enabled: true,
    subject: '[{{appName}}] ส่งคำขอเบิกจ่ายสำเร็จ — {{amount}}',
    heading: 'ส่งคำขอเบิกจ่ายสำเร็จ',
    intro: 'สวัสดีคุณ <strong>{{freelancerName}}</strong><br>ระบบได้รับคำขอเบิกจ่ายของคุณแล้ว กรุณารอการอนุมัติจาก Admin',
    footer: 'ส่งเมื่อ {{date}}',
  },
  payoutSuccess: {
    enabled: true,
    subject: '[{{appName}}] โอนเงินสำเร็จ {{totalNet}} — {{freelancerName}}',
    heading: 'โอนเงินสำเร็จ',
    intro: 'สวัสดีคุณ <strong>{{freelancerName}}</strong><br>เราได้โอนเงินให้คุณเรียบร้อยแล้ว',
    footer: 'โอนเมื่อ {{date}} · {{appName}}',
  },
  earningsReport: {
    enabled: true,
    subject: '[{{appName}}] สรุปรายได้ประจำ{{period}} — {{freelancerName}}',
    heading: 'สรุปรายได้',
    intro: 'สวัสดีคุณ <strong>{{freelancerName}}</strong><br>นี่คือสรุปรายได้ประจำ{{period}}ของคุณ',
    footer: 'ออกโดย {{appName}} · {{date}}',
  },
}

export const DEFAULT_MAIL_SETTINGS: MailSettings = {
  provider: 'resend',
  fromName: '',
  fromEmail: '',
  replyTo: '',
  adminRecipients: [],
  smtp: { host: '', port: 587, secure: false, user: '' },
  templates: DEFAULT_TEMPLATES,
}

export function isValidEmail(v: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim())
}

/** แทนที่ {{var}} — ต้องเหมือน renderVars() ใน functions/src/mail.ts เป๊ะ */
export function renderVars(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k: string) => vars[k] ?? '')
}

/** ตัวแปรที่พิมพ์ผิด/ไม่มีในประเภทนั้น — คืนรายชื่อไว้เตือน (ตอนส่งจริงจะถูกลบทิ้ง) */
export function unknownVars(text: string, allowed: string[]): string[] {
  const used = [...text.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1])
  return [...new Set(used.filter((v) => !allowed.includes(v)))]
}

function normalize(raw: Partial<MailSettings> | null | undefined): MailSettings {
  const d: Partial<MailSettings> = raw ?? {}
  const smtp: Partial<SmtpSettings> = d.smtp ?? {}
  const templates = {} as Record<EmailKey, EmailTemplate>
  for (const { key } of EMAIL_TYPES) {
    const def = DEFAULT_TEMPLATES[key]
    const t: Partial<EmailTemplate> = d.templates?.[key] ?? {}
    templates[key] = {
      enabled: typeof t.enabled === 'boolean' ? t.enabled : def.enabled,
      subject: (t.subject ?? '').trim() || def.subject,
      heading: (t.heading ?? '').trim() || def.heading,
      intro: (t.intro ?? '').trim() || def.intro,
      footer: (t.footer ?? '').trim() || def.footer,
    }
  }
  return {
    provider: d.provider === 'smtp' ? 'smtp' : 'resend',
    fromName: (d.fromName ?? '').trim(),
    fromEmail: (d.fromEmail ?? '').trim(),
    replyTo: (d.replyTo ?? '').trim(),
    adminRecipients: (d.adminRecipients ?? []).map((s) => s.trim()).filter(Boolean),
    smtp: {
      host: (smtp.host ?? '').trim(),
      port: Number(smtp.port) > 0 ? Number(smtp.port) : 587,
      secure: smtp.secure === true,
      user: (smtp.user ?? '').trim(),
    },
    templates,
  }
}

export async function getMailSettings(): Promise<MailSettings> {
  const snap = await getDoc(doc(db, 'settings', 'mail'))
  return normalize(snap.exists() ? (snap.data() as Partial<MailSettings>) : null)
}

export async function saveMailSettings(data: MailSettings): Promise<void> {
  await setDoc(
    doc(db, 'settings', 'mail'),
    { ...normalize(data), updatedAt: new Date().toISOString() },
    { merge: true },
  )
}

/** ส่งเมลทดสอบด้วย config ที่บันทึกไว้ — ต้องกดบันทึกก่อนถึงจะเห็นผลของที่เพิ่งแก้ */
export async function sendTestEmail(to: string, templateKey: EmailKey): Promise<{ provider: string }> {
  const fn = httpsCallable<{ to: string; templateKey: EmailKey }, { success: boolean; id?: string; provider: string }>(
    functions,
    'sendTestEmail',
  )
  const res = await fn({ to, templateKey })
  return { provider: res.data.provider }
}
