"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTools = buildTools;
const tools_1 = require("@langchain/core/tools");
const zod_1 = require("zod");
const types_1 = require("./types");
/** ใช้ไม่เต็มงาน — จองคิวเฉพาะวันที่ใช้ (งานหลายวันเท่านั้น) ไม่ใส่ = ทั้งงาน */
const USE_RANGE = {
    useFrom: zod_1.z.string().optional().describe('ใช้ไม่เต็มงาน: วันแรกที่ใช้ YYYY-MM-DD (อยู่ในวันงาน) — ไม่ใส่ = ทั้งงาน'),
    useTo: zod_1.z.string().optional().describe('วันสุดท้ายที่ใช้ YYYY-MM-DD'),
};
const category = zod_1.z.enum(types_1.CATEGORIES).describe('หมวดอุปกรณ์');
const signal = zod_1.z.enum(types_1.SIGNALS).describe('ประเภทสาย/สัญญาณ');
/**
 * tool ทุกตัวทำงานกับ Workspace (ร่างในหน่วยความจำ) — ไม่มีตัวไหนเขียน Firestore
 * ผลลัพธ์เป็นข้อความสั้น ✓/✗ ต่อบรรทัด ให้ LLM เห็นทันทีว่าอะไรไม่ผ่านและแก้เองได้
 */
function buildTools(ws, onFinish) {
    return [
        (0, tools_1.tool)(async () => ws.inventoryOverview(), {
            name: 'inventory_overview',
            description: 'ภาพรวมสต็อกต่อหมวด และจำนวนที่ยังว่างในช่วงวันของงานนี้ เรียกก่อนเลือกของ',
            schema: zod_1.z.object({}),
        }),
        (0, tools_1.tool)(async (a) => ws.searchInventory(a), {
            name: 'search_inventory',
            description: 'ค้นอุปกรณ์ในสต็อก (ของบริษัท/พาร์ทเนอร์/ของเช่า) คืน id, จำนวนว่าง, จำนวน port — id ที่ใช้กับ add_items ต้องมาจากที่นี่เท่านั้น',
            schema: zod_1.z.object({
                query: zod_1.z.string().optional().describe('คำค้น เช่น "atem", "sdi", "mars 400", "สาย sdi"'),
                category: category.optional(),
                ownership: zod_1.z.enum(['owned', 'rental', 'partner']).optional(),
                onlyAvailable: zod_1.z.boolean().optional().describe('true = เฉพาะที่ยังว่าง'),
                limit: zod_1.z.number().int().optional(),
            }),
        }),
        (0, tools_1.tool)(async ({ equipmentIds }) => ws.getPorts(equipmentIds), {
            name: 'get_ports',
            description: 'ชื่อ port IN/OUT/IO ของอุปกรณ์ในสต็อก — ใช้ดูก่อนวางแผนการโยง',
            schema: zod_1.z.object({ equipmentIds: zod_1.z.array(zod_1.z.string()).min(1).max(30) }),
        }),
        (0, tools_1.tool)(async () => ws.listPlan(), {
            name: 'list_plan',
            description: 'ดูร่างปัจจุบัน: รายการอุปกรณ์ (item id) และผังระบบ (node id, port ที่ใช้แล้ว, เส้น)',
            schema: zod_1.z.object({}),
        }),
        (0, tools_1.tool)(async ({ items }) => ws.addItems(items), {
            name: 'add_items',
            description: 'หยิบของจากสต็อกเข้าแผน (เช็กของว่างให้) — toLocation = ปลายทางที่ของไปอยู่ในงาน · ของในชุดกล้อง (เลนส์, ขาตั้ง, converter/fiber ฝั่งกล้อง, ส่งภาพไร้สาย, gimbal) ใส่ attachTo = item id ของกล้อง — แยกแถว quantity 1 ต่อกล้อง',
            schema: zod_1.z.object({
                items: zod_1.z.array(zod_1.z.object({
                    equipmentId: zod_1.z.string(),
                    quantity: zod_1.z.number().int().min(1),
                    toLocation: zod_1.z.string().optional(),
                    note: zod_1.z.string().optional(),
                    attachTo: zod_1.z.string().optional().describe('item id ของกล้องที่ของชิ้นนี้อยู่ในชุด (เลนส์, ขาตั้ง, converter ฝั่งกล้อง, TX) — ปลายทางตามกล้องให้เอง'),
                    ...USE_RANGE,
                })).min(1),
            }),
        }),
        (0, tools_1.tool)(async ({ items }) => ws.addExternalItems(items), {
            name: 'add_external_items',
            description: 'เพิ่มของที่ไม่มีในสต็อก (ต้องเช่า/ยืมเพิ่ม) — ใช้เมื่อค้นในสต็อกแล้วไม่มีหรือไม่พอเท่านั้น และต้องแจ้งผู้ใช้ใน finish',
            schema: zod_1.z.object({
                items: zod_1.z.array(zod_1.z.object({
                    name: zod_1.z.string(),
                    category,
                    quantity: zod_1.z.number().int().min(1),
                    origin: zod_1.z.enum(['rental', 'partner']).optional(),
                    vendor: zod_1.z.string().optional(),
                    unitCost: zod_1.z.number().min(0).optional().describe('ราคาเช่า/ชิ้น/วัน ถ้ารู้ ไม่รู้ = ไม่ต้องใส่'),
                    rentalDays: zod_1.z.number().int().min(1).optional(),
                    toLocation: zod_1.z.string().optional(),
                    note: zod_1.z.string().optional(),
                    ...USE_RANGE,
                })).min(1),
            }),
        }),
        (0, tools_1.tool)(async ({ updates }) => ws.updateItems(updates), {
            name: 'update_items',
            description: 'แก้จำนวน / หยิบจาก / ปลายทาง / หมายเหตุ / กล้องที่เลนส์จับคู่ / วันที่ใช้ ของแถวในแผน',
            schema: zod_1.z.object({
                updates: zod_1.z.array(zod_1.z.object({
                    itemId: zod_1.z.string(),
                    quantity: zod_1.z.number().int().min(1).optional(),
                    fromLocation: zod_1.z.string().optional(),
                    toLocation: zod_1.z.string().optional(),
                    note: zod_1.z.string().optional(),
                    attachTo: zod_1.z.string().optional().describe('จับคู่กับ item ของกล้อง ("" = ถอดออก)'),
                    useFrom: zod_1.z.string().optional().describe('วันแรกที่ใช้ YYYY-MM-DD ("" ทั้ง useFrom และ useTo = ใช้ทั้งงาน)'),
                    useTo: zod_1.z.string().optional().describe('วันสุดท้ายที่ใช้ YYYY-MM-DD'),
                })).min(1),
            }),
        }),
        (0, tools_1.tool)(async ({ itemIds }) => ws.removeItems(itemIds), {
            name: 'remove_items',
            description: 'เอาแถวออกจากแผน (กล่องในผังที่มาจากแถวนั้นหายไปด้วย)',
            schema: zod_1.z.object({ itemIds: zod_1.z.array(zod_1.z.string()).min(1) }),
        }),
        (0, tools_1.tool)(async ({ name }) => ws.createDiagram(name), {
            name: 'create_diagram',
            description: 'สร้างผังระบบ "Video" — 1 แผนมีผังเดียว (ภาพ เสียง FOH Intercom รวมกัน) มีผังอยู่แล้วจะคืนผังเดิม',
            schema: zod_1.z.object({ name: zod_1.z.string() }),
        }),
        (0, tools_1.tool)(async ({ diagramId }) => ws.clearDiagram(diagramId), {
            name: 'clear_diagram',
            description: 'ล้างกล่องและเส้นทั้งหมดในผัง (ใช้เมื่อต้องวาดใหม่ทั้งผัง)',
            schema: zod_1.z.object({ diagramId: zod_1.z.string() }),
        }),
        (0, tools_1.tool)(async ({ diagramId }) => ws.deleteDiagram(diagramId), {
            name: 'delete_diagram',
            description: 'ลบผังทั้งผัง — เฉพาะเมื่อผู้ใช้สั่ง',
            schema: zod_1.z.object({ diagramId: zod_1.z.string() }),
        }),
        (0, tools_1.tool)(async ({ diagramId, nodes }) => ws.addNodes(diagramId, nodes), {
            name: 'add_nodes',
            description: 'วางกล่องลงผัง — ปกติระบุ itemId (port มาจากสต็อกให้เอง) กล่องอิสระ (ของสถานที่ เช่น จอ LED, Internet ของ venue) ใส่ label + category + port เอง ไม่ต้องใส่พิกัด',
            schema: zod_1.z.object({
                diagramId: zod_1.z.string(),
                nodes: zod_1.z.array(zod_1.z.object({
                    itemId: zod_1.z.string().optional(),
                    label: zod_1.z.string().optional().describe('ชื่อบนกล่อง เช่น "CAM 1" — ไม่ใส่ = ชื่ออุปกรณ์'),
                    sub: zod_1.z.string().optional().describe('บรรทัดรอง เช่น จุดติดตั้ง'),
                    note: zod_1.z.string().optional().describe('หมายเหตุที่โชว์ในกล่อง เช่น ค่าที่ต้องตั้ง/ข้อควรระวัง — สั้นๆ ไม่เกิน ~2 บรรทัด'),
                    category: category.optional(),
                    inputs: zod_1.z.array(zod_1.z.string()).optional(),
                    outputs: zod_1.z.array(zod_1.z.string()).optional(),
                    ios: zod_1.z.array(zod_1.z.string()).optional(),
                })).min(1),
            }),
        }),
        (0, tools_1.tool)(async ({ diagramId, nodeId, label, sub, note }) => ws.updateNode(diagramId, nodeId, { label, sub, note }), {
            name: 'update_node',
            description: 'แก้ชื่อ / บรรทัดรอง / หมายเหตุ ของกล่องที่วางแล้ว (note: "" = ลบหมายเหตุ)',
            schema: zod_1.z.object({
                diagramId: zod_1.z.string(),
                nodeId: zod_1.z.string().describe('node id หรือ label'),
                label: zod_1.z.string().optional(),
                sub: zod_1.z.string().optional(),
                note: zod_1.z.string().optional(),
            }),
        }),
        (0, tools_1.tool)(async ({ diagramId, nodeId, side, names }) => ws.addPorts(diagramId, nodeId, side, names), {
            name: 'add_ports',
            description: 'เพิ่ม port ต่อท้ายกล่อง เมื่อข้อมูล port ในสต็อกไม่ครบ (ต้องบอกผู้ใช้ให้แก้ข้อมูลสต็อกด้วย)',
            schema: zod_1.z.object({ diagramId: zod_1.z.string(), nodeId: zod_1.z.string(), side: zod_1.z.enum(['in', 'out', 'io']), names: zod_1.z.array(zod_1.z.string()).min(1) }),
        }),
        (0, tools_1.tool)(async ({ diagramId, nodeIds }) => ws.removeNodes(diagramId, nodeIds), {
            name: 'remove_nodes',
            description: 'เอากล่องออกจากผัง (เส้นที่ต่ออยู่หายไปด้วย)',
            schema: zod_1.z.object({ diagramId: zod_1.z.string(), nodeIds: zod_1.z.array(zod_1.z.string()).min(1) }),
        }),
        (0, tools_1.tool)(async ({ diagramId, links }) => ws.connect(diagramId, links), {
            name: 'connect',
            description: 'โยงสาย — อ้างกล่องด้วย node id (หรือ label) และ port ด้วยชื่อตามที่ tool ให้มา ต้นทาง = OUT/IO, ปลายทาง = IN/IO, port ละ 1 เส้น',
            schema: zod_1.z.object({
                diagramId: zod_1.z.string(),
                links: zod_1.z.array(zod_1.z.object({
                    fromNode: zod_1.z.string(),
                    fromPort: zod_1.z.string(),
                    toNode: zod_1.z.string(),
                    toPort: zod_1.z.string(),
                    signal,
                    label: zod_1.z.string().optional().describe('ชื่อ/ความยาวสาย เช่น "SDI 50m" หรือ "ไร้สาย"'),
                })).min(1),
            }),
        }),
        (0, tools_1.tool)(async ({ diagramId, edgeIds }) => ws.disconnect(diagramId, edgeIds), {
            name: 'disconnect',
            description: 'ลบเส้น',
            schema: zod_1.z.object({ diagramId: zod_1.z.string(), edgeIds: zod_1.z.array(zod_1.z.string()).min(1) }),
        }),
        (0, tools_1.tool)(async ({ objects }) => ws.place3d(objects), {
            name: 'place_3d',
            description: 'วางกล้อง/วัตถุในผังวาง 3D ด้วยโซน (ไม่ต้องใส่พิกัด ระบบคำนวณตามขนาดสถานที่) — ซ้าย/ขวา = มองจาก FOH ไปเวที · วางชื่อเดิมซ้ำ = ย้ายโซน · โต๊ะ FOH มีให้อัตโนมัติ',
            schema: zod_1.z.object({
                objects: zod_1.z.array(zod_1.z.object({
                    zone: zod_1.z.enum(types_1.LAYOUT_ZONES).describe('stage_front_left/right/center = หน้าเวที, on_stage = บนเวที, floor_left/right = กลางฮอลล์ด้านข้าง, foh_center = กลางหลังสุดแถว FOH, back_left/right = หลังฮอลล์มุม, ob_area = รถ OB นอกฮอลล์'),
                    kind: zod_1.z.enum(types_1.LAYOUT_KINDS).optional().describe('ไม่ใส่ = camera ถ้า item เป็นกล้อง'),
                    label: zod_1.z.string().optional().describe('ชื่อในผัง ใช้ชื่อเดียวกับผังระบบ เช่น "CAM 1"'),
                    itemId: zod_1.z.string().optional().describe('item id ในแผน (กล้อง/รถ OB/จอ)'),
                    note: zod_1.z.string().optional().describe('เช่น เลนส์ที่ใส่, ความสูง riser'),
                })).min(1),
            }),
        }),
        (0, tools_1.tool)(async ({ a, b }) => ws.swapPositions(a, b), {
            name: 'swap_positions',
            description: 'สลับตำแหน่งกล้อง 2 ตัวในครั้งเดียว: ปลายทาง (ของในชุดย้ายตาม), บรรทัดรอง (จุดติดตั้ง) ในผังระบบ, ตำแหน่ง/ทิศในผังวาง 3D — ใช้เมื่อผู้ใช้สั่ง "สลับกล้อง X กับ Y"',
            schema: zod_1.z.object({
                a: zod_1.z.string().describe('item id หรือชื่อกล่องในผังระบบ เช่น "CAM 2"'),
                b: zod_1.z.string().describe('item id หรือชื่อกล่องในผังระบบ เช่น "CAM 3"'),
            }),
        }),
        (0, tools_1.tool)(async () => ws.validateText(), {
            name: 'validate',
            description: 'ตรวจร่างทั้งแผน: ของชนงานอื่น, port ซ้ำ, กล่องที่ยังไม่โยง, ของที่ยังไม่มีปลายทาง — เรียกก่อน finish เสมอ',
            schema: zod_1.z.object({}),
        }),
        (0, tools_1.tool)(async ({ summary, questions }) => {
            onFinish({ summary, questions: questions ?? [] });
            return 'รับทราบ — ส่งร่างให้ผู้ใช้ตรวจ';
        }, {
            name: 'finish',
            description: 'จบงาน ส่งร่างให้ผู้ใช้ตรวจ — summary ภาษาไทยสั้นๆ ว่าทำอะไรไป ขาดอะไร, questions = เรื่องที่ผู้ใช้ต้องตัดสินใจเอง',
            schema: zod_1.z.object({
                summary: zod_1.z.string(),
                questions: zod_1.z.array(zod_1.z.string()).optional(),
            }),
        }),
    ];
}
//# sourceMappingURL=tools.js.map