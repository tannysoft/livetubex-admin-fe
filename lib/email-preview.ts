import { renderVars, type EmailKey, type EmailTemplate } from './mail-settings'

/**
 * ── Preview อีเมลฝั่งเว็บ ─────────────────────────────────────────────────────
 *
 * ⚠️ `renderEmailShell()` ที่นี่เป็น **ฝาแฝด** ของตัวใน `functions/src/mail.ts`
 *    แก้ฝั่งไหนต้องแก้อีกฝั่งเสมอ ไม่งั้น preview จะโกหกว่าเมลจริงหน้าตาแบบนี้
 *    (แชร์โค้ดกันตรงๆ ไม่ได้ — functions เป็นคนละ package/tsconfig)
 *
 * ตารางข้อมูลใน preview เป็น **ค่าตัวอย่าง** ไม่ใช่ layout ที่เป๊ะทุก pixel
 * ของจริง — จุดประสงค์คือให้เห็นผลของข้อความ/สี/ชื่อระบบที่แอดมินกำลังแก้
 */

export interface ShellOptions {
  appName: string
  primaryColor: string
  heading: string
  intro: string
  footer: string
  bodyHtml: string
  cta?: { label: string; url: string }
  maxWidth?: number
}

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

/** ค่าตัวอย่าง — ชุดเดียวกับที่ sendTestEmail ใช้ ให้ preview กับเมลทดสอบตรงกัน */
export const SAMPLE_VARS: Record<string, string> = {
  date: '1 มกราคม 2569 09:30',
  freelancerName: 'สมชาย ทดสอบ',
  jobTitle: 'งานตัวอย่าง (เมลทดสอบ)',
  workDates: '1 ม.ค., 2 ม.ค.',
  amount: '฿10,000',
  tax: '฿300',
  net: '฿9,700',
  totalGross: '฿10,000',
  totalTax: '฿300',
  totalNet: '฿9,700',
  bankName: 'ธนาคารตัวอย่าง',
  bankAccount: 'xxxxxx1234',
  period: 'เดือนตัวอย่าง',
  jobCount: '1',
  notes: '(เมลทดสอบ)',
}

const SUCCESS_GREEN = '#059669'

const row = (label: string, value: string, last = false) => `
        <tr${last ? '' : ' style="border-bottom:1px solid #f3f4f6"'}>
          <td style="padding:10px 0;color:#6b7280;width:40%">${label}</td>
          <td style="padding:10px 0;color:#111827">${value}</td>
        </tr>`

const table = (rows: string) =>
  `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>`

const v = SAMPLE_VARS

/** ตารางข้อมูลตัวอย่างของแต่ละประเภทเมล */
const SAMPLE_BODY: Record<EmailKey, string> = {
  paymentRequestAdmin: table(
    row('Freelancer', `<strong>${v.freelancerName}</strong>`) +
      row('รายละเอียดงาน', v.jobTitle) +
      row('วันที่ทำงาน', v.workDates) +
      row('บัญชีธนาคาร', `${v.bankName}<br><span style="font-family:monospace">${v.bankAccount}</span>`) +
      row('จำนวนขอเบิก', v.amount) +
      row('ภาษีหัก ณ ที่จ่าย 3%', `−${v.tax}`) +
      row('ยอดโอนสุทธิ', `<strong>${v.net}</strong>`, true),
  ),
  paymentRequestFreelancer: table(
    row('รายละเอียดงาน', v.jobTitle) +
      row('วันที่ทำงาน', v.workDates) +
      row('จำนวนขอเบิก', v.amount) +
      row('ภาษีหัก ณ ที่จ่าย 3%', `−${v.tax}`) +
      row('ยอดที่จะได้รับ', `<strong>${v.net}</strong>`, true),
  ),
  payoutSuccess:
    table(row('งานที่โอน', `${v.jobCount} รายการ`) + row('รวมโอนทั้งหมด', `<strong>${v.totalNet}</strong>`, true)) +
    `<div style="margin-top:20px;padding:14px;background:#f9fafb;border-radius:10px;font-size:13px;color:#374151">
        <strong>โอนเข้าบัญชี:</strong> ${v.bankName} — ${v.bankAccount}
      </div>`,
  earningsReport:
    table(
      row('งานทั้งหมด', `${v.jobCount} รายการ`) +
        row('รวมยอดขอเบิก', v.totalGross) +
        row('ภาษีหัก ณ ที่จ่าย 3%', `−${v.totalTax}`, true),
    ) +
    `<div style="margin-top:24px;background:#f0fdf4;border-radius:12px;padding:16px">
        <p style="margin:0;font-size:13px;color:#374151">ยอดโอนสุทธิที่จะได้รับ (หักภาษี ณ ที่จ่าย 3%)</p>
        <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:${SUCCESS_GREEN}">${v.totalNet}</p>
      </div>`,
}

export interface EmailPreview {
  subject: string
  html: string
}

/** ประกอบ preview ของเมลหนึ่งฉบับจาก template ที่กำลังแก้อยู่ (ยังไม่ต้องบันทึก) */
export function previewEmail(
  key: EmailKey,
  tpl: EmailTemplate,
  brand: { appName: string; primaryColor: string },
  appUrl = '',
): EmailPreview {
  const vars = { ...SAMPLE_VARS, appName: brand.appName }

  // เมลแจ้งโอนสำเร็จใช้สีเขียว "สำเร็จ" ไม่ใช่สีแบรนด์ — ต้องตรงกับ functions/src/mail.ts
  const isPayout = key === 'payoutSuccess'
  const color = isPayout ? SUCCESS_GREEN : brand.primaryColor

  return {
    subject: renderVars(tpl.subject, vars),
    html: renderEmailShell({
      appName: brand.appName,
      primaryColor: color,
      maxWidth: key === 'earningsReport' ? 640 : isPayout ? 580 : 560,
      heading: renderVars(tpl.heading, vars),
      intro: renderVars(tpl.intro, vars),
      footer: renderVars(tpl.footer, vars),
      bodyHtml: SAMPLE_BODY[key],
      cta:
        key === 'paymentRequestAdmin'
          ? { label: 'ไปอนุมัติที่ Admin Panel →', url: `${appUrl}/admin/payments` }
          : undefined,
    }),
  }
}
