'use client'

import { formatCurrency } from '@/lib/utils'
import type { DocumentTotals } from '@/lib/accounting/calc'

interface Props {
  totals: DocumentTotals
  discountTotal: number
  vatRate: number
  whtRate?: number
  onDiscountChange?: (v: number) => void
  onVatRateChange?: (v: number) => void
  onWhtRateChange?: (v: number | undefined) => void
  readonly?: boolean
}

export default function DocumentSummary({
  totals,
  discountTotal,
  vatRate,
  whtRate,
  onDiscountChange,
  onVatRateChange,
  onWhtRateChange,
  readonly,
}: Props) {
  const inputCls = 'w-24 px-2 py-1 rounded-lg border border-gray-200 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727]'

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
      <dl className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-gray-600">ยอดรวม</dt>
          <dd className="font-medium tabular-nums">{formatCurrency(totals.subtotal)}</dd>
        </div>

        <div className="flex items-center justify-between">
          <dt className="text-gray-600">ส่วนลดท้ายเอกสาร</dt>
          <dd className="tabular-nums">
            {readonly || !onDiscountChange ? (
              <span className="font-medium">{discountTotal > 0 ? `- ${formatCurrency(discountTotal)}` : formatCurrency(0)}</span>
            ) : (
              <input
                type="number"
                min={0}
                step="any"
                value={discountTotal}
                onChange={(e) => onDiscountChange(Number(e.target.value) || 0)}
                className={inputCls}
              />
            )}
          </dd>
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 pt-2">
          <dt className="text-gray-600">ยอดก่อน VAT</dt>
          <dd className="font-medium tabular-nums">{formatCurrency(totals.baseBeforeVat)}</dd>
        </div>

        <div className="flex items-center justify-between">
          <dt className="text-gray-600 flex items-center gap-2">
            <span>VAT</span>
            {readonly || !onVatRateChange ? (
              <span className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded">{vatRate}%</span>
            ) : (
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  value={vatRate}
                  onChange={(e) => onVatRateChange(Number(e.target.value) || 0)}
                  className="w-14 px-1.5 py-0.5 rounded border border-gray-200 text-xs text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727]"
                />
                <span className="text-xs">%</span>
              </span>
            )}
          </dt>
          <dd className="font-medium tabular-nums">{formatCurrency(totals.vatAmount)}</dd>
        </div>

        <div className="flex items-center justify-between border-t border-gray-300 pt-2 text-base">
          <dt className="font-semibold text-gray-800">รวมทั้งสิ้น</dt>
          <dd className="font-bold text-[#f73727] tabular-nums">{formatCurrency(totals.grandTotal)}</dd>
        </div>

        {/* WHT (optional) */}
        {(readonly && totals.whtAmount === undefined) ? null : (
          <>
            <div className="flex items-center justify-between border-t border-gray-200 pt-2">
              <dt className="text-gray-600 flex items-center gap-2">
                <span>หัก ณ ที่จ่าย</span>
                {readonly || !onWhtRateChange ? (
                  whtRate ? <span className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded">{whtRate}%</span> : null
                ) : (
                  <span className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="any"
                      value={whtRate ?? ''}
                      onChange={(e) => {
                        const v = e.target.value === '' ? undefined : Number(e.target.value)
                        onWhtRateChange(v && v > 0 ? v : undefined)
                      }}
                      placeholder="0"
                      className="w-14 px-1.5 py-0.5 rounded border border-gray-200 text-xs text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727]"
                    />
                    <span className="text-xs">%</span>
                  </span>
                )}
              </dt>
              <dd className="font-medium tabular-nums text-red-600">
                {totals.whtAmount ? `- ${formatCurrency(totals.whtAmount)}` : '-'}
              </dd>
            </div>

            {totals.netPayable !== undefined && (
              <div className="flex items-center justify-between border-t border-gray-300 pt-2 text-base">
                <dt className="font-semibold text-gray-800">ยอดที่ต้องชำระสุทธิ</dt>
                <dd className="font-bold text-green-700 tabular-nums">{formatCurrency(totals.netPayable)}</dd>
              </div>
            )}
          </>
        )}
      </dl>
    </div>
  )
}
