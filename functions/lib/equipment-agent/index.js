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
exports.handleEquipmentAgent = handleEquipmentAgent;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const graph_1 = require("./graph");
const workspace_1 = require("./workspace");
const MAX_INSTRUCTION = 4000;
const MAX_PROMPT = 30000;
const MAX_RULES = 8000;
/** ตรงกับ MODEL_ID_PATTERN ใน lib/equipment/agent-settings.ts */
const MODEL_ID_PATTERN = /^claude-[a-z0-9.-]+$/;
/** ตรวจ payload แบบหยาบ — ข้อมูลมาจากหน้าเว็บของ admin เอง แต่กัน payload เพี้ยน/ใหญ่เกิน */
function parseRequest(data) {
    const d = data;
    const instruction = typeof d?.instruction === 'string' ? d.instruction.trim() : '';
    if (!instruction)
        throw new https_1.HttpsError('invalid-argument', 'ต้องมีคำสั่ง');
    if (instruction.length > MAX_INSTRUCTION)
        throw new https_1.HttpsError('invalid-argument', `คำสั่งยาวเกิน ${MAX_INSTRUCTION} ตัวอักษร`);
    const plan = d?.plan;
    if (!plan || typeof plan.id !== 'string' || !Array.isArray(plan.items) || !Array.isArray(plan.diagrams)) {
        throw new https_1.HttpsError('invalid-argument', 'ข้อมูลแผนไม่ครบ');
    }
    if (plan.items.length > 800 || plan.diagrams.length > 30)
        throw new https_1.HttpsError('invalid-argument', 'แผนใหญ่เกินกว่าที่ผู้ช่วยรองรับ');
    const history = (Array.isArray(d?.history) ? d.history : [])
        .filter((h) => (h.role === 'user' || h.role === 'assistant') && typeof h.text === 'string')
        .slice(-12)
        .map((h) => ({ role: h.role, text: h.text.slice(0, 4000) }));
    const text = (v, max, label) => {
        if (v == null)
            return undefined;
        if (typeof v !== 'string')
            throw new https_1.HttpsError('invalid-argument', `${label} ต้องเป็นข้อความ`);
        if (v.length > max)
            throw new https_1.HttpsError('invalid-argument', `${label} ยาวเกิน ${max} ตัวอักษร`);
        return v;
    };
    return {
        plan, instruction, history,
        model: typeof d?.model === 'string' && MODEL_ID_PATTERN.test(d.model) ? d.model : graph_1.DEFAULT_MODEL,
        systemPrompt: text(d?.systemPrompt, MAX_PROMPT, 'system prompt'),
        rules: text(d?.rules, MAX_RULES, 'กฎของทีม'),
        phase: d?.phase === 'items' || d?.phase === 'wiring' ? d.phase : 'all',
        effort: d?.effort === 'low' || d?.effort === 'medium' || d?.effort === 'high' ? d.effort : 'medium',
    };
}
function planRange(p) {
    if (!p.date)
        return null;
    return [p.date, p.endDate && p.endDate >= p.date ? p.endDate : p.date];
}
/** ฝาแฝดของ usageByEquipment() ใน lib/equipment/availability.ts — แผนอื่นที่วันทับกันและยังไม่ returned */
async function loadOtherUsage(plan) {
    const mine = planRange(plan);
    const usage = { bookings: new Map(), plans: new Map(), noDate: !mine };
    if (!mine)
        return usage;
    const snap = await admin.firestore().collection('equipmentPlans').get();
    for (const doc of snap.docs) {
        if (doc.id === plan.id)
            continue;
        const p = doc.data();
        if (p.status === 'returned')
            continue;
        const r = planRange(p);
        if (!r || r[0] > mine[1] || mine[0] > r[1])
            continue;
        for (const it of p.items ?? []) {
            if (!it.equipmentId)
                continue;
            // แถวที่ใช้ไม่เต็มงานจองเฉพาะวันที่ใช้ — ไม่ทับวันงานนี้ = ไม่นับ
            const ir = (0, workspace_1.clipRange)(it, { start: r[0], end: r[1] });
            if (ir.start > mine[1] || mine[0] > ir.end)
                continue;
            const list = usage.bookings.get(it.equipmentId) ?? [];
            list.push({ quantity: it.quantity || 0, start: ir.start, end: ir.end, title: p.title ?? doc.id });
            usage.bookings.set(it.equipmentId, list);
            const names = usage.plans.get(it.equipmentId) ?? [];
            if (!names.includes(p.title ?? doc.id))
                names.push(p.title ?? doc.id);
            usage.plans.set(it.equipmentId, names);
        }
    }
    return usage;
}
async function handleEquipmentAgent(data, apiKey, onEvent) {
    const req = parseRequest(data);
    if (!apiKey)
        throw new https_1.HttpsError('failed-precondition', 'ยังไม่ได้ตั้ง ANTHROPIC_API_KEY ใน Secret Manager');
    const [eqSnap, usage] = await Promise.all([
        admin.firestore().collection('equipment').get(),
        loadOtherUsage(req.plan),
    ]);
    const equipment = eqSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const ws = new workspace_1.Workspace(req.plan, equipment, usage);
    let result;
    try {
        result = await (0, graph_1.runAgentGraph)({
            ws, apiKey, model: req.model ?? graph_1.DEFAULT_MODEL, systemPrompt: req.systemPrompt, rules: req.rules,
            instruction: req.instruction, history: req.history ?? [], onEvent, phase: req.phase, effort: req.effort,
        });
    }
    catch (err) {
        console.error('equipmentAgent failed', err);
        const known = (0, graph_1.describeApiError)(err);
        if (known)
            throw new https_1.HttpsError(known.code, known.message);
        throw new https_1.HttpsError('internal', 'ผู้ช่วย AI ทำงานไม่สำเร็จ');
    }
    return {
        items: ws.items,
        diagrams: ws.diagrams,
        newDiagramIds: [...ws.newDiagramIds],
        newNodeIds: [...ws.newNodeIds],
        placements: ws.placements,
        ...result,
    };
}
//# sourceMappingURL=index.js.map