'use client'

import { useEffect, useRef, useState } from 'react'

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

/**
 * ช่องพิมพ์ + รายการแนะนำ (แทน <datalist> ที่ Safari/มือถือโชว์ไม่ค่อยติดและกรองไม่ได้)
 * โฟกัสแล้วเห็นตัวเลือกทั้งหมดทันที พิมพ์แล้วกรองแบบ "มีคำนี้อยู่ตรงไหนก็ได้" · ↑↓ Enter Esc ใช้ได้
 * พิมพ์ค่าใหม่ที่ไม่มีในรายการก็ได้ — เป็นแค่ตัวช่วยให้สะกดตรงกันทุกครั้ง
 */
export default function SuggestInput({ value, onChange, options, placeholder, className = '', disabled, onEnter, hint }: SuggestInputProps) {
  const [open, setOpen] = useState(false)
  const [idx, setIdx] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  const q = norm(value)
  const list = [...new Set(options.filter(Boolean))]
    .filter((o) => !q || norm(o).includes(q))
    // ที่ "เริ่มด้วย" คำที่พิมพ์มาก่อน แล้วค่อยเรียงตัวอักษร
    .sort((a, b) => (Number(!norm(a).startsWith(q)) - Number(!norm(b).startsWith(q))) || a.localeCompare(b, 'th'))
    .slice(0, 12)
  const showing = open && list.length > 0 && !(list.length === 1 && norm(list[0]) === q)

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
        className={className}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setOpen(true); setIdx(0) }}
        onFocus={() => { setOpen(true); setIdx(0) }}
        onKeyDown={onKeyDown}
      />
      {showing && (
        <ul className="absolute z-[210] left-0 right-0 mt-1 max-h-60 overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg text-sm">
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
