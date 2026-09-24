import * as admin from 'firebase-admin'
import { Resend } from 'resend'
import * as nodemailer from 'nodemailer'

/**
 * ── ระบบส่งอีเมล (whitelabel) ─────────────────────────────────────────────────
 *
 * ตั้งค่าได้จาก /admin/settings/mail → Firestore `settings/mail` (admin-only)
 *   - เลือก provider: Resend หรือ SMTP
 *   - ผู้ส่ง / reply-to / ผู้รับฝั่ง admin
 *   - ข้อความในแต่ละอีเมล (subject / หัวข้อ / ย่อหน้านำ / ท้ายเมล)
 *
 * ⚠️ รหัสผ่าน/API key **ไม่อยู่ใน Firestore** — อยู่ใน Secret Manager เท่านั้น
 *    (RESEND_API_KEY, SMTP_PASSWORD) ค่าที่เก็บใน Firestore เป็นค่าที่หลุดแล้ว
 *    ไม่เสียหาย (host, port, ชื่อผู้ส่ง, ข้อความ)
 *
 * โครง HTML (การ์ด + แถบสีแบรนด์ + ตารางข้อมูล) ถูกกำหนดในโค้ด ลูกค้าแก้ไม่ได้
 * ตั้งใจแบบนี้เพื่อไม่ให้เมลตกหล่นเพราะ HTML พัง และเวลาเราปรับ layout กลาง
 * ลูกค้าทุกเจ้าจะได้ตามไปด้วย
 */

export type EmailKey =
  | 'paymentRequestAdmin'
  | 'paymentRequestFreelancer'
  | 'payoutSuccess'
  | 'earningsReport'

export interface EmailTemplate {
  /** ปิดได้ต่อประเภท — ปิดแล้วระบบข้ามการส่งเมลนั้นไปเงียบๆ */
  enabled: boolean
  subject: string
  /** บรรทัดรองใต้ชื่อระบบในแถบสีแบรนด์ */
  heading: string
  /** ย่อหน้านำก่อนตารางข้อมูล (รองรับ <strong> <br>) */
  intro: string
  /** ข้อความเล็กสีเทาท้ายเมล */
  footer: string
}

export interface SmtpSettings {
  host: string
  port: number
  /** true = SMTPS (465), false = STARTTLS (587) */
  secure: boolean
  user: string
}

export interface MailSettings {
  provider: 'resend' | 'smtp'
  /** ชื่อผู้ส่งที่โชว์ในกล่องจดหมาย — ว่าง = ใช้ชื่อระบบจากแบรนด์ */
  fromName: string
  fromEmail: string
  replyTo: string
  /** อีเมล admin ที่รับแจ้งเตือนคำขอเบิกจ่าย */
  adminRecipients: string[]
  smtp: SmtpSettings
  templates: Record<EmailKey, EmailTemplate>
}

// ── ค่าตั้งต้น ────────────────────────────────────────────────────────────────
// ข้อความเดียวกับที่ hardcode ไว้เดิม — tenant ที่ไม่แก้อะไรจะได้เมลหน้าตาเหมือนเดิม

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

// ── โหลด config ───────────────────────────────────────────────────────────────

let cache: MailSettings | null = null

function mergeTemplates(raw: unknown): Record<EmailKey, EmailTemplate> {
  const stored = (raw ?? {}) as Partial<Record<EmailKey, Partial<EmailTemplate>>>
  const out = {} as Record<EmailKey, EmailTemplate>
  for (const key of Object.keys(DEFAULT_TEMPLATES) as EmailKey[]) {
    const d = DEFAULT_TEMPLATES[key]
    const s = stored[key] ?? {}
    out[key] = {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : d.enabled,
      // ช่องที่ลูกค้าลบจนว่าง → ใช้ค่า default ไม่ใช่ปล่อยเมลหัวข้อว่าง
      subject: (s.subject ?? '').trim() || d.subject,
      heading: (s.heading ?? '').trim() || d.heading,
      intro: (s.intro ?? '').trim() || d.intro,
      footer: (s.footer ?? '').trim() || d.footer,
    }
  }
  return out
}

/** cache ต่อ instance — config แทบไม่เปลี่ยน, instance รีไซเคิลเองอยู่แล้ว */
export async function getMailSettings(): Promise<MailSettings> {
  if (cache) return cache
  let d: Record<string, unknown> = {}
  try {
    d = ((await admin.firestore().doc('settings/mail').get()).data() ?? {}) as Record<string, unknown>
  } catch (e) {
    console.error('[getMailSettings] อ่าน mail config ไม่ได้ ใช้ค่า default:', e)
  }
  const smtp = (d.smtp ?? {}) as Partial<SmtpSettings>
  cache = {
    provider: d.provider === 'smtp' ? 'smtp' : 'resend',
    fromName: ((d.fromName as string) ?? '').trim(),
    fromEmail: ((d.fromEmail as string) ?? '').trim(),
    replyTo: ((d.replyTo as string) ?? '').trim(),
    adminRecipients: Array.isArray(d.adminRecipients)
      ? (d.adminRecipients as string[]).map((s) => s.trim()).filter(Boolean)
      : [],
    smtp: {
      host: (smtp.host ?? '').trim(),
      port: Number(smtp.port) > 0 ? Number(smtp.port) : 587,
      secure: smtp.secure === true,
      user: (smtp.user ?? '').trim(),
    },
    templates: mergeTemplates(d.templates),
  }
  return cache
}

// ── Template ─────────────────────────────────────────────────────────────────

/** แทนที่ {{var}} — ตัวแปรที่ไม่รู้จักถูกลบทิ้ง ไม่ปล่อย {{...}} ให้ผู้รับเห็น */
export function renderVars(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k: string) => vars[k] ?? '')
}

export interface ShellOptions {
  appName: string
  primaryColor: string
  heading: string
  intro: string
  footer: string
  /** แถวข้อมูล — สร้างจากโค้ด ลูกค้าแก้ไม่ได้ */
  bodyHtml: string
  cta?: { label: string; url: string }
  maxWidth?: number
}

/** โครงการ์ดกลางของอีเมลทุกฉบับ */
export function renderEmailShell(o: ShellOptions): string {
  const cta = o.cta?.url
    ? `
      <div style="margin-top:28px;text-align:center">
        <a href="${o.cta.url}"
           style="display:inline-block;background:${o.primaryColor};color:#fff;text-decoration:none;padding:12px 28px;border-radius:12px;font-weight:600;font-size:14px">
          ${o.cta.label}
        </a>
      </div>`
    : ''

  return `<!DOCTYPE html>
<html lang="th">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Helvetica Neue',Arial,sans-serif">
  <div style="max-width:${o.maxWidth ?? 560}px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <div style="background:${o.primaryColor};padding:24px 28px">
      <p style="margin:0;color:#fff;font-size:18px;font-weight:700">${o.appName}</p>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px">${o.heading}</p>
    </div>
    <div style="padding:28px">
      <p style="margin:0 0 20px;font-size:15px;color:#374151">${o.intro}</p>
      ${o.bodyHtml}${cta}
      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;text-align:center">${o.footer}</p>
    </div>
  </div>
</body>
</html>`
}

// ── ส่งเมล ────────────────────────────────────────────────────────────────────

export interface MailCredentials {
  resendApiKey: string
  smtpPassword: string
  /** ค่าเดิมจาก secret — ใช้เมื่อยังไม่ได้ตั้งใน Firestore */
  fallbackFrom: string
  fallbackAdminTo: string
}

export interface SendResult {
  id?: string
  error?: string
}

/** ที่อยู่ผู้ส่งแบบเต็ม `ชื่อ <อีเมล>` */
export function buildFrom(cfg: MailSettings, creds: MailCredentials, appName: string): string {
  const email = cfg.fromEmail || creds.fallbackFrom
  const name = cfg.fromName || `${appName} Notify`
  return `${name} <${email}>`
}

/** ผู้รับฝั่ง admin — Firestore ก่อน ไม่มีค่อยใช้ secret เดิม */
export function adminRecipients(cfg: MailSettings, creds: MailCredentials): string[] {
  if (cfg.adminRecipients.length) return cfg.adminRecipients
  return creds.fallbackAdminTo ? [creds.fallbackAdminTo] : []
}

export async function sendMail(
  cfg: MailSettings,
  creds: MailCredentials,
  msg: { from: string; to: string | string[]; subject: string; html: string },
): Promise<SendResult> {
  const to = Array.isArray(msg.to) ? msg.to : [msg.to]
  if (!to.length) return { error: 'ไม่มีผู้รับ' }

  if (cfg.provider === 'smtp') {
    if (!cfg.smtp.host || !cfg.smtp.user) {
      return { error: 'ยังตั้งค่า SMTP ไม่ครบ (host / user)' }
    }
    try {
      const transport = nodemailer.createTransport({
        host: cfg.smtp.host,
        port: cfg.smtp.port,
        secure: cfg.smtp.secure,
        auth: { user: cfg.smtp.user, pass: creds.smtpPassword },
      })
      const info = await transport.sendMail({
        from: msg.from,
        to,
        replyTo: cfg.replyTo || undefined,
        subject: msg.subject,
        html: msg.html,
      })
      return { id: info.messageId }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }

  // ── Resend ──
  if (!creds.resendApiKey) return { error: 'ยังไม่ได้ตั้ง RESEND_API_KEY' }
  try {
    const resend = new Resend(creds.resendApiKey)
    const { data, error } = await resend.emails.send({
      from: msg.from,
      to,
      replyTo: cfg.replyTo || undefined,
      subject: msg.subject,
      html: msg.html,
    })
    if (error) return { error: error.message }
    return { id: data?.id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
