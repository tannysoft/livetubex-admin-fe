'use client'

import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import type { DocumentItem } from '@/lib/types'
import { calcLineAmount, round2 } from '@/lib/accounting/calc'
import { formatCurrency } from '@/lib/utils'

interface Props {
  items: DocumentItem[]
  onChange: (items: DocumentItem[]) => void
  readonly?: boolean
}

const emptyItem: DocumentItem = { description: '', quantity: 1, unitPrice: 0, discount: 0, amount: 0 }

export default function DocumentItemsTable({ items, onChange, readonly }: Props) {
  const update = (idx: number, patch: Partial<DocumentItem>) => {
    const next = items.map((it, i) => {
      if (i !== idx) return it
      const merged = { ...it, ...patch }
      merged.amount = calcLineAmount(merged.quantity || 0, merged.unitPrice || 0, merged.discount || 0)
      return merged
    })
    onChange(next)
  }

  const addRow = () => {
    onChange([...items, { ...emptyItem }])
  }

  const removeRow = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx))
  }

  const inputCls = 'w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727] transition-all bg-white'
  const numCls = `${inputCls} text-right tabular-nums`

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-3 py-2 text-left font-semibold w-8">#</th>
              <th className="px-3 py-2 text-left font-semibold">รายการ</th>
              <th className="px-3 py-2 text-right font-semibold w-24">จำนวน</th>
              <th className="px-3 py-2 text-right font-semibold w-32">ราคา/หน่วย</th>
              <th className="px-3 py-2 text-right font-semibold w-28">ส่วนลด</th>
              <th className="px-3 py-2 text-right font-semibold w-32">จำนวนเงิน</th>
              {!readonly && <th className="px-2 py-2 w-10"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={readonly ? 6 : 7} className="px-3 py-6 text-center text-gray-400 text-xs">
                  ยังไม่มีรายการ — กด &quot;เพิ่มรายการ&quot; ด้านล่าง
                </td>
              </tr>
            ) : items.map((it, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-400 align-top pt-3 text-sm">{idx + 1}</td>
                <td className="px-2 py-2">
                  {readonly ? (
                    <div className="text-sm text-gray-900 whitespace-pre-wrap py-1">{it.description}</div>
                  ) : (
                    <textarea
                      value={it.description}
                      onChange={(e) => update(idx, { description: e.target.value })}
                      rows={1}
                      className={`${inputCls} resize-none`}
                      placeholder="รายละเอียดสินค้า/บริการ"
                    />
                  )}
                </td>
                <td className="px-2 py-2">
                  {readonly ? (
                    <div className="text-right tabular-nums py-1 text-sm">{it.quantity}</div>
                  ) : (
                    <input
                      type="number"
                      value={it.quantity}
                      onChange={(e) => update(idx, { quantity: Number(e.target.value) })}
                      className={numCls}
                      min={0}
                      step="any"
                    />
                  )}
                </td>
                <td className="px-2 py-2">
                  {readonly ? (
                    <div className="text-right tabular-nums py-1 text-sm">{formatCurrency(it.unitPrice)}</div>
                  ) : (
                    <input
                      type="number"
                      value={it.unitPrice}
                      onChange={(e) => update(idx, { unitPrice: Number(e.target.value) })}
                      className={numCls}
                      min={0}
                      step="any"
                    />
                  )}
                </td>
                <td className="px-2 py-2">
                  {readonly ? (
                    <div className="text-right tabular-nums py-1 text-sm">{it.discount ? formatCurrency(it.discount) : '-'}</div>
                  ) : (
                    <input
                      type="number"
                      value={it.discount ?? 0}
                      onChange={(e) => update(idx, { discount: Number(e.target.value) })}
                      className={numCls}
                      min={0}
                      step="any"
                    />
                  )}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums pt-3 text-sm">
                  {formatCurrency(round2(it.amount || 0))}
                </td>
                {!readonly && (
                  <td className="px-2 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!readonly && (
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#f73727] hover:bg-red-50 rounded-xl transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          เพิ่มรายการ
        </button>
      )}
    </div>
  )
}
