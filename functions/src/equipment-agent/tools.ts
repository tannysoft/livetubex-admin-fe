import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { CATEGORIES, LAYOUT_KINDS, LAYOUT_ZONES, SIGNALS } from './types'
import type { Workspace } from './workspace'

/** ใช้ไม่เต็มงาน — จองคิวเฉพาะวันที่ใช้ (งานหลายวันเท่านั้น) ไม่ใส่ = ทั้งงาน */
const USE_RANGE = {
  useFrom: z.string().optional().describe('ใช้ไม่เต็มงาน: วันแรกที่ใช้ YYYY-MM-DD (อยู่ในวันงาน) — ไม่ใส่ = ทั้งงาน'),
  useTo: z.string().optional().describe('วันสุดท้ายที่ใช้ YYYY-MM-DD'),
}

/** ผลจาก tool finish — graph อ่านไปเป็นสรุปที่ส่งกลับหน้าเว็บ */
export interface FinishResult {
  summary: string
  questions: string[]
}

const category = z.enum(CATEGORIES as [string, ...string[]]).describe('หมวดอุปกรณ์')
const signal = z.enum(SIGNALS as [string, ...string[]]).describe('ประเภทสาย/สัญญาณ')

/**
 * tool ทุกตัวทำงานกับ Workspace (ร่างในหน่วยความจำ) — ไม่มีตัวไหนเขียน Firestore
 * ผลลัพธ์เป็นข้อความสั้น ✓/✗ ต่อบรรทัด ให้ LLM เห็นทันทีว่าอะไรไม่ผ่านและแก้เองได้
 */
export function buildTools(ws: Workspace, onFinish: (r: FinishResult) => void) {
  return [
    tool(async () => ws.inventoryOverview(), {
      name: 'inventory_overview',
      description: 'ภาพรวมคลังต่อหมวด และจำนวนที่ยังว่างในช่วงวันของงานนี้ เรียกก่อนเลือกของ',
      schema: z.object({}),
    }),
    tool(async (a) => ws.searchInventory(a as Parameters<Workspace['searchInventory']>[0]), {
      name: 'search_inventory',
      description: 'ค้นอุปกรณ์ในคลัง (ของบริษัท/พาร์ทเนอร์/ของเช่า) คืน id, จำนวนว่าง, จำนวน port — id ที่ใช้กับ add_items ต้องมาจากที่นี่เท่านั้น',
      schema: z.object({
        query: z.string().optional().describe('คำค้น เช่น "atem", "sdi", "mars 400", "สาย sdi"'),
        category: category.optional(),
        ownership: z.enum(['owned', 'rental', 'partner']).optional(),
        onlyAvailable: z.boolean().optional().describe('true = เฉพาะที่ยังว่าง'),
        limit: z.number().int().optional(),
      }),
    }),
    tool(async ({ equipmentIds }) => ws.getPorts(equipmentIds), {
      name: 'get_ports',
      description: 'ชื่อ port IN/OUT/IO ของอุปกรณ์ในคลัง — ใช้ดูก่อนวางแผนการโยง',
      schema: z.object({ equipmentIds: z.array(z.string()).min(1).max(30) }),
    }),
    tool(async () => ws.listPlan(), {
      name: 'list_plan',
      description: 'ดูร่างปัจจุบัน: รายการอุปกรณ์ (item id) และผังโยง (node id, port ที่ใช้แล้ว, เส้น)',
      schema: z.object({}),
    }),
    tool(async ({ items }) => ws.addItems(items), {
      name: 'add_items',
      description: 'หยิบของจากคลังเข้าแผน (เช็กของว่างให้) — toLocation = ปลายทางที่ของไปอยู่ในงาน · ของในชุดกล้อง (เลนส์, ขาตั้ง, converter/fiber ฝั่งกล้อง, ส่งภาพไร้สาย, gimbal) ใส่ attachTo = item id ของกล้อง — แยกแถว quantity 1 ต่อกล้อง',
      schema: z.object({
        items: z.array(z.object({
          equipmentId: z.string(),
          quantity: z.number().int().min(1),
          toLocation: z.string().optional(),
          note: z.string().optional(),
          attachTo: z.string().optional().describe('item id ของกล้องที่ของชิ้นนี้อยู่ในชุด (เลนส์, ขาตั้ง, converter ฝั่งกล้อง, TX) — ปลายทางตามกล้องให้เอง'),
          ...USE_RANGE,
        })).min(1),
      }),
    }),
    tool(async ({ items }) => ws.addExternalItems(items as Parameters<Workspace['addExternalItems']>[0]), {
      name: 'add_external_items',
      description: 'เพิ่มของที่ไม่มีในคลัง (ต้องเช่า/ยืมเพิ่ม) — ใช้เมื่อค้นในคลังแล้วไม่มีหรือไม่พอเท่านั้น และต้องแจ้งผู้ใช้ใน finish',
      schema: z.object({
        items: z.array(z.object({
          name: z.string(),
          category,
          quantity: z.number().int().min(1),
          origin: z.enum(['rental', 'partner']).optional(),
          vendor: z.string().optional(),
          unitCost: z.number().min(0).optional().describe('ราคาเช่า/ชิ้น/วัน ถ้ารู้ ไม่รู้ = ไม่ต้องใส่'),
          rentalDays: z.number().int().min(1).optional(),
          toLocation: z.string().optional(),
          note: z.string().optional(),
          ...USE_RANGE,
        })).min(1),
      }),
    }),
    tool(async ({ updates }) => ws.updateItems(updates), {
      name: 'update_items',
      description: 'แก้จำนวน / หยิบจาก / ปลายทาง / หมายเหตุ / กล้องที่เลนส์จับคู่ / วันที่ใช้ ของแถวในแผน',
      schema: z.object({
        updates: z.array(z.object({
          itemId: z.string(),
          quantity: z.number().int().min(1).optional(),
          fromLocation: z.string().optional(),
          toLocation: z.string().optional(),
          note: z.string().optional(),
          attachTo: z.string().optional().describe('จับคู่กับ item ของกล้อง ("" = ถอดออก)'),
          useFrom: z.string().optional().describe('วันแรกที่ใช้ YYYY-MM-DD ("" ทั้ง useFrom และ useTo = ใช้ทั้งงาน)'),
          useTo: z.string().optional().describe('วันสุดท้ายที่ใช้ YYYY-MM-DD'),
        })).min(1),
      }),
    }),
    tool(async ({ itemIds }) => ws.removeItems(itemIds), {
      name: 'remove_items',
      description: 'เอาแถวออกจากแผน (กล่องในผังที่มาจากแถวนั้นหายไปด้วย)',
      schema: z.object({ itemIds: z.array(z.string()).min(1) }),
    }),
    tool(async ({ name }) => ws.createDiagram(name), {
      name: 'create_diagram',
      description: 'สร้างผังโยงใหม่ — ภาพ+เสียงใช้ผัง "Video" ผังเดียว (ไม่แยก Audio) แยกได้เฉพาะ "Intercom / Tally", "Network" — ชื่อซ้ำจะคืนผังเดิม',
      schema: z.object({ name: z.string() }),
    }),
    tool(async ({ diagramId }) => ws.clearDiagram(diagramId), {
      name: 'clear_diagram',
      description: 'ล้างกล่องและเส้นทั้งหมดในผัง (ใช้เมื่อต้องวาดใหม่ทั้งผัง)',
      schema: z.object({ diagramId: z.string() }),
    }),
    tool(async ({ diagramId }) => ws.deleteDiagram(diagramId), {
      name: 'delete_diagram',
      description: 'ลบผังทั้งผัง — เฉพาะเมื่อผู้ใช้สั่ง',
      schema: z.object({ diagramId: z.string() }),
    }),
    tool(async ({ diagramId, nodes }) => ws.addNodes(diagramId, nodes as Parameters<Workspace['addNodes']>[1]), {
      name: 'add_nodes',
      description: 'วางกล่องลงผัง — ปกติระบุ itemId (port มาจากคลังให้เอง) กล่องอิสระ (ของสถานที่ เช่น จอ LED, Internet ของ venue) ใส่ label + category + port เอง ไม่ต้องใส่พิกัด',
      schema: z.object({
        diagramId: z.string(),
        nodes: z.array(z.object({
          itemId: z.string().optional(),
          label: z.string().optional().describe('ชื่อบนกล่อง เช่น "CAM 1" — ไม่ใส่ = ชื่ออุปกรณ์'),
          sub: z.string().optional().describe('บรรทัดรอง เช่น จุดติดตั้ง'),
          note: z.string().optional().describe('หมายเหตุที่โชว์ในกล่อง เช่น ค่าที่ต้องตั้ง/ข้อควรระวัง — สั้นๆ ไม่เกิน ~2 บรรทัด'),
          category: category.optional(),
          inputs: z.array(z.string()).optional(),
          outputs: z.array(z.string()).optional(),
          ios: z.array(z.string()).optional(),
        })).min(1),
      }),
    }),
    tool(async ({ diagramId, nodeId, label, sub, note }) => ws.updateNode(diagramId, nodeId, { label, sub, note }), {
      name: 'update_node',
      description: 'แก้ชื่อ / บรรทัดรอง / หมายเหตุ ของกล่องที่วางแล้ว (note: "" = ลบหมายเหตุ)',
      schema: z.object({
        diagramId: z.string(),
        nodeId: z.string().describe('node id หรือ label'),
        label: z.string().optional(),
        sub: z.string().optional(),
        note: z.string().optional(),
      }),
    }),
    tool(async ({ diagramId, nodeId, side, names }) => ws.addPorts(diagramId, nodeId, side, names), {
      name: 'add_ports',
      description: 'เพิ่ม port ต่อท้ายกล่อง เมื่อข้อมูล port ในคลังไม่ครบ (ต้องบอกผู้ใช้ให้แก้ข้อมูลคลังด้วย)',
      schema: z.object({ diagramId: z.string(), nodeId: z.string(), side: z.enum(['in', 'out', 'io']), names: z.array(z.string()).min(1) }),
    }),
    tool(async ({ diagramId, nodeIds }) => ws.removeNodes(diagramId, nodeIds), {
      name: 'remove_nodes',
      description: 'เอากล่องออกจากผัง (เส้นที่ต่ออยู่หายไปด้วย)',
      schema: z.object({ diagramId: z.string(), nodeIds: z.array(z.string()).min(1) }),
    }),
    tool(async ({ diagramId, links }) => ws.connect(diagramId, links as Parameters<Workspace['connect']>[1]), {
      name: 'connect',
      description: 'โยงสาย — อ้างกล่องด้วย node id (หรือ label) และ port ด้วยชื่อตามที่ tool ให้มา ต้นทาง = OUT/IO, ปลายทาง = IN/IO, port ละ 1 เส้น',
      schema: z.object({
        diagramId: z.string(),
        links: z.array(z.object({
          fromNode: z.string(),
          fromPort: z.string(),
          toNode: z.string(),
          toPort: z.string(),
          signal,
          label: z.string().optional().describe('ชื่อ/ความยาวสาย เช่น "SDI 50m" หรือ "ไร้สาย"'),
        })).min(1),
      }),
    }),
    tool(async ({ diagramId, edgeIds }) => ws.disconnect(diagramId, edgeIds), {
      name: 'disconnect',
      description: 'ลบเส้น',
      schema: z.object({ diagramId: z.string(), edgeIds: z.array(z.string()).min(1) }),
    }),
    tool(async ({ objects }) => ws.place3d(objects), {
      name: 'place_3d',
      description: 'วางกล้อง/วัตถุในผังวาง 3D ด้วยโซน (ไม่ต้องใส่พิกัด ระบบคำนวณตามขนาดสถานที่) — ซ้าย/ขวา = มองจาก FOH ไปเวที · วางชื่อเดิมซ้ำ = ย้ายโซน · โต๊ะ FOH มีให้อัตโนมัติ',
      schema: z.object({
        objects: z.array(z.object({
          zone: z.enum(LAYOUT_ZONES).describe('stage_front_left/right/center = หน้าเวที, on_stage = บนเวที, floor_left/right = กลางฮอลล์ด้านข้าง, foh_center = กลางหลังสุดแถว FOH, back_left/right = หลังฮอลล์มุม, ob_area = รถ OB นอกฮอลล์'),
          kind: z.enum(LAYOUT_KINDS).optional().describe('ไม่ใส่ = camera ถ้า item เป็นกล้อง'),
          label: z.string().optional().describe('ชื่อในผัง ใช้ชื่อเดียวกับผังโยง เช่น "CAM 1"'),
          itemId: z.string().optional().describe('item id ในแผน (กล้อง/รถ OB/จอ)'),
          note: z.string().optional().describe('เช่น เลนส์ที่ใส่, ความสูง riser'),
        })).min(1),
      }),
    }),
    tool(async ({ a, b }) => ws.swapPositions(a, b), {
      name: 'swap_positions',
      description: 'สลับตำแหน่งกล้อง 2 ตัวในครั้งเดียว: ปลายทาง (ของในชุดย้ายตาม), บรรทัดรอง (จุดติดตั้ง) ในผังโยง, ตำแหน่ง/ทิศในผังวาง 3D — ใช้เมื่อผู้ใช้สั่ง "สลับกล้อง X กับ Y"',
      schema: z.object({
        a: z.string().describe('item id หรือชื่อกล่องในผังโยง เช่น "CAM 2"'),
        b: z.string().describe('item id หรือชื่อกล่องในผังโยง เช่น "CAM 3"'),
      }),
    }),
    tool(async () => ws.validateText(), {
      name: 'validate',
      description: 'ตรวจร่างทั้งแผน: ของชนงานอื่น, port ซ้ำ, กล่องที่ยังไม่โยง, ของที่ยังไม่มีปลายทาง — เรียกก่อน finish เสมอ',
      schema: z.object({}),
    }),
    tool(async ({ summary, questions }) => {
      onFinish({ summary, questions: questions ?? [] })
      return 'รับทราบ — ส่งร่างให้ผู้ใช้ตรวจ'
    }, {
      name: 'finish',
      description: 'จบงาน ส่งร่างให้ผู้ใช้ตรวจ — summary ภาษาไทยสั้นๆ ว่าทำอะไรไป ขาดอะไร, questions = เรื่องที่ผู้ใช้ต้องตัดสินใจเอง',
      schema: z.object({
        summary: z.string(),
        questions: z.array(z.string()).optional(),
      }),
    }),
  ]
}
