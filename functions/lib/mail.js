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
exports.DEFAULT_MAIL_SETTINGS = exports.DEFAULT_TEMPLATES = void 0;
exports.getMailSettings = getMailSettings;
exports.renderVars = renderVars;
exports.renderEmailShell = renderEmailShell;
exports.buildFrom = buildFrom;
exports.adminRecipients = adminRecipients;
exports.sendMail = sendMail;
const admin = __importStar(require("firebase-admin"));
const resend_1 = require("resend");
const nodemailer = __importStar(require("nodemailer"));
// ── ค่าตั้งต้น ────────────────────────────────────────────────────────────────
// ข้อความเดียวกับที่ hardcode ไว้เดิม — tenant ที่ไม่แก้อะไรจะได้เมลหน้าตาเหมือนเดิม
exports.DEFAULT_TEMPLATES = {
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
};
exports.DEFAULT_MAIL_SETTINGS = {
    provider: 'resend',
    fromName: '',
    fromEmail: '',
    replyTo: '',
    adminRecipients: [],
    smtp: { host: '', port: 587, secure: false, user: '' },
    templates: exports.DEFAULT_TEMPLATES,
};
// ── โหลด config ───────────────────────────────────────────────────────────────
let cache = null;
function mergeTemplates(raw) {
    const stored = (raw ?? {});
    const out = {};
    for (const key of Object.keys(exports.DEFAULT_TEMPLATES)) {
        const d = exports.DEFAULT_TEMPLATES[key];
        const s = stored[key] ?? {};
        out[key] = {
            enabled: typeof s.enabled === 'boolean' ? s.enabled : d.enabled,
            // ช่องที่ลูกค้าลบจนว่าง → ใช้ค่า default ไม่ใช่ปล่อยเมลหัวข้อว่าง
            subject: (s.subject ?? '').trim() || d.subject,
            heading: (s.heading ?? '').trim() || d.heading,
            intro: (s.intro ?? '').trim() || d.intro,
            footer: (s.footer ?? '').trim() || d.footer,
        };
    }
    return out;
}
/** cache ต่อ instance — config แทบไม่เปลี่ยน, instance รีไซเคิลเองอยู่แล้ว */
async function getMailSettings() {
    if (cache)
        return cache;
    let d = {};
    try {
        d = ((await admin.firestore().doc('settings/mail').get()).data() ?? {});
    }
    catch (e) {
        console.error('[getMailSettings] อ่าน mail config ไม่ได้ ใช้ค่า default:', e);
    }
    const smtp = (d.smtp ?? {});
    cache = {
        provider: d.provider === 'smtp' ? 'smtp' : 'resend',
        fromName: (d.fromName ?? '').trim(),
        fromEmail: (d.fromEmail ?? '').trim(),
        replyTo: (d.replyTo ?? '').trim(),
        adminRecipients: Array.isArray(d.adminRecipients)
            ? d.adminRecipients.map((s) => s.trim()).filter(Boolean)
            : [],
        smtp: {
            host: (smtp.host ?? '').trim(),
            port: Number(smtp.port) > 0 ? Number(smtp.port) : 587,
            secure: smtp.secure === true,
            user: (smtp.user ?? '').trim(),
        },
        templates: mergeTemplates(d.templates),
    };
    return cache;
}
// ── Template ─────────────────────────────────────────────────────────────────
/** แทนที่ {{var}} — ตัวแปรที่ไม่รู้จักถูกลบทิ้ง ไม่ปล่อย {{...}} ให้ผู้รับเห็น */
function renderVars(tpl, vars) {
    return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k) => vars[k] ?? '');
}
/** โครงการ์ดกลางของอีเมลทุกฉบับ */
function renderEmailShell(o) {
    const cta = o.cta?.url
        ? `
      <div style="margin-top:28px;text-align:center">
        <a href="${o.cta.url}"
           style="display:inline-block;background:${o.primaryColor};color:#fff;text-decoration:none;padding:12px 28px;border-radius:12px;font-weight:600;font-size:14px">
          ${o.cta.label}
        </a>
      </div>`
        : '';
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
</html>`;
}
/** ที่อยู่ผู้ส่งแบบเต็ม `ชื่อ <อีเมล>` */
function buildFrom(cfg, creds, appName) {
    const email = cfg.fromEmail || creds.fallbackFrom;
    const name = cfg.fromName || `${appName} Notify`;
    return `${name} <${email}>`;
}
/** ผู้รับฝั่ง admin — Firestore ก่อน ไม่มีค่อยใช้ secret เดิม */
function adminRecipients(cfg, creds) {
    if (cfg.adminRecipients.length)
        return cfg.adminRecipients;
    return creds.fallbackAdminTo ? [creds.fallbackAdminTo] : [];
}
async function sendMail(cfg, creds, msg) {
    const to = Array.isArray(msg.to) ? msg.to : [msg.to];
    if (!to.length)
        return { error: 'ไม่มีผู้รับ' };
    if (cfg.provider === 'smtp') {
        if (!cfg.smtp.host || !cfg.smtp.user) {
            return { error: 'ยังตั้งค่า SMTP ไม่ครบ (host / user)' };
        }
        try {
            const transport = nodemailer.createTransport({
                host: cfg.smtp.host,
                port: cfg.smtp.port,
                secure: cfg.smtp.secure,
                auth: { user: cfg.smtp.user, pass: creds.smtpPassword },
            });
            const info = await transport.sendMail({
                from: msg.from,
                to,
                replyTo: cfg.replyTo || undefined,
                subject: msg.subject,
                html: msg.html,
            });
            return { id: info.messageId };
        }
        catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
        }
    }
    // ── Resend ──
    if (!creds.resendApiKey)
        return { error: 'ยังไม่ได้ตั้ง RESEND_API_KEY' };
    try {
        const resend = new resend_1.Resend(creds.resendApiKey);
        const { data, error } = await resend.emails.send({
            from: msg.from,
            to,
            replyTo: cfg.replyTo || undefined,
            subject: msg.subject,
            html: msg.html,
        });
        if (error)
            return { error: error.message };
        return { id: data?.id };
    }
    catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
    }
}
//# sourceMappingURL=mail.js.map