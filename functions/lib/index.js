"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminResetUserPassword = exports.adminDeleteUser = exports.adminSetUserDisabled = exports.adminUpdateUserRole = exports.adminCreateUser = exports.adminListUsers = exports.migrateProfilePictures = exports.sendPaymentReport = exports.sendPayoutNotification = exports.lineAuth = exports.sendPaymentNotification = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const v2_1 = require("firebase-functions/v2");
const https = __importStar(require("https"));
const resend_1 = require("resend");
admin.initializeApp();
(0, v2_1.setGlobalOptions)({ region: 'asia-southeast1' });
// ── Secrets (set via: firebase functions:secrets:set SECRET_NAME) ──────────
const RESEND_API_KEY = (0, params_1.defineSecret)('RESEND_API_KEY'); // API Key จาก resend.com
const MAIL_FROM = (0, params_1.defineSecret)('MAIL_FROM'); // เช่น notify@yourcompany.com
const MAIL_TO = (0, params_1.defineSecret)('MAIL_TO'); // admin ที่รับแจ้งเตือน
const LINE_CHANNEL_ACCESS_TOKEN = (0, params_1.defineSecret)('LINE_CHANNEL_ACCESS_TOKEN'); // LINE Messaging API long-lived token
// ── ชื่อย่อธนาคาร ────────────────────────────────────────────────────────────
const BANK_ABBR = {
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
};
function abbrevBank(name) {
    for (const [key, abbr] of Object.entries(BANK_ABBR)) {
        if (name.includes(key))
            return abbr;
    }
    return name; // fallback: ใช้ชื่อเดิมถ้าหาไม่เจอ
}
// ── LINE push message helper ──────────────────────────────────────────────
function sendLineMessage(to, token, messages) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ to, messages });
        const req = https.request({
            hostname: 'api.line.me',
            path: '/v2/bot/message/push',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'Content-Length': Buffer.byteLength(body),
            },
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    resolve();
                }
                else {
                    reject(new Error(`LINE API ${res.statusCode}: ${data}`));
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}
// ── Email notification on new payment request ─────────────────────────────
// เรียกจาก frontend หลัง createPayment สำเร็จ (หลีกเลี่ยง Eventarc ที่ไม่รองรับ asia-southeast3)
exports.sendPaymentNotification = (0, https_1.onCall)({
    cors: [
        'https://livetubex-admin.web.app',
        'https://livetubex-admin.firebaseapp.com',
        'https://console.livetubex.com',
        /localhost/,
    ],
    secrets: [RESEND_API_KEY, MAIL_FROM, MAIL_TO],
}, async (request) => {
    // ตรวจสอบว่า caller เป็น freelancer จริง
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    const payment = (request.data ?? {});
    if (!payment.amount) {
        throw new https_1.HttpsError('invalid-argument', 'Missing payment data');
    }
    const mailFrom = MAIL_FROM.value();
    const mailTo = MAIL_TO.value();
    const resend = new resend_1.Resend(RESEND_API_KEY.value());
    // mask เลขบัญชี: แสดง 4 ตัวหลัง ซ่อนส่วนที่เหลือด้วย xxx
    const maskAccount = (acc) => {
        const clean = acc.replace(/\D/g, ''); // เอาเฉพาะตัวเลข
        if (clean.length <= 4)
            return clean;
        return 'x'.repeat(clean.length - 4) + clean.slice(-4);
    };
    // ── ดึงข้อมูล freelancer จาก Firestore โดยตรง ─────────────────────────
    // ไม่พึ่ง client ส่งมา เพราะ bankAccount, bankName, name ไม่ได้เก็บใน payments อีกต่อไป
    let freelancerEmail = null;
    let freelancerName = '-';
    let freelancerBankName = '-';
    let freelancerBankAccount = '-';
    const freelancerId = payment.freelancerId;
    const lineUserId = payment.lineUserId;
    if (freelancerId) {
        const snap = await admin.firestore().collection('freelancers').doc(freelancerId).get();
        if (snap.exists) {
            const data = snap.data();
            const email = data.email;
            if (email && email.trim())
                freelancerEmail = email.trim();
            if (data.name)
                freelancerName = data.name;
            if (data.bankName)
                freelancerBankName = data.bankName;
            if (data.bankAccount)
                freelancerBankAccount = data.bankAccount;
        }
    }
    // fallback: query ด้วย lineUserId ถ้าหา freelancerId ไม่เจอ
    if ((!freelancerEmail || freelancerName === '-') && lineUserId) {
        const snap = await admin.firestore()
            .collection('freelancers')
            .where('lineUserId', '==', lineUserId)
            .limit(1)
            .get();
        if (!snap.empty) {
            const data = snap.docs[0].data();
            const email = data.email;
            if (email && email.trim() && !freelancerEmail)
                freelancerEmail = email.trim();
            if (freelancerName === '-' && data.name)
                freelancerName = data.name;
            if (freelancerBankName === '-' && data.bankName)
                freelancerBankName = data.bankName;
            if (freelancerBankAccount === '-' && data.bankAccount)
                freelancerBankAccount = data.bankAccount;
        }
    }
    // ── ดึงชื่องานจาก jobId ───────────────────────────────────────────────────
    let jobTitle = payment.workDescription ?? '-';
    const jobId = payment.jobId;
    if (jobId) {
        const jobSnap = await admin.firestore().collection('jobs').doc(jobId).get();
        if (jobSnap.exists) {
            const t = jobSnap.data().title;
            if (t)
                jobTitle = t;
        }
    }
    console.log(`[sendPaymentNotification] from=${mailFrom} to=${mailTo} freelancer=${freelancerName} amount=${payment.amount} freelancerEmail=${freelancerEmail ?? 'none'} (freelancerId=${freelancerId ?? '-'} lineUserId=${lineUserId ?? '-'})`);
    const thaiDate = new Date(payment.requestedAt).toLocaleString('th-TH', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
    const amount = payment.amount;
    const tax = Math.round(amount * 0.03);
    const net = amount - tax;
    const workDatesText = Array.isArray(payment.workDates) && payment.workDates.length > 0
        ? payment.workDates.join(', ')
        : '-';
    const formatCurrency = (n) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(n);
    const html = `
<!DOCTYPE html>
<html lang="th">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Helvetica Neue',Arial,sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <!-- Header -->
    <div style="background:#f73727;padding:24px 28px">
      <p style="margin:0;color:#fff;font-size:18px;font-weight:700">LiveTubeX</p>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px">มีคำขอเบิกจ่ายเงินใหม่</p>
    </div>
    <!-- Body -->
    <div style="padding:28px">
      <p style="margin:0 0 20px;font-size:15px;color:#374151">
        <strong>${freelancerName}</strong> ส่งคำขอเบิกจ่ายเงินเข้ามาแล้ว กรุณาตรวจสอบและอนุมัติ
      </p>
      <!-- Info table -->
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:10px 0;color:#6b7280;width:40%">Freelancer</td>
          <td style="padding:10px 0;color:#111827;font-weight:600">${freelancerName}</td>
        </tr>
        <tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:10px 0;color:#6b7280">รายละเอียดงาน</td>
          <td style="padding:10px 0;color:#111827">${jobTitle}</td>
        </tr>
        <tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:10px 0;color:#6b7280">วันที่ทำงาน</td>
          <td style="padding:10px 0;color:#111827">${workDatesText}</td>
        </tr>
        <tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:10px 0;color:#6b7280">บัญชีธนาคาร</td>
          <td style="padding:10px 0;color:#111827">${freelancerBankName}<br><span style="font-family:monospace">${maskAccount(freelancerBankAccount)}</span></td>
        </tr>
        ${payment.notes ? `
        <tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:10px 0;color:#6b7280">หมายเหตุ</td>
          <td style="padding:10px 0;color:#111827">${payment.notes}</td>
        </tr>` : ''}
        <tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:10px 0;color:#6b7280">จำนวนขอเบิก</td>
          <td style="padding:10px 0;color:#111827;font-weight:600;font-size:16px">${formatCurrency(amount)}</td>
        </tr>
        <tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:10px 0;color:#6b7280">ภาษีหัก ณ ที่จ่าย 3%</td>
          <td style="padding:10px 0;color:#6b7280">−${formatCurrency(tax)}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#374151;font-weight:600">ยอดโอนสุทธิ</td>
          <td style="padding:10px 0;color:#f73727;font-weight:700;font-size:16px">${formatCurrency(net)}</td>
        </tr>
      </table>
      <!-- CTA -->
      <div style="margin-top:28px;text-align:center">
        <a href="https://livetubex-admin.web.app/admin/payments"
           style="display:inline-block;background:#f73727;color:#fff;text-decoration:none;padding:12px 28px;border-radius:12px;font-weight:600;font-size:14px">
          ไปอนุมัติที่ Admin Panel →
        </a>
      </div>
      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;text-align:center">
        ส่งเมื่อ ${thaiDate}
      </p>
    </div>
  </div>
</body>
</html>`;
    // ── ส่งเมลหา Admin ────────────────────────────────────────────────────
    const { data, error } = await resend.emails.send({
        from: `LiveTubeX Notify <${mailFrom}>`,
        to: mailTo,
        subject: `[LiveTubeX] คำขอเบิกจ่าย — ${freelancerName} — ${formatCurrency(amount)}`,
        html,
    });
    if (error) {
        console.error(`[sendPaymentNotification] ❌ Resend error (admin):`, error);
        throw new https_1.HttpsError('internal', `Email failed: ${error.message}`);
    }
    console.log(`[sendPaymentNotification] ✅ Admin email sent id=${data?.id}`);
    // ── ส่งเมลยืนยันหา Freelancer (ถ้ามี email) ───────────────────────────
    if (freelancerEmail) {
        const freelancerHtml = `
<!DOCTYPE html>
<html lang="th">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Helvetica Neue',Arial,sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <div style="background:#f73727;padding:24px 28px">
      <p style="margin:0;color:#fff;font-size:18px;font-weight:700">LiveTubeX</p>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px">ส่งคำขอเบิกจ่ายสำเร็จ</p>
    </div>
    <div style="padding:28px">
      <p style="margin:0 0 20px;font-size:15px;color:#374151">
        สวัสดีคุณ <strong>${freelancerName}</strong><br>
        ระบบได้รับคำขอเบิกจ่ายของคุณแล้ว กรุณารอการอนุมัติจาก Admin
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:10px 0;color:#6b7280;width:40%">รายละเอียดงาน</td>
          <td style="padding:10px 0;color:#111827">${jobTitle}</td>
        </tr>
        <tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:10px 0;color:#6b7280">วันที่ทำงาน</td>
          <td style="padding:10px 0;color:#111827">${workDatesText}</td>
        </tr>
        <tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:10px 0;color:#6b7280">จำนวนขอเบิก</td>
          <td style="padding:10px 0;color:#111827;font-weight:600">${formatCurrency(amount)}</td>
        </tr>
        <tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:10px 0;color:#6b7280">ภาษีหัก ณ ที่จ่าย 3%</td>
          <td style="padding:10px 0;color:#6b7280">−${formatCurrency(tax)}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#374151;font-weight:600">ยอดที่จะได้รับ</td>
          <td style="padding:10px 0;color:#f73727;font-weight:700;font-size:16px">${formatCurrency(net)}</td>
        </tr>
      </table>
      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;text-align:center">
        ส่งเมื่อ ${thaiDate}
      </p>
    </div>
  </div>
</body>
</html>`;
        const { error: freelancerError } = await resend.emails.send({
            from: `LiveTubeX Notify <${mailFrom}>`,
            to: freelancerEmail,
            subject: `[LiveTubeX] ส่งคำขอเบิกจ่ายสำเร็จ — ${formatCurrency(amount)}`,
            html: freelancerHtml,
        });
        if (freelancerError) {
            console.warn(`[sendPaymentNotification] ⚠️ Freelancer email failed:`, freelancerError);
        }
        else {
            console.log(`[sendPaymentNotification] ✅ Freelancer email sent to ${freelancerEmail}`);
        }
    }
    return { success: true, emailId: data?.id };
});
function fetchLineProfile(accessToken) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.line.me',
            path: '/v2/profile',
            method: 'GET',
            headers: { Authorization: `Bearer ${accessToken}` },
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode === 200) {
                        resolve(parsed);
                    }
                    else {
                        // LINE API คืน error เช่น token หมดอายุ
                        reject(new https_1.HttpsError('unauthenticated', `LINE API returned ${res.statusCode}: ${parsed.message ?? data}`));
                    }
                }
                catch {
                    reject(new https_1.HttpsError('internal', `Failed to parse LINE response: ${data}`));
                }
            });
        });
        req.on('error', (err) => {
            reject(new https_1.HttpsError('internal', `Network error calling LINE API: ${err.message}`));
        });
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new https_1.HttpsError('deadline-exceeded', 'LINE API request timed out'));
        });
        req.end();
    });
}
exports.lineAuth = (0, https_1.onCall)({
    // CORS: อนุญาต Firebase Hosting domain
    cors: [
        'https://livetubex-admin.web.app',
        'https://livetubex-admin.firebaseapp.com',
        'https://console.livetubex.com',
        /localhost/,
    ],
}, async (request) => {
    // ── 1. Validate input ──────────────────────────────────────────────────
    const { accessToken } = (request.data ?? {});
    if (!accessToken || typeof accessToken !== 'string' || accessToken.trim() === '') {
        throw new https_1.HttpsError('invalid-argument', 'accessToken is required and must be a non-empty string');
    }
    // ── 2. ยืนยัน LINE Access Token ────────────────────────────────────────
    let lineProfile;
    try {
        lineProfile = await fetchLineProfile(accessToken.trim());
    }
    catch (err) {
        // re-throw HttpsError ที่สร้างใน fetchLineProfile
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError('unauthenticated', 'Failed to verify LINE access token');
    }
    if (!lineProfile.userId) {
        throw new https_1.HttpsError('unauthenticated', 'LINE profile did not return userId');
    }
    // ── 3. ออก Firebase Custom Token ──────────────────────────────────────
    // NOTE: Service Account ต้องมี role "Service Account Token Creator"
    // ไปเพิ่มที่ https://console.cloud.google.com/iam-admin/iam
    let firebaseToken;
    try {
        firebaseToken = await admin.auth().createCustomToken(lineProfile.userId, {
            lineUser: true,
            displayName: lineProfile.displayName,
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // ช่วย debug: ถ้า error เกี่ยวกับ IAM จะขึ้น PERMISSION_DENIED
        if (msg.includes('PERMISSION_DENIED') || msg.includes('iam.serviceAccounts.signBlob')) {
            throw new https_1.HttpsError('permission-denied', 'Service account is missing "Service Account Token Creator" role. ' +
                'Go to https://console.cloud.google.com/iam-admin/iam and add the role.');
        }
        throw new https_1.HttpsError('internal', `createCustomToken failed: ${msg}`);
    }
    return {
        firebaseToken,
        lineUserId: lineProfile.userId,
        displayName: lineProfile.displayName,
        pictureUrl: lineProfile.pictureUrl ?? '',
    };
});
// ── แจ้งโอนเงินสำเร็จให้ Freelancer (Admin เรียกจากหน้าเตรียมจ่ายเงิน) ─────
exports.sendPayoutNotification = (0, https_1.onCall)({
    cors: [
        'https://livetubex-admin.web.app',
        'https://livetubex-admin.firebaseapp.com',
        'https://console.livetubex.com',
        /localhost/,
    ],
    secrets: [RESEND_API_KEY, MAIL_FROM, LINE_CHANNEL_ACCESS_TOKEN],
}, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    const { freelancerId, paymentIds, payoutSlipPath } = (request.data ?? {});
    if (!freelancerId || !Array.isArray(paymentIds) || paymentIds.length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'Missing freelancerId or paymentIds');
    }
    // ── ดึงข้อมูล freelancer ──────────────────────────────────────────────
    const freelancerSnap = await admin.firestore().collection('freelancers').doc(freelancerId).get();
    if (!freelancerSnap.exists)
        throw new https_1.HttpsError('not-found', 'Freelancer not found');
    const fl = freelancerSnap.data();
    const freelancerEmail = fl.email?.trim();
    const freelancerName = fl.name ?? '-';
    const bankName = fl.bankName ?? '-';
    const bankAccount = fl.bankAccount ?? '-';
    const lineUserId = fl.lineUserId?.trim();
    // ── ดึงข้อมูล payments + job titles ──────────────────────────────────
    const formatCurr = (n) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(n);
    const paymentDocs = await Promise.all(paymentIds.map((id) => admin.firestore().collection('payments').doc(id).get()));
    const rows = [];
    let totalNet = 0;
    for (const snap of paymentDocs) {
        if (!snap.exists)
            continue;
        const p = snap.data();
        const amount = p.amount;
        const tax = Math.round(amount * 0.03);
        const net = amount - tax + (p.expenseAmount ?? 0);
        totalNet += net;
        let jobTitle = '-';
        const jobId = p.jobId;
        if (jobId) {
            const jobSnap = await admin.firestore().collection('jobs').doc(jobId).get();
            if (jobSnap.exists)
                jobTitle = jobSnap.data().title ?? '-';
        }
        rows.push({ jobTitle, position: p.position ?? '-', amount, net, tax });
    }
    // ── สร้าง URL สำหรับดูสลิป ────────────────────────────────────────────
    let slipUrl = null;
    if (payoutSlipPath) {
        try {
            const bucket = admin.storage().bucket();
            const file = bucket.file(payoutSlipPath);
            const [meta] = await file.getMetadata();
            const token = meta.metadata?.firebaseStorageDownloadTokens;
            if (token) {
                slipUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(payoutSlipPath)}?alt=media&token=${token}`;
            }
        }
        catch (e) {
            console.warn('[sendPayoutNotification] could not get slip URL:', e);
        }
    }
    const maskAccount = (acc) => {
        const clean = acc.replace(/\D/g, '');
        if (clean.length <= 4)
            return clean;
        return 'x'.repeat(clean.length - 4) + clean.slice(-4);
    };
    const rowsHtml = rows.map((r) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#111827">${r.jobTitle}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#374151">${r.position}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#111827;text-align:right;white-space:nowrap">${formatCurr(r.amount)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#059669;font-weight:600;text-align:right;white-space:nowrap">${formatCurr(r.net)}</td>
      </tr>`).join('');
    const slipSection = slipUrl ? `
      <div style="margin-top:24px;text-align:center">
        <a href="${slipUrl}"
           style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:12px 28px;border-radius:12px;font-weight:600;font-size:14px">
          ดูสลิปการโอนเงิน →
        </a>
      </div>` : '';
    const thaiNow = new Date().toLocaleDateString('th-TH', {
        year: 'numeric', month: 'long', day: 'numeric',
        timeZone: 'Asia/Bangkok',
    });
    const html = `
<!DOCTYPE html>
<html lang="th">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Helvetica Neue',Arial,sans-serif">
  <div style="max-width:580px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <div style="background:#059669;padding:24px 28px">
      <p style="margin:0;color:#fff;font-size:18px;font-weight:700">LiveTubeX</p>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px">แจ้งโอนเงินสำเร็จ</p>
    </div>
    <div style="padding:28px">
      <p style="margin:0 0 20px;font-size:15px;color:#374151">
        สวัสดีคุณ <strong>${freelancerName}</strong><br>
        ระบบได้ทำการโอนเงินให้คุณเรียบร้อยแล้ว
      </p>
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
            <td style="padding:12px;text-align:right;font-weight:700;color:#059669;font-size:16px;border-top:2px solid #e5e7eb">${formatCurr(totalNet)}</td>
          </tr>
        </tfoot>
      </table>
      <div style="margin-top:20px;padding:14px;background:#f9fafb;border-radius:10px;font-size:13px;color:#374151">
        <strong>โอนเข้าบัญชี:</strong> ${bankName} — ${maskAccount(bankAccount)}
      </div>
      ${slipSection}
      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;text-align:center">โอนเมื่อ ${thaiNow} · LiveTubeX</p>
    </div>
  </div>
</body>
</html>`;
    // ── ส่งอีเมล (ถ้ามี) ─────────────────────────────────────────────────
    let emailSent = false;
    if (freelancerEmail) {
        const resend = new resend_1.Resend(RESEND_API_KEY.value());
        const { error } = await resend.emails.send({
            from: `LiveTubeX Notify <${MAIL_FROM.value()}>`,
            to: freelancerEmail,
            subject: `[LiveTubeX] โอนเงินสำเร็จ ${formatCurr(totalNet)} — ${freelancerName}`,
            html,
        });
        if (error) {
            console.error('[sendPayoutNotification] email ❌', error);
        }
        else {
            emailSent = true;
            console.log(`[sendPayoutNotification] email ✅ sent to ${freelancerEmail}`);
        }
    }
    // ── ส่ง LINE push message ─────────────────────────────────────────────
    let lineSent = false;
    if (lineUserId) {
        try {
            const liffUrl = 'https://liff.line.me/2009681467-TEcRBohh/payments';
            const maskedAcc = `xxxxxx${bankAccount.replace(/\D/g, '').slice(-4)}`;
            const bankAbbr = abbrevBank(bankName);
            const flexMessage = {
                type: 'flex',
                altText: `LiveTubeX: ชำระเงินสำเร็จ ${formatCurr(totalNet)}`,
                sender: { name: 'LiveTubeX' },
                contents: {
                    type: 'bubble',
                    header: {
                        type: 'box',
                        layout: 'vertical',
                        backgroundColor: '#059669',
                        paddingAll: '16px',
                        contents: [
                            { type: 'text', text: 'LiveTubeX', color: '#ffffffBF', size: 'xs', weight: 'bold' },
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
            };
            await sendLineMessage(lineUserId, LINE_CHANNEL_ACCESS_TOKEN.value(), [flexMessage]);
            lineSent = true;
            console.log(`[sendPayoutNotification] LINE ✅ sent to ${lineUserId}`);
            // บันทึก log สำหรับ LINE message report
            const bangkokNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
            const month = `${bangkokNow.getFullYear()}-${String(bangkokNow.getMonth() + 1).padStart(2, '0')}`;
            await admin.firestore().collection('lineMessageLogs').add({
                sentAt: new Date().toISOString(),
                month,
                freelancerId,
                freelancerName,
                lineUserId,
                paymentCount: rows.length,
            });
        }
        catch (e) {
            console.warn('[sendPayoutNotification] LINE ❌', e);
        }
    }
    console.log(`[sendPayoutNotification] done — email:${emailSent} line:${lineSent}`);
    return { success: true, emailSent, lineSent };
});
exports.sendPaymentReport = (0, https_1.onCall)({
    cors: [
        'https://livetubex-admin.web.app',
        'https://livetubex-admin.firebaseapp.com',
        'https://console.livetubex.com',
        /localhost/,
    ],
    secrets: [RESEND_API_KEY, MAIL_FROM],
}, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    // Admin only (sign_in_provider == 'password')
    const provider = request.auth.token?.firebase;
    if (provider?.sign_in_provider !== 'password') {
        throw new https_1.HttpsError('permission-denied', 'Admin only');
    }
    const { reports } = (request.data ?? {});
    if (!reports || !Array.isArray(reports) || reports.length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'Missing reports data');
    }
    const mailFrom = MAIL_FROM.value();
    const resend = new resend_1.Resend(RESEND_API_KEY.value());
    const formatCurr = (n) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(n);
    const formatDates = (dates) => {
        if (!dates || dates.length === 0)
            return '-';
        return dates.map((d) => {
            const dt = new Date(d + 'T00:00:00');
            return dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
        }).join(', ');
    };
    const results = [];
    for (const report of reports) {
        const { freelancerEmail, freelancerName, period, payments, totalGross, totalTax, totalNet } = report;
        if (!freelancerEmail || !freelancerEmail.trim()) {
            console.warn(`[sendPaymentReport] skip ${freelancerName} — no email`);
            results.push({ email: freelancerEmail || '-', ok: false });
            continue;
        }
        const rows = payments.map((p) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#111827">${p.workDescription}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#374151">${p.position ?? '-'}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#374151;white-space:nowrap">${formatDates(p.workDates)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#111827;text-align:right;white-space:nowrap">${formatCurr(p.amount)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280;text-align:right;white-space:nowrap">−${formatCurr(Math.round(p.amount * 0.03))}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#059669;font-weight:600;text-align:right;white-space:nowrap">${formatCurr(p.amount - Math.round(p.amount * 0.03))}</td>
        </tr>`).join('');
        const html = `
<!DOCTYPE html>
<html lang="th">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Helvetica Neue',Arial,sans-serif">
  <div style="max-width:640px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <div style="background:#f73727;padding:24px 28px">
      <p style="margin:0;color:#fff;font-size:18px;font-weight:700">LiveTubeX</p>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px">สรุปรายได้ประจำ${period}</p>
    </div>
    <div style="padding:28px">
      <p style="margin:0 0 20px;font-size:15px;color:#374151">
        สวัสดีคุณ <strong>${freelancerName}</strong><br>
        นี่คือสรุปรายได้ของคุณประจำ<strong>${period}</strong>
      </p>
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
              <td style="padding:12px;text-align:right;font-weight:700;color:#f73727;font-size:15px;border-top:2px solid #e5e7eb">${formatCurr(totalNet)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div style="margin-top:24px;background:#f0fdf4;border-radius:12px;padding:16px;display:flex;align-items:center;gap:12px">
        <div>
          <p style="margin:0;font-size:13px;color:#374151">ยอดโอนสุทธิที่จะได้รับ (หักภาษี ณ ที่จ่าย 3%)</p>
          <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#059669">${formatCurr(totalNet)}</p>
        </div>
      </div>
      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;text-align:center">
        ออกโดย LiveTubeX · ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
    </div>
  </div>
</body>
</html>`;
        const { error } = await resend.emails.send({
            from: `LiveTubeX Notify <${mailFrom}>`,
            to: freelancerEmail.trim(),
            subject: `[LiveTubeX] สรุปรายได้ประจำ${period} — ${freelancerName}`,
            html,
        });
        if (error) {
            console.error(`[sendPaymentReport] ❌ ${freelancerEmail}:`, error);
            results.push({ email: freelancerEmail, ok: false });
        }
        else {
            console.log(`[sendPaymentReport] ✅ sent to ${freelancerEmail}`);
            results.push({ email: freelancerEmail, ok: true });
        }
    }
    return { results };
});
// ── Migrate LINE profile pictures → Firebase Storage (admin only) ──────────
// Backfill รูป profile ของ freelancer เก่าๆ ที่ยังไม่มี profileImagePath ใน Storage
// — server-side fetch จาก LINE CDN (ไม่มี CORS) แล้วอัพโหลดผ่าน admin SDK (bypass rules)
// flow ปกติ (sync ตอน LIFF login) ยังทำงานเหมือนเดิม — ฟังก์ชันนี้ใช้ตอน admin อยากเร่ง backfill
exports.migrateProfilePictures = (0, https_1.onCall)({
    cors: [
        'https://livetubex-admin.web.app',
        'https://livetubex-admin.firebaseapp.com',
        'https://console.livetubex.com',
        /localhost/,
    ],
    timeoutSeconds: 540, // 9 นาที — เผื่อ freelancer เยอะ
}, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    const provider = request.auth.token.firebase?.sign_in_provider;
    if (provider !== 'password') {
        throw new https_1.HttpsError('permission-denied', 'Admin only');
    }
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const snapshot = await db.collection('freelancers').get();
    const result = {
        total: snapshot.size,
        migrated: 0,
        skipped: 0,
        failed: [],
    };
    for (const doc of snapshot.docs) {
        const data = doc.data();
        const lineUserId = data.lineUserId?.trim();
        const linePictureUrl = data.linePictureUrl?.trim();
        const profileImagePath = data.profileImagePath?.trim();
        const name = data.name ?? doc.id;
        // ข้ามถ้าไม่มีรูปต้นทาง หรือ migrate แล้ว
        if (!lineUserId || !linePictureUrl || profileImagePath) {
            result.skipped++;
            continue;
        }
        try {
            const res = await fetch(linePictureUrl);
            if (!res.ok)
                throw new Error(`fetch ${res.status}`);
            const arrayBuffer = await res.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const contentType = res.headers.get('content-type') ?? 'image/jpeg';
            const path = `profilePictures/${lineUserId}/profile.jpg`;
            await bucket.file(path).save(buffer, {
                contentType,
                metadata: {
                    metadata: { uploadedBy: 'migration', source: 'line-profile' },
                },
            });
            await doc.ref.update({ profileImagePath: path });
            result.migrated++;
            console.log(`[migrateProfilePictures] ✅ ${name} (${doc.id})`);
        }
        catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            console.warn(`[migrateProfilePictures] ❌ ${name} (${doc.id}): ${reason}`);
            result.failed.push({ id: doc.id, name, reason });
        }
    }
    return result;
});
// ═══════════════════════════════════════════════════════════════════════════
// Admin Users & Roles — จัดการผู้ใช้แอดมิน + role (owner เท่านั้น)
// ═══════════════════════════════════════════════════════════════════════════
const BOOTSTRAP_OWNER_EMAIL = 't@livetubex.com';
const VALID_ROLES = ['owner', 'admin', 'accountant'];
const ADMIN_CORS = [
    'https://livetubex-admin.web.app',
    'https://livetubex-admin.firebaseapp.com',
    'https://console.livetubex.com',
    /localhost/,
];
/** ตรวจว่า caller เป็น owner (bootstrap email หรือ role=owner) — ไม่ใช่ → throw */
async function requireOwner(request) {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    const token = request.auth.token;
    if (token.firebase?.sign_in_provider !== 'password') {
        throw new https_1.HttpsError('permission-denied', 'Admin only');
    }
    const email = token.email?.toLowerCase();
    if (email === BOOTSTRAP_OWNER_EMAIL)
        return;
    if (token.role === 'owner')
        return;
    const doc = await admin.firestore().collection('adminUsers').doc(request.auth.uid).get();
    if (doc.exists && doc.data()?.role === 'owner')
        return;
    throw new https_1.HttpsError('permission-denied', 'เฉพาะ Owner เท่านั้นที่จัดการผู้ใช้ได้');
}
function assertRole(role) {
    if (typeof role !== 'string' || !VALID_ROLES.includes(role)) {
        throw new https_1.HttpsError('invalid-argument', 'role ไม่ถูกต้อง');
    }
    return role;
}
exports.adminListUsers = (0, https_1.onCall)({ cors: ADMIN_CORS }, async (request) => {
    await requireOwner(request);
    const db = admin.firestore();
    const [list, docsSnap] = await Promise.all([
        admin.auth().listUsers(1000),
        db.collection('adminUsers').get(),
    ]);
    const roleDocs = new Map();
    docsSnap.forEach((d) => roleDocs.set(d.id, d.data()));
    const users = list.users
        .filter((u) => u.providerData.some((p) => p.providerId === 'password'))
        .map((u) => {
        const doc = roleDocs.get(u.uid);
        const email = (u.email ?? '').toLowerCase();
        const role = doc?.role ?? (email === BOOTSTRAP_OWNER_EMAIL ? 'owner' : 'admin');
        return {
            uid: u.uid,
            email: u.email ?? '',
            name: doc?.name ?? u.displayName ?? '',
            role,
            disabled: u.disabled,
            createdAt: doc?.createdAt
                ?? (u.metadata.creationTime ? new Date(u.metadata.creationTime).toISOString() : ''),
        };
    })
        .sort((a, b) => a.email.localeCompare(b.email));
    return { users };
});
exports.adminCreateUser = (0, https_1.onCall)({ cors: ADMIN_CORS }, async (request) => {
    await requireOwner(request);
    const { email, password, name, role } = request.data ?? {};
    if (typeof email !== 'string' || !email.includes('@'))
        throw new https_1.HttpsError('invalid-argument', 'อีเมลไม่ถูกต้อง');
    if (typeof password !== 'string' || password.length < 6)
        throw new https_1.HttpsError('invalid-argument', 'รหัสผ่านอย่างน้อย 6 ตัว');
    const validRole = assertRole(role);
    const userRecord = await admin.auth().createUser({
        email: email.trim(),
        password,
        displayName: typeof name === 'string' ? name.trim() : undefined,
    }).catch((e) => { throw new https_1.HttpsError('already-exists', e?.message ?? 'สร้างผู้ใช้ไม่สำเร็จ'); });
    await admin.auth().setCustomUserClaims(userRecord.uid, { role: validRole });
    const now = new Date().toISOString();
    await admin.firestore().collection('adminUsers').doc(userRecord.uid).set({
        email: email.trim(),
        name: typeof name === 'string' ? name.trim() : '',
        role: validRole,
        disabled: false,
        createdAt: now,
        updatedAt: now,
        createdBy: request.auth?.token?.email ?? request.auth?.uid ?? '',
    });
    return { uid: userRecord.uid };
});
exports.adminUpdateUserRole = (0, https_1.onCall)({ cors: ADMIN_CORS }, async (request) => {
    await requireOwner(request);
    const { uid, role } = request.data ?? {};
    if (typeof uid !== 'string')
        throw new https_1.HttpsError('invalid-argument', 'uid ไม่ถูกต้อง');
    const validRole = assertRole(role);
    const target = await admin.auth().getUser(uid).catch(() => null);
    if (!target)
        throw new https_1.HttpsError('not-found', 'ไม่พบผู้ใช้');
    if ((target.email ?? '').toLowerCase() === BOOTSTRAP_OWNER_EMAIL && validRole !== 'owner') {
        throw new https_1.HttpsError('failed-precondition', 'เปลี่ยน role ของ owner ตั้งต้นไม่ได้');
    }
    await admin.auth().setCustomUserClaims(uid, { role: validRole });
    await admin.firestore().collection('adminUsers').doc(uid).set({
        email: target.email ?? '',
        name: target.displayName ?? '',
        role: validRole,
        updatedAt: new Date().toISOString(),
    }, { merge: true });
    return { ok: true };
});
exports.adminSetUserDisabled = (0, https_1.onCall)({ cors: ADMIN_CORS }, async (request) => {
    await requireOwner(request);
    const { uid, disabled } = request.data ?? {};
    if (typeof uid !== 'string' || typeof disabled !== 'boolean')
        throw new https_1.HttpsError('invalid-argument', 'ข้อมูลไม่ถูกต้อง');
    if (uid === request.auth?.uid)
        throw new https_1.HttpsError('failed-precondition', 'ปิดใช้งานบัญชีตัวเองไม่ได้');
    const target = await admin.auth().getUser(uid).catch(() => null);
    if (target && (target.email ?? '').toLowerCase() === BOOTSTRAP_OWNER_EMAIL) {
        throw new https_1.HttpsError('failed-precondition', 'ปิดใช้งาน owner ตั้งต้นไม่ได้');
    }
    await admin.auth().updateUser(uid, { disabled });
    await admin.firestore().collection('adminUsers').doc(uid).set({ disabled, updatedAt: new Date().toISOString() }, { merge: true });
    return { ok: true };
});
exports.adminDeleteUser = (0, https_1.onCall)({ cors: ADMIN_CORS }, async (request) => {
    await requireOwner(request);
    const { uid } = request.data ?? {};
    if (typeof uid !== 'string')
        throw new https_1.HttpsError('invalid-argument', 'uid ไม่ถูกต้อง');
    if (uid === request.auth?.uid)
        throw new https_1.HttpsError('failed-precondition', 'ลบบัญชีตัวเองไม่ได้');
    const target = await admin.auth().getUser(uid).catch(() => null);
    if (target && (target.email ?? '').toLowerCase() === BOOTSTRAP_OWNER_EMAIL) {
        throw new https_1.HttpsError('failed-precondition', 'ลบ owner ตั้งต้นไม่ได้');
    }
    await admin.auth().deleteUser(uid);
    await admin.firestore().collection('adminUsers').doc(uid).delete().catch(() => { });
    return { ok: true };
});
exports.adminResetUserPassword = (0, https_1.onCall)({ cors: ADMIN_CORS }, async (request) => {
    await requireOwner(request);
    const { uid, password } = request.data ?? {};
    if (typeof uid !== 'string')
        throw new https_1.HttpsError('invalid-argument', 'uid ไม่ถูกต้อง');
    if (typeof password !== 'string' || password.length < 6)
        throw new https_1.HttpsError('invalid-argument', 'รหัสผ่านอย่างน้อย 6 ตัว');
    await admin.auth().updateUser(uid, { password });
    return { ok: true };
});
//# sourceMappingURL=index.js.map