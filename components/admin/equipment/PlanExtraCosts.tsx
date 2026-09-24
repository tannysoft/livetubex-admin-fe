'use client'

import Link from 'next/link'
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import FormListbox from '@/components/ui/FormListbox'
import SuggestInput from '@/components/ui/SuggestInput'
import { DEFAULT_EXTRA_CATEGORY, extraCostAmount } from '@/lib/equipment/rental-cost'
import { newId } from '@/lib/equipment/plans'
import { formatCurrency } from '@/lib/utils'
import type { PlanCost } from '@/lib/types'

interface PlanExtraCostsProps {
  costs: PlanCost[]
  onChange: (costs: PlanCost[]) => void
  /** ชื่อหมวดจาก expenseCategories (ไม่รวมหมวดค่าจ้างทีมงาน — อันนั้นมาจากระบบเบิกจ่าย) */
  categoryNames: string[]
  /** ผู้ขายในระบบบัญชี + ผู้ให้เช่าที่รู้จัก — autocomplete ช่องผู้รับเงิน */
  vendorOptions?: string[]
}

const cellInput = 'w-full px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand disabled:bg-gray-50 disabled:text-gray-500'

/** ค่าใช้จ่ายอื่นของงาน (รถตู้, ที่พัก, อาหาร…) — แยกจากรายการอุปกรณ์ จึงไม่ไปโผล่ในใบจัดของ */
export default function PlanExtraCosts({ costs, onChange, categoryNames, vendorOptions = [] }: PlanExtraCostsProps) {
  const patch = (id: string, data: Partial<PlanCost>) =>
    onChange(costs.map((c) => (c.id === id ? { ...c, ...data } : c)))

  const add = () =>
    onChange([...costs, {
      id: newId(), description: '', quantity: 1, unitCost: 0,
      categoryName: categoryNames.includes(DEFAULT_EXTRA_CATEGORY) ? DEFAULT_EXTRA_CATEGORY : categoryNames[0] ?? DEFAULT_EXTRA_CATEGORY,
    }])

  const vendors = [...new Set([...costs.map((c) => c.vendor).filter((v): v is string => !!v), ...vendorOptions])].sort()

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-4 border-b border-gray-100">
        <div>
          <h2 className="font-semibold text-gray-900">ค่าใช้จ่ายอื่นของงาน</h2>
          <p className="text-xs text-gray-500 mt-0.5">รถตู้ รถขนของ ที่พัก อาหาร ค่าทางด่วน ฯลฯ — ไม่แสดงในใบจัดของ</p>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
          <PlusIcon className="w-4 h-4" /> เพิ่มค่าใช้จ่าย
        </button>
      </div>

      {costs.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">ยังไม่มีค่าใช้จ่ายอื่น</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-500 border-b border-gray-100">
                <th className="pl-5 pr-2 py-3">รายการ</th>
                <th className="px-2 py-3 w-44">หมวดบัญชี</th>
                <th className="px-2 py-3 w-[18%]">ผู้รับเงิน</th>
                <th className="px-2 py-3 w-20 text-right">จำนวน</th>
                <th className="px-2 py-3 w-32 text-right">ราคา/หน่วย</th>
                <th className="px-2 py-3 w-28 text-right">รวม</th>
                <th className="pr-5 w-32" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {costs.map((c) => {
                const locked = !!c.expenseId
                return (
                  <tr key={c.id}>
                    <td className="pl-5 pr-2 py-1.5">
                      <input className={cellInput} disabled={locked} value={c.description} placeholder="เช่น รถตู้ 2 คัน ไป-กลับ" onChange={(e) => patch(c.id, { description: e.target.value })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <FormListbox
                        value={c.categoryName}
                        onChange={(v) => patch(c.id, { categoryName: v })}
                        disabled={locked}
                        // หมวดเดิมที่ถูกลบจากบัญชีไปแล้ว ยังต้องโชว์ได้
                        options={[...new Set([...categoryNames, c.categoryName])].map((n) => ({ value: n, label: n }))}
                        buttonClassName="!py-1.5 !shadow-none"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <SuggestInput className={cellInput} disabled={locked} options={vendors} value={c.vendor ?? ''} placeholder="—" onChange={(v) => patch(c.id, { vendor: v })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" min={1} className={`${cellInput} text-right tabular-nums`} disabled={locked} value={c.quantity} onChange={(e) => patch(c.id, { quantity: Math.max(1, Number(e.target.value) || 1) })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" min={0} className={`${cellInput} text-right tabular-nums`} disabled={locked} value={c.unitCost || ''} placeholder="0" onChange={(e) => patch(c.id, { unitCost: Math.max(0, Number(e.target.value) || 0) })} />
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-gray-900">{formatCurrency(extraCostAmount(c))}</td>
                    <td className="pr-5 py-1.5">
                      <div className="flex items-center justify-end gap-1">
                        {locked && (
                          <Link href={`/admin/accounting/expenses/new?id=${c.expenseId}`} className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium hover:underline whitespace-nowrap">
                            {c.expenseCode}
                          </Link>
                        )}
                        <button title="ลบ" onClick={() => onChange(costs.filter((x) => x.id !== c.id))} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
