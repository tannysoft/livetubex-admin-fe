'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { ArrowLeftIcon, ArrowTopRightOnSquareIcon, PrinterIcon } from '@heroicons/react/24/outline'
import FormCheckbox from '@/components/ui/FormCheckbox'
import { Skeleton } from '@/components/ui/Skeleton'
import LabelSizePicker from '@/components/admin/equipment/LabelSizePicker'
import type { GroupBy } from '@/lib/equipment/item-groups'
import { LABEL_SCALE, useLabelSize, useLensLines } from '@/lib/equipment/lens-lines'
import type { SharedPlan } from '@/lib/equipment/plan-share'
import type { EquipmentPlan } from '@/lib/types'

// เอกสารพิมพ์ตัวเดียวกับหน้าพิมพ์ของแอดมิน — โหลดเฉพาะตอนเปิด (มือถือไม่ต้องโหลดตั้งแต่แรก)
const PlanPrintDocument = dynamic(() => import('@/components/admin/equipment/PlanPrintDocument'), {
  ssr: false,
  loading: () => <Skeleton className="h-96 w-full rounded-2xl" />,
})

/** แผนที่แชร์ → รูปของ EquipmentPlan ที่เอกสารพิมพ์ใช้ (ไม่มีต้นทุน/ค่าใช้จ่ายอื่น — showCosts ปิดเสมอ) */
function toPrintable(plan: SharedPlan, shareId: string): EquipmentPlan {
  return { ...plan, id: shareId, extraCosts: [], status: plan.status ?? 'ready', createdAt: '', updatedAt: plan.updatedAt ?? '' } as unknown as EquipmentPlan
}

/**
 * พิมพ์ / บันทึก PDF จากหน้าแชร์ทีมงาน — ใช้ window.print() เหมือนหน้าพิมพ์แผน (ไม่มีต้นทุน)
 * ในแอป LINE สั่งพิมพ์ไม่ได้ → ปุ่มเปิดในเบราว์เซอร์ (onOpenExternal)
 */
export default function SharePrintView({ plan, shareId, onClose, inLineApp, onOpenExternal }: {
  plan: SharedPlan
  shareId: string
  onClose: () => void
  inLineApp: boolean
  onOpenExternal: () => void
}) {
  const [showList, setShowList] = useState(true)
  const [showDiagrams, setShowDiagrams] = useState(true)
  const [showLayouts, setShowLayouts] = useState(true)
  const [showCables, setShowCables] = useState(true)
  const [showFoh, setShowFoh] = useState(true)
  const [groupBy, setGroupBy] = useState<GroupBy>('destination')
  const [lensLines, setLensLines] = useLensLines()
  const [labelSize] = useLabelSize()
  const diagrams = plan.diagrams.filter((d) => d.nodes.length > 0)
  const layouts = plan.layouts.filter((l) => l.objects.length > 0)

  return (
    <div className="p-3 lg:p-5 space-y-3 print:p-0 print:space-y-0 bg-white print:bg-white min-h-dvh">
      <div className="print:hidden space-y-3">
        <button onClick={onClose} className="inline-flex items-center gap-1.5 text-sm text-gray-500 active:text-gray-800">
          <ArrowLeftIcon className="w-4 h-4" /> กลับไปดูแผน
        </button>
        <div className="rounded-2xl border border-gray-100 shadow-sm p-3 flex items-center gap-x-5 gap-y-3 flex-wrap">
          <FormCheckbox checked={showList} onChange={setShowList} label="รายการอุปกรณ์" />
          <FormCheckbox checked={showDiagrams} onChange={setShowDiagrams} label={`ผังระบบ (${diagrams.length})`} />
          {layouts.length > 0 && <FormCheckbox checked={showLayouts} onChange={setShowLayouts} label={`ผังวาง 3D (${layouts.length})`} />}
          {showLayouts && layouts.length > 0 && <FormCheckbox checked={lensLines} onChange={setLensLines} label="แนวเลนส์" />}
          {showLayouts && layouts.length > 0 && <LabelSizePicker />}
          <FormCheckbox checked={showCables} onChange={setShowCables} label="ตารางสาย" />
          {(plan.fohFeeds?.length ?? 0) > 0 && <FormCheckbox checked={showFoh} onChange={setShowFoh} label="ส่งภาพทีม Visual" />}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
            {([['destination', 'ตามปลายทาง'], ['category', 'ตามหมวด']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setGroupBy(key)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${groupBy === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          {inLineApp ? (
            <button onClick={onOpenExternal} className="flex items-center gap-2 px-5 py-2.5 bg-brand text-white text-sm font-medium rounded-xl active:bg-brand-dark">
              <ArrowTopRightOnSquareIcon className="w-4 h-4" /> เปิดในเบราว์เซอร์เพื่อบันทึก PDF
            </button>
          ) : (
            <button onClick={() => window.print()} className="flex items-center gap-2 px-5 py-2.5 bg-brand text-white text-sm font-medium rounded-xl active:bg-brand-dark">
              <PrinterIcon className="w-4 h-4" /> พิมพ์ / บันทึก PDF
            </button>
          )}
        </div>
        {inLineApp && <p className="text-xs text-gray-500">แอป LINE สั่งพิมพ์/บันทึก PDF ไม่ได้ — เปิดในเบราว์เซอร์ (Safari/Chrome) แล้วกดพิมพ์ ซึ่งอาจต้องใส่รหัสผ่านของลิงก์</p>}
        {!inLineApp && <p className="text-xs text-gray-500">หน้าต่างพิมพ์ → เลือกปลายทาง “บันทึกเป็น PDF” · กระดาษ A4 แนวนอน</p>}
      </div>
      <PlanPrintDocument
        plan={toPrintable(plan, shareId)}
        showList={showList}
        showDiagrams={showDiagrams}
        showLayouts={showLayouts && layouts.length > 0}
        showCables={showCables}
        showFoh={showFoh}
        showCosts={false}
        lensLines={lensLines}
        labelScale={LABEL_SCALE[labelSize]}
        groupBy={groupBy}
      />
    </div>
  )
}
