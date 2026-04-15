'use client'

import { useEffect, useMemo, useState } from 'react'

const COLORS = ['#f73727', '#FFD700', '#06C755', '#4A90E2', '#FF69B4', '#FF8C00', '#9B59B6', '#00BCD4']
const COUNT   = 60

interface Piece {
  id: number
  color: string
  left: string
  size: string
  delay: string
  duration: string
  shape: 'circle' | 'rect'
}

export default function CelebrationOverlay({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), 3200)
    const t2 = setTimeout(() => onDone(), 3800)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onDone])

  const pieces = useMemo<Piece[]>(() =>
    Array.from({ length: COUNT }, (_, i) => ({
      id: i,
      color: COLORS[i % COLORS.length],
      left: `${(i / COUNT) * 100 + (Math.random() - 0.5) * 4}%`,
      size: `${7 + (i % 5) * 3}px`,
      delay: `${(i % 20) * 0.07}s`,
      duration: `${2 + (i % 8) * 0.25}s`,
      shape: i % 3 === 0 ? 'circle' : 'rect',
    })), [])

  return (
    <div
      className={`fixed inset-0 z-[999] flex flex-col items-center justify-end overflow-hidden pointer-events-auto ${leaving ? 'celebration-out' : ''}`}
      onClick={() => { setLeaving(true); setTimeout(onDone, 600) }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" />

      {/* Confetti */}
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece absolute top-0 pointer-events-none"
          style={{
            left: p.left,
            width: p.size,
            height: p.shape === 'circle' ? p.size : `${parseInt(p.size) * 0.6}px`,
            backgroundColor: p.color,
            borderRadius: p.shape === 'circle' ? '50%' : '2px',
            animationDelay: p.delay,
            animationDuration: p.duration,
          }}
        />
      ))}

      {/* CEO + badge */}
      <div className="relative z-10 flex flex-col items-center pb-0 ceo-enter">
        {/* Badge */}
        <div className="badge-pop mb-3 bg-white rounded-2xl px-6 py-3 shadow-2xl text-center">
          <p className="text-2xl font-black text-[#f73727] leading-tight">โอนสำเร็จแล้ว! 🎉</p>
          <p className="text-sm text-gray-500 mt-0.5">ขอบคุณที่ได้ร่วมงานค้าบ 🙏</p>
        </div>

        {/* CEO photo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/ceo.png"
          alt="CEO"
          className="h-72 sm:h-80 object-contain drop-shadow-2xl select-none"
          draggable={false}
        />
      </div>
    </div>
  )
}
