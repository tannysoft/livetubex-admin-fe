'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowsPointingInIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon } from '@heroicons/react/24/outline'

interface ZoomPanProps {
  children: ReactNode
  className?: string
  /** ซูมได้สูงสุดกี่เท่าของขนาดพอดีกรอบ */
  maxScale?: number
}

interface View { x: number; y: number; s: number }

/**
 * กรอบซูม/เลื่อนสำหรับมือถือ — 2 นิ้วบีบซูม, 1 นิ้วลาก, แตะ 2 ครั้งซูมเข้า/กลับ, ล้อเมาส์ซูม
 * ลูกต้องขยายเต็มกรอบ (w-full h-full) — scale 1 = พอดีกรอบ, เลื่อนได้เฉพาะตอนซูมและไม่หลุดขอบ
 */
export default function ZoomPan({ children, className = '', maxScale = 10 }: ZoomPanProps) {
  const box = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, s: 1 })
  const viewRef = useRef(view)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; s: number; cx: number; cy: number } | null>(null)
  const tap = useRef<{ t: number; x: number; y: number; moved: boolean }>({ t: 0, x: 0, y: 0, moved: false })

  const apply = useCallback((v: View) => {
    const el = box.current
    const w = el?.clientWidth ?? 0
    const h = el?.clientHeight ?? 0
    const s = Math.min(maxScale, Math.max(1, v.s))
    // ไม่ให้เลื่อนจนเนื้อหาหลุดกรอบ (เนื้อหาขนาดเท่ากรอบ × s)
    const x = Math.min(0, Math.max(w - w * s, v.x))
    const y = Math.min(0, Math.max(h - h * s, v.y))
    viewRef.current = { x, y, s }
    setView(viewRef.current)
  }, [maxScale])

  /** ซูมโดยให้จุด (px,py) ในกรอบอยู่กับที่ */
  const zoomAt = useCallback((px: number, py: number, s: number) => {
    const v = viewRef.current
    const next = Math.min(maxScale, Math.max(1, s))
    apply({ s: next, x: px - (px - v.x) * (next / v.s), y: py - (py - v.y) * (next / v.s) })
  }, [apply, maxScale])

  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  // React ผูก wheel แบบ passive → preventDefault ไม่ได้ ต้องผูกเอง
  useEffect(() => {
    const el = box.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const p = local(e)
      zoomAt(p.x, p.y, viewRef.current.s * Math.exp(-e.deltaY * 0.002))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  // หมุนจอ/เปลี่ยนขนาด → กลับไปพอดีกรอบ
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => apply({ x: 0, y: 0, s: 1 }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [apply])

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()]
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const v = viewRef.current
    // จุดของเนื้อหาที่อยู่ใต้กลางสองนิ้ว — ให้ตามนิ้วไประหว่างบีบ
    pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: v.s, cx: (mid.x - v.x) / v.s, cy: (mid.y - v.y) / v.s }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    box.current?.setPointerCapture(e.pointerId)
    const p = local(e)
    pointers.current.set(e.pointerId, p)
    if (pointers.current.size === 2) startPinch()
    if (pointers.current.size === 1) tap.current = { ...tap.current, x: p.x, y: p.y, moved: false }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    const p = local(e)
    pointers.current.set(e.pointerId, p)
    if (Math.hypot(p.x - tap.current.x, p.y - tap.current.y) > 8) tap.current.moved = true
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const s = Math.min(maxScale, Math.max(1, pinch.current.s * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist)))
      apply({ s, x: mid.x - pinch.current.cx * s, y: mid.y - pinch.current.cy * s })
    } else if (pointers.current.size === 1) {
      const v = viewRef.current
      apply({ ...v, x: v.x + p.x - prev.x, y: v.y + p.y - prev.y })
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const p = pointers.current.get(e.pointerId)
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 1) startPinch() // ยกนิ้วหนึ่ง → อีกนิ้วลากต่อได้
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 0 && p && !tap.current.moved) {
      const now = Date.now()
      if (now - tap.current.t < 300) {
        // แตะสองครั้ง: ซูมเข้า 2.5 เท่าที่จุดนั้น หรือกลับพอดีกรอบถ้าซูมอยู่แล้ว
        if (viewRef.current.s > 1.05) apply({ x: 0, y: 0, s: 1 })
        else zoomAt(p.x, p.y, 2.5)
        tap.current.t = 0
      } else {
        tap.current.t = now
      }
    }
  }

  /** ปุ่ม +/− ซูมรอบกลางกรอบ */
  const zoomBy = (factor: number) => {
    const el = box.current
    zoomAt((el?.clientWidth ?? 0) / 2, (el?.clientHeight ?? 0) / 2, viewRef.current.s * factor)
  }
  const reset = () => apply({ x: 0, y: 0, s: 1 })

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div
        ref={box}
        className="absolute inset-0 touch-none select-none cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="w-full h-full origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}>
          {children}
        </div>
      </div>
      <div className="absolute right-2 bottom-2 flex flex-col gap-1.5">
        <ZoomButton label="ซูมเข้า" onClick={() => zoomBy(1.6)}><MagnifyingGlassPlusIcon className="w-5 h-5" /></ZoomButton>
        <ZoomButton label="ซูมออก" onClick={() => zoomBy(1 / 1.6)}><MagnifyingGlassMinusIcon className="w-5 h-5" /></ZoomButton>
        <ZoomButton label="พอดีจอ" onClick={reset}><ArrowsPointingInIcon className="w-5 h-5" /></ZoomButton>
      </div>
      {view.s > 1.01 && (
        <span className="absolute left-2 bottom-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[11px] tabular-nums">{view.s.toFixed(1)}×</span>
      )}
    </div>
  )
}

function ZoomButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="w-10 h-10 flex items-center justify-center rounded-full bg-white/95 border border-gray-200 shadow-sm text-gray-700 active:bg-gray-100"
    >
      {children}
    </button>
  )
}
