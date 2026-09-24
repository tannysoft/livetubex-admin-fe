import type {
  DiagramEdge, DiagramNode, Equipment, EquipmentPlan, FohFeed, PlanDiagram, SignalType,
} from '../types'
import { DEFAULT_PORTS } from './constants'
import { autoLayoutDiagram } from './diagram'
import { fohSystemOf, feedFormat } from './foh-feeds'
import { newId } from './plans'
import { formatShortLabel, sameFormat } from './video-format'

/**
 * สร้างผัง "ส่งภาพ FOH" จาก plan.fohFeeds — สวิตเชอร์ OB → (converter) → เครื่องของทีม Visual (E2 / LED processor / …)
 * - สวิตเชอร์ = แถว switcher แรกในรายการ (port จากคลัง) · ไม่มี = กล่องอิสระ "OB Switcher"
 * - เลือก port ขาออกตามชื่อสัญญาณ (PGM / AUX n / Clean / MV) และชนิดสาย · ไม่เจอ = เพิ่ม port ให้กล่อง (ไม่แตะคลัง)
 * - ชนิดสัญญาณต่าง (SDI ↔ HDMI) หรือ format ต่างจากระบบหลัก → แทรกกล่อง converter · Fiber = TX/RX · NDI/SRT = encoder
 * - ปลายทางชื่อเดียวกัน = กล่องเดียว มี input ละ feed
 * กล่องที่แทรกเป็นกล่องอิสระ (ไม่ผูกคลัง) — ให้ผู้ใช้เปลี่ยนเป็นของจริงเองในตัวแก้ผัง
 */
export const FOH_DIAGRAM_NAME = 'ส่งภาพ FOH — ทีม Visual'

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9ก-๙]+/g, '')
type Wire = 'sdi' | 'hdmi'
const wireOf = (port: string): Wire => (/hdmi/i.test(port) ? 'hdmi' : 'sdi')
const WIRE_LABEL: Record<Wire, string> = { sdi: 'SDI', hdmi: 'HDMI' }

/** คำที่ใช้หา port ขาออกของสัญญาณนั้น — ลำดับสำคัญ (คำแรกแม่นสุด) */
function sourceKeys(source: string): string[] {
  const s = norm(source)
  const aux = s.match(/aux(\d+)/)
  if (aux) return [`aux${aux[1]}`, 'aux']
  if (s.startsWith('clean')) return ['clean', 'aux']
  if (s.includes('multiview') || s === 'mv') return ['multiview', 'mv']
  if (s.startsWith('pgm') || s.startsWith('program')) return ['pgm', 'program', 'out']
  return [s]
}

interface Builder { nodes: DiagramNode[]; edges: DiagramEdge[] }

function freeNode(b: Builder, n: Omit<DiagramNode, 'id' | 'x' | 'y'>): DiagramNode {
  const node: DiagramNode = { id: newId(), x: 0, y: 0, ...n }
  b.nodes.push(node)
  return node
}

function link(b: Builder, from: DiagramNode, outIdx: number, to: DiagramNode, inIdx: number, signal: SignalType, label?: string) {
  b.edges.push({
    id: newId(), from: { nodeId: from.id, side: 'out', index: outIdx }, to: { nodeId: to.id, side: 'in', index: inIdx }, signal,
    ...(label ? { label } : {}),
  })
}

export function buildFohDiagram(plan: EquipmentPlan, equipmentById: Map<string, Equipment>, keepId?: string): PlanDiagram {
  const feeds = (plan.fohFeeds ?? []).filter((f) => f.source.trim() || f.destination.trim())
  const b: Builder = { nodes: [], edges: [] }

  // ── ต้นทาง: สวิตเชอร์ของ OB ─────────────────────────────────────────────
  const swItem = plan.items.find((i) => i.category === 'switcher' && !i.attachedTo)
  const eq = swItem?.equipmentId ? equipmentById.get(swItem.equipmentId) : undefined
  const sw = freeNode(b, {
    label: swItem?.name || 'OB Switcher',
    sub: 'ต้นทาง — รถ OB',
    category: 'switcher',
    ...(swItem ? { planItemId: swItem.id, ...(swItem.equipmentId ? { equipmentId: swItem.equipmentId } : {}) } : {}),
    // เอาเฉพาะขาออก — ผังนี้ไม่วาดกล้องเข้า
    inputs: [],
    outputs: [...(eq?.outputs ?? (swItem ? DEFAULT_PORTS.switcher.outputs : []))],
    ios: [],
  })
  const used = new Set<number>()

  /** port ขาออกที่ยังว่างและตรงคำค้น — ชอบชนิดสายที่ตรงกับที่ส่ง */
  const tryPick = (f: FohFeed, keys: string[]): number | undefined => {
    const want: Wire | undefined = f.connection === 'HDMI' ? 'hdmi' : f.connection === 'SDI' || f.connection === 'Fiber' ? 'sdi' : undefined
    for (const key of keys) {
      const cand = sw.outputs.map((p, i) => ({ p, i })).filter(({ p, i }) => !used.has(i) && norm(p).includes(key))
      const hit = cand.find(({ p }) => !want || wireOf(p) === want) ?? cand[0]
      if (hit) { used.add(hit.i); return hit.i }
    }
    return undefined
  }
  // 2 รอบ: จองชื่อตรงตัวก่อน (AUX 1 → AUX 1) แล้วค่อยให้ตัวที่ใช้ตัวสำรอง (Clean feed → AUX ที่เหลือ) ไม่งั้น feed ก่อนหน้าแย่ง port
  const outIdx = new Map<string, number>()
  for (const f of feeds) {
    const i = tryPick(f, sourceKeys(f.source).slice(0, 1))
    if (i != null) outIdx.set(f.id, i)
  }
  for (const f of feeds) {
    if (outIdx.has(f.id)) continue
    let i = tryPick(f, sourceKeys(f.source).slice(1))
    if (i == null) {
      // ไม่มี port ที่ตรง → เพิ่มให้กล่อง (ชื่อบอกชนิดสายที่ส่ง)
      sw.outputs.push(`${f.source || 'OUT'} (${f.connection === 'HDMI' ? 'HDMI' : 'SDI'})`)
      i = sw.outputs.length - 1
      used.add(i)
    }
    outIdx.set(f.id, i)
  }

  // ── ปลายทาง: 1 กล่องต่อชื่อเครื่อง ──────────────────────────────────────
  const dests = new Map<string, DiagramNode>()
  const destNotes = new Map<string, string[]>()
  const destOf = (f: FohFeed): DiagramNode => {
    const key = norm(f.destination) || '?'
    let n = dests.get(key)
    if (!n) {
      const sys = fohSystemOf(f.destination)
      n = freeNode(b, { label: f.destination.trim() || 'FOH', sub: 'FOH — ทีม Visual', category: sys?.category ?? 'other', inputs: [], outputs: [], ios: [] })
      dests.set(key, n)
      destNotes.set(key, [])
    }
    return n
  }

  for (const f of feeds) {
    const out = outIdx.get(f.id)!
    let cur = { node: sw, idx: out, wire: wireOf(sw.outputs[out]) as Wire }
    const fmt = feedFormat(f, plan.videoFormat)
    const cable = f.cableLength?.trim()

    // format ต่างจากระบบหลัก → cross converter (ออกเป็นชนิดสายที่ปลายทางต้องการ)
    const target: Wire = f.connection === 'HDMI' ? 'hdmi' : 'sdi'
    if (f.format && plan.videoFormat && !sameFormat(f.format, plan.videoFormat)) {
      const cv = freeNode(b, {
        label: `Cross converter → ${formatShortLabel(f.format)}`, sub: `${f.source} · ${formatShortLabel(plan.videoFormat)} → ${formatShortLabel(f.format)}`,
        category: 'converter', inputs: [`${WIRE_LABEL[cur.wire]} IN`], outputs: [`${WIRE_LABEL[target]} OUT`], ios: [],
        note: 'เช่น Teranex / UpDownCross / AVMATRIX SC2030 — เปลี่ยนเป็นของในคลัง',
      })
      link(b, cur.node, cur.idx, cv, 0, cur.wire)
      cur = { node: cv, idx: 0, wire: target }
    } else if ((f.connection === 'SDI' || f.connection === 'HDMI' || f.connection === 'Fiber') && cur.wire !== target) {
      const cv = freeNode(b, {
        label: `${WIRE_LABEL[cur.wire]} → ${WIRE_LABEL[target]} converter`, sub: f.source,
        category: 'converter', inputs: [`${WIRE_LABEL[cur.wire]} IN`], outputs: [`${WIRE_LABEL[target]} OUT`], ios: [],
      })
      link(b, cur.node, cur.idx, cv, 0, cur.wire)
      cur = { node: cv, idx: 0, wire: target }
    }

    const dest = destOf(f)
    const inName = (conn: string) => `${f.destInput?.trim() || `${conn} IN ${dest.inputs.length + 1}`} (${f.source || '?'})`
    const fmtNote = fmt ? formatShortLabel(fmt) : ''

    if (f.connection === 'Fiber') {
      // ระยะไกล: SDI → fiber TX ~~ fiber ~~ RX → SDI
      const tx = freeNode(b, { label: 'Fiber TX', sub: `${f.source} → ${f.destination}`, category: 'converter', inputs: ['SDI IN'], outputs: ['FIBER OUT'], ios: [] })
      const rx = freeNode(b, { label: 'Fiber RX', sub: 'FOH', category: 'converter', inputs: ['FIBER IN'], outputs: ['SDI OUT'], ios: [] })
      link(b, cur.node, cur.idx, tx, 0, 'sdi')
      link(b, tx, 0, rx, 0, 'fiber', cable)
      dest.inputs.push(inName('SDI'))
      link(b, rx, 0, dest, dest.inputs.length - 1, 'sdi', fmtNote)
    } else if (f.connection === 'NDI' || f.connection === 'SRT') {
      const enc = freeNode(b, { label: `${f.connection} Encoder`, sub: f.source, category: 'recorder', inputs: [`${WIRE_LABEL[cur.wire]} IN`], outputs: ['LAN'], ios: [] })
      link(b, cur.node, cur.idx, enc, 0, cur.wire)
      dest.inputs.push(inName(`${f.connection} (LAN)`))
      link(b, enc, 0, dest, dest.inputs.length - 1, 'network', cable)
    } else {
      const conn = f.connection === 'HDMI' ? 'HDMI' : f.connection === 'SDI' ? 'SDI' : 'IN'
      dest.inputs.push(inName(conn))
      const label = [cable, fmtNote].filter(Boolean).join(' · ')
      link(b, cur.node, cur.idx, dest, dest.inputs.length - 1, f.connection === 'Other' ? 'other' : cur.wire, label)
    }
    if (f.note?.trim()) destNotes.get(norm(f.destination) || '?')!.push(`${f.source}: ${f.note.trim()}`)
  }

  for (const [key, n] of dests) {
    const notes = destNotes.get(key) ?? []
    if (notes.length) n.note = notes.join('\n')
  }

  return autoLayoutDiagram({ id: keepId ?? newId(), name: FOH_DIAGRAM_NAME, nodes: b.nodes, edges: b.edges })
}
