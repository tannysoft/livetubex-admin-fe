'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowUturnLeftIcon, PrinterIcon, TrashIcon, CheckCircleIcon, ExclamationTriangleIcon, ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Skeleton } from '@/components/ui/Skeleton'
import DiagramPreview from '@/components/admin/equipment/DiagramPreview'
import {
  createRevision, deleteRevision, isModifiedSinceRevision, listRevisions, restoreContent, revisionMeta, setPlanRevision,
  type RestoreResult,
} from '@/lib/equipment/revisions'
import { changedDiagrams, diffItems, removedDiagrams } from '@/lib/equipment/plan-diff'
import { formatDateTime } from '@/lib/utils'
import type { EquipmentPlan, PlanRevision, PlanRevisionMeta } from '@/lib/types'

interface RevisionPanelProps {
  isOpen: boolean
  onClose: () => void
  plan: EquipmentPlan
  userEmail?: string
  /** กู้คืน → แทนที่ items/diagrams/layouts ของแผน (เข้า autosave ตามปกติ) */
  onRestore: (content: RestoreResult) => void
  /** plan.revision เปลี่ยน (บันทึก/กู้คืน/ลบ) — อัปเดต state โดยไม่นับเป็นการแก้แผน */
  onRevisionChange: (meta: PlanRevisionMeta | null) => void
}

/** permission-denied ส่วนใหญ่ = ยังไม่ได้ deploy rules ของ subcollection revisions */
function errMsg(e: unknown): string {
  const err = e as { code?: string; message?: string }
  if (err?.code === 'permission-denied') return 'ไม่มีสิทธิ์อ่าน/เขียน revision — ต้อง deploy Firestore rules ก่อน (firebase deploy --only firestore:rules)'
  return err?.message ?? ''
}

const SOURCE_LABEL: Record<PlanRevision['source'], { label: string; cls: string }> = {
  manual: { label: 'บันทึกเอง', cls: 'bg-gray-100 text-gray-600' },
  agent: { label: 'ก่อนใช้ร่าง AI', cls: 'bg-violet-100 text-violet-700' },
  restore: { label: 'ก่อนกู้คืน', cls: 'bg-sky-100 text-sky-700' },
}

/**
 * Revision ของแผน — บันทึก snapshot (จัดของ + ผังโยง + ผังวาง) เป็น Rev 1, 2, 3 …
 * เทียบกับตอนนี้ / พิมพ์ฉบับของ revision นั้น / กู้คืน (บันทึกของปัจจุบันเป็น revision ให้ก่อนเสมอ)
 */
export default function RevisionPanel({ isOpen, onClose, plan, userEmail, onRestore, onRevisionChange }: RevisionPanelProps) {
  const [revisions, setRevisions] = useState<PlanRevision[] | null>(null)
  const [label, setLabel] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [confirmRestore, setConfirmRestore] = useState<PlanRevision | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<PlanRevision | null>(null)

  const reload = async () => {
    try {
      setRevisions(await listRevisions(plan.id))
    } catch (e) {
      setError(errMsg(e) || 'โหลด revision ไม่สำเร็จ')
      setRevisions([])
    }
  }

  useEffect(() => {
    if (!isOpen) return
    let alive = true
    listRevisions(plan.id)
      .then((r) => { if (alive) setRevisions(r) })
      .catch((e) => { if (alive) { setError(errMsg(e) || 'โหลด revision ไม่สำเร็จ'); setRevisions([]) } })
    return () => { alive = false }
  }, [isOpen, plan.id])

  const modified = isModifiedSinceRevision(plan)
  // เลขถัดไปดูทั้งรายการและ plan.revision — รายการโหลดไม่ได้ก็ยังไม่โชว์เลขย้อนหลัง
  const nextNumber = Math.max(revisions?.[0]?.number ?? 0, plan.revision?.number ?? 0) + 1
  const selected = revisions?.find((r) => r.id === selectedId) ?? null

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const meta = await createRevision(plan, { label, note, source: 'manual', createdBy: userEmail })
      onRevisionChange(meta)
      setLabel('')
      setNote('')
      await reload()
    } catch (e) {
      setError(errMsg(e) || 'บันทึก revision ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const restore = async (rev: PlanRevision) => {
    setBusy(true)
    setError('')
    try {
      // ของปัจจุบันยังไม่ถูกบันทึกเป็น revision → เก็บไว้ก่อน กู้คืนผิดแล้วย้อนกลับได้
      if (modified && (plan.items.length || plan.diagrams.length || plan.layouts?.length)) {
        await createRevision(plan, { label: `ก่อนกู้คืน Rev ${rev.number}`, source: 'restore', createdBy: userEmail })
      }
      const content = restoreContent(plan, rev)
      onRestore(content)
      const meta = revisionMeta(rev)
      await setPlanRevision(plan.id, meta)
      onRevisionChange(meta)
      await reload()
      setSelectedId(null)
      if (content.keptLocked.length) {
        setError(`กู้คืน Rev ${rev.number} แล้ว — เก็บ ${content.keptLocked.length} รายการที่ลงบัญชีแล้วไว้ในแผนต่อ (ลบไม่ได้): ${content.keptLocked.map((i) => i.name).join(', ')}`)
      }
    } catch (e) {
      setError(errMsg(e) || 'กู้คืนไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (rev: PlanRevision) => {
    setBusy(true)
    try {
      await deleteRevision(plan, rev.id)
      if (plan.revision?.id === rev.id) onRevisionChange(null)
      if (selectedId === rev.id) setSelectedId(null)
      await reload()
    } catch (e) {
      setError(errMsg(e) || 'ลบไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  // เทียบ revision ที่เลือก → ตอนนี้ (ก่อน = revision, หลัง = แผนตอนนี้)
  const itemDiff = selected ? diffItems(selected.items, plan.items) : null
  const diagramDiff = selected ? changedDiagrams(selected.diagrams, plan.diagrams) : []
  const goneDiagrams = selected ? removedDiagrams(selected.diagrams, plan.diagrams) : []
  const previewDiagram = selected
    ? selected.diagrams.find((d) => d.id === previewId) ?? selected.diagrams[0]
    : undefined

  return (
    <Modal isOpen={isOpen} onClose={() => { if (!busy) onClose() }} title="Revision ของแผน" size="4xl">
      <div className="space-y-5">
        {/* สถานะ + บันทึกใหม่ */}
        <div className="rounded-xl border border-gray-100 p-4 space-y-3">
          <p className={`flex items-center gap-1.5 text-sm font-medium ${plan.revision && !modified ? 'text-green-700' : 'text-amber-700'}`}>
            {plan.revision && !modified
              ? <><CheckCircleIcon className="w-4 h-4" /> แผนตอนนี้ตรงกับ Rev {plan.revision.number}{plan.revision.label ? ` — ${plan.revision.label}` : ''}</>
              : <><ExclamationTriangleIcon className="w-4 h-4" /> {plan.revision ? `มีการแก้ไขหลัง Rev ${plan.revision.number} ที่ยังไม่ได้บันทึกเป็น revision` : 'ยังไม่เคยบันทึก revision'}</>}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_auto] gap-2">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="ชื่อ เช่น ส่งทีมกล้อง, หลังคุยลูกค้า"
              className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="หมายเหตุ — เปลี่ยนอะไรไปบ้าง (ไม่บังคับ)"
              className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
            <button
              onClick={save}
              disabled={busy || !revisions || (!!plan.revision && !modified)}
              title={plan.revision && !modified ? 'ยังไม่มีอะไรเปลี่ยนจาก revision ล่าสุด' : undefined}
              className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-xl hover:bg-brand-dark disabled:opacity-50 whitespace-nowrap"
            >
              {busy ? 'กำลังทำ...' : `บันทึกเป็น Rev ${nextNumber}`}
            </button>
          </div>
          <p className="text-[11px] text-gray-400">
            เก็บ รายการจัดของ + ผังโยง + ผังวาง 3D · ติ๊ก “จัดแล้ว/เก็บกลับ” ไม่นับเป็นการแก้ · ค่าใช้จ่ายอื่นและการลงบัญชีไม่ถูกย้อนตอนกู้คืน
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* รายการ revision */}
        {!revisions ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : revisions.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">ยังไม่มี revision — กดบันทึกเมื่อแผนพร้อมส่งให้ทีม</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
            {revisions.map((r) => {
              const src = SOURCE_LABEL[r.source] ?? SOURCE_LABEL.manual
              const isCurrent = plan.revision?.id === r.id
              return (
                <li key={r.id} className={`px-4 py-3 ${selectedId === r.id ? 'bg-brand-soft/40' : ''}`}>
                  <div className="flex items-start gap-3 flex-wrap">
                    <span className={`shrink-0 px-2 py-0.5 rounded-lg text-sm font-bold ${isCurrent ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>Rev {r.number}</span>
                    <div className="flex-1 min-w-[200px]">
                      <p className="text-sm text-gray-900">
                        {r.label || <span className="text-gray-400">ไม่มีชื่อ</span>}
                        <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium align-middle ${src.cls}`}>{src.label}</span>
                        {isCurrent && <span className="ml-1.5 text-[11px] text-green-600">ตรงกับแผน{modified ? 'ตอนบันทึก' : 'ตอนนี้'}</span>}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDateTime(r.createdAt)}{r.createdBy ? ` · ${r.createdBy}` : ''}
                        {' · '}{r.stats.items} รายการ ({r.stats.pieces} ชิ้น) · {r.stats.diagrams} ผังโยง {r.stats.nodes} กล่อง {r.stats.edges} สาย{r.stats.layouts ? ` · ผังวาง ${r.stats.layouts}` : ''}
                      </p>
                      {r.note && <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-wrap">{r.note}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => { setSelectedId(selectedId === r.id ? null : r.id); setPreviewId(null) }} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg">
                        <ArrowsRightLeftIcon className="w-3.5 h-3.5" /> เทียบ
                      </button>
                      <Link href={`/admin/equipment/plans/print?id=${plan.id}&rev=${r.id}`} title="พิมพ์ฉบับ revision นี้" className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
                        <PrinterIcon className="w-4 h-4" />
                      </Link>
                      <button onClick={() => setConfirmRestore(r)} disabled={busy} title="กู้คืนแผนเป็น revision นี้" className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50">
                        <ArrowUturnLeftIcon className="w-4 h-4" />
                      </button>
                      <button onClick={() => setConfirmDelete(r)} disabled={busy} title="ลบ revision" className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {selectedId === r.id && itemDiff && (
                    <div className="mt-3 space-y-3">
                      <p className="text-xs font-semibold text-gray-500">Rev {r.number} → ตอนนี้</p>
                      {itemDiff.added.length + itemDiff.removed.length + itemDiff.changed.length === 0 && diagramDiff.length === 0 && goneDiagrams.length === 0 ? (
                        <p className="text-sm text-gray-500">ไม่มีความต่างในรายการจัดของและผังโยง</p>
                      ) : (
                        <ul className="text-sm rounded-lg border border-gray-100 divide-y divide-gray-50 max-h-48 overflow-auto bg-white">
                          {itemDiff.added.map((it) => <li key={`a${it.id}`} className="px-3 py-1.5"><span className="text-green-600 font-semibold mr-2">+</span>{it.name} ×{it.quantity} <span className="text-gray-400">{it.toLocation}</span></li>)}
                          {itemDiff.removed.map((it) => <li key={`r${it.id}`} className="px-3 py-1.5 text-gray-400"><span className="text-red-500 font-semibold mr-2">−</span><s>{it.name} ×{it.quantity}</s></li>)}
                          {itemDiff.changed.map(({ before, after }) => (
                            <li key={`c${after.id}`} className="px-3 py-1.5">
                              <span className="text-sky-600 font-semibold mr-2">~</span>{after.name}
                              <span className="text-gray-500 ml-2">
                                {before.quantity !== after.quantity && <>×{before.quantity} → ×{after.quantity} </>}
                                {(before.toLocation ?? '') !== (after.toLocation ?? '') && <>{before.toLocation || '—'} → {after.toLocation || '—'} </>}
                                {(before.note ?? '') !== (after.note ?? '') && <>หมายเหตุเปลี่ยน</>}
                              </span>
                            </li>
                          ))}
                          {diagramDiff.map((c) => (
                            <li key={`d${c.diagram.id}`} className="px-3 py-1.5">
                              <span className="text-sky-600 font-semibold mr-2">~</span>ผัง {c.diagram.name}{c.isNew ? ' (ใหม่หลัง revision นี้)' : ''}
                              <span className="text-gray-500 ml-2">+{c.addedNodes} กล่อง +{c.addedEdges} สาย{c.removed ? ` −${c.removed}` : ''}</span>
                            </li>
                          ))}
                          {goneDiagrams.map((d) => <li key={`g${d.id}`} className="px-3 py-1.5 text-gray-400"><span className="text-red-500 font-semibold mr-2">−</span>ผัง {d.name} (ถูกลบหลัง revision นี้)</li>)}
                        </ul>
                      )}
                      {r.diagrams.length > 0 && previewDiagram && (
                        <div className="rounded-xl border border-gray-100 overflow-hidden">
                          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-100 overflow-x-auto">
                            <span className="text-[11px] text-gray-400 px-1">ผังใน Rev {r.number}:</span>
                            {r.diagrams.map((d) => (
                              <button key={d.id} onClick={() => setPreviewId(d.id)} className={`shrink-0 px-3 py-1 rounded-lg text-xs font-medium ${d.id === previewDiagram.id ? 'bg-brand-soft text-gray-900' : 'text-gray-500 hover:bg-gray-50'}`}>
                                {d.name}
                              </button>
                            ))}
                          </div>
                          <DiagramPreview diagram={previewDiagram} height={300} />
                        </div>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!confirmRestore}
        title={`กู้คืน Rev ${confirmRestore?.number}`}
        message={`รายการจัดของ ผังโยง และผังวาง จะถูกแทนด้วย Rev ${confirmRestore?.number}${modified ? ' — ของปัจจุบันจะถูกบันทึกเป็น revision ใหม่ให้ก่อน ย้อนกลับได้' : ''} · สถานะจัดแล้ว/เก็บกลับ และรายการที่ลงบัญชีแล้วจะคงไว้`}
        confirmLabel="กู้คืน"
        onConfirm={() => { const r = confirmRestore; setConfirmRestore(null); if (r) restore(r) }}
        onClose={() => setConfirmRestore(null)}
      />
      <ConfirmDialog
        isOpen={!!confirmDelete}
        title={`ลบ Rev ${confirmDelete?.number}`}
        message="ลบแล้วกู้คืนไม่ได้ (เลข revision ถัดไปจะไม่ย้อนมาใช้เลขนี้ซ้ำ ถ้ายังมี revision ที่เลขสูงกว่า)"
        confirmLabel="ลบ"
        danger
        onConfirm={() => { const r = confirmDelete; setConfirmDelete(null); if (r) remove(r) }}
        onClose={() => setConfirmDelete(null)}
      />
    </Modal>
  )
}
