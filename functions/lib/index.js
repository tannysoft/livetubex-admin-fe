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
exports.sendPaymentReport = exports.lineAuth = exports.sendPaymentNotification = void 0;
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
//# sourceMappingURL=index.js.map