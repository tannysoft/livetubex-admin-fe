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
exports.verifyLineSignature = verifyLineSignature;
exports.fetchGroupSummary = fetchGroupSummary;
exports.handleLineEvents = handleLineEvents;
const admin = __importStar(require("firebase-admin"));
const crypto_1 = require("crypto");
const https = __importStar(require("https"));
/** ตรวจลายเซ็น x-line-signature = base64(HMAC-SHA256(channel secret, raw body)) */
function verifyLineSignature(rawBody, signature, secret) {
    if (!signature || !secret)
        return false;
    const expected = (0, crypto_1.createHmac)('sha256', secret).update(rawBody).digest();
    let got;
    try {
        got = Buffer.from(signature, 'base64');
    }
    catch {
        return false;
    }
    return got.length === expected.length && (0, crypto_1.timingSafeEqual)(got, expected);
}
function getJson(path, token) {
    return new Promise((resolve, reject) => {
        const req = https.request({ hostname: 'api.line.me', path, method: 'GET', headers: { Authorization: `Bearer ${token}` } }, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    }
                    catch (e) {
                        reject(e);
                    }
                }
                else
                    reject(new Error(`LINE API ${res.statusCode}: ${data}`));
            });
        });
        req.on('error', reject);
        req.end();
    });
}
/** ชื่อ/รูปกลุ่ม — ต้องใช้ token ของบอทที่อยู่ในกลุ่มนั้น */
async function fetchGroupSummary(groupId, token) {
    try {
        const s = await getJson(`/v2/bot/group/${encodeURIComponent(groupId)}/summary`, token);
        return { name: s.groupName ?? '', ...(s.pictureUrl ? { pictureUrl: s.pictureUrl } : {}) };
    }
    catch (e) {
        console.warn('[lineWebhook] group summary ❌', groupId, e);
        return null;
    }
}
const SUMMARY_TTL_MS = 6 * 60 * 60 * 1000; // ชื่อกลุ่มเปลี่ยนได้ — ดึงใหม่อย่างมากทุก 6 ชม. (ไม่ยิงทุกข้อความ)
async function handleLineEvents(events, token) {
    const db = admin.firestore();
    const now = new Date().toISOString();
    // 1 webhook มีหลาย event ของกลุ่มเดียวกันได้ — ทำกลุ่มละครั้ง (event สุดท้ายชนะ)
    const byGroup = new Map();
    for (const ev of events) {
        const gid = ev.source?.type === 'group' ? ev.source.groupId : undefined;
        if (gid)
            byGroup.set(gid, ev.type);
    }
    for (const [groupId, type] of byGroup) {
        const ref = db.collection('lineGroups').doc(groupId);
        if (type === 'leave') {
            await ref.set({ groupId, active: false, leftAt: now, lastEventAt: now }, { merge: true });
            continue;
        }
        const cur = (await ref.get()).data();
        const stale = !cur?.name || !cur.lastEventAt || Date.now() - new Date(cur.lastEventAt).getTime() > SUMMARY_TTL_MS;
        const summary = stale || type === 'join' ? await fetchGroupSummary(groupId, token) : null;
        await ref.set({
            groupId,
            active: true,
            lastEventAt: now,
            ...(type === 'join' ? { joinedAt: now } : {}),
            ...(summary ? { name: summary.name || cur?.name || 'กลุ่ม LINE', ...(summary.pictureUrl ? { pictureUrl: summary.pictureUrl } : {}) } : cur?.name ? {} : { name: 'กลุ่ม LINE' }),
        }, { merge: true });
    }
}
//# sourceMappingURL=line-groups.js.map