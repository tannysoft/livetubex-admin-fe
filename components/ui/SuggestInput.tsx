'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

interface SuggestInputProps {
  value: string
  onChange: (v: string) => void
  /** ตัวเลือกทั้งหมด — โชว์ทั้งหมดตอนโฟกัส แล้วกรองตามที่พิมพ์ */
  options: string[]
  placeholder?: string
  className?: string
  disabled?: boolean
  onEnter?: () => void
  /** ข้อความท้ายรายการ เช่น บอกที่มาของตัวเลือก */
  hint?: string
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** กล่องที่ position: fixed อ้างอิง — ปกติคือจอ แต่ถ้ามีบรรพบุรุษที่มี transform/filter (เช่น panel ของ Modal) จะอ้างกล่องนั้นแทน */
function fixedContainer(el: HTMLElement): DOMRect | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const cs = getComputedStyle(p)
    if (cs.transform !== 'none' || cs.filter !== 'none' || cs.perspective !== 'none' || /paint|layout|strict|content/.test(cs.contain)) return p.getBoundingClientRect()
  }
  return null
}

type ListPos = { left: number; width: number; top?: number; bottom?: number; maxHeight: number }

/**
 * ช่องพิมพ์ + รายการแนะนำ (แทน <datalist> ที่ Safari/มือถือโชว์ไม่ค่อยติดและกรองไม่ได้)
 * โฟกัสแล้วเห็นตัวเลือกทั้งหมดทันที พิมพ์แล้วกรองแบบ "มีคำนี้อยู่ตรงไหนก็ได้" · ↑↓ Enter Esc ใช้ได้
 * พิมพ์ค่าใหม่ที่ไม่มีในรายการก็ได้ — เป็นแค่ตัวช่วยให้สะกดตรงกันทุกครั้ง
 */
export default function SuggestInput({ value, onChange, options, placeholder, className = '', disabled, onEnter, hint }: SuggestInputProps) {
  const [open, setOpen] = useState(false)
  const [idx, setIdx] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // รายการลอยแบบ fixed — ไม่โดนตัดโดยกล่องที่ overflow (เช่น ตารางที่เลื่อนแนวนอน) และเปิดขึ้นบนเมื่อข้างล่างไม่พอ
  const [pos, setPos] = useState<ListPos | null>(null)

  const q = norm(value)
  const list = [...new Set(options.filter(Boolean))]
    .filter((o) => !q || norm(o).includes(q))
    // ที่ "เริ่มด้วย" คำที่พิมพ์มาก่อน แล้วค่อยเรียงตัวอักษร
    .sort((a, b) => (Number(!norm(a).startsWith(q)) - Number(!norm(b).startsWith(q))) || a.localeCompare(b, 'th'))
    .slice(0, 12)
  const showing = open && list.length > 0 && !(list.length === 1 && norm(list[0]) === q)

  const place = useCallback(() => {
    const input = inputRef.current
    if (!input) return
    const r = input.getBoundingClientRect()
    const cb = fixedContainer(input)
    const offX = cb?.left ?? 0
    const offY = cb?.top ?? 0
    const cbBottom = cb ? cb.bottom : window.innerHeight
    const below = window.innerHeight - r.bottom
    const up = below < 220 && r.top > below
    const room = (up ? r.top : below) - 12
    setPos(up
      ? { left: r.left - offX, width: r.width, bottom: cbBottom - r.top + 4, maxHeight: Math.max(120, Math.min(240, room)) }
      : { left: r.left - offX, width: r.width, top: r.bottom - offY + 4, maxHeight: Math.max(120, Math.min(240, room)) })
  }, [])

  useLayoutEffect(() => {
    if (!showing) return
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place) }
  }, [showing, place])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showing) {
      if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter() }
      else if (e.key === 'ArrowDown') setOpen(true)
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, list.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(list[idx] ?? list[0]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        ref={inputRef}
        className={className}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setOpen(true); setIdx(0) }}
        onFocus={() => { setOpen(true); setIdx(0) }}
        onKeyDown={onKeyDown}
      />
      {showing && pos && (
        <ul
          style={{ left: pos.left, width: pos.width, minWidth: 180, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
          className="fixed z-[210] overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg text-sm"
        >
          {list.map((o, i) => (
            <li key={o}>
              <button
                type="button"
                onMouseEnter={() => setIdx(i)}
                onClick={() => pick(o)}
                className={`w-full px-3 py-1.5 text-left truncate ${i === idx ? 'bg-brand-soft text-gray-900' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                {o}
              </button>
            </li>
          ))}
          {hint && <li className="px-3 pt-1.5 pb-1 text-[10px] text-gray-400 border-t border-gray-100 mt-1">{hint}</li>}
        </ul>
      )}
    </div>
  )
}
