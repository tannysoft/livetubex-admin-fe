import * as admin from 'firebase-admin'
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { setGlobalOptions } from 'firebase-functions/v2'
import * as https from 'https'
import {
  DEFAULT_TEMPLATES,
  adminRecipients,
  buildFrom,
  getMailSettings,
  renderEmailShell,
  renderVars,
  sendMail,
  type EmailKey,
  type MailCredentials,
} from './mail'

admin.initializeApp()

setGlobalOptions({ region: 'asia-southeast1' })

// ── Whitelabel config (ตั้งใน functions/.env — ดู functions/.env.example) ───
// APP_ORIGINS: โดเมนของ tenant คั่นด้วย comma (ตัวแรกใช้เป็นลิงก์ใน email)
// ไม่ตั้ง → เดาจาก default hosting domain ของ project เอง
const PROJECT_ID = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? ''

const CONFIGURED_ORIGINS = (process.env.APP_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

const DEFAULT_ORIGINS = PROJECT_ID
  ? [`https://${PROJECT_ID}.web.app`, `https://${PROJECT_ID}.firebaseapp.com`]
  : []

const ALLOWED_ORIGINS: string[] = CONFIGURED_ORIGINS.length ? CONFIGURED_ORIGINS : DEFAULT_ORIGINS

/** ใช้กับ onCall ทุกตัว — origin ที่อนุญาต + localhost ตอน dev */
const CORS_ORIGINS: (string | RegExp)[] = [...ALLOWED_ORIGINS, /localhost/]

/** URL หลักของแอป (ใช้ทำลิงก์ในอีเมล) */
const APP_URL = ALLOWED_ORIGINS[0] ?? ''

/** LIFF ID fallback จาก env — ใช้ตอนอ่าน publicSettings/line ไม่ได้ */
const LIFF_ID_FALLBACK = process.env.LINE_LIFF_ID ?? ''

/** อีเมล owner ตั้งต้น (bootstrap) — ว่าง = ไม่มีใครได้ owner อัตโนมัติ */
const BOOTSTRAP_OWNER_EMAIL = (process.env.BOOTSTRAP_OWNER_EMAIL ?? '').toLowerCase()

/** ว่างแปลว่า "ไม่มีใครใช่" ไม่ใช่ "ทุกคนใช่" — กันกรณี email undefined ตรงกับ '' */
function isBootstrapOwner(email: string | null | undefined): boolean {
  return !!BOOTSTRAP_OWNER_EMAIL && (email ?? '').toLowerCase() === BOOTSTRAP_OWNER_EMAIL
}

// ── แบรนด์ (อ่านจาก Firestore publicSettings/brand — ที่เดียวกับฝั่งเว็บ) ────
interface BrandInfo {
  appName: string
  primaryColor: string
  appUrl: string
}

/**
 * ใช้เมื่ออ่าน publicSettings/brand ไม่ได้ (ยังไม่ได้ seed / offline)
 * ตั้ง APP_NAME + BRAND_COLOR ใน functions/.env เพื่อให้อีเมลถูกแบรนด์
 * ตั้งแต่ก่อน seed doc
 */
const FALLBACK_BRAND: BrandInfo = {
  appName: process.env.APP_NAME || 'ระบบจัดการงาน',
  primaryColor: /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(process.env.BRAND_COLOR ?? '')
    ? (process.env.BRAND_COLOR as string)
    : '#f73727',
  appUrl: APP_URL,
}

let brandCache: BrandInfo | null = null

/** cache ต่อ instance — แบรนด์แทบไม่เปลี่ยน, instance รีไซเคิลเองอยู่แล้ว */
async function getBrandInfo(): Promise<BrandInfo> {
  if (brandCache) return brandCache
  try {
    const snap = await admin.firestore().doc('publicSettings/brand').get()
    const d = snap.data() ?? {}
    brandCache = {
      appName: (d.appName as string) || FALLBACK_BRAND.appName,
      primaryColor: /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test((d.primaryColor as string) ?? '')
        ? (d.primaryColor as string)
        : FALLBACK_BRAND.primaryColor,
      appUrl: APP_URL,
    }
  } catch (e) {
    console.error('[getBrandInfo] อ่านแบรนด์ไม่ได้ ใช้ค่า fallback:', e)
    brandCache = FALLBACK_BRAND
  }
  return brandCache
}

interface LineConfig {
  liffId: string
  /** LINE Login channel ID — ใช้ตรวจว่า access token ออกโดย channel ของ tenant นี้ */
  loginChannelId: string
}

/** LIFF ID เป็นรูปแบบ {channelId}-{suffix} — ดึง channel ID ออกมาเป็นค่า default */
function channelIdFromLiffId(liffId: string): string {
  const m = /^(\d{8,12})-[A-Za-z0-9]{4,20}$/.exec(liffId.trim())
  return m ? m[1] : ''
}

let lineConfigCache: LineConfig | null = null

/**
 * LINE config ของ tenant — แหล่งเดียวกับฝั่งเว็บ (publicSettings/line)
 * ตั้งได้ที่ /admin/settings/line โดยไม่ต้อง redeploy
 *
 * loginChannelId ที่ไม่ได้ตั้งไว้ จะ derive จาก LIFF ID ให้ (prefix ของ LIFF ID
 * คือ channel ID ของ LINE Login channel นั้น)
 */
async function getLineConfig(): Promise<LineConfig> {
  if (lineConfigCache) return lineConfigCache
  let liffId = LIFF_ID_FALLBACK
  let loginChannelId = process.env.LINE_LOGIN_CHANNEL_ID ?? ''
  try {
    const d = (await admin.firestore().doc('publicSettings/line').get()).data() ?? {}
    liffId = ((d.liffId as string) ?? '').trim() || liffId
    loginChannelId = ((d.loginChannelId as string) ?? '').trim() || loginChannelId
  } catch (e) {
    console.error('[getLineConfig] อ่าน LINE config ไม่ได้ ใช้ค่า env:', e)
  }
  lineConfigCache = {
    liffId,
    loginChannelId: loginChannelId || channelIdFromLiffId(liffId),
  }
  return lineConfigCache
}

/** รวม secret ที่โมดูล mail ต้องใช้ — เรียกได้เฉพาะใน handler ที่ประกาศ secrets ไว้ */
function mailCreds(opts: { withAdminTo?: boolean } = {}): MailCredentials {
  return {
    resendApiKey: RESEND_API_KEY.value(),
    smtpPassword: SMTP_PASSWORD.value(),
    fallbackFrom: MAIL_FROM.value(),
    fallbackAdminTo: opts.withAdminTo ? MAIL_TO.value() : '',
  }
}

async function getLiffId(): Promise<string> {
  return (await getLineConfig()).liffId
}

// ── Secrets (set via: firebase functions:secrets:set SECRET_NAME) ──────────
const RESEND_API_KEY           = defineSecret('RESEND_API_KEY')           // API Key จาก resend.com
const MAIL_FROM                = defineSecret('MAIL_FROM')                 // เช่น notify@yourcompany.com
const MAIL_TO                  = defineSecret('MAIL_TO')                   // admin ที่รับแจ้งเตือน
const SMTP_PASSWORD            = defineSecret('SMTP_PASSWORD')             // รหัสผ่าน SMTP (ใช้เมื่อ provider = smtp)
const LINE_CHANNEL_ACCESS_TOKEN = defineSecret('LINE_CHANNEL_ACCESS_TOKEN') // LINE Messaging API long-lived token

// ── ชื่อย่อธนาคาร ────────────────────────────────────────────────────────────
const BANK_ABBR: Record<string, string> = {
  'กสิกรไทย': 'KBANK', 'ธนาคารกสิกรไทย': 'KBANK',
  'ไทยพาณิชย์': 'SCB', 'ธนาคารไทยพาณิชย์': 'SCB',
  'กรุงเทพ': 'BBL', 'ธนาคารกรุงเทพ': 'BBL',
  'กรุงไทย': 'KTB', 'ธนาคารกรุงไทย': 'KTB',
  'กรุงศรีอยุธยา': 'BAY', 'ธนาคารกรุงศรีอยุธยา': 'BAY',
  'ทหารไทยธนชาต': 'TTB', 'ธนาคารทหารไทยธนชาต': 'TTB', 'ทีทีบี': 'TTB',
  'ออมสิน': 'GSB', 'ธนาคารออมสิน': 'GSB',
  'อาคารสงเคราะห์': 'GHB', 'ธนาคารอาคารสงเคราะห์': 'GHB',
  'เพื่อการเกษตรและสหกรณ์': 'BAAC', 'ธกส': 'BAAC',
  'ซีไอเอ็มบี': 'CIMB', 'ธนาคารซีไอเอ็มบีไทย': 'CIMB',
  'ยูโอบี': 'UOB', 'ธนาคารยูโอบี': 'UOB',
  'ทิสโก้': 'TISCO', 'ธนาคารทิสโก้': 'TISCO',
  'เกียรตินาคิน': 'KKP', 'ธนาคารเกียรตินาคินภัทร': 'KKP',
  'แลนด์ แอนด์ เฮ้าส์': 'LHB', 'ธนาคารแลนด์ แอนด์ เฮ้าส์': 'LHB',
}

function abbrevBank(name: string): string {
  for (const [key, abbr] of Object.entries(BANK_ABBR)) {
    if (name.includes(key)) return abbr
  }
  return name  // fallback: ใช้ชื่อเดิมถ้าหาไม่เจอ
}

// ── LINE push message helper ──────────────────────────────────────────────
function sendLineMessage(to: string, token: string, messages: object[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ to, messages })
    const req = https.request(
      {
        hostname: 'api.line.me',
        path: '/v2/bot/message/push',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve()
          } else {
            reject(new Error(`LINE API ${res.statusCode}: ${data}`))
          }
        })
      }
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ── Email notification on new payment request ─────────────────────────────
// เรียกจาก frontend หลัง createPayment สำเร็จ (หลีกเลี่ยง Eventarc ที่ไม่รองรับ asia-southeast3)
export const sendPaymentNotification = onCall(
  {
    cors: CORS_ORIGINS,
    secrets: [RESEND_API_KEY, SMTP_PASSWORD, MAIL_FROM, MAIL_TO],
  },
  async (request) => {
    // ตรวจสอบว่า caller เป็น freelancer จริง
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required')
    }

    const payment = (request.data ?? {}) as Record<string, unknown>
    if (!payment.amount) {
      throw new HttpsError('invalid-argument', 'Missing payment data')
    }


    // mask เลขบัญชี: แสดง 4 ตัวหลัง ซ่อนส่วนที่เหลือด้วย xxx
    const maskAccount = (acc: string) => {
      const clean = acc.replace(/\D/g, '')   // เอาเฉพาะตัวเลข
      if (clean.length <= 4) return clean
      return 'x'.repeat(clean.length - 4) + clean.slice(-4)
    }

    // ── ดึงข้อมูล freelancer จาก Firestore โดยตรง ─────────────────────────
    // ไม่พึ่ง client ส่งมา เพราะ bankAccount, bankName, name ไม่ได้เก็บใน payments อีกต่อไป
    let freelancerEmail: string | null = null
    let freelancerName = '-'
    let freelancerBankName = '-'
    let freelancerBankAccount = '-'
    const freelancerId = payment.freelancerId as string | undefined
    const lineUserId   = payment.lineUserId   as string | undefined

    if (freelancerId) {
      const snap = await admin.firestore().collection('freelancers').doc(freelancerId).get()
      if (snap.exists) {
        const data = snap.data()!
        const email = data.email as string | undefined
        if (email && email.trim()) freelancerEmail = email.trim()
        if (data.name) freelancerName = data.name as string
        if (data.bankName) freelancerBankName = data.bankName as string
        if (data.bankAccount) freelancerBankAccount = data.bankAccount as string
      }
    }

    // fallback: query ด้วย lineUserId ถ้าหา freelancerId ไม่เจอ
    if ((!freelancerEmail || freelancerName === '-') && lineUserId) {
      const snap = await admin.firestore()
        .collection('freelancers')
        .where('lineUserId', '==', lineUserId)
        .limit(1)
        .get()
      if (!snap.empty) {
        const data = snap.docs[0].data()
        const email = data.email as string | undefined
        if (email && email.trim() && !freelancerEmail) freelancerEmail = email.trim()
        if (freelancerName === '-' && data.name) freelancerName = data.name as string
        if (freelancerBankName === '-' && data.bankName) freelancerBankName = data.bankName as string
        if (freelancerBankAccount === '-' && data.bankAccount) freelancerBankAccount = data.bankAccount as string
      }
    }

    // ── ดึงชื่องานจาก jobId ───────────────────────────────────────────────────
    let jobTitle = (payment.workDescription as string | undefined) ?? '-'
    const jobId = payment.jobId as string | undefined
    if (jobId) {
      const jobSnap = await admin.firestore().collection('jobs').doc(jobId).get()
      if (jobSnap.exists) {
        const t = jobSnap.data()!.title as string | undefined
        if (t) jobTitle = t
      }
    }

    console.log(`[sendPaymentNotification] freelancer=${freelancerName} amount=${payment.amount as number} freelancerEmail=${freelancerEmail ?? 'none'} (freelancerId=${freelancerId ?? '-'} lineUserId=${lineUserId ?? '-'})`)

    const thaiDate = new Date(payment.requestedAt as string).toLocaleString('th-TH', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

    const amount = payment.amount as number
    const tax = Math.round(amount * 0.03)
    const net = amount - tax

    const workDatesText = Array.isArray(payment.workDates) && (payment.workDates as string[]).length > 0
      ? (payment.workDates as string[]).join(', ')
      : '-'

    const formatCurrency = (n: number) =>
      new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(n)

    const brand = await getBrandInfo()
    const mail = await getMailSettings()
    const creds = mailCreds({ withAdminTo: true })

    // ตัวแปรที่ใช้ได้ในข้อความที่แอดมินแก้เองได้ (/admin/settings/mail)
    const vars: Record<string, string> = {
      appName: brand.appName,
      date: thaiDate,
      freelancerName,
      jobTitle,
      workDates: workDatesText,
      amount: formatCurrency(amount),
      tax: formatCurrency(tax),
      net: formatCurrency(net),
      bankName: freelancerBankName,
      bankAccount: maskAccount(freelancerBankAccount),
      notes: (payment.notes as string) ?? '',
    }

    const row = (label: string, value: string, opts: { bold?: boolean; muted?: boolean; big?: boolean; last?: boolean } = {}) => `
        <tr${opts.last ? '' : ' style="border-bottom:1px solid #f3f4f6"'}>
          <td style="padding:10px 0;color:${opts.bold ? '#374151;font-weight:600' : '#6b7280'};width:40%">${label}</td>
          <td style="padding:10px 0;color:${opts.muted ? '#6b7280' : opts.bold ? brand.primaryColor : '#111827'}${opts.bold || opts.big ? ';font-weight:700' : ''}${opts.big ? ';font-size:16px' : ''}">${value}</td>
        </tr>`

    const from = buildFrom(mail, creds, brand.appName)

    // ── เมลหา Admin ───────────────────────────────────────────────────────
    const adminTpl = mail.templates.paymentRequestAdmin
    const adminTo = adminRecipients(mail, creds)
    let adminEmailId: string | undefined

    if (adminTpl.enabled && adminTo.length) {
      const html = renderEmailShell({
        appName: brand.appName,
        primaryColor: brand.primaryColor,
        heading: renderVars(adminTpl.heading, vars),
        intro: renderVars(adminTpl.intro, vars),
        footer: renderVars(adminTpl.footer, vars),
        cta: { label: 'ไปอนุมัติที่ Admin Panel →', url: `${brand.appUrl}/admin/payments` },
        bodyHtml: `
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${row('Freelancer', `<strong>${freelancerName}</strong>`)}
        ${row('รายละเอียดงาน', jobTitle)}
        ${row('วันที่ทำงาน', workDatesText)}
        ${row('บัญชีธนาคาร', `${freelancerBankName}<br><span style="font-family:monospace">${maskAccount(freelancerBankAccount)}</span>`)}
        ${payment.notes ? row('หมายเหตุ', payment.notes as string) : ''}
        ${row('จำนวนขอเบิก', formatCurrency(amount), { big: true })}
        ${row('ภาษีหัก ณ ที่จ่าย 3%', `−${formatCurrency(tax)}`, { muted: true })}
        ${row('ยอดโอนสุทธิ', formatCurrency(net), { bold: true, big: true, last: true })}
      </table>`,
      })

      const res = await sendMail(mail, creds, {
        from,
        to: adminTo,
        subject: renderVars(adminTpl.subject, vars),
        html,
      })
      if (res.error) {
        console.error('[sendPaymentNotification] ❌ ส่งเมลหา admin ไม่สำเร็จ:', res.error)
        throw new HttpsError('internal', `Email failed: ${res.error}`)
      }
      adminEmailId = res.id
      console.log(`[sendPaymentNotification] ✅ admin email sent id=${adminEmailId}`)
    } else {
      console.log('[sendPaymentNotification] ข้ามเมล admin (ปิดไว้ หรือไม่มีผู้รับ)')
    }

    // ── เมลยืนยันหา Freelancer ────────────────────────────────────────────
    const flTpl = mail.templates.paymentRequestFreelancer
    if (freelancerEmail && flTpl.enabled) {
      const freelancerHtml = renderEmailShell({
        appName: brand.appName,
        primaryColor: brand.primaryColor,
        heading: renderVars(flTpl.heading, vars),
        intro: renderVars(flTpl.intro, vars),
        footer: renderVars(flTpl.footer, vars),
        bodyHtml: `
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${row('รายละเอียดงาน', jobTitle)}
        ${row('วันที่ทำงาน', workDatesText)}
        ${row('จำนวนขอเบิก', formatCurrency(amount))}
        ${row('ภาษีหัก ณ ที่จ่าย 3%', `−${formatCurrency(tax)}`, { muted: true })}
        ${row('ยอดที่จะได้รับ', formatCurrency(net), { bold: true, big: true, last: true })}
      </table>`,
      })

      const res = await sendMail(mail, creds, {
        from,
        to: freelancerEmail,
        subject: renderVars(flTpl.subject, vars),
        html: freelancerHtml,
      })
      if (res.error) {
        console.warn('[sendPaymentNotification] ⚠️ ส่งเมลหา freelancer ไม่สำเร็จ:', res.error)
      } else {
        console.log(`[sendPaymentNotification] ✅ freelancer email sent to ${freelancerEmail}`)
      }
    }

    return { success: true, emailId: adminEmailId }
  }
)

interface LineProfile {
  userId: string
  displayName: string
  pictureUrl?: string
  statusMessage?: string
}

interface LineTokenInfo {
  /** channel ID ที่ออก token นี้ */
  client_id: string
  scope: string
  expires_in: number
}

/**
 * ตรวจว่า access token ออกโดย LINE Login channel ตัวไหน
 *
 * ⚠️ จำเป็นด้านความปลอดภัย: `/v2/profile` รับ token จาก **channel ไหนก็ได้**
 * ถ้าไม่เช็ก client_id ใครก็เอา token จาก LIFF app อื่นมาแลก Firebase token
 * ของระบบนี้ได้ (impersonate ตัวเองเข้ามาเป็น freelancer)
 * ref: https://developers.line.biz/en/reference/line-login/#verify-access-token
 */
function verifyLineAccessToken(accessToken: string): Promise<LineTokenInfo> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.line.me',
        path: `/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`,
        method: 'GET',
      },
      (res) => {
        let data = ''
        res.on('data', (chunk: string) => { data += chunk })
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data)
            if (res.statusCode === 200) {
              resolve(parsed as LineTokenInfo)
            } else {
              reject(new HttpsError(
                'unauthenticated',
                `LINE token verification failed (${res.statusCode}): ${parsed.error_description ?? data}`
              ))
            }
          } catch {
            reject(new HttpsError('internal', `Failed to parse LINE verify response: ${data}`))
          }
        })
      }
    )
    req.on('error', (err: Error) => {
      reject(new HttpsError('internal', `Network error calling LINE verify API: ${err.message}`))
    })
    req.setTimeout(10000, () => {
      req.destroy()
      reject(new HttpsError('deadline-exceeded', 'LINE verify API request timed out'))
    })
    req.end()
  })
}

function fetchLineProfile(accessToken: string): Promise<LineProfile> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.line.me',
      path: '/v2/profile',
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk: string) => { data += chunk })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (res.statusCode === 200) {
            resolve(parsed as LineProfile)
          } else {
            // LINE API คืน error เช่น token หมดอายุ
            reject(new HttpsError(
              'unauthenticated',
              `LINE API returned ${res.statusCode}: ${parsed.message ?? data}`
            ))
          }
        } catch {
          reject(new HttpsError('internal', `Failed to parse LINE response: ${data}`))
        }
      })
    })

    req.on('error', (err: Error) => {
      reject(new HttpsError('internal', `Network error calling LINE API: ${err.message}`))
    })

    req.setTimeout(10000, () => {
      req.destroy()
      reject(new HttpsError('deadline-exceeded', 'LINE API request timed out'))
    })

    req.end()
  })
}

export const lineAuth = onCall(
  {
    // CORS: อนุญาต Firebase Hosting domain
    cors: CORS_ORIGINS,
  },
  async (request) => {
    // ── 1. Validate input ──────────────────────────────────────────────────
    const { accessToken } = (request.data ?? {}) as { accessToken?: string }

    if (!accessToken || typeof accessToken !== 'string' || accessToken.trim() === '') {
      throw new HttpsError('invalid-argument', 'accessToken is required and must be a non-empty string')
    }

    const token = accessToken.trim()

    // ── 2. ตรวจว่า token ออกโดย LINE Login channel ของ tenant นี้ ──────────
    // ต้องทำก่อนเรียก /v2/profile เสมอ — profile API รับ token จาก channel ไหนก็ได้
    // ถ้าข้ามขั้นนี้ ใครก็เอา token จาก LIFF app อื่นมาแลก Firebase token ของระบบนี้ได้
    const { loginChannelId } = await getLineConfig()
    if (!loginChannelId) {
      // fail closed — ยอมให้ login ไม่ได้ ดีกว่าปล่อย token จาก channel อื่นเข้ามา
      console.error('[lineAuth] ไม่มี loginChannelId — ตั้งที่ /admin/settings/line')
      throw new HttpsError(
        'failed-precondition',
        'ระบบยังตั้งค่า LINE Login channel ไม่เสร็จ กรุณาติดต่อ Admin'
      )
    }

    let tokenInfo: LineTokenInfo
    try {
      tokenInfo = await verifyLineAccessToken(token)
    } catch (err) {
      if (err instanceof HttpsError) throw err
      throw new HttpsError('unauthenticated', 'Failed to verify LINE access token')
    }

    if (tokenInfo.client_id !== loginChannelId) {
      console.warn(
        `[lineAuth] ปฏิเสธ token จาก channel อื่น: ได้ ${tokenInfo.client_id} คาดหวัง ${loginChannelId}`
      )
      throw new HttpsError('unauthenticated', 'LINE access token ไม่ได้ออกโดย channel ของระบบนี้')
    }

    if (tokenInfo.expires_in <= 0) {
      throw new HttpsError('unauthenticated', 'LINE access token หมดอายุแล้ว')
    }

    // ── 3. ดึง profile ────────────────────────────────────────────────────
    let lineProfile: LineProfile
    try {
      lineProfile = await fetchLineProfile(token)
    } catch (err) {
      // re-throw HttpsError ที่สร้างใน fetchLineProfile
      if (err instanceof HttpsError) throw err
      throw new HttpsError('unauthenticated', 'Failed to verify LINE access token')
    }

    if (!lineProfile.userId) {
      throw new HttpsError('unauthenticated', 'LINE profile did not return userId')
    }

    // ── 4. ออก Firebase Custom Token ──────────────────────────────────────
    // NOTE: Service Account ต้องมี role "Service Account Token Creator"
    // ไปเพิ่มที่ https://console.cloud.google.com/iam-admin/iam
    let firebaseToken: string
    try {
      firebaseToken = await admin.auth().createCustomToken(lineProfile.userId, {
        lineUser: true,
        displayName: lineProfile.displayName,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      // ช่วย debug: ถ้า error เกี่ยวกับ IAM จะขึ้น PERMISSION_DENIED
      if (msg.includes('PERMISSION_DENIED') || msg.includes('iam.serviceAccounts.signBlob')) {
        throw new HttpsError(
          'permission-denied',
          'Service account is missing "Service Account Token Creator" role. ' +
          'Go to https://console.cloud.google.com/iam-admin/iam and add the role.'
        )
      }
      throw new HttpsError('internal', `createCustomToken failed: ${msg}`)
    }

    return {
      firebaseToken,
      lineUserId: lineProfile.userId,
      displayName: lineProfile.displayName,
      pictureUrl: lineProfile.pictureUrl ?? '',
    }
  }
)

// ── แจ้งโอนเงินสำเร็จให้ Freelancer (Admin เรียกจากหน้าเตรียมจ่ายเงิน) ─────
export const sendPayoutNotification = onCall(
  {
    cors: CORS_ORIGINS,
    secrets: [RESEND_API_KEY, SMTP_PASSWORD, MAIL_FROM, LINE_CHANNEL_ACCESS_TOKEN],
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required')

    const { freelancerId, paymentIds, payoutSlipPath } =
      (request.data ?? {}) as {
        freelancerId?: string
        paymentIds?: string[]
        payoutSlipPath?: string
      }

    if (!freelancerId || !Array.isArray(paymentIds) || paymentIds.length === 0) {
      throw new HttpsError('invalid-argument', 'Missing freelancerId or paymentIds')
    }

    // ── ดึงข้อมูล freelancer ──────────────────────────────────────────────
    const freelancerSnap = await admin.firestore().collection('freelancers').doc(freelancerId).get()
    if (!freelancerSnap.exists) throw new HttpsError('not-found', 'Freelancer not found')
    const fl = freelancerSnap.data()!
    const freelancerEmail = (fl.email as string | undefined)?.trim()
    const freelancerName  = (fl.name as string) ?? '-'
    const bankName        = (fl.bankName as string) ?? '-'
    const bankAccount     = (fl.bankAccount as string) ?? '-'
    const lineUserId      = (fl.lineUserId as string | undefined)?.trim()

    // ── ดึงข้อมูล payments + job titles ──────────────────────────────────
    const formatCurr = (n: number) =>
      new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(n)

    const paymentDocs = await Promise.all(
      paymentIds.map((id) => admin.firestore().collection('payments').doc(id).get())
    )

    interface PaymentRow { jobTitle: string; position: string; amount: number; net: number; tax: number }
    const rows: PaymentRow[] = []
    let totalNet = 0

    for (const snap of paymentDocs) {
      if (!snap.exists) continue
      const p = snap.data()!
      const amount = p.amount as number
      const tax    = Math.round(amount * 0.03)
      const net    = amount - tax + ((p.expenseAmount as number | undefined) ?? 0)
      totalNet += net

      let jobTitle = '-'
      const jobId = p.jobId as string | undefined
      if (jobId) {
        const jobSnap = await admin.firestore().collection('jobs').doc(jobId).get()
        if (jobSnap.exists) jobTitle = (jobSnap.data()!.title as string) ?? '-'
      }
      rows.push({ jobTitle, position: (p.position as string) ?? '-', amount, net, tax })
    }

    // ── สร้าง URL สำหรับดูสลิป ────────────────────────────────────────────
    let slipUrl: string | null = null
    if (payoutSlipPath) {
      try {
        const bucket = admin.storage().bucket()
        const file   = bucket.file(payoutSlipPath)
        const [meta] = await file.getMetadata()
        const token  = (meta.metadata as Record<string, string> | undefined)?.firebaseStorageDownloadTokens
        if (token) {
          slipUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(payoutSlipPath)}?alt=media&token=${token}`
        }
      } catch (e) {
        console.warn('[sendPayoutNotification] could not get slip URL:', e)
      }
    }

    const maskAccount = (acc: string) => {
      const clean = acc.replace(/\D/g, '')
      if (clean.length <= 4) return clean
      return 'x'.repeat(clean.length - 4) + clean.slice(-4)
    }

    const rowsHtml = rows.map((r) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#111827">${r.jobTitle}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#374151">${r.position}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#111827;text-align:right;white-space:nowrap">${formatCurr(r.amount)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#059669;font-weight:600;text-align:right;white-space:nowrap">${formatCurr(r.net)}</td>
      </tr>`).join('')

    const slipSection = slipUrl ? `
      <div style="margin-top:24px;text-align:center">
        <a href="${slipUrl}"
           style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:12px 28px;border-radius:12px;font-weight:600;font-size:14px">
          ดูสลิปการโอนเงิน →
        </a>
      </div>` : ''

    const thaiNow = new Date().toLocaleDateString('th-TH', {
      year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'Asia/Bangkok',
    })

    const brand = await getBrandInfo()
    const mail = await getMailSettings()
    const creds = mailCreds()
    const tpl = mail.templates.payoutSuccess

    const vars: Record<string, string> = {
      appName: brand.appName,
      date: thaiNow,
      freelancerName,
      totalNet: formatCurr(totalNet),
      bankName,
      bankAccount: maskAccount(bankAccount),
      jobCount: String(rows.length),
    }

    // แถบหัวเมลนี้ใช้สีเขียว "สำเร็จ" ไม่ใช่สีแบรนด์ — สื่อสถานะ ไม่ใช่ตัวตน
    const SUCCESS_GREEN = '#059669'

    const html = renderEmailShell({
      appName: brand.appName,
      primaryColor: SUCCESS_GREEN,
      maxWidth: 580,
      heading: renderVars(tpl.heading, vars),
      intro: renderVars(tpl.intro, vars),
      footer: renderVars(tpl.footer, vars),
      bodyHtml: `
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#f9fafb">
            <th style="padding:10px 12px;text-align:left;color:#6b7280;border-bottom:2px solid #e5e7eb">งาน</th>
            <th style="padding:10px 12px;text-align:left;color:#6b7280;border-bottom:2px solid #e5e7eb">ตำแหน่ง</th>
            <th style="padding:10px 12px;text-align:right;color:#6b7280;border-bottom:2px solid #e5e7eb">ยอดเบิก</th>
            <th style="padding:10px 12px;text-align:right;color:#6b7280;border-bottom:2px solid #e5e7eb">โอนสุทธิ</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr style="background:#f0fdf4">
            <td colspan="3" style="padding:12px;font-weight:700;color:#111827;border-top:2px solid #e5e7eb">รวมโอนทั้งหมด</td>
            <td style="padding:12px;text-align:right;font-weight:700;color:${SUCCESS_GREEN};font-size:16px;border-top:2px solid #e5e7eb">${formatCurr(totalNet)}</td>
          </tr>
        </tfoot>
      </table>
      <div style="margin-top:20px;padding:14px;background:#f9fafb;border-radius:10px;font-size:13px;color:#374151">
        <strong>โอนเข้าบัญชี:</strong> ${bankName} — ${maskAccount(bankAccount)}
      </div>
      ${slipSection}`,
    })

    // ── ส่งอีเมล (ถ้ามี) ─────────────────────────────────────────────────
    let emailSent = false
    if (freelancerEmail && tpl.enabled) {
      const res = await sendMail(mail, creds, {
        from: buildFrom(mail, creds, brand.appName),
        to: freelancerEmail,
        subject: renderVars(tpl.subject, vars),
        html,
      })
      if (res.error) {
        console.error('[sendPayoutNotification] email ❌', res.error)
      } else {
        emailSent = true
        console.log(`[sendPayoutNotification] email ✅ sent to ${freelancerEmail}`)
      }
    }

    // ── ส่ง LINE push message ─────────────────────────────────────────────
    let lineSent = false
    if (lineUserId) {
      try {
        const liffId = await getLiffId()
        const liffUrl = liffId ? `https://liff.line.me/${liffId}/payments` : APP_URL
        const maskedAcc = `xxxxxx${bankAccount.replace(/\D/g, '').slice(-4)}`
        const bankAbbr = abbrevBank(bankName)

        const flexMessage: object = {
          type: 'flex',
          altText: `${brand.appName}: ชำระเงินสำเร็จ ${formatCurr(totalNet)}`,
          sender: { name: brand.appName },
          contents: {
            type: 'bubble',
            header: {
              type: 'box',
              layout: 'vertical',
              backgroundColor: '#059669',
              paddingAll: '16px',
              contents: [
                { type: 'text', text: brand.appName, color: '#ffffffBF', size: 'xs', weight: 'bold' },
                { type: 'text', text: 'ชำระเงินสำเร็จ ✅', color: '#ffffff', size: 'xl', weight: 'bold', margin: 'xs' },
              ],
            },
            body: {
              type: 'box',
              layout: 'vertical',
              paddingAll: '16px',
              spacing: 'sm',
              contents: [
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: 'ยอดโอน', size: 'sm', color: '#6b7280', flex: 1 },
                    { type: 'text', text: formatCurr(totalNet), size: 'sm', color: '#059669', weight: 'bold', align: 'end' },
                  ],
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: 'บัญชี', size: 'sm', color: '#6b7280', flex: 1 },
                    { type: 'text', text: `${bankAbbr} ${maskedAcc}`, size: 'sm', color: '#374151', align: 'end' },
                  ],
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: 'จำนวน', size: 'sm', color: '#6b7280', flex: 1 },
                    { type: 'text', text: `${rows.length} งาน`, size: 'sm', color: '#374151', align: 'end' },
                  ],
                },
              ],
            },
            footer: {
              type: 'box',
              layout: 'vertical',
              paddingAll: '12px',
              spacing: 'sm',
              contents: [
                {
                  type: 'button',
                  style: 'primary',
                  color: '#059669',
                  height: 'sm',
                  action: {
                    type: 'uri',
                    label: 'ดูประวัติเบิกจ่าย',
                    uri: liffUrl,
                  },
                },
                ...(slipUrl
                  ? [
                      {
                        type: 'button',
                        style: 'secondary',
                        height: 'sm',
                        action: {
                          type: 'uri',
                          label: 'ดูสลิปการโอนเงิน',
                          uri: slipUrl,
                        },
                      },
                    ]
                  : []),
              ],
            },
          },
        }

        await sendLineMessage(lineUserId, LINE_CHANNEL_ACCESS_TOKEN.value(), [flexMessage])
        lineSent = true
        console.log(`[sendPayoutNotification] LINE ✅ sent to ${lineUserId}`)

        // บันทึก log สำหรับ LINE message report
        const bangkokNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }))
        const month = `${bangkokNow.getFullYear()}-${String(bangkokNow.getMonth() + 1).padStart(2, '0')}`
        await admin.firestore().collection('lineMessageLogs').add({
          sentAt: new Date().toISOString(),
          month,
          freelancerId,
          freelancerName,
          lineUserId,
          paymentCount: rows.length,
        })
      } catch (e) {
        console.warn('[sendPayoutNotification] LINE ❌', e)
      }
    }

    console.log(`[sendPayoutNotification] done — email:${emailSent} line:${lineSent}`)
    return { success: true, emailSent, lineSent }
  }
)

// ── ส่งรายละเอียดงานให้ Freelancer ทาง LINE (Admin เรียก) ─────────────────
// ข้อมูลงานอ่านจาก jobs เอง (ไม่เชื่อข้อความงานจาก client) — client ส่งแค่ jobId, คนรับ, ข้อความเพิ่มเติม
// ไม่มี budget/ราคา (อยู่ jobFinance) · 1 คน = 1 push = นับโควตา LINE 1 ข้อความ → log ลง lineMessageLogs (kind 'job')

/** ลิงก์ template ของ Google Calendar (งานทั้งวัน — วันสิ้นสุดแบบไม่รวม จึง +1) ฝาแฝดของ googleCalendarUrl ใน lib/calendar.ts */
function jobGoogleCalendarUrl(job: { title: string; date: string; endDate?: string; location?: string; description?: string }): string {
  const ymd = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
  const start = new Date(job.date + 'T00:00:00Z')
  const end = new Date((job.endDate && job.endDate > job.date ? job.endDate : job.date) + 'T00:00:00Z')
  end.setUTCDate(end.getUTCDate() + 1)
  const q = new URLSearchParams({ action: 'TEMPLATE', text: job.title, dates: `${ymd(start)}/${ymd(end)}` })
  if (job.location) q.set('location', job.location)
  if (job.description) q.set('details', job.description.slice(0, 1500))
  return `https://calendar.google.com/calendar/render?${q.toString().replace('%2F', '/')}`
}

function thaiDateRange(date: string, endDate?: string): string {
  const f = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(d + 'T00:00:00Z').toLocaleDateString('th-TH', { timeZone: 'UTC', ...opts })
  const full: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }
  if (!endDate || endDate <= date) return f(date, full)
  return `${f(date, { weekday: 'short', day: 'numeric', month: 'short' })} – ${f(endDate, full)}`
}

export const sendJobDetails = onCall(
  { cors: CORS_ORIGINS, secrets: [LINE_CHANNEL_ACCESS_TOKEN] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required')
    const token = request.auth.token as { firebase?: { sign_in_provider?: string } }
    if (token.firebase?.sign_in_provider !== 'password') throw new HttpsError('permission-denied', 'Admin only')

    const { jobId, freelancerIds, message, includePlans, template: rawTemplate } = (request.data ?? {}) as { jobId?: string; freelancerIds?: string[]; message?: string; includePlans?: boolean; template?: string }
    // details = รายละเอียดงาน (ก่อนงาน) · completed = งานเสร็จสิ้น ชวนเบิกเงิน (ปุ่มเปิด LIFF พร้อมเลือกงานให้ ?claim=)
    const template: 'details' | 'completed' = rawTemplate === 'completed' ? 'completed' : 'details'
    if (!jobId || typeof jobId !== 'string') throw new HttpsError('invalid-argument', 'Missing jobId')
    if (!Array.isArray(freelancerIds) || freelancerIds.length === 0) throw new HttpsError('invalid-argument', 'Missing freelancerIds')
    if (freelancerIds.length > 100) throw new HttpsError('invalid-argument', 'ส่งได้ครั้งละไม่เกิน 100 คน')
    const extra = typeof message === 'string' ? message.trim().slice(0, 1000) : ''

    const db = admin.firestore()
    const jobSnap = await db.collection('jobs').doc(jobId).get()
    if (!jobSnap.exists) throw new HttpsError('not-found', 'ไม่พบงาน')
    const job = jobSnap.data() as { title: string; date: string; endDate?: string; location?: string; clientName?: string; description?: string }

    const brand = await getBrandInfo()
    const liffId = await getLiffId()
    const color = brand.primaryColor
    const dateText = job.date ? thaiDateRange(job.date, job.endDate) : '-'
    const row = (label: string, value: string) => ({
      type: 'box', layout: 'baseline', spacing: 'md',
      contents: [
        { type: 'text', text: label, size: 'sm', color: '#6b7280', flex: 2 },
        { type: 'text', text: value || '-', size: 'sm', color: '#111827', flex: 5, wrap: true },
      ],
    })
    const bodyContents: object[] = [
      { type: 'text', text: job.title || 'งาน', size: 'lg', weight: 'bold', color: '#111827', wrap: true },
      { type: 'box', layout: 'vertical', spacing: 'sm', margin: 'md', contents: [
        row('วันที่', dateText),
        row('สถานที่', job.location ?? ''),
        ...(job.clientName ? [row('ลูกค้า', job.clientName)] : []),
      ] },
    ]
    if (template === 'completed') {
      bodyContents.push({ type: 'separator', margin: 'lg' })
      bodyContents.push({ type: 'text', text: 'ขอบคุณที่ร่วมงานนี้ 🙏 งานเสร็จสิ้นแล้ว — ส่งเบิกค่าจ้างได้เลย', size: 'sm', color: '#111827', wrap: true, margin: 'lg' })
    } else if (job.description?.trim()) {
      bodyContents.push({ type: 'separator', margin: 'lg' })
      bodyContents.push({ type: 'text', text: job.description.trim().slice(0, 1500), size: 'sm', color: '#374151', wrap: true, margin: 'lg' })
    }
    if (extra) {
      bodyContents.push({ type: 'box', layout: 'vertical', margin: 'lg', paddingAll: '12px', cornerRadius: '8px', backgroundColor: '#fef9c3', contents: [
        { type: 'text', text: 'ข้อความจากแอดมิน', size: 'xs', color: '#854d0e', weight: 'bold' },
        { type: 'text', text: extra, size: 'sm', color: '#422006', wrap: true, margin: 'sm' },
      ] })
    }
    const buttons: object[] = []
    if (template === 'completed') {
      const claimUri = liffId ? `https://liff.line.me/${liffId}?claim=${encodeURIComponent(jobId)}` : `${APP_URL}/freelancer?claim=${encodeURIComponent(jobId)}`
      buttons.push({ type: 'button', style: 'primary', color: '#059669', height: 'sm', action: { type: 'uri', label: 'เบิกเงิน', uri: claimUri } })
    }
    // ปุ่ม "ดูแผนงาน" — แผนจัดอุปกรณ์ที่ผูกกับงานนี้และเปิดลิงก์แชร์อยู่ (เปิดใน LINE: freelancer ไม่ต้องใส่รหัส)
    if (template === 'details' && includePlans !== false) {
      const planSnaps = await db.collection('equipmentPlans').where('jobId', '==', jobId).get()
      const plans = planSnaps.docs.sort((a, b) => String(a.data().date ?? '').localeCompare(String(b.data().date ?? ''))).slice(0, 3)
      for (const pl of plans) {
        const share = (await db.collection('planShares').doc(pl.id).get()).data() as { shareId?: string; enabled?: boolean } | undefined
        if (!share?.enabled || !share.shareId) continue
        const s = encodeURIComponent(share.shareId)
        const uri = liffId ? `https://liff.line.me/${liffId}/plan?s=${s}` : `${APP_URL}/share/plan?s=${s}`
        const label = plans.length > 1 ? `ดูแผน: ${String(pl.data().title ?? '')}` : 'ดูแผนงาน / ผัง'
        buttons.push({ type: 'button', style: 'primary', color, height: 'sm', action: { type: 'uri', label: label.slice(0, 40), uri } })
      }
    }
    const hasPlan = buttons.length > 0
    if (template === 'details' && job.date) buttons.push({ type: 'button', style: hasPlan ? 'secondary' : 'primary', ...(hasPlan ? {} : { color }), height: 'sm', action: { type: 'uri', label: 'เพิ่มลงปฏิทิน', uri: jobGoogleCalendarUrl(job) } })
    if (liffId && template === 'details') buttons.push({ type: 'button', style: 'secondary', height: 'sm', action: { type: 'uri', label: `เปิด ${brand.appName}`.slice(0, 40), uri: `https://liff.line.me/${liffId}` } })

    const flexMessage: object = {
      type: 'flex',
      altText: (template === 'completed' ? `${brand.appName}: งาน ${job.title} เสร็จสิ้น — เบิกเงินได้เลย` : `${brand.appName}: รายละเอียดงาน ${job.title} (${dateText})`).slice(0, 400),
      sender: { name: brand.appName.slice(0, 20) },
      contents: {
        type: 'bubble',
        header: { type: 'box', layout: 'vertical', backgroundColor: template === 'completed' ? '#059669' : color, paddingAll: '16px', contents: [
          { type: 'text', text: brand.appName, color: '#ffffffBF', size: 'xs', weight: 'bold' },
          { type: 'text', text: template === 'completed' ? 'งานเสร็จสิ้น ✅' : 'รายละเอียดงาน 🎬', color: '#ffffff', size: 'xl', weight: 'bold', margin: 'xs' },
        ] },
        body: { type: 'box', layout: 'vertical', paddingAll: '16px', contents: bodyContents },
        ...(buttons.length ? { footer: { type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'sm', contents: buttons } } : {}),
      },
    }

    const bangkokNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }))
    const month = `${bangkokNow.getFullYear()}-${String(bangkokNow.getMonth() + 1).padStart(2, '0')}`
    const sent: string[] = []
    const failed: { id: string; name: string; reason: string }[] = []
    const uniqueIds = [...new Set(freelancerIds.filter((x) => typeof x === 'string' && x))]
    const snaps = await db.getAll(...uniqueIds.map((id) => db.collection('freelancers').doc(id)))
    for (const snap of snaps) {
      const fl = snap.data()
      const name = (fl?.name as string | undefined) ?? snap.id
      const lineUserId = (fl?.lineUserId as string | undefined)?.trim()
      if (!fl) { failed.push({ id: snap.id, name, reason: 'ไม่พบ freelancer' }); continue }
      if (!lineUserId) { failed.push({ id: snap.id, name, reason: 'ไม่มี LINE' }); continue }
      try {
        await sendLineMessage(lineUserId, LINE_CHANNEL_ACCESS_TOKEN.value(), [flexMessage])
        sent.push(snap.id)
        await db.collection('lineMessageLogs').add({
          sentAt: new Date().toISOString(), month, kind: template === 'completed' ? 'job_done' : 'job', jobId, jobTitle: job.title ?? '',
          freelancerId: snap.id, freelancerName: name, lineUserId, paymentCount: 0,
        })
      } catch (e) {
        console.warn('[sendJobDetails] LINE ❌', snap.id, e)
        failed.push({ id: snap.id, name, reason: e instanceof Error ? e.message.slice(0, 200) : 'ส่งไม่สำเร็จ' })
      }
    }
    console.log(`[sendJobDetails] job ${jobId} sent:${sent.length} failed:${failed.length}`)
    return { sent, failed }
  }
)

// ── ส่งสรุปรายได้ให้ Freelancer (Admin เรียก) ─────────────────────────────
interface ReportPaymentRow {
  workDescription: string
  position?: string
  workDates?: string[]
  amount: number
  paidAt?: string
}

interface FreelancerReport {
  freelancerEmail: string
  freelancerName: string
  period: string
  payments: ReportPaymentRow[]
  totalGross: number
  totalTax: number
  totalNet: number
}

export const sendPaymentReport = onCall(
  {
    cors: CORS_ORIGINS,
    secrets: [RESEND_API_KEY, SMTP_PASSWORD, MAIL_FROM],
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required')

    // Admin only (sign_in_provider == 'password')
    const provider = (request.auth.token as Record<string, unknown>)?.firebase as Record<string, unknown> | undefined
    if (provider?.sign_in_provider !== 'password') {
      throw new HttpsError('permission-denied', 'Admin only')
    }

    const { reports } = (request.data ?? {}) as { reports?: FreelancerReport[] }
    if (!reports || !Array.isArray(reports) || reports.length === 0) {
      throw new HttpsError('invalid-argument', 'Missing reports data')
    }

    const mail = await getMailSettings()
    const creds = mailCreds()
    const tpl = mail.templates.earningsReport
    if (!tpl.enabled) {
      console.log('[sendPaymentReport] ปิดเมลสรุปรายได้ไว้ — ไม่ส่ง')
      return { results: [] }
    }

    const formatCurr = (n: number) =>
      new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(n)

    const formatDates = (dates?: string[]) => {
      if (!dates || dates.length === 0) return '-'
      return dates.map((d) => {
        const dt = new Date(d + 'T00:00:00')
        return dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
      }).join(', ')
    }

    const results: { email: string; ok: boolean }[] = []

    for (const report of reports) {
      const { freelancerEmail, freelancerName, period, payments, totalGross, totalTax, totalNet } = report

      if (!freelancerEmail || !freelancerEmail.trim()) {
        console.warn(`[sendPaymentReport] skip ${freelancerName} — no email`)
        results.push({ email: freelancerEmail || '-', ok: false })
        continue
      }

      const rows = payments.map((p) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#111827">${p.workDescription}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#374151">${p.position ?? '-'}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#374151;white-space:nowrap">${formatDates(p.workDates)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#111827;text-align:right;white-space:nowrap">${formatCurr(p.amount)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280;text-align:right;white-space:nowrap">−${formatCurr(Math.round(p.amount * 0.03))}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#059669;font-weight:600;text-align:right;white-space:nowrap">${formatCurr(p.amount - Math.round(p.amount * 0.03))}</td>
        </tr>`).join('')

      const brand = await getBrandInfo()
      const vars: Record<string, string> = {
        appName: brand.appName,
        date: new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }),
        freelancerName,
        period,
        totalGross: formatCurr(totalGross),
        totalTax: formatCurr(totalTax),
        totalNet: formatCurr(totalNet),
        jobCount: String(payments.length),
      }

      const html = renderEmailShell({
        appName: brand.appName,
        primaryColor: brand.primaryColor,
        maxWidth: 640,
        heading: renderVars(tpl.heading, vars),
        intro: renderVars(tpl.intro, vars),
        footer: renderVars(tpl.footer, vars),
        bodyHtml: `
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:520px">
          <thead>
            <tr style="background:#f9fafb">
              <th style="padding:10px 12px;text-align:left;color:#6b7280;font-weight:600;border-bottom:2px solid #e5e7eb">งาน</th>
              <th style="padding:10px 12px;text-align:left;color:#6b7280;font-weight:600;border-bottom:2px solid #e5e7eb">ตำแหน่ง</th>
              <th style="padding:10px 12px;text-align:left;color:#6b7280;font-weight:600;border-bottom:2px solid #e5e7eb">วันที่</th>
              <th style="padding:10px 12px;text-align:right;color:#6b7280;font-weight:600;border-bottom:2px solid #e5e7eb">ยอดขอเบิก</th>
              <th style="padding:10px 12px;text-align:right;color:#6b7280;font-weight:600;border-bottom:2px solid #e5e7eb">ภาษี 3%</th>
              <th style="padding:10px 12px;text-align:right;color:#6b7280;font-weight:600;border-bottom:2px solid #e5e7eb">สุทธิ</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr style="background:#f9fafb">
              <td colspan="3" style="padding:12px;font-weight:700;color:#111827;border-top:2px solid #e5e7eb">รวมทั้งหมด</td>
              <td style="padding:12px;text-align:right;font-weight:700;color:#111827;border-top:2px solid #e5e7eb">${formatCurr(totalGross)}</td>
              <td style="padding:12px;text-align:right;color:#6b7280;border-top:2px solid #e5e7eb">−${formatCurr(totalTax)}</td>
              <td style="padding:12px;text-align:right;font-weight:700;color:${brand.primaryColor};font-size:15px;border-top:2px solid #e5e7eb">${formatCurr(totalNet)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div style="margin-top:24px;background:#f0fdf4;border-radius:12px;padding:16px">
        <p style="margin:0;font-size:13px;color:#374151">ยอดโอนสุทธิที่จะได้รับ (หักภาษี ณ ที่จ่าย 3%)</p>
        <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#059669">${formatCurr(totalNet)}</p>
      </div>`,
      })

      const res = await sendMail(mail, creds, {
        from: buildFrom(mail, creds, brand.appName),
        to: freelancerEmail.trim(),
        subject: renderVars(tpl.subject, vars),
        html,
      })

      if (res.error) {
        console.error(`[sendPaymentReport] ❌ ${freelancerEmail}:`, res.error)
        results.push({ email: freelancerEmail, ok: false })
      } else {
        console.log(`[sendPaymentReport] ✅ sent to ${freelancerEmail}`)
        results.push({ email: freelancerEmail, ok: true })
      }
    }

    return { results }
  }
)

// ── Migrate LINE profile pictures → Firebase Storage (admin only) ──────────
// Backfill รูป profile ของ freelancer เก่าๆ ที่ยังไม่มี profileImagePath ใน Storage
// — server-side fetch จาก LINE CDN (ไม่มี CORS) แล้วอัพโหลดผ่าน admin SDK (bypass rules)
// flow ปกติ (sync ตอน LIFF login) ยังทำงานเหมือนเดิม — ฟังก์ชันนี้ใช้ตอน admin อยากเร่ง backfill
export const migrateProfilePictures = onCall(
  {
    cors: CORS_ORIGINS,
    timeoutSeconds: 540, // 9 นาที — เผื่อ freelancer เยอะ
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required')
    const provider = (request.auth.token.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider
    if (provider !== 'password') {
      throw new HttpsError('permission-denied', 'Admin only')
    }

    const db = admin.firestore()
    const bucket = admin.storage().bucket()

    const snapshot = await db.collection('freelancers').get()

    const result = {
      total: snapshot.size,
      migrated: 0,
      skipped: 0,
      failed: [] as { id: string; name: string; reason: string }[],
    }

    for (const doc of snapshot.docs) {
      const data = doc.data()
      const lineUserId = (data.lineUserId as string | undefined)?.trim()
      const linePictureUrl = (data.linePictureUrl as string | undefined)?.trim()
      const profileImagePath = (data.profileImagePath as string | undefined)?.trim()
      const name = (data.name as string | undefined) ?? doc.id

      // ข้ามถ้าไม่มีรูปต้นทาง หรือ migrate แล้ว
      if (!lineUserId || !linePictureUrl || profileImagePath) {
        result.skipped++
        continue
      }

      try {
        const res = await fetch(linePictureUrl)
        if (!res.ok) throw new Error(`fetch ${res.status}`)
        const arrayBuffer = await res.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        const contentType = res.headers.get('content-type') ?? 'image/jpeg'

        const path = `profilePictures/${lineUserId}/profile.jpg`
        await bucket.file(path).save(buffer, {
          contentType,
          metadata: {
            metadata: { uploadedBy: 'migration', source: 'line-profile' },
          },
        })

        await doc.ref.update({ profileImagePath: path })
        result.migrated++
        console.log(`[migrateProfilePictures] ✅ ${name} (${doc.id})`)
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        console.warn(`[migrateProfilePictures] ❌ ${name} (${doc.id}): ${reason}`)
        result.failed.push({ id: doc.id, name, reason })
      }
    }

    return result
  }
)

// ── ส่งเมลทดสอบ (admin เท่านั้น) ────────────────────────────────────────────
// ใช้ตรวจว่า provider / ผู้ส่ง / รหัสผ่าน ตั้งถูกก่อนใช้งานจริง
// ส่งด้วย config ที่บันทึกไว้แล้วเท่านั้น — ไม่รับ from/provider จาก client
export const sendTestEmail = onCall(
  {
    cors: CORS_ORIGINS,
    secrets: [RESEND_API_KEY, SMTP_PASSWORD, MAIL_FROM, MAIL_TO],
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required')
    const token = request.auth.token as { firebase?: { sign_in_provider?: string } }
    if (token.firebase?.sign_in_provider !== 'password') {
      throw new HttpsError('permission-denied', 'Admin only')
    }

    const { to, templateKey } = (request.data ?? {}) as { to?: string; templateKey?: EmailKey }
    const recipient = (to ?? '').trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) {
      throw new HttpsError('invalid-argument', 'กรุณาระบุอีเมลผู้รับที่ถูกต้อง')
    }

    const brand = await getBrandInfo()
    const mail = await getMailSettings()
    const creds = mailCreds({ withAdminTo: true })

    const key: EmailKey = (templateKey && templateKey in DEFAULT_TEMPLATES)
      ? templateKey
      : 'paymentRequestAdmin'
    const tpl = mail.templates[key]

    // ค่าตัวอย่างสำหรับ preview — ไม่แตะข้อมูลจริง
    const vars: Record<string, string> = {
      appName: brand.appName,
      date: new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'long', timeStyle: 'short' }),
      freelancerName: 'สมชาย ทดสอบ',
      jobTitle: 'งานตัวอย่าง (เมลทดสอบ)',
      workDates: '1 ม.ค., 2 ม.ค.',
      amount: '฿10,000', tax: '฿300', net: '฿9,700',
      totalGross: '฿10,000', totalTax: '฿300', totalNet: '฿9,700',
      bankName: 'ธนาคารตัวอย่าง', bankAccount: 'xxxxxx1234',
      period: 'เดือนตัวอย่าง', jobCount: '1', notes: '(เมลทดสอบ)',
    }

    const html = renderEmailShell({
      appName: brand.appName,
      primaryColor: brand.primaryColor,
      heading: renderVars(tpl.heading, vars),
      intro: renderVars(tpl.intro, vars),
      footer: renderVars(tpl.footer, vars),
      bodyHtml: `
      <div style="padding:14px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;font-size:13px;color:#92400e">
        นี่คือ<strong>เมลทดสอบ</strong>จากหน้าตั้งค่าอีเมล — ข้อมูลด้านบนเป็นค่าตัวอย่าง ไม่ใช่รายการจริง
      </div>`,
    })

    const res = await sendMail(mail, creds, {
      from: buildFrom(mail, creds, brand.appName),
      to: recipient,
      subject: `[ทดสอบ] ${renderVars(tpl.subject, vars)}`,
      html,
    })

    if (res.error) {
      console.error('[sendTestEmail] ❌', res.error)
      throw new HttpsError('internal', res.error)
    }
    console.log(`[sendTestEmail] ✅ sent to ${recipient} via ${mail.provider}`)
    return { success: true, id: res.id, provider: mail.provider }
  }
)

// ═══════════════════════════════════════════════════════════════════════════
// Admin Users & Roles — จัดการผู้ใช้แอดมิน + role (owner เท่านั้น)
// ═══════════════════════════════════════════════════════════════════════════

type AdminRole = 'owner' | 'admin' | 'accountant'
const VALID_ROLES: AdminRole[] = ['owner', 'admin', 'accountant']

const ADMIN_CORS = CORS_ORIGINS

/** ตรวจว่า caller เป็น owner (bootstrap email หรือ role=owner) — ไม่ใช่ → throw */
async function requireOwner(request: CallableRequest): Promise<void> {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required')
  const token = request.auth.token as { firebase?: { sign_in_provider?: string }; email?: string; role?: string }
  if (token.firebase?.sign_in_provider !== 'password') {
    throw new HttpsError('permission-denied', 'Admin only')
  }
  const email = token.email?.toLowerCase()
  if (isBootstrapOwner(email)) return
  if (token.role === 'owner') return
  const doc = await admin.firestore().collection('adminUsers').doc(request.auth.uid).get()
  if (doc.exists && (doc.data()?.role as string) === 'owner') return
  throw new HttpsError('permission-denied', 'เฉพาะ Owner เท่านั้นที่จัดการผู้ใช้ได้')
}

function assertRole(role: unknown): AdminRole {
  if (typeof role !== 'string' || !VALID_ROLES.includes(role as AdminRole)) {
    throw new HttpsError('invalid-argument', 'role ไม่ถูกต้อง')
  }
  return role as AdminRole
}

export const adminListUsers = onCall({ cors: ADMIN_CORS }, async (request) => {
  await requireOwner(request)
  const db = admin.firestore()
  const [list, docsSnap] = await Promise.all([
    admin.auth().listUsers(1000),
    db.collection('adminUsers').get(),
  ])
  const roleDocs = new Map<string, FirebaseFirestore.DocumentData>()
  docsSnap.forEach((d) => roleDocs.set(d.id, d.data()))

  const users = list.users
    .filter((u) => u.providerData.some((p) => p.providerId === 'password'))
    .map((u) => {
      const doc = roleDocs.get(u.uid)
      const email = (u.email ?? '').toLowerCase()
      const role: AdminRole = (doc?.role as AdminRole) ?? (isBootstrapOwner(email) ? 'owner' : 'admin')
      return {
        uid: u.uid,
        email: u.email ?? '',
        name: (doc?.name as string) ?? u.displayName ?? '',
        role,
        disabled: u.disabled,
        createdAt: (doc?.createdAt as string)
          ?? (u.metadata.creationTime ? new Date(u.metadata.creationTime).toISOString() : ''),
      }
    })
    .sort((a, b) => a.email.localeCompare(b.email))

  return { users }
})

export const adminCreateUser = onCall({ cors: ADMIN_CORS }, async (request) => {
  await requireOwner(request)
  const { email, password, name, role } = request.data ?? {}
  if (typeof email !== 'string' || !email.includes('@')) throw new HttpsError('invalid-argument', 'อีเมลไม่ถูกต้อง')
  if (typeof password !== 'string' || password.length < 6) throw new HttpsError('invalid-argument', 'รหัสผ่านอย่างน้อย 6 ตัว')
  const validRole = assertRole(role)

  const userRecord = await admin.auth().createUser({
    email: email.trim(),
    password,
    displayName: typeof name === 'string' ? name.trim() : undefined,
  }).catch((e) => { throw new HttpsError('already-exists', (e as Error)?.message ?? 'สร้างผู้ใช้ไม่สำเร็จ') })

  await admin.auth().setCustomUserClaims(userRecord.uid, { role: validRole })
  const now = new Date().toISOString()
  await admin.firestore().collection('adminUsers').doc(userRecord.uid).set({
    email: email.trim(),
    name: typeof name === 'string' ? name.trim() : '',
    role: validRole,
    disabled: false,
    createdAt: now,
    updatedAt: now,
    createdBy: request.auth?.token?.email ?? request.auth?.uid ?? '',
  })
  return { uid: userRecord.uid }
})

export const adminUpdateUserRole = onCall({ cors: ADMIN_CORS }, async (request) => {
  await requireOwner(request)
  const { uid, role } = request.data ?? {}
  if (typeof uid !== 'string') throw new HttpsError('invalid-argument', 'uid ไม่ถูกต้อง')
  const validRole = assertRole(role)

  const target = await admin.auth().getUser(uid).catch(() => null)
  if (!target) throw new HttpsError('not-found', 'ไม่พบผู้ใช้')
  if (isBootstrapOwner(target.email) && validRole !== 'owner') {
    throw new HttpsError('failed-precondition', 'เปลี่ยน role ของ owner ตั้งต้นไม่ได้')
  }

  await admin.auth().setCustomUserClaims(uid, { role: validRole })
  await admin.firestore().collection('adminUsers').doc(uid).set({
    email: target.email ?? '',
    name: target.displayName ?? '',
    role: validRole,
    updatedAt: new Date().toISOString(),
  }, { merge: true })
  return { ok: true }
})

export const adminSetUserDisabled = onCall({ cors: ADMIN_CORS }, async (request) => {
  await requireOwner(request)
  const { uid, disabled } = request.data ?? {}
  if (typeof uid !== 'string' || typeof disabled !== 'boolean') throw new HttpsError('invalid-argument', 'ข้อมูลไม่ถูกต้อง')
  if (uid === request.auth?.uid) throw new HttpsError('failed-precondition', 'ปิดใช้งานบัญชีตัวเองไม่ได้')
  const target = await admin.auth().getUser(uid).catch(() => null)
  if (target && isBootstrapOwner(target.email)) {
    throw new HttpsError('failed-precondition', 'ปิดใช้งาน owner ตั้งต้นไม่ได้')
  }
  await admin.auth().updateUser(uid, { disabled })
  await admin.firestore().collection('adminUsers').doc(uid).set({ disabled, updatedAt: new Date().toISOString() }, { merge: true })
  return { ok: true }
})

export const adminDeleteUser = onCall({ cors: ADMIN_CORS }, async (request) => {
  await requireOwner(request)
  const { uid } = request.data ?? {}
  if (typeof uid !== 'string') throw new HttpsError('invalid-argument', 'uid ไม่ถูกต้อง')
  if (uid === request.auth?.uid) throw new HttpsError('failed-precondition', 'ลบบัญชีตัวเองไม่ได้')
  const target = await admin.auth().getUser(uid).catch(() => null)
  if (target && isBootstrapOwner(target.email)) {
    throw new HttpsError('failed-precondition', 'ลบ owner ตั้งต้นไม่ได้')
  }
  await admin.auth().deleteUser(uid)
  await admin.firestore().collection('adminUsers').doc(uid).delete().catch(() => {})
  return { ok: true }
})

export const adminResetUserPassword = onCall({ cors: ADMIN_CORS }, async (request) => {
  await requireOwner(request)
  const { uid, password } = request.data ?? {}
  if (typeof uid !== 'string') throw new HttpsError('invalid-argument', 'uid ไม่ถูกต้อง')
  if (typeof password !== 'string' || password.length < 6) throw new HttpsError('invalid-argument', 'รหัสผ่านอย่างน้อย 6 ตัว')
  await admin.auth().updateUser(uid, { password })
  return { ok: true }
})

// ── ผู้ช่วย AI จัดอุปกรณ์ + ร่างผังระบบ (LangGraph.js + Claude) ──────────────────
// คืน "ร่าง" ให้หน้าเว็บตรวจก่อน — ไม่เขียน Firestore เอง (ดู functions/src/equipment-agent/)
// ⚠️ ANTHROPIC_API_KEY ต้องมีใน Secret Manager ก่อน deploy ไม่งั้น deploy functions ล้มทั้งชุด
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')

export const equipmentAgent = onCall(
  { cors: CORS_ORIGINS, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 900, memory: '1GiB' },
  async (request, response) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required')
    const provider = (request.auth.token.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider
    if (provider !== 'password') throw new HttpsError('permission-denied', 'Admin only')
    const { handleEquipmentAgent } = await import('./equipment-agent')
    // client เรียกแบบ .stream() → ส่งความคิด/ขั้นตอนสดๆ, เรียกแบบปกติ → sendChunk เป็น noop
    const onEvent = request.acceptsStreaming && response ? (e: unknown) => { void response.sendChunk(e).catch(() => {}) } : undefined
    return handleEquipmentAgent(request.data, ANTHROPIC_API_KEY.value(), onEvent)
  },
)

// ผู้ช่วย AI ของทั้งระบบ (/admin/agent) — ตัวกลางเรียก Claude ทีละรอบ tool รันที่หน้าเว็บ (ดู system-agent.ts)
export const systemAgent = onCall(
  { cors: CORS_ORIGINS, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300, memory: '512MiB' },
  async (request, response) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required')
    const provider = (request.auth.token.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider
    if (provider !== 'password') throw new HttpsError('permission-denied', 'Admin only')
    const { handleSystemAgent } = await import('./system-agent')
    const onEvent = request.acceptsStreaming && response ? (e: unknown) => { void response.sendChunk(e).catch(() => {}) } : undefined
    return handleSystemAgent(request.data, ANTHROPIC_API_KEY.value(), onEvent)
  },
)

// ═══════════════════════════════════════════════════════════════════════════
// แชร์แผนจัดอุปกรณ์ให้ทีมงาน (ลิงก์ + รหัสผ่าน) — ดู plan-share.ts
// ═══════════════════════════════════════════════════════════════════════════

export const setPlanShare = onCall({ cors: CORS_ORIGINS }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required')
  const token = request.auth.token as { firebase?: { sign_in_provider?: string }; email?: string }
  if (token.firebase?.sign_in_provider !== 'password') throw new HttpsError('permission-denied', 'Admin only')
  const { handleSetPlanShare } = await import('./plan-share')
  return handleSetPlanShare(request.data, token.email)
})

/** สาธารณะ (ไม่ต้อง login) — ความปลอดภัยอยู่ที่ shareId เดาไม่ได้ + รหัสผ่าน + ล็อกเมื่อใส่ผิดหลายครั้ง */
export const getSharedPlan = onCall({ cors: CORS_ORIGINS, memory: '512MiB' }, async (request) => {
  const { handleGetSharedPlan } = await import('./plan-share')
  return handleGetSharedPlan(request.data, request.auth)
})
