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
exports.handleSetPlanShare = handleSetPlanShare;
exports.handleGetSharedPlan = handleGetSharedPlan;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const crypto_1 = require("crypto");
const util_1 = require("util");
/**
 * แชร์แผนจัดอุปกรณ์ให้ทีมงานดูผ่านลิงก์ + รหัสผ่าน (ไม่ต้อง login)
 *
 * `planShares/{planId}` — client อ่านได้เฉพาะ admin, เขียนผ่าน function นี้เท่านั้น (hash รหัสผ่านฝั่ง server)
 * หน้า /share/plan เรียก getSharedPlan → ตรวจรหัสผ่าน → คืนแผนที่ตัดข้อมูลการเงินออกแล้ว
 * ⚠️ type ที่คืนเป็นฝาแฝดของ SharedPlan ใน lib/equipment/plan-share.ts
 */
const scrypt = (0, util_1.promisify)(crypto_1.scrypt);
const MIN_PASSWORD = 4;
const MAX_PASSWORD = 64;
/** ผิดติดกันเท่านี้ → ล็อกลิงก์ชั่วคราว (กันสุ่มรหัส) */
const MAX_FAILS = 8;
const LOCK_MS = 10 * 60 * 1000;
async function hashPassword(password, salt) {
    return scrypt(password, salt, 32);
}
function newShareId() {
    // 16 byte → base64url 22 ตัว เดาไม่ได้ — ลิงก์เองก็เป็นความลับชั้นแรก รหัสผ่านเป็นชั้นที่สอง
    return (0, crypto_1.randomBytes)(16).toString('base64url');
}
/** admin: เปิด/ปิด/ตั้งรหัสผ่าน/เปลี่ยนลิงก์ */
async function handleSetPlanShare(data, adminEmail) {
    const d = (data ?? {});
    const planId = typeof d.planId === 'string' ? d.planId : '';
    if (!planId)
        throw new https_1.HttpsError('invalid-argument', 'ต้องระบุแผน');
    const db = admin.firestore();
    const plan = await db.collection('equipmentPlans').doc(planId).get();
    if (!plan.exists)
        throw new https_1.HttpsError('not-found', 'ไม่พบแผนนี้');
    const ref = db.collection('planShares').doc(planId);
    const cur = (await ref.get()).data();
    const password = typeof d.password === 'string' ? d.password : '';
    if (password && (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD)) {
        throw new https_1.HttpsError('invalid-argument', `รหัสผ่านต้องยาว ${MIN_PASSWORD}–${MAX_PASSWORD} ตัวอักษร`);
    }
    if (!cur && !password)
        throw new https_1.HttpsError('invalid-argument', 'ตั้งรหัสผ่านก่อนเปิดลิงก์');
    let salt = cur?.salt ?? '';
    let hash = cur?.hash ?? '';
    if (password) {
        const s = (0, crypto_1.randomBytes)(16);
        salt = s.toString('hex');
        hash = (await hashPassword(password, s)).toString('hex');
    }
    const next = {
        planId,
        shareId: !cur || d.regenerate === true ? newShareId() : cur.shareId,
        enabled: typeof d.enabled === 'boolean' ? d.enabled : cur?.enabled ?? true,
        salt,
        hash,
        // เปลี่ยนรหัส/ลิงก์ = ปลดล็อกให้ด้วย
        failCount: 0,
        lockedUntil: 0,
        updatedAt: new Date().toISOString(),
        ...(adminEmail ? { updatedBy: adminEmail } : {}),
    };
    await ref.set(next);
    return { shareId: next.shareId, enabled: next.enabled };
}
/** สาธารณะ: ตรวจรหัสผ่านแล้วคืนแผนแบบตัดข้อมูลการเงิน */
async function handleGetSharedPlan(data) {
    const d = (data ?? {});
    const shareId = typeof d.shareId === 'string' ? d.shareId.trim() : '';
    const password = typeof d.password === 'string' ? d.password : '';
    // ข้อความเดียวกันทั้ง "ไม่มีลิงก์" และ "ปิดแล้ว" — ไม่บอกคนนอกว่าลิงก์ไหนเคยมีจริง
    const notFound = () => new https_1.HttpsError('not-found', 'ลิงก์นี้ไม่ถูกต้องหรือถูกปิดแล้ว');
    if (!/^[A-Za-z0-9_-]{10,64}$/.test(shareId))
        throw notFound();
    if (!password || password.length > MAX_PASSWORD)
        throw new https_1.HttpsError('permission-denied', 'รหัสผ่านไม่ถูกต้อง');
    const db = admin.firestore();
    const snap = await db.collection('planShares').where('shareId', '==', shareId).limit(1).get();
    if (snap.empty)
        throw notFound();
    const ref = snap.docs[0].ref;
    const share = snap.docs[0].data();
    if (!share.enabled)
        throw notFound();
    const now = Date.now();
    if ((share.lockedUntil ?? 0) > now) {
        const min = Math.ceil(((share.lockedUntil ?? 0) - now) / 60000);
        throw new https_1.HttpsError('resource-exhausted', `ใส่รหัสผิดหลายครั้ง — ลองใหม่ในอีก ${min} นาที`);
    }
    const expected = Buffer.from(share.hash, 'hex');
    const got = await hashPassword(password, Buffer.from(share.salt, 'hex'));
    const ok = expected.length === got.length && (0, crypto_1.timingSafeEqual)(expected, got);
    if (!ok) {
        await db.runTransaction(async (tx) => {
            const cur = (await tx.get(ref)).data();
            const fails = (cur?.failCount ?? 0) + 1;
            tx.update(ref, fails >= MAX_FAILS ? { failCount: 0, lockedUntil: now + LOCK_MS } : { failCount: fails });
        });
        throw new https_1.HttpsError('permission-denied', 'รหัสผ่านไม่ถูกต้อง');
    }
    if (share.failCount)
        await ref.update({ failCount: 0 });
    const planSnap = await db.collection('equipmentPlans').doc(share.planId).get();
    if (!planSnap.exists)
        throw notFound();
    return sanitizePlan(planSnap.data());
}
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined && o[k] !== null).map((k) => [k, o[k]]));
/**
 * ตัดเฉพาะที่ทีมหน้างานต้องใช้ — ไม่ส่งต้นทุน/ผู้ให้เช่า/เลขรายจ่าย/ค่าใช้จ่ายอื่น/jobId
 * (เพิ่ม field ใหม่ให้ PlanItem แล้วไม่ต้องห่วงว่าจะหลุด เพราะใช้ allowlist)
 */
function sanitizePlan(p) {
    const items = (p.items ?? []).map((it) => pick(it, [
        'id', 'code', 'name', 'category', 'quantity', 'fromLocation', 'toLocation', 'note', 'attachedTo', 'origin', 'packed', 'returned', 'useFrom', 'useTo',
    ]));
    const layouts = (p.layouts ?? []).map((l) => {
        const venue = { ...l.venue };
        // รูป floor plan อยู่ใน collection admin-only — ไม่ส่ง (ผังวางยังดูได้ แค่ไม่มีรูปปูพื้น)
        delete venue.floorImageId;
        return { id: l.id, name: l.name, venue, objects: l.objects ?? [] };
    });
    const revision = p.revision;
    return {
        ...pick(p, ['title', 'jobTitle', 'date', 'endDate', 'location', 'notes', 'status', 'videoFormat', 'recordings', 'fohFeeds', 'updatedAt']),
        items,
        diagrams: p.diagrams ?? [],
        layouts,
        ...(revision ? { revision: pick(revision, ['number', 'label', 'savedAt']) } : {}),
    };
}
//# sourceMappingURL=plan-share.js.map