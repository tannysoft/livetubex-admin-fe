'use client'

import type { DiagramEdge, DiagramNode, DiagramPortRef, PlanDiagram } from '@/lib/types'
import { CATEGORY_COLORS, signalMeta } from '@/lib/equipment/constants'
import {
  NODE_HEADER_H, NODE_W, NOTE_LINE_H, NOTE_PAD, PORT_ROW_H, edgeMidpoint, edgePath, exitSide, nodeHeight, noteHeight,
  portPosition, portRow, portsBottom, portsOf, wrapNote,
} from '@/lib/equipment/diagram'

export type DiagramSelection = { type: 'node' | 'edge'; id: string } | null

interface DiagramGraphProps {
  diagram: PlanDiagram
  selection?: DiagramSelection
  /** port ต้นทางของเส้นที่กำลังลาก — ไฮไลต์ให้เห็นว่าเริ่มจากไหน */
  linkingFrom?: DiagramPortRef | null
  onNodePointerDown?: (e: React.PointerEvent, node: DiagramNode) => void
  onPortPointerDown?: (e: React.PointerEvent, ref: DiagramPortRef) => void
  onPortPointerUp?: (e: React.PointerEvent, ref: DiagramPortRef) => void
  onEdgePointerDown?: (e: React.PointerEvent, edge: DiagramEdge) => void
}

function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

/**
 * เนื้อในของผังโยง (เส้น + กล่อง) — ไม่มี <svg> ครอบ
 * ตัวแก้ไขกับหน้า print ใช้ตัวเดียวกัน ผังที่พิมพ์จึงตรงกับที่วาดเสมอ
 * ไม่ส่ง handler = read-only
 */
export default function DiagramGraph({
  diagram, selection, linkingFrom,
  onNodePointerDown, onPortPointerDown, onPortPointerUp, onEdgePointerDown,
}: DiagramGraphProps) {
  const interactive = !!onNodePointerDown
  const nodeById = new Map(diagram.nodes.map((n) => [n.id, n]))

  return (
    <>
      {diagram.edges.map((edge) => {
        const a = nodeById.get(edge.from.nodeId)
        const b = nodeById.get(edge.to.nodeId)
        if (!a || !b) return null
        const p1 = portPosition(a, edge.from.side, edge.from.index)
        const p2 = portPosition(b, edge.to.side, edge.to.index)
        const d = edgePath(p1, exitSide(edge.from.side), p2, exitSide(edge.to.side))
        const mid = edgeMidpoint(p1, exitSide(edge.from.side), p2, exitSide(edge.to.side))
        const meta = signalMeta(edge.signal)
        const selected = selection?.type === 'edge' && selection.id === edge.id
        const text = edge.label ? clip(edge.label, 28) : ''
        const textW = text.length * 6.2 + 10
        return (
          <g key={edge.id}>
            {selected && <path d={d} fill="none" stroke={meta.color} strokeOpacity={0.25} strokeWidth={9} strokeLinecap="round" />}
            <path d={d} fill="none" stroke={meta.color} strokeWidth={2.2} strokeDasharray={meta.dash} />
            {text && (
              <g pointerEvents="none">
                <rect x={mid.x - textW / 2} y={mid.y - 9} width={textW} height={18} rx={4} fill="#fff" stroke={meta.color} strokeWidth={1} />
                <text x={mid.x} y={mid.y + 3.5} textAnchor="middle" fontSize={10} fontWeight={600} fill={meta.color}>{text}</text>
              </g>
            )}
            {interactive && (
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                style={{ cursor: 'pointer' }}
                onPointerDown={(e) => onEdgePointerDown?.(e, edge)}
              />
            )}
          </g>
        )
      })}

      {diagram.nodes.map((node) => {
        const h = nodeHeight(node)
        const color = CATEGORY_COLORS[node.category]
        const selected = selection?.type === 'node' && selection.id === node.id
        return (
          <g key={node.id} transform={`translate(${node.x} ${node.y})`}>
            {selected && <rect x={-4} y={-4} width={NODE_W + 8} height={h + 8} rx={12} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={4} />}
            <rect width={NODE_W} height={h} rx={8} fill="#fff" stroke={color} strokeWidth={1.5} />
            {/* หัวกล่อง: มุมบนโค้ง มุมล่างตรง */}
            <path d={`M 0 ${NODE_HEADER_H} V 8 a 8 8 0 0 1 8 -8 H ${NODE_W - 8} a 8 8 0 0 1 8 8 V ${NODE_HEADER_H} Z`} fill={color} />
            <g
              style={interactive ? { cursor: 'move' } : undefined}
              onPointerDown={interactive ? (e) => onNodePointerDown?.(e, node) : undefined}
            >
              <rect width={NODE_W} height={h} rx={8} fill="transparent" />
              <text x={10} y={node.sub ? 17 : 25} fontSize={12.5} fontWeight={700} fill="#fff">{clip(node.label, 24)}</text>
              {node.sub && <text x={10} y={32} fontSize={9.5} fill="#fff" fillOpacity={0.85}>{clip(node.sub, 32)}</text>}
              {node.note?.trim() && (() => {
                // หมายเหตุ: แถบเหลืองใต้ port (สีอ่อน + ขอบ ยังอ่านออกตอนพิมพ์ขาวดำ)
                const top = portsBottom(node) + 4
                return (
                  <g pointerEvents="none">
                    <rect x={6} y={top} width={NODE_W - 12} height={noteHeight(node)} rx={4} fill="#fffbeb" stroke="#f59e0b" strokeOpacity={0.6} strokeWidth={0.8} />
                    {wrapNote(node.note).map((line, i) => (
                      <text key={i} x={11} y={top + NOTE_PAD + (i + 1) * NOTE_LINE_H - 3} fontSize={9.5} fill="#78350f">{line}</text>
                    ))}
                  </g>
                )
              })()}
            </g>

            {(['in', 'out', 'io'] as const).map((side) =>
              portsOf(node, side).map((name, index) => {
                const cx = side === 'in' ? 0 : NODE_W
                const cy = NODE_HEADER_H + portRow(node, side, index) * PORT_ROW_H + PORT_ROW_H / 2
                const ref: DiagramPortRef = { nodeId: node.id, side, index }
                const isFrom = !!linkingFrom && linkingFrom.nodeId === node.id
                  && linkingFrom.side === side && linkingFrom.index === index
                return (
                  <g key={`${side}-${index}`}>
                    <text
                      x={side === 'in' ? 11 : NODE_W - 11}
                      y={cy + 3.5}
                      textAnchor={side === 'in' ? 'start' : 'end'}
                      fontSize={10}
                      fill="#374151"
                      pointerEvents="none"
                    >
                      {side === 'io' ? `⇄ ${clip(name, 12)}` : clip(name, 14)}
                    </text>
                    {side === 'io'
                      // port เข้า-ออก = สี่เหลี่ยมข้าวหลามตัด ให้ต่างจากวงกลมของ in/out ตอนพิมพ์ขาวดำ
                      ? <rect x={cx - 5} y={cy - 5} width={10} height={10} transform={`rotate(45 ${cx} ${cy})`} fill={isFrom ? color : '#fff'} stroke={color} strokeWidth={1.8} />
                      : <circle cx={cx} cy={cy} r={5} fill={isFrom ? color : '#fff'} stroke={color} strokeWidth={1.8} />}
                    {interactive && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={11}
                        fill="transparent"
                        style={{ cursor: 'crosshair' }}
                        onPointerDown={(e) => onPortPointerDown?.(e, ref)}
                        onPointerUp={(e) => onPortPointerUp?.(e, ref)}
                      />
                    )}
                  </g>
                )
              }),
            )}
          </g>
        )
      })}
    </>
  )
}
