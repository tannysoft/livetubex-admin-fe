'use client'

import { MinusIcon, PlusIcon } from '@heroicons/react/20/solid'
import { calcTax, formatCurrency } from '@/lib/utils'

/**
 * ยอดขอเบิก = จำนวนคิว × ราคาต่อคิว — ฟอร์มขอเบิก LIFF (2 หน้า) + สร้าง/แก้การเบิกจ่ายของแอดมิน
 * จำนวนคิวเริ่มที่ 1 · +/− ทีละ 0.5 · พิมพ์เองได้
 */
export function queueTotal(queuesInput: string, rateInput: string): { queues: number; rate: number; amount: number } {
  const queues = Number(queuesInput)
  const rate = Number(rateInput)
  const ok = Number.isFinite(queues) && queues > 0 && Number.isFinite(rate) && rate > 0
  return { queues, rate, amount: ok ? Math.round(queues * rate * 100) / 100 : 0 }
}

const STEP = 0.5
/** +/− ทีละ 0.5 แล้วปัดให้ลงตัวครึ่งคิว (พิมพ์ 1.3 แล้วกด + = 1.5) · ต่ำสุด 0.5 */
function stepQueue(v: number, dir: 1 | -1): number {
  const snapped = dir > 0 ? Math.floor(v / STEP) * STEP + STEP : Math.ceil(v / STEP) * STEP - STEP
  return Math.max(STEP, Math.round(snapped * 2) / 2)
}

export default function QueueAmountInput({ queues, onQueues, rate, onRate, inputCls, labelCls }: {
  queues: string
  onQueues: (v: string) => void
  rate: string
  onRate: (v: string) => void
  inputCls: string
  labelCls: string
}) {
  const { amount } = queueTotal(queues, rate)
  // ฐานของปุ่ม +/− (ช่องว่าง/พิมพ์ผิด = 0 → กด + ได้ 0.5)
  const typed = Number(queues)
  const current = queues.trim() && Number.isFinite(typed) ? typed : 0
  const tax = calcTax(amount)
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1.3fr_auto_1.2fr] items-end gap-2">
        <div>
          <label className={labelCls}>จำนวนคิว *</label>
          {/* + / − ทีละครึ่งคิว (0.5) · พิมพ์เองได้ */}
          <div className="flex items-stretch rounded-xl border border-gray-200 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-brand/30 focus-within:border-brand transition-all">
            <button
              type="button"
              onClick={() => onQueues(String(stepQueue(current, -1)))}
              disabled={current <= STEP}
              className="w-10 shrink-0 flex items-center justify-center text-gray-600 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 disabled:opacity-30 disabled:hover:bg-gray-50"
              aria-label="ลดจำนวนคิว"
            >
              <MinusIcon className="w-4 h-4" />
            </button>
            <input
              type="number"
              value={queues}
              onChange={(e) => onQueues(e.target.value)}
              className="w-full min-w-0 py-2.5 text-center text-sm font-medium tabular-nums focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              min="0.5"
              step="0.5"
              inputMode="decimal"
              placeholder="1"
              aria-label="จำนวนคิว"
            />
            <button
              type="button"
              onClick={() => onQueues(String(stepQueue(current, 1)))}
              className="w-10 shrink-0 flex items-center justify-center text-gray-600 bg-gray-50 hover:bg-gray-100 active:bg-gray-200"
              aria-label="เพิ่มจำนวนคิว"
            >
              <PlusIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
        <span className="pb-3 text-gray-400">×</span>
        <div>
          <label className={labelCls}>ราคาต่อคิว (บาท) *</label>
          <input
            type="number"
            value={rate}
            onChange={(e) => onRate(e.target.value)}
            className={inputCls}
            min="1"
            inputMode="numeric"
            placeholder="0"
          />
        </div>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5">
        <span className="text-sm text-gray-600">รวมเป็นเงิน</span>
        <span className="text-right">
          <span className="block text-base font-bold text-gray-900 tabular-nums">{formatCurrency(amount)}</span>
          {amount > 0 && <span className="block text-[11px] text-gray-500 tabular-nums">หัก 3% {formatCurrency(tax.tax)} · ได้รับ {formatCurrency(tax.net)}</span>}
        </span>
      </div>
    </div>
  )
}
