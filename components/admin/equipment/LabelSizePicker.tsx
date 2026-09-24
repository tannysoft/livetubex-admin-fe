'use client'

import { LABEL_SIZES, useLabelSize } from '@/lib/equipment/lens-lines'

/** ปุ่ม S / M / L ขนาดป้ายชื่อในผังวาง 3D — ค่าเดียวใช้ทุกหน้า (แก้ผัง / แชร์ / พิมพ์) */
export default function LabelSizePicker({ className = '' }: { className?: string }) {
  const [size, setSize] = useLabelSize()
  return (
    <div className={`inline-flex items-center rounded-lg border border-gray-200 bg-white p-0.5 text-xs font-medium ${className}`} role="group" aria-label="ขนาดป้ายชื่อ">
      <span className="px-1.5 text-gray-400">ป้าย</span>
      {LABEL_SIZES.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => setSize(s)}
          aria-pressed={size === s}
          className={`w-7 py-1 rounded-md ${size === s ? 'bg-brand-soft text-gray-900' : 'text-gray-500 hover:bg-gray-100'}`}
        >
          {s}
        </button>
      ))}
    </div>
  )
}
