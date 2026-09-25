import type { DiagramNode, PlanDiagram } from '../types'
import { portsOf } from './diagram'

/**
 * ตั้งค่า ATEM จากผังระบบ → ไฟล์ XML ที่ ATEM Software Control เปิดด้วย File → Restore ได้
 * - ชื่อ input: เลข = ตัวเลขท้ายชื่อ port (เช่น "SDI IN 5" → 5) · ไม่มีเลข/เลขซ้ำ = ลำดับ port
 *   ชื่อ = กล่องต้นทาง โดยเดินย้อนผ่านกล่องส่งต่อ (converter / fiber RX / ส่งภาพไร้สาย) ไปหากล้องจริง
 * - AUX: port ขาออก SDI ที่มีสาย (Constellation ทุก SDI OUT คือ AUX) — เดาแหล่งภาพจากป้ายสาย/ปลายทาง (PGM / Clean / MV / CAM n) เดาไม่ได้ = ไม่แตะ
 * - Multiview: port MULTIVIEW แต่ละตัว = 1 multiview · ช่องเริ่มต้น PVW, PGM แล้วเรียง input
 * - เลขแหล่งภาพตามโปรโตคอล ATEM: input n = n, Black 0, Bars 1000, M/E n PGM = 10000+10n (PVW +1), Clean feed n = 7000+n, Multiview n = 9000+n
 * ⚠️ โครง XML ของ ATEM ไม่มีเอกสารทางการ — วิธีที่ชัวร์คือเอาไฟล์ที่ export จากเครื่องจริง (File → Save As)
 *    มาให้ `patchAtemXml` แก้เฉพาะชื่อ input แล้ว Restore กลับ · `buildAtemXml` (ไม่มีไฟล์ฐาน) เป็นทางสำรอง
 */

export interface AtemInput {
  id: number
  port: string
  longName: string   // ATEM จำกัด 20 ตัวอักษร
  shortName: string  // ATEM จำกัด 4 ตัวอักษร
}

// กล่องที่แค่ส่งต่อสัญญาณ — ชื่อ input ควรเป็นของต้นทางที่อยู่หลังกล่องพวกนี้
const PASS_THROUGH = new Set(['converter', 'wireless'])

const ascii = (s: string) => s.normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim()

/** ชื่อย่อ 4 ตัว: "CAM 1" → CAM1, "CAM 12" → C12, อื่นๆ = ตัวอักษร/ตัวเลข 4 ตัวแรก */
export function atemShortName(name: string): string {
  const s = ascii(name).toUpperCase()
  const cam = s.match(/\bCAM(?:ERA)?\s*(\d+)/)
  if (cam) return `CAM${cam[1]}`.length <= 4 ? `CAM${cam[1]}` : `C${cam[1]}`.slice(0, 4)
  return s.replace(/[^A-Z0-9]/g, '').slice(0, 4)
}

function upstream(diagram: PlanDiagram, byId: Map<string, DiagramNode>, node: DiagramNode, seen: Set<string>): DiagramNode {
  if (seen.size > 6 || !PASS_THROUGH.has(node.category)) return node
  seen.add(node.id)
  // converter ฝั่งกล้องมักมีสาย return จากสวิตเชอร์เข้าด้วย → ข้ามกล่องที่ผ่านมาแล้ว (รวมตัวสวิตเชอร์) และชอบกล้องก่อน
  const srcs = diagram.edges
    .filter((x) => x.to.nodeId === node.id && (x.to.side === 'in' || x.to.side === 'io') && !seen.has(x.from.nodeId))
    .map((x) => byId.get(x.from.nodeId))
    .filter((x): x is DiagramNode => !!x)
  const src = srcs.find((x) => x.category === 'camera') ?? srcs.find((x) => x.category !== 'switcher')
  return src ? upstream(diagram, byId, src, seen) : node
}

export function atemInputs(diagram: PlanDiagram, switcher: DiagramNode): AtemInput[] {
  const byId = new Map(diagram.nodes.map((n) => [n.id, n]))
  const ports = portsOf(switcher, 'in')
  const nums = ports.map((p) => Number(p.match(/(\d+)\s*$/)?.[1] ?? NaN))
  const valid = nums.every((n) => Number.isFinite(n) && n > 0) && new Set(nums).size === nums.length
  const out: AtemInput[] = []
  ports.forEach((port, i) => {
    const e = diagram.edges.find((x) => x.to.nodeId === switcher.id && x.to.side === 'in' && x.to.index === i)
    const src = e && byId.get(e.from.nodeId)
    if (!src) return
    const origin = upstream(diagram, byId, src, new Set([switcher.id]))
    const longName = ascii(origin.label).slice(0, 20) || `Input ${i + 1}`
    out.push({ id: valid ? nums[i] : i + 1, port, longName, shortName: atemShortName(longName) || String(i + 1) })
  })
  return out.sort((a, b) => a.id - b.id)
}

// ── AUX / Multiview ──────────────────────────────────────────────────────────

export const ATEM_UNSET = -1 // ไม่แตะค่านี้ในไฟล์

export interface AtemSource { id: number; label: string }
export interface AtemAux { index: number; port: string; dest: string; source: number }
export interface AtemMultiview { index: number; windows: number[] }

/** จำนวน M/E จากชื่อกล่อง ("4 M/E", "2M/E") — ไม่ระบุ = 1 */
export function atemMeCount(label: string): number {
  const m = label.match(/(\d)\s*M\s*\/?\s*E/i)
  return m ? Math.min(4, Math.max(1, Number(m[1]))) : 1
}

export function atemSources(inputs: AtemInput[], meCount: number, mvCount: number): AtemSource[] {
  const out: AtemSource[] = [{ id: 0, label: 'Black' }, { id: 1000, label: 'Color Bars' }]
  for (const i of inputs) out.push({ id: i.id, label: `${i.id} · ${i.longName}` })
  for (let m = 1; m <= meCount; m++) {
    const me = meCount > 1 ? `M/E ${m} ` : ''
    out.push({ id: 10000 + 10 * m, label: `${me}Program` }, { id: 10000 + 10 * m + 1, label: `${me}Preview` }, { id: 7000 + m, label: `Clean Feed ${m}` })
  }
  for (let v = 1; v <= mvCount; v++) out.push({ id: 9000 + v, label: `Multiview ${v}` })
  return out
}

const isMvPort = (p: string) => /multi\s*view|\bmv\b/i.test(p)

export function multiviewCount(switcher: DiagramNode): number {
  return Math.max(1, switcher.outputs.filter(isMvPort).length)
}

/** เดาแหล่งภาพจากข้อความ (ป้ายสาย + ชื่อปลายทาง) */
function guessSource(text: string, inputs: AtemInput[]): number {
  const t = ascii(text).toUpperCase()
  const cam = t.match(/\bCAM(?:ERA)?\s*(\d+)/)
  if (cam) {
    const hit = inputs.find((i) => new RegExp(`CAM(?:ERA)?\\s*${cam[1]}\\b`, 'i').test(i.longName))
    if (hit) return hit.id
  }
  if (/CLEAN/.test(t)) return 7001
  if (/MULTI\s*VIEW|\bMV\b/.test(t)) return 9001
  if (/\bPVW\b|PREVIEW/.test(t)) return 10011
  if (/\bPGM\b|PROGRAM/.test(t)) return 10010
  return ATEM_UNSET
}

export function atemAuxes(diagram: PlanDiagram, switcher: DiagramNode, inputs: AtemInput[]): AtemAux[] {
  const byId = new Map(diagram.nodes.map((n) => [n.id, n]))
  const out: AtemAux[] = []
  switcher.outputs.forEach((port, i) => {
    if (isMvPort(port)) return
    const edges = diagram.edges.filter((e) => e.from.nodeId === switcher.id && e.from.side === 'out' && e.from.index === i)
    if (edges.length === 0) return
    const n = Number(port.match(/(\d+)\s*$/)?.[1] ?? NaN)
    const dest = edges.map((e) => byId.get(e.to.nodeId)?.label ?? '?').join(', ')
    const hint = edges.map((e) => [e.label, e.note].filter(Boolean).join(' ')).join(' ')
    // ป้ายสายบอกชัดกว่าชื่อปลายทาง (ปลายทางชื่อ "HyperDeck PGM" แต่สายเขียน AUX 5 ก็ได้)
    const byLabel = guessSource(hint, inputs)
    out.push({ index: (Number.isFinite(n) && n > 0 ? n : i + 1) - 1, port, dest: [dest, hint].filter(Boolean).join(' · '), source: byLabel !== ATEM_UNSET ? byLabel : guessSource(dest, inputs) })
  })
  return out.sort((a, b) => a.index - b.index)
}

/** ช่อง multiview เริ่มต้น: PVW, PGM แล้ว input เรียงตามเลข (ช่องที่เหลือไม่แตะ) */
export function atemMultiviews(count: number, windows: number, inputs: AtemInput[]): AtemMultiview[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    windows: Array.from({ length: windows }, (_, w) => (w === 0 ? 10011 : w === 1 ? 10010 : inputs[w - 2]?.id ?? ATEM_UNSET)),
  }))
}

const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export interface AtemConfig { inputs: AtemInput[]; auxes: AtemAux[]; multiviews: AtemMultiview[] }

/**
 * XML ขั้นต่ำ — ใช้เมื่อไม่มีไฟล์จากเครื่องจริง
 * ⚠️ ชื่อ tag ของ AUX / Multiview เดาจากไฟล์ที่เคยเห็น ไม่มีเอกสารยืนยัน — แนะนำ patch ไฟล์จริงเสมอ
 */
export function buildAtemXml(product: string, c: AtemConfig): string {
  const L: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', `<Profile majorVersion="1" minorVersion="5" product="${esc(product)}">`, '    <Settings>']
  if (c.inputs.length) {
    L.push('        <Inputs>', ...c.inputs.map((i) => `            <Input id="${i.id}" shortName="${esc(i.shortName)}" longName="${esc(i.longName)}"/>`), '        </Inputs>')
  }
  const mvs = c.multiviews.filter((m) => m.windows.some((w) => w !== ATEM_UNSET))
  if (mvs.length) {
    L.push('        <MultiViews>')
    for (const m of mvs) {
      L.push(`            <MultiView index="${m.index}">`, '                <Windows>')
      m.windows.forEach((w, i) => { if (w !== ATEM_UNSET) L.push(`                    <Window index="${i}" source="${w}"/>`) })
      L.push('                </Windows>', '            </MultiView>')
    }
    L.push('        </MultiViews>')
  }
  L.push('    </Settings>')
  const aux = c.auxes.filter((a) => a.source !== ATEM_UNSET)
  if (aux.length) L.push('    <Auxiliaries>', ...aux.map((a) => `        <Auxiliary index="${a.index}" source="${a.source}"/>`), '    </Auxiliaries>')
  L.push('</Profile>', '')
  return L.join('\n')
}

export interface PatchResult { xml: string; inputs: number; auxes: number; windows: number; missing: string[] }

/**
 * แก้ค่าในไฟล์ที่ export จาก ATEM Software Control — แก้เฉพาะ element ที่มีอยู่แล้วในไฟล์ ไม่สร้าง tag ใหม่ ส่วนอื่นคงเดิม
 * หา element แบบยืดหยุ่น (ชื่อ tag ต่างกันตามรุ่น/เวอร์ชัน): AUX = tag ที่ชื่อมี "aux" + index + source,
 * Multiview window = tag ที่ชื่อมี "window" + index + source ภายใต้ tag "multiview" ที่มี index
 * คืน null ถ้าไม่ใช่ไฟล์ ATEM
 */
export function patchAtemXml(xml: string, c: AtemConfig): PatchResult | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length || doc.documentElement.nodeName !== 'Profile') return null
  const all = Array.from(doc.getElementsByTagName('*'))
  const missing: string[] = []
  const r: PatchResult = { xml: '', inputs: 0, auxes: 0, windows: 0, missing }

  const inputEls = all.filter((e) => e.nodeName === 'Input' && e.parentElement?.nodeName === 'Inputs')
  for (const inp of c.inputs) {
    const el = inputEls.find((n) => Number(n.getAttribute('id')) === inp.id)
    if (!el) { missing.push(`input ${inp.id}`); continue }
    el.setAttribute('longName', inp.longName)
    el.setAttribute('shortName', inp.shortName)
    r.inputs++
  }

  const auxEls = all.filter((e) => /aux/i.test(e.nodeName) && e.hasAttribute('index') && e.hasAttribute('source'))
  for (const a of c.auxes) {
    if (a.source === ATEM_UNSET) continue
    const el = auxEls.find((n) => Number(n.getAttribute('index')) === a.index)
    if (!el) { missing.push(`AUX ${a.index + 1}`); continue }
    el.setAttribute('source', String(a.source))
    r.auxes++
  }

  const mvEls = all.filter((e) => /multi\s*view/i.test(e.nodeName) && !/views$/i.test(e.nodeName) && e.hasAttribute('index'))
  for (const m of c.multiviews) {
    const mv = mvEls.find((n) => Number(n.getAttribute('index')) === m.index)
    const wins = mv ? Array.from(mv.getElementsByTagName('*')).filter((e) => /window/i.test(e.nodeName) && e.hasAttribute('index') && e.hasAttribute('source')) : []
    m.windows.forEach((w, i) => {
      if (w === ATEM_UNSET) return
      const el = wins.find((n) => Number(n.getAttribute('index')) === i)
      if (!el) { missing.push(`Multiview ${m.index + 1} ช่อง ${i + 1}`); return }
      el.setAttribute('source', String(w))
      r.windows++
    })
  }

  const body = new XMLSerializer().serializeToString(doc)
  r.xml = body.startsWith('<?xml') ? body : `<?xml version="1.0" encoding="UTF-8"?>\n${body}`
  return r
}
