'use client'

import { useEffect, useRef, useState } from 'react'
import {
  PlusIcon, TrashIcon, MagnifyingGlassPlusIcon, MagnifyingGlassMinusIcon,
  ArrowsPointingOutIcon, Squares2X2Icon, XMarkIcon,
} from '@heroicons/react/24/outline'
import FormListbox from '@/components/ui/FormListbox'
import DiagramGraph, { type DiagramSelection } from './DiagramGraph'
import type {
  DiagramEdge, DiagramNode, DiagramPortRef, Equipment, PlanDiagram, PlanItem, PortSide, SignalType,
} from '@/lib/types'
import {
  CATEGORY_COLORS, DEFAULT_PORTS, EQUIPMENT_CATEGORIES, SIGNAL_TYPES, signalMeta,
} from '@/lib/equipment/constants'
import {
  NODE_W, diagramBounds, edgePath, exitSide, isEdgeValid, nodeHeight, portName, portPosition, portsOf, samePort, snap,
  NOTE_MAX_LINES, wrapNote,
} from '@/lib/equipment/diagram'
import { newId } from '@/lib/equipment/plans'
import { ORIGIN_LABEL, isRentalItem, itemOrigin } from '@/lib/equipment/rental-cost'

interface DiagramEditorProps {
  diagram: PlanDiagram
  onChange: (next: PlanDiagram) => void
  planItems: PlanItem[]
  equipmentById: Map<string, Equipment>
  /** เปิดตัวเลือกอุปกรณ์ (ของบริษัท/ของเช่า) — ของที่เลือกจะเข้ารายการของแผนแล้วโผล่ใน palette */
  onRequestAdd?: () => void
}

type View = { tx: number; ty: number; k: number }
type Pending = { from: DiagramPortRef; start: { x: number; y: number }; cursor: { x: number; y: number } }
type Drag =
  | { kind: 'node'; nodeId: string; grabX: number; grabY: number }
  | { kind: 'pan'; startX: number; startY: number; tx: number; ty: number }

// หมวดที่ปกติไม่ได้อยู่ในผังสัญญาณ — ข้ามตอนกด "วางทุกชิ้น"
const NON_SIGNAL = new Set(['cable', 'support', 'lens', 'lighting'])

const inputCls = 'w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand'

export default function DiagramEditor({ diagram, onChange, planItems, equipmentById, onRequestAdd }: DiagramEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const [view, setView] = useState<View>({ tx: 40, ty: 40, k: 1 })
  const [selection, setSelection] = useState<DiagramSelection>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [lastSignal, setLastSignal] = useState<SignalType>('sdi')

  const selectedNode = selection?.type === 'node' ? diagram.nodes.find((n) => n.id === selection.id) : undefined
  const selectedEdge = selection?.type === 'edge' ? diagram.edges.find((e) => e.id === selection.id) : undefined

  const toWorld = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect()
    return { x: (clientX - rect.left - view.tx) / view.k, y: (clientY - rect.top - view.ty) / view.k }
  }

  // ── mutations ────────────────────────────────────────────────────────────
  const setNodes = (nodes: DiagramNode[], edges: DiagramEdge[] = diagram.edges) =>
    onChange({ ...diagram, nodes, edges: edges.filter((e) => isEdgeValid(e, nodes)) })

  const patchNode = (id: string, patch: Partial<DiagramNode>) =>
    setNodes(diagram.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)))

  const patchEdge = (id: string, patch: Partial<DiagramEdge>) =>
    onChange({ ...diagram, edges: diagram.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) })

  const removeSelection = () => {
    if (!selection) return
    if (selection.type === 'node') setNodes(diagram.nodes.filter((n) => n.id !== selection.id))
    else onChange({ ...diagram, edges: diagram.edges.filter((e) => e.id !== selection.id) })
    setSelection(null)
  }

  /** ลบ port กลางรายการ → เส้นของ port นั้นหาย และเส้นของ port ถัดไปต้องเลื่อน index ตาม */
  const removePort = (node: DiagramNode, side: PortSide, index: number) => {
    const key = side === 'in' ? 'inputs' : side === 'out' ? 'outputs' : 'ios'
    const nodes = diagram.nodes.map((n) => (n.id === node.id ? { ...n, [key]: portsOf(n, side).filter((_, i) => i !== index) } : n))
    const shift = (ref: DiagramPortRef): DiagramPortRef | null => {
      if (ref.nodeId !== node.id || ref.side !== side) return ref
      if (ref.index === index) return null
      return ref.index > index ? { ...ref, index: ref.index - 1 } : ref
    }
    const edges = diagram.edges.flatMap((e) => {
      const from = shift(e.from)
      const to = shift(e.to)
      return from && to ? [{ ...e, from, to }] : []
    })
    setNodes(nodes, edges)
  }

  const viewCenter = () => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 100, y: 100 }
    return { x: (rect.width / 2 - view.tx) / view.k, y: (rect.height / 2 - view.ty) / view.k }
  }

  const nodeFromItem = (item: PlanItem, x: number, y: number, label?: string): DiagramNode => {
    const eq = item.equipmentId ? equipmentById.get(item.equipmentId) : undefined
    const ports = DEFAULT_PORTS[item.category]
    return {
      id: newId(),
      equipmentId: item.equipmentId,
      planItemId: item.id,
      label: label ?? item.name,
      // กล้องที่จับคู่เลนส์ไว้ → บอกเลนส์ต่อท้ายบรรทัดรอง (ช่างกล้องดูผังแล้วรู้ว่าต้องใส่ตัวไหน)
      sub: [
        [eq?.brand, eq?.model].filter(Boolean).join(' ') || item.toLocation,
        ...planItems.filter((c) => c.attachedTo === item.id && c.category === 'lens').map((c) => c.name),
      ].filter(Boolean).join(' · ') || undefined,
      category: item.category,
      x: snap(x),
      y: snap(y),
      inputs: [...(eq?.inputs ?? ports.inputs)],
      outputs: [...(eq?.outputs ?? ports.outputs)],
      ios: [...(eq ? eq.ios ?? [] : ports.ios ?? [])],
    }
  }

  const placedCount = (item: PlanItem) =>
    // planItemId ก่อน — ของเช่าที่พิมพ์เองไม่มี equipmentId และป้ายชื่อถูกแก้/ต่อเลขท้ายได้
    diagram.nodes.filter((n) => (n.planItemId ? n.planItemId === item.id : !!item.equipmentId && n.equipmentId === item.equipmentId)).length

  const addFromItem = (item: PlanItem) => {
    const c = viewCenter()
    const n = diagram.nodes.length
    // ของนับจำนวน (เช่น กล้องรุ่นเดียวกัน 4 ตัว) วางซ้ำได้ — ต่อเลขท้ายให้แยกออก
    const count = placedCount(item)
    const label = item.quantity > 1 ? `${item.name} #${count + 1}` : item.name
    const node = nodeFromItem(item, c.x - NODE_W / 2 + (n % 5) * 20, c.y - 40 + (n % 5) * 20, label)
    setNodes([...diagram.nodes, node])
    setSelection({ type: 'node', id: node.id })
  }

  const addFreeNode = () => {
    const c = viewCenter()
    const node: DiagramNode = {
      id: newId(), label: 'อุปกรณ์ใหม่', category: 'other',
      x: snap(c.x - NODE_W / 2), y: snap(c.y - 40), inputs: ['IN'], outputs: ['OUT'],
    }
    setNodes([...diagram.nodes, node])
    setSelection({ type: 'node', id: node.id })
  }

  /** วางของที่ยังไม่อยู่ในผังทั้งหมด เรียงเป็นคอลัมน์ตามหมวด ให้ผู้ใช้ลากจัดต่อ */
  const placeAll = () => {
    const todo = planItems.filter((it) => !NON_SIGNAL.has(it.category) && placedCount(it) === 0)
    if (todo.length === 0) return
    const bounds = diagram.nodes.length ? diagramBounds(diagram, 0) : { x: 0, y: 0, w: 0, h: 0 }
    const startY = bounds.y + bounds.h + (diagram.nodes.length ? 60 : 0)
    const colY = new Map<string, number>()
    const cats = [...new Set(todo.map((t) => t.category))]
    const added = todo.map((it) => {
      const col = cats.indexOf(it.category)
      const y = colY.get(it.category) ?? startY
      const node = nodeFromItem(it, bounds.x + col * (NODE_W + 110), y)
      colY.set(it.category, y + nodeHeight(node) + 30)
      return node
    })
    setNodes([...diagram.nodes, ...added])
  }

  const completeLink = (from: DiagramPortRef, to: DiagramPortRef) => {
    setPending(null)
    if (from.nodeId === to.nodeId) return
    // เก็บทิศ out → in เสมอเมื่อทำได้ ตารางสายจะอ่าน "ต้นทาง → ปลายทาง" ถูกด้าน (io โยงได้ทั้งสองทาง ปล่อยตามที่ลาก)
    const [a, b] = (from.side === 'in' && to.side !== 'in') ? [to, from] : [from, to]
    const dup = diagram.edges.some((e) => (samePort(e.from, a) && samePort(e.to, b)) || (samePort(e.from, b) && samePort(e.to, a)))
    if (dup) return
    const edge: DiagramEdge = { id: newId(), from: a, to: b, signal: lastSignal }
    onChange({ ...diagram, edges: [...diagram.edges, edge] })
    setSelection({ type: 'edge', id: edge.id })
  }

  // ── pointer handlers ─────────────────────────────────────────────────────
  const onNodePointerDown = (e: React.PointerEvent, node: DiagramNode) => {
    e.stopPropagation()
    setPending(null)
    setSelection({ type: 'node', id: node.id })
    const w = toWorld(e.clientX, e.clientY)
    dragRef.current = { kind: 'node', nodeId: node.id, grabX: w.x - node.x, grabY: w.y - node.y }
    svgRef.current?.setPointerCapture(e.pointerId)
  }

  const onPortPointerDown = (e: React.PointerEvent, ref: DiagramPortRef) => {
    e.stopPropagation()
    // touch จะ capture pointer ไว้ที่ port ต้นทางเอง → ปล่อยออก ไม่งั้น pointerup ไม่ไปถึง port ปลายทาง
    const el = e.currentTarget as Element
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    if (pending && !samePort(pending.from, ref)) {
      completeLink(pending.from, ref)
      return
    }
    const w = toWorld(e.clientX, e.clientY)
    setPending({ from: ref, start: w, cursor: w })
  }

  const onPortPointerUp = (e: React.PointerEvent, ref: DiagramPortRef) => {
    e.stopPropagation()
    // ปล่อยบน port เดิม = โหมดคลิก-คลิก (คง pending ไว้รอคลิก port ถัดไป)
    if (pending && !samePort(pending.from, ref)) completeLink(pending.from, ref)
  }

  const onEdgePointerDown = (e: React.PointerEvent, edge: DiagramEdge) => {
    e.stopPropagation()
    setPending(null)
    setSelection({ type: 'edge', id: edge.id })
  }

  const onBackgroundPointerDown = (e: React.PointerEvent) => {
    setPending(null)
    setSelection(null)
    dragRef.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, tx: view.tx, ty: view.ty }
    svgRef.current?.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (drag?.kind === 'node') {
      const w = toWorld(e.clientX, e.clientY)
      const x = snap(w.x - drag.grabX)
      const y = snap(w.y - drag.grabY)
      const node = diagram.nodes.find((n) => n.id === drag.nodeId)
      if (node && (node.x !== x || node.y !== y)) patchNode(drag.nodeId, { x, y })
    } else if (drag?.kind === 'pan') {
      setView((v) => ({ ...v, tx: drag.tx + e.clientX - drag.startX, ty: drag.ty + e.clientY - drag.startY }))
    } else if (pending) {
      setPending({ ...pending, cursor: toWorld(e.clientX, e.clientY) })
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current) {
      dragRef.current = null
      if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId)
      return
    }
    // ลากเส้นแล้วปล่อยกลางที่ว่าง = ยกเลิก (ถ้าแค่คลิก port ไม่ได้ลาก ให้คงไว้เป็นโหมดคลิก-คลิก)
    if (pending && Math.hypot(pending.cursor.x - pending.start.x, pending.cursor.y - pending.start.y) > 12) {
      setPending(null)
    }
  }

  // ── zoom ─────────────────────────────────────────────────────────────────
  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    setView((v) => {
      const rect = svgRef.current?.getBoundingClientRect()
      const px = cx ?? (rect ? rect.width / 2 : 0)
      const py = cy ?? (rect ? rect.height / 2 : 0)
      const k = Math.min(2.5, Math.max(0.2, v.k * factor))
      const ratio = k / v.k
      return { k, tx: px - (px - v.tx) * ratio, ty: py - (py - v.ty) * ratio }
    })
  }

  const fitView = () => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const b = diagramBounds(diagram)
    const k = Math.min(1.25, Math.max(0.2, Math.min(rect.width / b.w, rect.height / b.h)))
    setView({ k, tx: (rect.width - b.w * k) / 2 - b.x * k, ty: (rect.height - b.h * k) / 2 - b.y * k })
  }

  // React ผูก wheel แบบ passive → preventDefault ไม่ได้ ต้องผูก native เอง
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const rect = svg.getBoundingClientRect()
        zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - rect.left, e.clientY - rect.top)
      } else {
        setView((v) => ({ ...v, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY }))
      }
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'Escape') { setPending(null); setSelection(null) }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection) { e.preventDefault(); removeSelection() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // เปิดผัง → จัดให้เห็นทั้งผัง (สลับผัง = remount ด้วย key ที่หน้าแม่ จึงทำครั้งเดียวตอน mount พอ)
  useEffect(() => {
    const raf = requestAnimationFrame(fitView)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pendingPath = (() => {
    if (!pending) return null
    const n = diagram.nodes.find((x) => x.id === pending.from.nodeId)
    if (!n) return null
    const p = portPosition(n, pending.from.side, pending.from.index)
    const exit = exitSide(pending.from.side)
    return edgePath(p, exit, pending.cursor, exit === 'out' ? 'in' : 'out')
  })()

  const gridSize = 20 * view.k

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* Canvas */}
      <div className="relative flex-1 min-w-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <svg
          ref={svgRef}
          className="block w-full h-[68vh] min-h-[420px] touch-none select-none"
          style={{ cursor: pending ? 'crosshair' : 'grab' }}
          onPointerDown={onBackgroundPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <defs>
            <pattern id="diagram-grid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse" x={view.tx % gridSize} y={view.ty % gridSize}>
              <circle cx={1} cy={1} r={1} fill="#e5e7eb" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#diagram-grid)" />
          <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
            <DiagramGraph
              diagram={diagram}
              selection={selection}
              linkingFrom={pending?.from}
              onNodePointerDown={onNodePointerDown}
              onPortPointerDown={onPortPointerDown}
              onPortPointerUp={onPortPointerUp}
              onEdgePointerDown={onEdgePointerDown}
            />
            {pendingPath && (
              <path d={pendingPath} fill="none" stroke={signalMeta(lastSignal).color} strokeWidth={2} strokeDasharray="6 4" pointerEvents="none" />
            )}
          </g>
        </svg>

        {diagram.nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-gray-400 text-sm">
              <Squares2X2Icon className="w-10 h-10 mx-auto text-gray-300" />
              <p className="mt-3">ผังยังว่าง — กดอุปกรณ์จากรายการด้านขวาเพื่อวางลงผัง</p>
              <p className="text-xs mt-1">ลากจากจุด port หนึ่งไปอีกจุดเพื่อโยงสาย</p>
            </div>
          </div>
        )}

        {/* Zoom controls */}
        <div className="absolute bottom-3 left-3 flex items-center gap-1 bg-white/95 border border-gray-200 rounded-xl shadow-sm p-1">
          <button onClick={() => zoomAt(1 / 1.2)} title="ซูมออก" className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg"><MagnifyingGlassMinusIcon className="w-4 h-4" /></button>
          <span className="text-xs text-gray-500 w-10 text-center tabular-nums">{Math.round(view.k * 100)}%</span>
          <button onClick={() => zoomAt(1.2)} title="ซูมเข้า" className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg"><MagnifyingGlassPlusIcon className="w-4 h-4" /></button>
          <button onClick={fitView} title="พอดีจอ" className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg"><ArrowsPointingOutIcon className="w-4 h-4" /></button>
        </div>

        {pending && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-gray-900/90 text-white text-xs px-3 py-1.5 rounded-full">
            เลือก port ปลายทาง · Esc เพื่อยกเลิก
          </div>
        )}
      </div>

      {/* Side panel */}
      <div className="w-full lg:w-80 shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 lg:h-[68vh] lg:min-h-[420px] overflow-y-auto">
        {selectedNode ? (
          <div className="space-y-3">
            <PanelHeader title="อุปกรณ์ในผัง" onClose={() => setSelection(null)} />
            <Field label="ชื่อที่แสดง">
              <input className={inputCls} value={selectedNode.label} onChange={(e) => patchNode(selectedNode.id, { label: e.target.value })} />
            </Field>
            <Field label="บรรทัดรอง (รุ่น / จุดติดตั้ง)">
              <input className={inputCls} value={selectedNode.sub ?? ''} onChange={(e) => patchNode(selectedNode.id, { sub: e.target.value })} />
            </Field>
            <Field label="หมายเหตุ (โชว์ในผัง)">
              <textarea
                className={inputCls}
                rows={3}
                value={selectedNode.note ?? ''}
                placeholder="เช่น ตั้ง 1080i50, ใช้แบต V-mount, ห้ามถอดระหว่างออกอากาศ"
                onChange={(e) => patchNode(selectedNode.id, { note: e.target.value })}
              />
              {wrapNote(selectedNode.note, 999).length > NOTE_MAX_LINES && (
                <p className="mt-1 text-[11px] text-amber-600">ยาวเกิน {NOTE_MAX_LINES} บรรทัด — ในผังจะถูกตัด ฉบับเต็มอยู่ใต้ผังในหน้าพิมพ์</p>
              )}
            </Field>
            <Field label="หมวด">
              <FormListbox
                value={selectedNode.category}
                onChange={(v) => patchNode(selectedNode.id, { category: v as DiagramNode['category'] })}
                options={EQUIPMENT_CATEGORIES}
              />
            </Field>
            {(['in', 'out', 'io'] as const).map((side) => {
              const key = side === 'in' ? 'inputs' : side === 'out' ? 'outputs' : 'ios'
              const ports = portsOf(selectedNode, side)
              const title = side === 'in' ? 'ขาเข้า (ซ้าย)' : side === 'out' ? 'ขาออก (ขวา)' : 'เข้า-ออกในตัวเดียว ⇄ (ขวา)'
              const prefix = side === 'in' ? 'IN' : side === 'out' ? 'OUT' : 'I/O'
              return (
                <div key={side}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold text-gray-500">{title}</p>
                    <button
                      onClick={() => patchNode(selectedNode.id, { [key]: [...ports, `${prefix} ${ports.length + 1}`] })}
                      className="flex items-center gap-1 text-xs text-brand hover:text-brand-dark font-medium"
                    >
                      <PlusIcon className="w-3.5 h-3.5" /> เพิ่ม port
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {ports.length === 0 && <p className="text-xs text-gray-400">ไม่มี</p>}
                    {ports.map((name, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <input
                          className={`${inputCls} py-1.5`}
                          value={name}
                          onChange={(e) => patchNode(selectedNode.id, { [key]: ports.map((p, j) => (j === i ? e.target.value : p)) })}
                        />
                        <button onClick={() => removePort(selectedNode, side, i)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg shrink-0">
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
            <DeleteButton onClick={removeSelection} label="ลบออกจากผัง" />
          </div>
        ) : selectedEdge ? (
          <div className="space-y-3">
            <PanelHeader title="สายสัญญาณ" onClose={() => setSelection(null)} />
            <div className="text-xs bg-gray-50 rounded-xl p-3 space-y-1 text-gray-600">
              <p><span className="text-gray-400">จาก</span> {diagram.nodes.find((n) => n.id === selectedEdge.from.nodeId)?.label} · <b>{portName(diagram.nodes, selectedEdge.from)}</b></p>
              <p><span className="text-gray-400">ไป</span> {diagram.nodes.find((n) => n.id === selectedEdge.to.nodeId)?.label} · <b>{portName(diagram.nodes, selectedEdge.to)}</b></p>
            </div>
            <Field label="ประเภทสัญญาณ">
              <div className="grid grid-cols-2 gap-1.5">
                {SIGNAL_TYPES.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => { patchEdge(selectedEdge.id, { signal: s.value }); setLastSignal(s.value) }}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      selectedEdge.signal === s.value ? 'border-gray-900 bg-gray-50 text-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <SignalSwatch color={s.color} dash={s.dash} />
                    <span className="truncate">{s.label}</span>
                  </button>
                ))}
              </div>
            </Field>
            <Field label="ชื่อสาย / ความยาว">
              <input className={inputCls} placeholder="เช่น SDI 50m #12" value={selectedEdge.label ?? ''} onChange={(e) => patchEdge(selectedEdge.id, { label: e.target.value })} />
            </Field>
            <Field label="หมายเหตุ">
              <textarea className={inputCls} rows={2} value={selectedEdge.note ?? ''} onChange={(e) => patchEdge(selectedEdge.id, { note: e.target.value })} />
            </Field>
            <DeleteButton onClick={removeSelection} label="ลบสายนี้" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-gray-800">วางอุปกรณ์ลงผัง</p>
                <button onClick={placeAll} className="text-xs text-brand hover:text-brand-dark font-medium">วางทุกชิ้น</button>
              </div>
              {planItems.length === 0 ? (
                <p className="text-xs text-gray-400">ยังไม่มีอุปกรณ์ในรายการ — เพิ่มที่แท็บ “รายการอุปกรณ์” ก่อน หรือใช้กล่องอิสระด้านล่าง</p>
              ) : (
                <ul className="space-y-1">
                  {planItems.map((item) => {
                    const count = placedCount(item)
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => addFromItem(item)}
                          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-left hover:bg-gray-50 transition-colors"
                        >
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: CATEGORY_COLORS[item.category] }} />
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm text-gray-800 truncate">
                              {item.name || '—'}
                              {isRentalItem(item) && <span className={`ml-1.5 px-1 py-0.5 rounded text-[10px] font-medium ${itemOrigin(item) === 'partner' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>{ORIGIN_LABEL[itemOrigin(item)]}</span>}
                            </span>
                            {item.code && <span className="block text-[11px] text-gray-400">{item.code}{item.quantity > 1 ? ` · ×${item.quantity}` : ''}</span>}
                          </span>
                          {count > 0
                            ? <span className="text-[11px] text-green-600 font-medium shrink-0">ในผัง {count}</span>
                            : <PlusIcon className="w-4 h-4 text-gray-400 shrink-0" />}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              {onRequestAdd && (
                <button
                  onClick={onRequestAdd}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-brand-soft text-sm font-medium text-brand hover:bg-brand-tint transition-colors"
                >
                  <PlusIcon className="w-4 h-4" /> เลือกอุปกรณ์เพิ่ม (บริษัท / ของเช่า)
                </button>
              )}
              <button
                onClick={addFreeNode}
                className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-gray-300 text-sm text-gray-600 hover:border-brand hover:text-brand transition-colors"
              >
                <PlusIcon className="w-4 h-4" /> กล่องอิสระ (ของสถานที่ / ลูกค้า)
              </button>
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-800 mb-2">สายที่จะโยงเส้นถัดไป</p>
              <div className="grid grid-cols-2 gap-1.5">
                {SIGNAL_TYPES.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setLastSignal(s.value)}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      lastSignal === s.value ? 'border-gray-900 bg-gray-50 text-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <SignalSwatch color={s.color} dash={s.dash} />
                    <span className="truncate">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs text-gray-400 space-y-1 border-t border-gray-100 pt-3">
              <p>• ลากจากจุด port ไปอีกจุด (หรือคลิกทีละจุด) เพื่อโยงสาย · ◇ = port เข้า-ออกในตัวเดียว</p>
              <p>• คลิกกล่อง/เส้นเพื่อแก้ไข · Delete เพื่อลบ</p>
              <p>• ลากพื้นว่างเพื่อเลื่อน · Ctrl/⌘ + scroll เพื่อซูม</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm font-semibold text-gray-800">{title}</p>
      <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><XMarkIcon className="w-4 h-4" /></button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 mb-1.5">{label}</p>
      {children}
    </div>
  )
}

function DeleteButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm text-red-600 hover:bg-red-50 transition-colors">
      <TrashIcon className="w-4 h-4" /> {label}
    </button>
  )
}

export function SignalSwatch({ color, dash }: { color: string; dash?: string }) {
  return (
    <svg width={26} height={6} className="shrink-0">
      <line x1={0} y1={3} x2={26} y2={3} stroke={color} strokeWidth={2.2} strokeDasharray={dash} />
    </svg>
  )
}
