'use client'

import DiagramGraph from '@/components/admin/equipment/DiagramGraph'
import { diagramBounds } from '@/lib/equipment/diagram'
import type { PlanDiagram } from '@/lib/types'

/** ผังย่อแบบอ่านอย่างเดียว พอดีกรอบ — ใช้ในร่างผู้ช่วย AI และหน้า revision */
export default function DiagramPreview({ diagram, height = 360 }: { diagram: PlanDiagram; height?: number }) {
  if (diagram.nodes.length === 0) {
    return <div className="bg-gray-50/60 flex items-center justify-center text-sm text-gray-400" style={{ height }}>ผังว่าง</div>
  }
  const b = diagramBounds(diagram)
  return (
    <div className="bg-gray-50/60" style={{ height }}>
      <svg viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        <DiagramGraph diagram={diagram} />
      </svg>
    </div>
  )
}
