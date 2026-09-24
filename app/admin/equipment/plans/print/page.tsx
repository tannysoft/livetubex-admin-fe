'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeftIcon, PrinterIcon } from '@heroicons/react/24/outline'
import FormCheckbox from '@/components/ui/FormCheckbox'
import { Skeleton } from '@/components/ui/Skeleton'
import PlanPrintDocument, { type GroupBy } from '@/components/admin/equipment/PlanPrintDocument'
import { getEquipmentPlan } from '@/lib/equipment/plans'
import { useLensLines } from '@/lib/equipment/lens-lines'
import { getRevision, isModifiedSinceRevision, revisionLabel } from '@/lib/equipment/revisions'
import type { EquipmentPlan } from '@/lib/types'

function PlanPrint() {
  const params = useSearchParams()
  const planId = params.get('id')
  const revId = params.get('rev')
  const [plan, setPlan] = useState<EquipmentPlan | null>(null)
  const [revLabel, setRevLabel] = useState<string | undefined>()
  const [revMissing, setRevMissing] = useState(false)
  const [loading, setLoading] = useState(!!planId)
  const [showList, setShowList] = useState(true)
  const [showCables, setShowCables] = useState(true)
  const [showDiagrams, setShowDiagrams] = useState(true)
  const [showLayouts, setShowLayouts] = useState(true)
  const [lensLines, setLensLines] = useLensLines()
  const [showCosts, setShowCosts] = useState(false)
  const [showFoh, setShowFoh] = useState(true)
  const [groupBy, setGroupBy] = useState<GroupBy>('destination')

  useEffect(() => {
    if (!planId) return
    let alive = true
    Promise.all([getEquipmentPlan(planId), revId ? getRevision(planId, revId) : Promise.resolve(null)]).then(([p, rev]) => {
      if (!alive) return
      if (p && rev) {
        // พิมพ์ฉบับ revision: เนื้อหาจาก snapshot, หัวกระดาษ/วันที่/สถานที่จากแผนปัจจุบัน
        setPlan({ ...p, items: rev.items, diagrams: rev.diagrams, layouts: rev.layouts ?? [] })
        setRevLabel(revisionLabel(rev))
      } else {
        setPlan(p)
        setRevMissing(!!revId && !!p)
        if (p?.revision) setRevLabel(isModifiedSinceRevision(p) ? `ร่าง (แก้หลัง Rev ${p.revision.number})` : revisionLabel(p.revision))
      }
      setLoading(false)
    })
    return () => { alive = false }
  }, [planId, revId])

  if (loading) return <Skeleton className="h-96 w-full rounded-2xl" />
  if (!plan) return <p className="py-20 text-center text-gray-500">ไม่พบแผนนี้</p>

  const diagrams = plan.diagrams.filter((d) => d.nodes.length > 0)

  return (
    <div className="space-y-5 print:space-y-0">
      {/* Toolbar — ไม่ถูกพิมพ์ */}
      <div className="print:hidden space-y-4">
        <Link href={`/admin/equipment/plans/edit?id=${plan.id}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeftIcon className="w-4 h-4" /> กลับไปแก้แผน
        </Link>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-x-6 gap-y-3 flex-wrap">
          <FormCheckbox checked={showList} onChange={setShowList} label="รายการอุปกรณ์" />
          <FormCheckbox checked={showDiagrams} onChange={setShowDiagrams} label={`ผังโยง (${diagrams.length})`} />
          <FormCheckbox checked={showLayouts} onChange={setShowLayouts} label={`ผังวาง 3D (${plan.layouts?.length ?? 0})`} />
          {showLayouts && !!plan.layouts?.length && <FormCheckbox checked={lensLines} onChange={setLensLines} label="แนวเลนส์ในผังวาง" />}
          <FormCheckbox checked={showCosts} onChange={setShowCosts} label="ต้นทุน (ค่าเช่า + ค่าใช้จ่ายอื่น)" />
          <FormCheckbox checked={showCables} onChange={setShowCables} label="ตารางสาย" />
          {(plan.fohFeeds?.length ?? 0) > 0 && <FormCheckbox checked={showFoh} onChange={setShowFoh} label={`ส่งภาพทีม Visual (${plan.fohFeeds?.length})`} />}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
            {([['destination', 'จัดกลุ่มตามปลายทาง'], ['category', 'ตามหมวด']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setGroupBy(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${groupBy === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <button onClick={() => window.print()} className="flex items-center gap-2 px-5 py-2.5 bg-brand text-white text-sm font-medium rounded-xl hover:bg-brand-dark transition-colors">
            <PrinterIcon className="w-4 h-4" /> พิมพ์ / บันทึก PDF
          </button>
        </div>
      </div>

      {revMissing && <p className="print:hidden text-sm text-red-600">ไม่พบ revision ที่ระบุ — แสดงแผนปัจจุบันแทน</p>}
      <PlanPrintDocument showFoh={showFoh} revisionLabel={revLabel} plan={plan} showList={showList} showDiagrams={showDiagrams} showCables={showCables} showLayouts={showLayouts} lensLines={lensLines} showCosts={showCosts} groupBy={groupBy} />
    </div>
  )
}

export default function EquipmentPlanPrintPage() {
  return (
    <Suspense>
      <PlanPrint />
    </Suspense>
  )
}
