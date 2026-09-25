'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeftIcon, PlusIcon, PrinterIcon, TrashIcon, CheckCircleIcon, ArrowPathIcon, ExclamationCircleIcon, SparklesIcon, ClockIcon, ShareIcon, PencilSquareIcon,
} from '@heroicons/react/24/outline'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Skeleton } from '@/components/ui/Skeleton'
import PlanItemsTable from '@/components/admin/equipment/PlanItemsTable'
import EquipmentPicker from '@/components/admin/equipment/EquipmentPicker'
import DiagramEditor from '@/components/admin/equipment/DiagramEditor'
import AtemExportModal from '@/components/admin/equipment/AtemExportModal'
import AgentPanel from '@/components/admin/equipment/AgentPanel'
import { deleteField } from 'firebase/firestore'
import RevisionPanel from '@/components/admin/equipment/RevisionPanel'
import SharePlanModal from '@/components/admin/equipment/SharePlanModal'
import PlanInfoModal from '@/components/admin/equipment/PlanInfoModal'
import { formatFullLabel } from '@/lib/equipment/video-format'
import RecordingList from '@/components/admin/equipment/RecordingList'
import { camLabels } from '@/lib/equipment/item-groups'
import { teleTripodFor } from '@/lib/equipment/tele-tripod'
import { fohSummary } from '@/lib/equipment/foh-feeds'
import { createRevision, isModifiedSinceRevision } from '@/lib/equipment/revisions'
import { getEquipmentPlan, getEquipmentPlans, updateEquipmentPlan, newId } from '@/lib/equipment/plans'
import { overlappingPlans, planConflicts, planRange, usageByEquipment } from '@/lib/equipment/availability'
import { FOH_DIAGRAM_NAME, buildFohDiagram, mergeDiagrams } from '@/lib/equipment/foh-diagram'
import { newLayout } from '@/lib/equipment/layout-zones'
import { itemOwner, ownerCounts } from '@/lib/equipment/owners'
import { ArrowDownTrayIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { getEquipmentList } from '@/lib/equipment/equipment'
import { PLAN_STATUSES } from '@/lib/equipment/constants'
import { getJobs } from '@/lib/firebase-utils'
import { getActiveVendors } from '@/lib/accounting/vendors'
import { formatDate, formatDatePill } from '@/lib/utils'
import PlanExtraCosts from '@/components/admin/equipment/PlanExtraCosts'
import { recordPlanExpenses, planCostTotals } from '@/lib/equipment/rental-cost'
import { getExpenseCategories } from '@/lib/accounting/expense-categories'
import { useAuth } from '@/lib/auth-context'
import { formatCurrency } from '@/lib/utils'
import type { Equipment, EquipmentPlan, Job, PlanDiagram, PlanItem, PlanLayout } from '@/lib/types'

// three.js ใหญ่ — โหลดเฉพาะตอนเปิดแท็บผัง 3D และห้าม prerender (ต้องมี WebGL)
const LayoutEditor = dynamic(() => import('@/components/admin/equipment/LayoutEditor'), {
  ssr: false,
  loading: () => <Skeleton className="h-[68vh] w-full rounded-2xl" />,
})

type SaveState = 'saved' | 'dirty' | 'saving' | 'error'


function PlanEditor() {
  const router = useRouter()
  const { user } = useAuth()
  const planId = useSearchParams().get('id')

  const [plan, setPlan] = useState<EquipmentPlan | null>(null)
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [vendorNames, setVendorNames] = useState<string[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [otherPlans, setOtherPlans] = useState<EquipmentPlan[]>([])
  const [categoryNames, setCategoryNames] = useState<string[]>([])
  const [loading, setLoading] = useState(!!planId)
  const [tab, setTab] = useState<'items' | 'diagrams' | 'layouts'>('items')
  const [activeDiagramId, setActiveDiagramId] = useState<string | null>(null)
  const [showAgent, setShowAgent] = useState(false)
  const [showRevisions, setShowRevisions] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  /** เปิด modal ใหม่ = ร่างเริ่มจากแผนปัจจุบัน */
  const [infoKey, setInfoKey] = useState(0)
  // เพิ่มทุกครั้งที่ใช้ร่างจากผู้ช่วย → remount DiagramEditor ให้ fit view กับกล่องชุดใหม่
  const [agentApplied, setAgentApplied] = useState(0)
  const [confirmFoh, setConfirmFoh] = useState(false)
  const [confirmMerge, setConfirmMerge] = useState(false)
  // กรองตารางรายการตามเจ้าของ (บริษัทเรา / พาร์ทเนอร์ / ผู้ให้เช่า) — null = ทั้งหมด
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null)
  // Export ตั้งค่า ATEM — ปุ่มเด่นบนแถบแท็บผังโยง (หลายสวิตเชอร์ = เลือกก่อน)
  const [atemMenu, setAtemMenu] = useState(false)
  const [atemFor, setAtemFor] = useState<string | null>(null)
  const [activeLayoutId, setActiveLayoutId] = useState<string | null>(null)
  const [deleteLayout, setDeleteLayout] = useState<PlanLayout | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  // แถวนอกสต็อกที่กำลังเลือกของเช่า/พาร์ทเนอร์ในสต็อกมาแทน
  const [replaceRow, setReplaceRow] = useState<PlanItem | null>(null)
  // กล้องที่กำลังเพิ่มของในชุด (ขาตั้ง/converter/จอ …) จากสต็อก หรือเช่าเพิ่มนอกสต็อก
  const [kitFor, setKitFor] = useState<PlanItem | null>(null)
  const [deleteDiagram, setDeleteDiagram] = useState<PlanDiagram | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [confirmRecord, setConfirmRecord] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordError, setRecordError] = useState('')

  // autosave: latest/version เป็น ref เพราะ save ที่ค้างอยู่ต้องเห็นค่าล่าสุด ไม่ใช่ค่าตอนถูกสร้าง
  const latest = useRef<EquipmentPlan | null>(null)
  const version = useRef(0)
  const savedVersion = useRef(0)

  useEffect(() => {
    if (!planId) return
    let alive = true
    Promise.all([getEquipmentPlan(planId), getEquipmentList(), getJobs(), getEquipmentPlans()]).then(([p, eq, j, all]) => {
      if (!alive) return
      setPlan(p)
      setOtherPlans(all.filter((x) => x.id !== planId))
      latest.current = p
      setEquipment(eq)
      setJobs(j)
      setActiveDiagramId(p?.diagrams[0]?.id ?? null)
      setLoading(false)
    })
    // หมวดบัญชีสำหรับค่าใช้จ่ายอื่น — โหลดแยก ไม่ให้หน้าแผนพังถ้าส่วนบัญชีอ่านไม่ได้
    getExpenseCategories()
      .then((cats) => { if (alive) setCategoryNames(cats.filter((c) => !c.isFixed).map((c) => c.name)) })
      .catch(() => {})
    // ผู้ขายในบัญชี → autocomplete ผู้ให้เช่า/ผู้รับเงิน ให้สะกดตรงกับตอนลง Expense
    getActiveVendors()
      .then((vs) => { if (alive) setVendorNames(vs.map((v) => v.name)) })
      .catch(() => {})
    return () => { alive = false }
  }, [planId])

  // ตัวเลือก autocomplete: ผู้ให้เช่า/พาร์ทเนอร์จากสต็อก + ผู้ขายในบัญชี · ที่เก็บจากสต็อก
  const knownVendors = [...new Set([...equipment.flatMap((e) => [e.rentalVendor, e.partnerName]).filter((v): v is string => !!v), ...vendorNames])]
  const knownLocations = [...new Set(equipment.map((e) => e.storageLocation).filter((v): v is string => !!v))]

  /** plan.revision เปลี่ยน — ไม่ใช่การแก้เนื้อหาแผน จึงไม่ bump version (autosave ไม่ต้องทำงาน) */
  const setRevisionMeta = (meta: EquipmentPlan['revision'] | null) => {
    if (!latest.current) return
    latest.current = { ...latest.current, revision: meta ?? undefined }
    setPlan((p) => (p ? { ...p, revision: meta ?? undefined } : p))
  }

  const change = (patch: Partial<EquipmentPlan>) => {
    if (!latest.current) return
    const next = { ...latest.current, ...patch }
    latest.current = next
    version.current += 1
    setPlan(next)
    setSaveState('dirty')
  }

  const save = async () => {
    const p = latest.current
    if (!p) return
    const v = version.current
    setSaveState('saving')
    try {
      await updateEquipmentPlan(p.id, {
        title: p.title, jobId: p.jobId ?? '', jobTitle: p.jobTitle ?? '', date: p.date ?? '', endDate: p.endDate ?? '',
        location: p.location ?? '', status: p.status, notes: p.notes ?? '',
        items: p.items, diagrams: p.diagrams, layouts: p.layouts ?? [], extraCosts: p.extraCosts ?? [],
        // ล้างระบบภาพ = ลบ field (undefined จะถูกกรองทิ้งแล้วค่าเก่าค้าง)
        videoFormat: p.videoFormat ?? (deleteField() as unknown as undefined),
        recordings: p.recordings ?? [],
        fohFeeds: p.fohFeeds ?? [],
      })
      savedVersion.current = Math.max(savedVersion.current, v)
      // มีการแก้เพิ่มระหว่างรอ save → ยังถือว่า dirty ให้รอบถัดไปเก็บ
      setSaveState(version.current === v ? 'saved' : 'dirty')
    } catch (e) {
      console.error(e)
      setSaveState('error')
    }
  }

  useEffect(() => {
    if (saveState !== 'dirty') return
    const t = setTimeout(save, 1200)
    return () => clearTimeout(t)
  }, [plan, saveState])

  // ออกจากหน้าโดยยังมีของค้าง → ยิง save ทิ้งท้าย + เตือนถ้าปิดแท็บ
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (version.current !== savedVersion.current) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      if (version.current !== savedVersion.current) save()
    }
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72 rounded-xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    )
  }

  if (!plan) {
    return (
      <div className="py-20 text-center text-gray-500">
        <p>ไม่พบแผนนี้</p>
        <Link href="/admin/equipment/plans" className="text-brand text-sm mt-2 inline-block">กลับไปหน้ารายการแผน</Link>
      </div>
    )
  }

  const equipmentById = new Map(equipment.map((e) => [e.id, e]))
  const activeDiagram = plan.diagrams.find((d) => d.id === activeDiagramId) ?? plan.diagrams[0]
  const packed = plan.items.filter((i) => i.packed).length
  const returned = plan.items.filter((i) => i.returned).length

  const addPicked = (picked: { equipment: Equipment; quantity: number }[], attachTo?: PlanItem) => {
    const added: PlanItem[] = picked.map(({ equipment: e, quantity }) => {
      const origin = e.ownership ?? 'owned'
      const counterpart = origin === 'rental' ? e.rentalVendor : origin === 'partner' ? e.partnerName : undefined
      return {
        id: newId(), equipmentId: e.id, code: e.code, name: e.name, category: e.category,
        quantity, packed: false, returned: false, origin,
        fromLocation: counterpart || e.storageLocation,
        // ของเช่า/พาร์ทเนอร์ → เติมต้นทุนให้เลย (snapshot ราคา ณ วันเลือก แก้ในแผนได้ — พาร์ทเนอร์ปกติ 0)
        ...(origin !== 'owned' ? { rentalVendor: counterpart, unitCost: e.rentalRate ?? 0, rentalDays: 1 } : {}),
        // เลนส์ที่เลือกจากแถวกล้อง → ติดกล้องนั้น ไปปลายทางเดียวกัน
        ...(attachTo ? { attachedTo: attachTo.id, ...(attachTo.toLocation ? { toLocation: attachTo.toLocation } : {}) } : {}),
      }
    })
    // เลนส์ tele เช่า → ขาตั้งของร้านเดียวกันมาด้วย ติดกล้องตัวเดียวกัน
    const tripods: PlanItem[] = []
    if (attachTo) for (const lens of added) {
      const t = teleTripodFor(lens, attachTo, [...plan.items, ...added, ...tripods])
      if (t) tripods.push(t)
    }
    change({ items: [...plan.items, ...added, ...tripods] })
  }

  /**
   * แถวนอกสต็อก (พิมพ์เอง) → แทนด้วยของในสต็อก คง id/จำนวน/ปลายทาง/การจับคู่/หมายเหตุ/วันที่/สถานะจัดของ
   * กล่องในผังโยงที่มาจากแถวนี้ผูกกับอุปกรณ์ใหม่ (port ว่าง = เติมจากสต็อก)
   */
  const replaceWithStock = (row: PlanItem, e: Equipment) => {
    const origin = e.ownership ?? 'owned'
    const counterpart = origin === 'rental' ? e.rentalVendor : origin === 'partner' ? e.partnerName : undefined
    const next: PlanItem = {
      ...row, equipmentId: e.id, code: e.code, name: e.name, category: e.category, origin,
      fromLocation: counterpart || e.storageLocation,
      ...(origin !== 'owned' ? { rentalVendor: counterpart, unitCost: e.rentalRate ?? 0, rentalDays: row.rentalDays ?? 1 } : {}),
    }
    delete next.isRental
    if (origin === 'owned') { delete next.rentalVendor; delete next.unitCost; delete next.rentalDays }
    // ชื่อแถวเดิมที่ผู้ใช้ตั้งเอง (เช่น "กล้อง 7") ไม่ใช่ชื่อรุ่นเดิม → คงไว้
    const oldEq = row.equipmentId ? equipmentById.get(row.equipmentId) : undefined
    if (oldEq && row.name !== oldEq.name) next.name = row.name
    const model = (x?: Equipment) => [x?.brand, x?.model].filter(Boolean).join(' ')
    const oldModel = model(oldEq)
    const newModel = model(e)
    const diagrams = plan.diagrams.map((d) => ({
      ...d,
      nodes: d.nodes.map((n) => n.planItemId !== row.id ? n : {
        ...n, equipmentId: e.id,
        // บรรทัดรองที่ขึ้นต้นด้วยรุ่นเดิม → เปลี่ยนเป็นรุ่นใหม่ (ชื่อกล่อง เช่น "CAM 7" และ port เดิมคงไว้ ไม่ให้เส้นหลุด)
        ...(oldModel && n.sub?.startsWith(oldModel) ? { sub: (newModel || e.name) + n.sub.slice(oldModel.length) } : {}),
        ...(!n.inputs.length && !n.outputs.length && !(n.ios ?? []).length ? { inputs: e.inputs ?? [], outputs: e.outputs ?? [], ios: e.ios ?? [] } : {}),
      }),
    }))
    change({ items: plan.items.map((i) => (i.id === row.id ? next : i)), diagrams })
  }

  /** เช่าเพิ่มนอกสต็อกให้กล้อง — แถวใหม่ติดกล้อง ปลายทางเดียวกัน กรอกชื่อ/ร้าน/ราคาต่อในตาราง */
  const addExternalFor = (camera: PlanItem, name: string) => {
    const row: PlanItem = {
      id: newId(), name, category: 'support', quantity: 1, packed: false, returned: false, origin: 'rental',
      attachedTo: camera.id, ...(camera.toLocation ? { toLocation: camera.toLocation } : {}),
    }
    change({ items: [...plan.items, row] })
  }

  const addExternalItem = () => {
    change({ items: [...plan.items, { id: newId(), name: '', category: 'other', quantity: 1, packed: false, returned: false, origin: 'rental' }] })
  }

  // ── สายส่ง FOH จาก feed → วาดลงผังหลัก (1 แผน = 1 ผังโยง) ─────────────────
  // วาดซ้ำ = ลบกล่อง FOH ชุดเดิม (generated) แล้ววาดใหม่ · ผังแยกแบบเก่า (FOH_DIAGRAM_NAME) ถูกแทนด้วยชุดใหม่ในผังหลัก
  const legacyFoh = plan.diagrams.find((d) => d.name === FOH_DIAGRAM_NAME)
  const mainDiagram = plan.diagrams.find((d) => d.name !== FOH_DIAGRAM_NAME)
  const hasFohDrawn = !!legacyFoh?.nodes.length || !!mainDiagram?.nodes.some((n) => n.generated === 'foh')
  const applyFohDiagram = () => {
    const diagram = buildFohDiagram(plan, equipmentById, mainDiagram)
    const rest = plan.diagrams.filter((d) => d.id !== mainDiagram?.id && d.id !== legacyFoh?.id)
    change({ diagrams: [diagram, ...rest] })
    setActiveDiagramId(diagram.id)
    setAgentApplied((n) => n + 1) // remount DiagramEditor — ผังเดิม id เดียวกันแต่เนื้อหาเปลี่ยน
    setTab('diagrams')
    setConfirmFoh(false)
  }
  const requestFohDiagram = () => {
    if (hasFohDrawn) setConfirmFoh(true)
    else applyFohDiagram()
  }

  const addDiagram = () => {
    const diagram: PlanDiagram = { id: newId(), name: 'Video', nodes: [], edges: [] }
    change({ diagrams: [diagram] })
    setActiveDiagramId(diagram.id)
  }
  // ข้อมูลเก่าที่แยกหลายผัง → รวมเป็นผังเดียว
  const mergeAllDiagrams = () => {
    const merged = mergeDiagrams(plan.diagrams)
    change({ diagrams: [merged] })
    setActiveDiagramId(merged.id)
    setAgentApplied((n) => n + 1)
    setConfirmMerge(false)
  }

  const layouts = plan.layouts ?? []
  const activeLayout = layouts.find((l) => l.id === activeLayoutId) ?? layouts[0]

  const addLayout = () => {
    // ทุกงานมี FOH — ผังใหม่วางโต๊ะ FOH กลางหลังสุดให้เลย, สถานที่เดาจากชื่อสถานที่ของแผน
    const layout: PlanLayout = newLayout(plan, `ผังวาง ${layouts.length + 1}`)
    change({ layouts: [...layouts, layout] })
    setActiveLayoutId(layout.id)
  }

  const updateLayout = (next: PlanLayout) =>
    change({ layouts: (latest.current!.layouts ?? []).map((l) => (l.id === next.id ? next : l)) })

  const updateDiagram = (next: PlanDiagram) =>
    change({ diagrams: latest.current!.diagrams.map((d) => (d.id === next.id ? next : d)) })

  const rental = planCostTotals(plan)
  // ของชนกับงานอื่นที่วันทับ — ใช้ทั้งใน picker (กันเลือกเกิน) และแถบเตือน (กรณีเปลี่ยนวันทีหลัง)
  // picker เพิ่มแถวใหม่แบบทั้งงาน → ดูวันที่จองมากที่สุดในวันงาน (แถวที่ใช้ไม่เต็มงานนับเฉพาะวันที่ใช้)
  const pr = planRange(plan)
  const usage = pr ? usageByEquipment(overlappingPlans(plan, otherPlans), pr) : new Map()
  // เลนส์รุ่นเดียวกันจับคู่หลายกล้องได้ (หลายแถว) — picker ต้องหักที่แผนนี้ใช้ไปแล้ว (วันที่ใช้มากสุด)
  const inPlanQty = new Map<string, number>()
  if (pr) for (const [id, u] of usageByEquipment([plan], pr)) inPlanQty.set(id, u.used)
  else for (const it of plan.items) if (it.equipmentId) inPlanQty.set(it.equipmentId, (inPlanQty.get(it.equipmentId) ?? 0) + it.quantity)
  const conflicts = planConflicts(plan, otherPlans, equipmentById)

  /** ต้นทุนที่ยังค้าง (ค่าเช่า + ค่าใช้จ่ายอื่น) → Expense ในบัญชี (1 ใบต่อหมวด+ผู้รับเงิน) แล้วบันทึกแผนทันทีให้ expenseId ไม่หลุด */
  const handleRecordRental = async () => {
    if (!latest.current) return
    setRecording(true)
    setRecordError('')
    try {
      const { items, extraCosts, failed } = await recordPlanExpenses(latest.current, user?.uid ?? 'admin')
      change({ items, extraCosts })
      await save()
      if (failed) setRecordError('ลงบัญชีได้บางส่วน — กดอีกครั้งเพื่อลงรายการที่เหลือ')
    } finally {
      setRecording(false)
    }
  }

  // หน้า print อ่านจาก Firestore — ต้องรอ save ให้จบก่อน ไม่งั้นพิมพ์ได้ของเก่า
  const openPrint = async () => {
    if (version.current !== savedVersion.current) await save()
    router.push(`/admin/equipment/plans/print?id=${plan.id}`)
  }

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/equipment/plans" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeftIcon className="w-4 h-4" /> แผนจัดอุปกรณ์
        </Link>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="flex-1 min-w-[240px] text-2xl font-bold text-gray-900">{plan.title}</h1>
          <div className="flex items-center gap-3">
            <SaveIndicator state={saveState} onRetry={save} />
            <button
              onClick={() => setShowRevisions(true)}
              title="บันทึก / เทียบ / กู้คืน revision ของแผน"
              className={`flex items-center gap-2 px-3.5 py-2.5 border text-sm font-medium rounded-xl transition-colors ${
                plan.revision && !isModifiedSinceRevision(plan)
                  ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <ClockIcon className="w-4 h-4" />
              {plan.revision ? `Rev ${plan.revision.number}${isModifiedSinceRevision(plan) ? ' · แก้แล้ว' : ''}` : 'Revision'}
            </button>
            <button
              onClick={() => setShowAgent(true)}
              className="flex items-center gap-2 px-4 py-2.5 border border-brand text-brand text-sm font-medium rounded-xl hover:bg-brand-soft transition-colors"
            >
              <SparklesIcon className="w-4 h-4" /> ผู้ช่วย AI
            </button>
            <button
              onClick={() => setShowShare(true)}
              title="ส่งลิงก์ + รหัสผ่านให้ทีมงานดูแผนบนมือถือ"
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 bg-white text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              <ShareIcon className="w-4 h-4" /> แชร์ทีมงาน
            </button>
            <button
              onClick={openPrint}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors"
            >
              <PrinterIcon className="w-4 h-4" /> พิมพ์รายการ + ผัง
            </button>
          </div>
        </div>
      </div>

      <AgentPanel
        isOpen={showAgent}
        onClose={() => setShowAgent(false)}
        plan={plan}
        onApply={async (items, diagrams, layouts) => {
          // เก็บของเดิมเป็น revision ก่อนแทนด้วยร่าง AI — ถ้ายังไม่ได้บันทึกไว้ (ย้อนกลับได้จากหน้า Revision)
          const cur = latest.current
          if (cur && (cur.items.length || cur.diagrams.length) && isModifiedSinceRevision(cur)) {
            try {
              setRevisionMeta(await createRevision(cur, { label: 'ก่อนใช้ร่าง AI', source: 'agent', createdBy: user?.email ?? undefined }))
            } catch (e) {
              console.error('auto revision failed', e)
            }
          }
          change({ items, diagrams, layouts })
          if (!diagrams.some((d) => d.id === activeDiagramId)) setActiveDiagramId(diagrams[0]?.id ?? null)
          if (!layouts.some((l) => l.id === activeLayoutId)) setActiveLayoutId(layouts[0]?.id ?? null)
          setAgentApplied((n) => n + 1)
        }}
      />

      <SharePlanModal
        isOpen={showShare}
        onClose={() => setShowShare(false)}
        planId={plan.id}
        flush={async () => { if (version.current !== savedVersion.current) await save() }}
      />

      <RevisionPanel
        isOpen={showRevisions}
        onClose={() => setShowRevisions(false)}
        plan={plan}
        userEmail={user?.email ?? undefined}
        onRevisionChange={setRevisionMeta}
        onRestore={({ items, diagrams, layouts }) => {
          change({ items, diagrams, layouts })
          if (!diagrams.some((d) => d.id === activeDiagramId)) setActiveDiagramId(diagrams[0]?.id ?? null)
          setAgentApplied((n) => n + 1)
        }}
      />

      {/* ข้อมูลแผน — อ่านอย่างเดียว แก้ผ่าน modal (กันพิมพ์โดนโดยไม่ตั้งใจ) */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-start justify-between gap-3">
          <dl className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3 text-sm">
            <InfoField label="งาน">{plan.jobTitle || <span className="text-gray-400">ไม่ผูกกับงาน</span>}</InfoField>
            <InfoField label="วันที่">
              {plan.date ? `${formatDate(plan.date)}${plan.endDate && plan.endDate !== plan.date ? ` – ${formatDate(plan.endDate)}` : ''}` : <span className="text-gray-400">ยังไม่ระบุ</span>}
            </InfoField>
            <InfoField label="สถานที่">{plan.location || <span className="text-gray-400">ยังไม่ระบุ</span>}</InfoField>
            <InfoField label="สถานะ">
              {(() => {
                const st = PLAN_STATUSES.find((x) => x.value === plan.status)
                return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${st?.color ?? ''}`}>{st?.label ?? plan.status}</span>
              })()}
            </InfoField>
            <InfoField label="ระบบภาพ">{plan.videoFormat ? formatFullLabel(plan.videoFormat) : <span className="text-gray-400">ยังไม่ระบุ</span>}</InfoField>
            <InfoField label="format ไฟล์บันทึก" wide><RecordingList recordings={plan.recordings} main={plan.videoFormat} /></InfoField>
            <InfoField label="ส่งภาพให้ทีม Visual (FOH)" wide>
              {fohSummary(plan.fohFeeds) || <span className="text-gray-400">ไม่มี</span>}
              {(plan.fohFeeds?.length ?? 0) > 0 && (
                <button onClick={requestFohDiagram} className="ml-2 text-xs font-medium text-brand hover:underline">วาดลงผังโยง</button>
              )}
            </InfoField>
            {plan.notes && <InfoField label="หมายเหตุของแผน" full><span className="whitespace-pre-wrap">{plan.notes}</span></InfoField>}
          </dl>
          <button
            onClick={() => { setInfoKey((k) => k + 1); setShowInfo(true) }}
            className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 border border-gray-200 text-sm font-medium text-gray-700 rounded-xl hover:bg-gray-50"
          >
            <PencilSquareIcon className="w-4 h-4" /> แก้ไขข้อมูลแผน
          </button>
        </div>
      </div>

      <PlanInfoModal key={infoKey} isOpen={showInfo} onClose={() => setShowInfo(false)} plan={plan} jobs={jobs} onSave={(patch) => change(patch)} />

      {/* Tabs + ตัวเลือกผัง (ผังโยง/ผังวาง) อยู่แถวเดียวกัน ประหยัดที่ */}
      <div className="flex items-center gap-3 flex-wrap">
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {([['items', `รายการอุปกรณ์ (${plan.items.length})`], ['diagrams', `ผังโยง (${plan.diagrams.length})`], ['layouts', `ผังวาง 3D (${layouts.length})`]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>
        {tab === 'diagrams' ? (
          <div className="flex items-center justify-end gap-2 flex-wrap flex-1 min-w-0">
            {activeDiagram && <span className="text-xs text-gray-400 mr-auto">{activeDiagram.nodes.length} อุปกรณ์ · {activeDiagram.edges.length} สาย</span>}
            {(() => {
              const switchers = activeDiagram?.nodes.filter((n) => n.category === 'switcher' && n.inputs.length > 0) ?? []
              if (switchers.length === 0) return null
              return (
                <div className="relative">
                  <button
                    onClick={() => (switchers.length === 1 ? setAtemFor(switchers[0].id) : setAtemMenu((v) => !v))}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 transition-colors"
                  >
                    <ArrowDownTrayIcon className="w-4 h-4" /> Download XML ATEM
                  </button>
                  {atemMenu && switchers.length > 1 && (
                    <div className="absolute right-0 mt-1 z-20 w-64 bg-white border border-gray-200 rounded-xl shadow-lg py-1">
                      <p className="px-3 py-1.5 text-[11px] text-gray-400">เลือกสวิตเชอร์</p>
                      {switchers.map((n) => (
                        <button key={n.id} onClick={() => { setAtemFor(n.id); setAtemMenu(false) }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                          {n.label}{n.sub && <span className="block text-[11px] text-gray-400 truncate">{n.sub}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}
            {plan.diagrams.length > 1 && plan.diagrams.map((d) => (
              <button
                key={d.id}
                onClick={() => setActiveDiagramId(d.id)}
                className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                  activeDiagram?.id === d.id ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {d.name || 'ไม่มีชื่อ'}
              </button>
            ))}
            {plan.diagrams.length > 1 && (
              <button onClick={() => setConfirmMerge(true)} className="px-3 py-1 rounded-full text-sm font-medium border border-dashed border-amber-400 text-amber-700 hover:bg-amber-50 transition-colors">
                รวมเป็นผังเดียว
              </button>
            )}
            {activeDiagram && (
              <>
                <span className="text-xs font-semibold text-gray-500 ml-2">ชื่อผัง</span>
                <input
                  value={activeDiagram.name}
                  onChange={(e) => updateDiagram({ ...activeDiagram, name: e.target.value })}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm w-40 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                />
                <button onClick={() => setDeleteDiagram(activeDiagram)} title="ลบผังนี้" className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                  <TrashIcon className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        ) : tab === 'layouts' ? (
          <div className="flex items-center justify-end gap-2 flex-wrap flex-1 min-w-0">
            {activeLayout && <span className="text-xs text-gray-400 mr-auto">{activeLayout.venue.name} · {activeLayout.objects.length} ชิ้น</span>}
            {layouts.map((l) => (
              <button
                key={l.id}
                onClick={() => setActiveLayoutId(l.id)}
                className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                  activeLayout?.id === l.id ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {l.name || 'ไม่มีชื่อ'}
              </button>
            ))}
            <button onClick={addLayout} className="flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border border-dashed border-gray-300 text-gray-600 hover:border-brand hover:text-brand transition-colors">
              <PlusIcon className="w-4 h-4" /> เพิ่มผังวาง
            </button>
            {activeLayout && (
              <>
                <span className="text-xs font-semibold text-gray-500 ml-2">ชื่อผัง</span>
                <input
                  value={activeLayout.name}
                  onChange={(e) => updateLayout({ ...activeLayout, name: e.target.value })}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm w-40 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                />
                <button onClick={() => setDeleteLayout(activeLayout)} title="ลบผังนี้" className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                  <TrashIcon className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {tab === 'items' ? (
        <div className="space-y-5">
        {conflicts.length > 0 && (
          <div className="flex gap-3 px-5 py-4 rounded-2xl bg-red-50 border border-red-200 text-sm text-red-800">
            <ExclamationTriangleIcon className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">อุปกรณ์ {conflicts.length} รายการถูกใช้ในงานอื่นที่วันชนกัน</p>
              <ul className="text-xs space-y-0.5">
                {conflicts.map((c) => (
                  <li key={c.item.id}>
                    <b>{c.item.name}</b> ต้องการ {c.need} แต่ว่าง {c.available}{c.day && plan.endDate && plan.endDate !== plan.date ? ` (วันที่ ${formatDatePill(c.day)})` : ''} —{' '}
                    {c.usage.plans.map((p) => <Link key={p.id} href={`/admin/equipment/plans/edit?id=${p.id}`} className="underline mr-1">{p.title}{p.quantity > 1 ? ` ×${p.quantity}` : ''}</Link>)}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-red-700/80">แก้ได้โดยลดจำนวน, เปลี่ยนวันที่, กำหนดวันใช้ของแถวนั้น (ถ้าไม่ได้ใช้ทั้งงาน), เอาออกจากอีกแผน หรือใช้ของเช่า/พาร์ทเนอร์แทน</p>
            </div>
          </div>
        )}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-4 border-b border-gray-100">
            <div className="flex gap-4 text-sm text-gray-600">
              <span>จัดแล้ว <b className="text-gray-900">{packed}/{plan.items.length}</b></span>
              <span>เก็บกลับ <b className="text-gray-900">{returned}/{plan.items.length}</b></span>
            </div>
            <div className="flex gap-2">
              <button onClick={addExternalItem} className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
                <PlusIcon className="w-4 h-4" /> ของเช่า (พิมพ์เอง)
              </button>
              <button onClick={() => setShowPicker(true)} className="flex items-center gap-1.5 px-3.5 py-2 bg-brand text-white text-sm font-medium rounded-xl hover:bg-brand-dark transition-colors">
                <PlusIcon className="w-4 h-4" /> เลือกอุปกรณ์ (บริษัท / เช่า / พาร์ทเนอร์)
              </button>
            </div>
          </div>
          {(() => {
            const owners = ownerCounts(plan.items.map(itemOwner))
            if (owners.length < 2) return null
            const chip = (active: boolean) => `shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`
            return (
              <div className="flex items-center gap-1.5 overflow-x-auto px-5 py-2.5 border-b border-gray-100 [scrollbar-width:none]">
                <span className="shrink-0 text-xs text-gray-400 mr-1">เจ้าของ</span>
                <button onClick={() => setOwnerFilter(null)} className={chip(ownerFilter == null)}>ทั้งหมด {plan.items.length}</button>
                {owners.map((o) => (
                  <button key={o.key || '_none'} onClick={() => setOwnerFilter(o.key)} className={chip(ownerFilter === o.key)}>
                    {o.label} {o.count}
                  </button>
                ))}
              </div>
            )
          })()}
          <PlanItemsTable ownerFilter={ownerFilter ?? undefined} items={plan.items} onChange={(items) => change({ items })} vendorOptions={knownVendors} locationOptions={knownLocations} onAddKit={setKitFor} planDate={plan.date} planEndDate={plan.endDate} camLabels={camLabels(plan)} onPickFromStock={setReplaceRow} />

        </div>

          <PlanExtraCosts costs={plan.extraCosts ?? []} onChange={(extraCosts) => change({ extraCosts })} categoryNames={categoryNames} vendorOptions={knownVendors} />

          {rental.total > 0 && (
            <div className="px-5 py-4 rounded-2xl border border-amber-200 bg-amber-50/60 flex items-center gap-x-6 gap-y-2 flex-wrap text-sm">
              <div>
                <p className="text-xs text-gray-500">ต้นทุนของแผนรวม (ก่อน VAT)</p>
                <p className="text-xl font-bold text-gray-900 tabular-nums">{formatCurrency(rental.total)}</p>
              </div>
              <div className="text-xs text-gray-600 space-y-0.5">
                <p>ค่าเช่าอุปกรณ์ <b className="tabular-nums">{formatCurrency(rental.rental)}</b> · ค่าใช้จ่ายอื่น <b className="tabular-nums">{formatCurrency(rental.extra)}</b></p>
                <p>ลงบัญชีแล้ว <b className="tabular-nums">{formatCurrency(rental.recorded)}</b></p>
                <p>ยังไม่ลงบัญชี <b className="tabular-nums">{formatCurrency(rental.pending)}</b></p>
              </div>
              <div className="flex-1 min-w-[200px] text-xs">
                {!plan.jobId
                  ? <p className="text-amber-700">ยังไม่ได้ผูกแผนกับงาน — ต้นทุนนี้จะไม่ถูกนับเข้างานใด เลือก “งาน” ด้านบนก่อน</p>
                  : <p className="text-gray-500">นับเป็นต้นทุนของงาน “{plan.jobTitle}” ในหน้าต้นทุนต่อโปรเจกต์แล้ว</p>}
                {recordError && <p className="text-red-600 mt-1">{recordError}</p>}
              </div>
              <button
                onClick={() => setConfirmRecord(true)}
                disabled={recording || rental.pending <= 0}
                className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-40"
              >
                {recording ? 'กำลังลงบัญชี...' : 'ลงบัญชีเป็นรายจ่าย'}
              </button>
            </div>
          )}
        </div>
      ) : tab === 'layouts' ? (
        <div className="space-y-3">
          {activeLayout ? (
            <>
              <LayoutEditor key={`${activeLayout.id}-${agentApplied}`} planId={plan.id} layout={activeLayout} onChange={updateLayout} planItems={plan.items} onRequestAdd={() => setShowPicker(true)} />
            </>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
              <p className="text-gray-400 text-sm">ยังไม่มีผังวาง 3D — กด “เพิ่มผังวาง” แล้วเลือกสถานที่ (เช่น Impact Arena) เพื่อเริ่มวางกล้อง</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {activeDiagram ? (
            <>
              <DiagramEditor
                key={`${activeDiagram.id}-${agentApplied}`}
                diagram={activeDiagram}
                onChange={updateDiagram}
                planItems={plan.items}
                equipmentById={equipmentById}
                onRequestAdd={() => setShowPicker(true)}
              />
            </>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
              <p className="text-gray-400 text-sm">ยังไม่มีผังโยง — ภาพ เสียง ส่งจอ FOH และ Intercom อยู่ในผังเดียวกัน</p>
              <button onClick={addDiagram} className="mt-3 inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-sm font-medium border border-dashed border-gray-300 text-gray-600 hover:border-brand hover:text-brand transition-colors">
                <PlusIcon className="w-4 h-4" /> เริ่มวาดผังโยง
              </button>
            </div>
          )}
        </div>
      )}

      <EquipmentPicker
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        equipment={equipment}
        existingIds={new Set()}
        // ของที่อยู่ในแผนแล้วเลือกเพิ่มได้อีกแถว (เช่น ของพาร์ทเนอร์ 6 ชิ้น แยกให้กล้องคนละตัว) — นับรวมกับที่ใช้แล้วตอนเช็กว่าง
        inPlanQty={inPlanQty}
        usage={usage}
        noDate={!plan.date}
        onConfirm={(picked) => addPicked(picked)}
      />

      {/* แทนแถวด้วยของในสต็อก: แถวนอกสต็อก → เปิดแท็บตามที่มาเดิม ค้นด้วยชื่อเดิม · แถวในสต็อก (ปุ่ม "เปลี่ยน") → ทุกที่มา หมวดเดิม */}
      <EquipmentPicker
        key={replaceRow?.id ?? 'none-replace'}
        isOpen={!!replaceRow}
        onClose={() => setReplaceRow(null)}
        single
        title={replaceRow?.equipmentId ? `เปลี่ยน “${replaceRow.name}” เป็นของตัวอื่น` : `เลือกจากสต็อกแทน “${replaceRow?.name || 'แถวนอกสต็อก'}”`}
        initialOwnership={replaceRow?.equipmentId ? '' : replaceRow?.origin === 'partner' ? 'partner' : 'rental'}
        initialSearch={replaceRow && !replaceRow.equipmentId && equipment.some((e) => e.name.toLowerCase().includes(replaceRow.name.trim().toLowerCase())) ? replaceRow.name.trim() : ''}
        initialCategory={replaceRow && replaceRow.category !== 'other' ? replaceRow.category : ''}
        equipment={replaceRow?.equipmentId ? equipment.filter((e) => e.id !== replaceRow.equipmentId) : equipment}
        existingIds={new Set()}
        inPlanQty={inPlanQty}
        usage={usage}
        noDate={!plan.date}
        onConfirm={(picked) => { if (replaceRow && picked[0]) replaceWithStock(replaceRow, picked[0].equipment) }}
      />

      {/* เพิ่มของในชุดให้กล้อง — ทุกหมวด ทุกที่มา (บริษัท/เช่า/พาร์ทเนอร์) ติดกล้องตัวนั้น · หรือเช่าเพิ่มนอกสต็อก */}
      <EquipmentPicker
        key={kitFor ? `kit-${kitFor.id}` : 'none-kit'}
        isOpen={!!kitFor}
        onClose={() => setKitFor(null)}
        title={`เพิ่มอุปกรณ์ให้ ${kitFor ? (camLabels(plan).get(kitFor.id) ?? kitFor.name) : 'กล้อง'}${kitFor?.toLocation ? ` · ${kitFor.toLocation}` : ''}`}
        equipment={equipment}
        existingIds={new Set()}
        inPlanQty={inPlanQty}
        usage={usage}
        noDate={!plan.date}
        onConfirm={(picked) => kitFor && addPicked(picked, kitFor)}
        onExternal={(name) => kitFor && addExternalFor(kitFor, name)}
      />


      <ConfirmDialog
        isOpen={confirmFoh}
        title="วาดสายส่ง FOH ใหม่"
        message={`กล่อง/สายส่ง FOH ที่เคยวาดไว้จะถูกลบแล้ววาดใหม่ในผังหลักจากรายการ feed ตอนนี้${legacyFoh ? ` (ผังแยก “${FOH_DIAGRAM_NAME}” แบบเก่าจะถูกเอาออก)` : ''} — ที่แก้ในส่วนนั้นเองจะหาย กล่องอื่นในผังไม่แตะ (บันทึก Revision ไว้ก่อนได้)`}
        confirmLabel="วาดใหม่"
        onConfirm={applyFohDiagram}
        onClose={() => setConfirmFoh(false)}
      />

      {(() => {
        const sw = atemFor ? activeDiagram?.nodes.find((n) => n.id === atemFor) : undefined
        return activeDiagram && sw ? <AtemExportModal key={sw.id} isOpen onClose={() => setAtemFor(null)} diagram={activeDiagram} switcher={sw} /> : null
      })()}

      <ConfirmDialog
        isOpen={confirmMerge}
        title="รวมเป็นผังเดียว"
        message={`รวม ${plan.diagrams.length} ผัง (${plan.diagrams.map((d) => d.name).join(', ')}) เป็นผังเดียว — ผังถัดไปวางต่อด้านล่าง กล่องของแถวเดียวกันที่ซ้ำกันรวมเป็นกล่องเดียว (บันทึก Revision ไว้ก่อนได้)`}
        confirmLabel="รวมผัง"
        onConfirm={mergeAllDiagrams}
        onClose={() => setConfirmMerge(false)}
      />

      <ConfirmDialog
        isOpen={confirmRecord}
        title="ลงบัญชีต้นทุนของแผน"
        message={`สร้างรายจ่ายยอดรวม ${formatCurrency(rental.pending)} (1 ใบต่อหมวด+ผู้รับเงิน${plan.jobId ? ' ผูกกับงานนี้' : ' — ยังไม่ผูกงาน'}) ลงแล้วช่องราคาจะถูกล็อก แก้ต่อได้ที่เมนูรายจ่าย`}
        confirmLabel="ลงบัญชี"
        onConfirm={handleRecordRental}
        onClose={() => setConfirmRecord(false)}
      />

      <ConfirmDialog
        isOpen={!!deleteLayout}
        title="ลบผังวาง 3D"
        message={`ต้องการลบผัง "${deleteLayout?.name}" ใช่หรือไม่?`}
        confirmLabel="ลบ"
        onConfirm={() => {
          if (!deleteLayout) return
          const rest = layouts.filter((l) => l.id !== deleteLayout.id)
          change({ layouts: rest })
          setActiveLayoutId(rest[0]?.id ?? null)
        }}
        onClose={() => setDeleteLayout(null)}
        danger
      />

      <ConfirmDialog
        isOpen={!!deleteDiagram}
        title="ลบผังโยง"
        message={`ต้องการลบผัง "${deleteDiagram?.name}" ใช่หรือไม่?`}
        confirmLabel="ลบ"
        onConfirm={() => {
          if (!deleteDiagram) return
          const rest = plan.diagrams.filter((d) => d.id !== deleteDiagram.id)
          change({ diagrams: rest })
          setActiveDiagramId(rest[0]?.id ?? null)
        }}
        onClose={() => setDeleteDiagram(null)}
        danger
      />
    </div>
  )
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === 'error') {
    return (
      <button onClick={onRetry} className="flex items-center gap-1.5 text-sm text-red-600 hover:underline">
        <ExclamationCircleIcon className="w-4 h-4" /> บันทึกไม่สำเร็จ — ลองอีกครั้ง
      </button>
    )
  }
  if (state === 'saved') {
    return <span className="flex items-center gap-1.5 text-sm text-gray-400"><CheckCircleIcon className="w-4 h-4 text-green-500" /> บันทึกแล้ว</span>
  }
  return <span className="flex items-center gap-1.5 text-sm text-gray-400"><ArrowPathIcon className="w-4 h-4 animate-spin" /> กำลังบันทึก...</span>
}

export default function EquipmentPlanEditPage() {
  return (
    <Suspense>
      <PlanEditor />
    </Suspense>
  )
}

function InfoField({ label, children, wide, full }: { label: string; children: React.ReactNode; wide?: boolean; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2 md:col-span-4' : wide ? 'col-span-2' : ''}>
      <dt className="text-xs font-semibold text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-gray-900">{children}</dd>
    </div>
  )
}
