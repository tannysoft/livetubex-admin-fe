'use client'

import { useMemo } from 'react'
import { formatCurrency } from '@/lib/utils'

export interface TrendPoint {
  label: string         // เช่น "พ.ค. 68"
  revenue: number
  expense: number
  profit: number
}

interface Props {
  data: TrendPoint[]
  height?: number       // SVG height in px (default 220)
}

/**
 * Simple SVG bar chart — grouped bars for revenue vs expense, line for profit overlay
 * ไม่พึ่ง chart library — ทำให้ bundle เบา
 */
export default function TrendChart({ data, height = 240 }: Props) {
  const { paddedData, maxBar, maxAbsProfit } = useMemo(() => {
    const padded = data.length > 0 ? data : []
    const maxBar = Math.max(1, ...padded.flatMap((d) => [d.revenue, d.expense]))
    const maxAbsProfit = Math.max(1, ...padded.map((d) => Math.abs(d.profit)))
    return { paddedData: padded, maxBar, maxAbsProfit }
  }, [data])

  if (paddedData.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">ไม่มีข้อมูล</p>
  }

  const padding = { top: 20, right: 50, bottom: 28, left: 50 }
  const width = 720
  const innerW = width - padding.left - padding.right
  const innerH = height - padding.top - padding.bottom
  const groupW = innerW / paddedData.length
  const barW = (groupW - 12) / 2

  const yBar = (v: number) => innerH - (v / maxBar) * innerH
  // profit overlay axis (separate, centered at 50% with +/-)
  const yProfit = (v: number) => innerH / 2 - (v / maxAbsProfit) * (innerH / 2 - 4)

  // y-axis grid lines for bars
  const gridSteps = 4
  const gridValues = Array.from({ length: gridSteps + 1 }, (_, i) => (maxBar * i) / gridSteps)

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[600px]" style={{ height }}>
        {/* y-axis grid */}
        {gridValues.map((v, i) => {
          const y = padding.top + yBar(v)
          return (
            <g key={i}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#e5e7eb" strokeWidth={0.5} strokeDasharray="3,3" />
              <text x={padding.left - 4} y={y + 3} textAnchor="end" fontSize="9" fill="#9ca3af">
                {v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}
              </text>
            </g>
          )
        })}

        {/* bars + labels */}
        {paddedData.map((d, i) => {
          const groupX = padding.left + i * groupW + 6
          const revH = innerH - yBar(d.revenue)
          const expH = innerH - yBar(d.expense)
          return (
            <g key={i}>
              {/* revenue bar (green) */}
              <rect
                x={groupX}
                y={padding.top + yBar(d.revenue)}
                width={barW}
                height={revH}
                fill="#15803d"
                rx={2}
              />
              <title>รายได้: {formatCurrency(d.revenue)}</title>

              {/* expense bar (red) */}
              <rect
                x={groupX + barW + 2}
                y={padding.top + yBar(d.expense)}
                width={barW}
                height={expH}
                fill="#b91c1c"
                rx={2}
              />

              {/* x-axis label */}
              <text x={groupX + barW} y={height - padding.bottom + 16} textAnchor="middle" fontSize="9" fill="#6b7280">
                {d.label}
              </text>

              {/* profit dot */}
              <circle
                cx={groupX + barW}
                cy={padding.top + yProfit(d.profit)}
                r={3}
                fill={d.profit >= 0 ? '#f73727' : '#dc2626'}
                stroke="#fff"
                strokeWidth={1.5}
              />
            </g>
          )
        })}

        {/* profit line */}
        <polyline
          fill="none"
          stroke="#f73727"
          strokeWidth={1.5}
          points={paddedData.map((d, i) => {
            const x = padding.left + i * groupW + 6 + barW
            const y = padding.top + yProfit(d.profit)
            return `${x},${y}`
          }).join(' ')}
        />

        {/* zero line for profit */}
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={padding.top + innerH / 2}
          y2={padding.top + innerH / 2}
          stroke="#d1d5db"
          strokeWidth={0.5}
          strokeDasharray="2,3"
        />
      </svg>

      {/* legend */}
      <div className="flex items-center justify-center gap-4 text-xs text-gray-600 mt-2">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-green-700"></span>
          รายได้
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-red-700"></span>
          รายจ่าย
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-1 rounded-sm bg-[#f73727]"></span>
          กำไรสุทธิ
        </span>
      </div>
    </div>
  )
}
