'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import Logo from '@/components/ui/Logo'
import DiagramGraph from './DiagramGraph'
import { SignalSwatch } from './DiagramEditor'
import { SIGNAL_TYPES, signalMeta } from '@/lib/equipment/constants'
import { NOTE_MAX_LINES, diagramBounds, portName, wrapNote } from '@/lib/equipment/diagram'
import { isCameraKind, kindMeta } from '@/lib/equipment/venues'
import { getPlanAsset } from '@/lib/equipment/plan-assets'
import { extraCostAmount, itemCost, planCostTotals } from '@/lib/equipment/rental-cost'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { formatFullLabel } from '@/lib/equipment/video-format'
import { recordingsLabel } from '@/lib/equipment/recording-format'
import { FEED_CONNECTIONS, feedFormatLabel, fohSummary } from '@/lib/equipment/foh-feeds'
import type { EquipmentPlan, PlanDiagram, PlanLayout } from '@/lib/types'
import { camTag, groupItems, type GroupBy } from '@/lib/equipment/item-groups'
import { itemUseLabel } from '@/lib/equipment/availability'

export type { GroupBy }

interface PlanPrintDocumentProps {
  plan: EquipmentPlan
  showList: boolean
  showDiagrams: boolean
  showCables: boolean
  showLayouts: boolean
  /** วาดแนวเลนส์ (กรวยมุมรับภาพ) ในภาพผังวาง — ไม่ส่ง = วาด */
  lensLines?: boolean
  /** ต้นทุนค่าเช่า — ปิดเป็นค่าเริ่มต้น เพราะเอกสารนี้มักแจกทีมหน้างาน */
  showCosts?: boolean
  groupBy: GroupBy
  /** หน้าส่งภาพให้ทีม Visual (FOH) — ไม่ส่ง = พิมพ์ถ้ามี feed */
  showFoh?: boolean
  /** ป้าย revision ที่มุมขวาของทุกหน้า เช่น "Rev 3 — ส่งทีมกล้อง" / "ร่าง (แก้หลัง Rev 3)" */
  revisionLabel?: string
}

/** ส่งป้าย revision ให้ PrintHeader ทุกหน้าโดยไม่ต้องไล่ส่ง prop ทุก section */
const RevisionLabelContext = createContext<string | undefined>(undefined)

/** ตัวเอกสารที่ถูกพิมพ์ — รายการ (A4 ตั้ง) → ผังโยงทีละผัง (A4 นอน) → ตารางสาย (A4 ตั้ง) */
export default function PlanPrintDocument(props: PlanPrintDocumentProps) {
  return (
    <RevisionLabelContext.Provider value={props.revisionLabel}>
      <PlanPrintBody {...props} />
    </RevisionLabelContext.Provider>
  )
}

function PlanPrintBody({ plan, showList, showDiagrams, showCables, showLayouts, lensLines = true, showCosts = false, showFoh = true, groupBy }: PlanPrintDocumentProps) {
  const feeds = (plan.fohFeeds ?? []).filter((f) => f.source || f.destination)
  const diagrams = plan.diagrams.filter((d) => d.nodes.length > 0)
  const totalQty = plan.items.reduce((s, i) => s + i.quantity, 0)

  const rentalItems = plan.items.filter((i) => itemCost(i) > 0)
  const extraCosts = (plan.extraCosts ?? []).filter((c) => extraCostAmount(c) > 0)
  const rental = planCostTotals(plan)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 print:p-0 print:border-0 print:shadow-none print:rounded-none text-gray-900">
      {showList && (
        <section>
          <PrintHeader plan={plan} subtitle="รายการอุปกรณ์" />
          <p className="text-xs text-gray-500 mb-3">{plan.items.length} รายการ · รวม {totalQty} ชิ้น</p>
          {plan.notes && <p className="text-xs border border-gray-300 rounded-md px-3 py-2 mb-3 whitespace-pre-wrap"><b>หมายเหตุ:</b> {plan.notes}</p>}

          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-y border-gray-400 text-left">
                <th className="py-1.5 pr-2 w-6">#</th>
                <th className="py-1.5 pr-2 w-20">รหัส</th>
                <th className="py-1.5 pr-2">อุปกรณ์</th>
                <th className="py-1.5 pr-2 w-10 text-right">จำนวน</th>
                <th className="py-1.5 px-2">หยิบจาก → โยกไป</th>
                <th className="py-1.5 pr-2">หมายเหตุ</th>
                <th className="py-1.5 w-10 text-center">ขึ้นรถ</th>
                <th className="py-1.5 w-10 text-center">เก็บกลับ</th>
              </tr>
            </thead>
            {(() => {
              let n = 0
              return groupItems(plan.items, groupBy).map((group) => (
                <tbody key={group.title}>
                  <tr className="break-after-avoid">
                    <td colSpan={8} className="pt-3 pb-1 font-bold text-[11px] border-b border-gray-300">
                      {group.title} <span className="font-normal text-gray-500">({group.rows.reduce((s, r) => s + r.item.quantity, 0)} ชิ้น)</span>
                    </td>
                  </tr>
                  {group.rows.map(({ item: it, child }) => {
                    n += 1
                    // ติดกล้องที่อยู่คนละกลุ่ม (แยกตามปลายทาง) → บอกชื่อกล้องแทนการเยื้อง
                    const parent = !child && it.attachedTo ? plan.items.find((p) => p.id === it.attachedTo) : undefined
                    return (
                      <tr key={it.id} className="border-b border-gray-200 break-inside-avoid align-top">
                        <td className="py-1.5 pr-2 text-gray-500">{n}</td>
                        <td className="py-1.5 pr-2 font-mono text-[10px]">{it.code ?? '—'}</td>
                        <td className={`py-1.5 pr-2 font-medium ${child ? 'pl-4' : ''}`}>
                          {child && <span className="text-gray-400 mr-1">↳</span>}
                          {camTag(it) && <span className="mr-1 px-1 rounded bg-black text-white text-[10px] font-bold whitespace-nowrap">{camTag(it)}</span>}
                          {it.name || '—'}
                          {parent && <span className="font-normal text-gray-500"> (ใส่กับ {camTag(parent) || parent.name})</span>}
                          {itemUseLabel(it, plan) && <span className="ml-1 px-1 border border-gray-400 rounded text-[9px] font-semibold whitespace-nowrap">📅 {itemUseLabel(it, plan)}</span>}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{it.quantity}</td>
                        <td className="py-1.5 px-2">{it.fromLocation || '—'} → <b>{it.toLocation || '—'}</b></td>
                        <td className="py-1.5 pr-2">{it.note}</td>
                        <td className="py-1.5 text-center"><Box checked={!!it.packed} /></td>
                        <td className="py-1.5 text-center"><Box checked={!!it.returned} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              ))
            })()}
          </table>

          <div className="grid grid-cols-2 gap-10 mt-10 text-xs break-inside-avoid">
            <p className="border-t border-gray-400 pt-1.5 text-center">ผู้จัดของ / วันที่</p>
            <p className="border-t border-gray-400 pt-1.5 text-center">ผู้ตรวจรับกลับ / วันที่</p>
          </div>
        </section>
      )}

      {showFoh && feeds.length > 0 && (
        // เอกสารส่งมอบให้ทีม Visual — แยกหน้า ฉีกให้ทีมหน้า FOH ถือได้
        <section className="print-portrait mt-10 print:mt-0">
          <PrintHeader plan={plan} subtitle="ส่งภาพให้ทีม Visual (FOH)" />
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-left border-b border-gray-900">
                <th className="py-1.5 pr-2 w-6">#</th>
                <th className="py-1.5 pr-2">สัญญาณ</th>
                <th className="py-1.5 pr-2">ส่งเข้า</th>
                <th className="py-1.5 pr-2">ทาง</th>
                <th className="py-1.5 pr-2">format</th>
                <th className="py-1.5 pr-2">ระยะสาย</th>
                <th className="py-1.5 pr-2">หมายเหตุ</th>
                <th className="py-1.5 w-12 text-center">ได้รับ</th>
              </tr>
            </thead>
            <tbody>
              {feeds.map((f, i) => (
                <tr key={f.id} className="border-b border-gray-200 align-top">
                  <td className="py-2 pr-2">{i + 1}</td>
                  <td className="py-2 pr-2 font-semibold">{f.source || '—'}</td>
                  <td className="py-2 pr-2">
                    {f.destination || '—'}
                    {f.destInput && <span className="block text-[10px] text-gray-600">ช่องรับ: <b>{f.destInput}</b></span>}
                  </td>
                  <td className="py-2 pr-2 whitespace-nowrap">{FEED_CONNECTIONS.find((c) => c.value === f.connection)?.label ?? f.connection}</td>
                  <td className="py-2 pr-2">{feedFormatLabel(f, plan.videoFormat)}</td>
                  <td className="py-2 pr-2">{f.cableLength || '—'}</td>
                  <td className="py-2 pr-2 whitespace-pre-wrap">{f.note || ''}</td>
                  <td className="py-2 text-center"><Box checked={false} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid grid-cols-2 gap-10 mt-10 text-xs break-inside-avoid">
            <p className="border-t border-gray-400 pt-1.5 text-center">ผู้ส่ง (ทีม OB) / เวลา</p>
            <p className="border-t border-gray-400 pt-1.5 text-center">ผู้รับ (ทีม Visual) / เวลา</p>
          </div>
        </section>
      )}

      {showDiagrams && diagrams.map((d) => (
        <section key={d.id} className="print-landscape mt-10 print:mt-0">
          <PrintHeader plan={plan} subtitle={`ผังโยง — ${d.name}`} />
          <DiagramFigure diagram={d} />
          <Legend diagram={d} />
          <FullNotes diagram={d} />
        </section>
      ))}

      {showLayouts && (plan.layouts ?? []).map((l) => <LayoutPages key={l.id} plan={plan} layout={l} lensLines={lensLines} />)}

      {showCables && diagrams.some((d) => d.edges.length > 0) && (
        <section className="print-portrait mt-10 print:mt-0">
          <PrintHeader plan={plan} subtitle="ตารางสาย" />
          {diagrams.filter((d) => d.edges.length > 0).map((d) => (
            <div key={d.id} className="mb-5">
              <p className="font-bold text-xs mb-1">{d.name}</p>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-y border-gray-400 text-left">
                    <th className="py-1.5 pr-2 w-6">#</th>
                    <th className="py-1.5 pr-2 w-20">สัญญาณ</th>
                    <th className="py-1.5 pr-2">ต้นทาง</th>
                    <th className="py-1.5 pr-2">ปลายทาง</th>
                    <th className="py-1.5 pr-2">สาย</th>
                    <th className="py-1.5 pr-2">หมายเหตุ</th>
                    <th className="py-1.5 w-8 text-center">✓</th>
                  </tr>
                </thead>
                <tbody>
                  {d.edges.map((e, i) => (
                    <tr key={e.id} className="border-b border-gray-200 break-inside-avoid align-top">
                      <td className="py-1.5 pr-2 text-gray-500">{i + 1}</td>
                      <td className="py-1.5 pr-2">{signalMeta(e.signal).label}</td>
                      <td className="py-1.5 pr-2">{d.nodes.find((n) => n.id === e.from.nodeId)?.label} · <b>{portName(d.nodes, e.from)}</b></td>
                      <td className="py-1.5 pr-2">{d.nodes.find((n) => n.id === e.to.nodeId)?.label} · <b>{portName(d.nodes, e.to)}</b></td>
                      <td className="py-1.5 pr-2">{e.label}</td>
                      <td className="py-1.5 pr-2">{e.note}</td>
                      <td className="py-1.5 text-center"><Box checked={false} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      )}

      {showCosts && rental.total > 0 && (
        <section className="print-portrait mt-10 print:mt-0">
          <PrintHeader plan={plan} subtitle="สรุปต้นทุนของแผน" />
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-y border-gray-400 text-left">
                <th className="py-1.5 pr-2 w-6">#</th>
                <th className="py-1.5 pr-2">รายการ</th>
                <th className="py-1.5 pr-2">ผู้ให้เช่า / พาร์ทเนอร์ / ผู้รับเงิน</th>
                <th className="py-1.5 pr-2 text-right">ราคา/หน่วย</th>
                <th className="py-1.5 pr-2 text-right">จำนวน</th>
                <th className="py-1.5 pr-2 text-right">วัน</th>
                <th className="py-1.5 pr-2 text-right">รวม</th>
                <th className="py-1.5">บัญชี</th>
              </tr>
            </thead>
            <tbody>
              {rentalItems.map((it, i) => (
                <tr key={it.id} className="border-b border-gray-200 break-inside-avoid">
                  <td className="py-1.5 pr-2 text-gray-500">{i + 1}</td>
                  <td className="py-1.5 pr-2 font-medium">{it.name || '—'}</td>
                  <td className="py-1.5 pr-2">{it.rentalVendor || '—'}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{formatCurrency(it.unitCost ?? 0)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{it.quantity}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{it.rentalDays ?? 1}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums font-medium">{formatCurrency(itemCost(it))}</td>
                  <td className="py-1.5">{it.expenseCode ?? 'ยังไม่ลง'}</td>
                </tr>
              ))}
              {extraCosts.map((c, i) => (
                <tr key={c.id} className="border-b border-gray-200 break-inside-avoid">
                  <td className="py-1.5 pr-2 text-gray-500">{rentalItems.length + i + 1}</td>
                  <td className="py-1.5 pr-2 font-medium">{c.description || '—'} <span className="font-normal text-gray-500">({c.categoryName})</span></td>
                  <td className="py-1.5 pr-2">{c.vendor || '—'}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{formatCurrency(c.unitCost)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{c.quantity}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">—</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums font-medium">{formatCurrency(extraCostAmount(c))}</td>
                  <td className="py-1.5">{c.expenseCode ?? 'ยังไม่ลง'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-400 font-bold">
                <td colSpan={6} className="py-2 pr-2 text-right">รวมต้นทุน (ก่อน VAT)</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatCurrency(rental.total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </section>
      )}
    </div>
  )
}

/** ผังวาง 3D → รูปมุมบน + รูป perspective (หน้าละรูป, A4 นอน) + ตารางตำแหน่ง */
function LayoutPages({ plan, layout, lensLines }: { plan: EquipmentPlan; layout: PlanLayout; lensLines: boolean }) {
  const [shots, setShots] = useState<{ top: string; persp: string } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      // three.js โหลดเฉพาะตอนมีผัง 3D ให้พิมพ์
      const { snapshotLayout } = await import('@/lib/equipment/layout-scene')
      const floor = layout.venue.floorImageId ? await getPlanAsset(layout.venue.floorImageId).catch(() => null) : null
      const top = await snapshotLayout(layout, 'top', floor, undefined, undefined, lensLines)
      const persp = await snapshotLayout(layout, 'perspective', floor, undefined, undefined, lensLines)
      if (alive) setShots({ top, persp })
    })().catch((e) => { console.error(e); if (alive) setFailed(true) })
    return () => { alive = false }
  }, [layout, lensLines])

  const views = [['มุมบน', shots?.top], ['3D', shots?.persp]] as const
  return (
    <>
      {views.map(([name, src]) => (
        <section key={name} className="print-landscape mt-10 print:mt-0">
          <PrintHeader plan={plan} subtitle={`ผังวาง ${name} — ${layout.name} · ${layout.venue.name}`} />
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" className="w-full print:h-[150mm] object-contain border border-gray-200" />
          ) : (
            <div className="h-64 flex items-center justify-center text-sm text-gray-400 border border-gray-200">
              {failed ? 'สร้างภาพไม่สำเร็จ (เบราว์เซอร์ไม่รองรับ WebGL)' : 'กำลังสร้างภาพ...'}
            </div>
          )}
          <p className="text-[10px] text-gray-500 mt-1">
            พื้นที่ราบ {layout.venue.width} × {layout.venue.depth} ม. · ตาราง 1 ช่อง = 5 ม. · ขนาดสถานที่เป็นค่าที่กรอกในระบบ โปรดตรวจกับแบบของสถานที่จริง
          </p>
        </section>
      ))}

      {layout.objects.length > 0 && (
        <section className="print-portrait mt-10 print:mt-0">
          <PrintHeader plan={plan} subtitle={`ตำแหน่งอุปกรณ์ — ${layout.name}`} />
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-y border-gray-400 text-left">
                <th className="py-1.5 pr-2 w-6">#</th>
                <th className="py-1.5 pr-2">ชื่อ</th>
                <th className="py-1.5 pr-2">ชนิด</th>
                <th className="py-1.5 pr-2">ตำแหน่ง X, Z (ม.)</th>
                <th className="py-1.5 pr-2">ระดับพื้น</th>
                <th className="py-1.5 pr-2">หันหน้า</th>
                <th className="py-1.5 pr-2">เลนส์</th>
                <th className="py-1.5 pr-2">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {layout.objects.map((o, i) => {
                const cam = isCameraKind(o.kind)
                return (
                  <tr key={o.id} className="border-b border-gray-200 break-inside-avoid align-top">
                    <td className="py-1.5 pr-2 text-gray-500">{i + 1}</td>
                    <td className="py-1.5 pr-2 font-medium">{o.label}</td>
                    <td className="py-1.5 pr-2">{kindMeta(o.kind).label}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{o.x}, {o.z}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{o.y > 0 ? `+${o.y} ม.` : 'พื้น'}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{o.rotation}°</td>
                    <td className="py-1.5 pr-2">{cam ? `สูง ${o.mountHeight ?? '—'} ม. · FOV ${o.fov ?? '—'}°` : ''}</td>
                    <td className="py-1.5 pr-2">{o.note}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}
    </>
  )
}

function PrintHeader({ plan, subtitle }: { plan: EquipmentPlan; subtitle: string }) {
  const revision = useContext(RevisionLabelContext)
  return (
    <div className="flex items-end justify-between gap-4 border-b-2 border-gray-900 pb-2 mb-3">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{subtitle}</p>
        <h2 className="text-lg font-bold leading-tight">{plan.title}</h2>
        <p className="text-xs text-gray-600 mt-0.5">
          {[plan.jobTitle && plan.jobTitle !== plan.title ? `งาน: ${plan.jobTitle}` : '', plan.date ? formatDate(plan.date) : '', plan.location]
            .filter(Boolean).join(' · ')}
        </p>
        {plan.videoFormat && (
          <p className="text-xs mt-0.5"><span className="text-gray-500">ระบบภาพ:</span> <b>{formatFullLabel(plan.videoFormat)}</b></p>
        )}
        {fohSummary(plan.fohFeeds) && (
          <p className="text-xs mt-0.5"><span className="text-gray-500">ส่งทีม Visual (FOH):</span> <b>{fohSummary(plan.fohFeeds)}</b></p>
        )}
        {recordingsLabel(plan.recordings, plan.videoFormat) && (
          <p className="text-xs mt-0.5"><span className="text-gray-500">บันทึก:</span> <b>{recordingsLabel(plan.recordings, plan.videoFormat)}</b></p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <Logo width={126} height={19} href="" />
        {revision && <p className="text-[11px] font-bold text-gray-900 mt-1">{revision}</p>}
        <p className="text-[10px] text-gray-400 mt-1">พิมพ์เมื่อ {formatDateTime(new Date().toISOString())}</p>
      </div>
    </div>
  )
}

/** ผังย่อให้พอดีหน้า — viewBox = ขอบเขตของกล่องทั้งหมด จึงไม่ขึ้นกับตำแหน่ง pan/zoom ตอนแก้ */
function DiagramFigure({ diagram }: { diagram: PlanDiagram }) {
  const b = diagramBounds(diagram, 30)
  return (
    <svg
      viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full max-h-[70vh] print:max-h-none print:h-[150mm] border border-gray-200 rounded-lg print:rounded-none"
      style={{ aspectRatio: `${b.w} / ${b.h}` }}
    >
      <DiagramGraph diagram={diagram} />
    </svg>
  )
}

/** หมายเหตุที่ยาวจนถูกตัดในกล่อง — พิมพ์ฉบับเต็มไว้ใต้ผัง */
function FullNotes({ diagram }: { diagram: PlanDiagram }) {
  const long = diagram.nodes.filter((n) => wrapNote(n.note, 999).length > NOTE_MAX_LINES)
  if (long.length === 0) return null
  return (
    <div className="mt-2 text-[10px] text-gray-700 space-y-0.5">
      <p className="font-semibold">หมายเหตุฉบับเต็ม</p>
      {long.map((n) => <p key={n.id} className="whitespace-pre-wrap"><b>{n.label}:</b> {n.note}</p>)}
    </div>
  )
}

function Legend({ diagram }: { diagram: PlanDiagram }) {
  const used = SIGNAL_TYPES.filter((s) => diagram.edges.some((e) => e.signal === s.value))
  if (used.length === 0) return null
  return (
    <div className="flex items-center gap-4 flex-wrap mt-2 text-[10px] text-gray-600">
      {used.map((s) => (
        <span key={s.value} className="inline-flex items-center gap-1.5"><SignalSwatch color={s.color} dash={s.dash} /> {s.label}</span>
      ))}
    </div>
  )
}

function Box({ checked }: { checked: boolean }) {
  return (
    <span className="inline-flex items-center justify-center w-3.5 h-3.5 border border-gray-700 text-[10px] leading-none">
      {checked ? '✓' : ''}
    </span>
  )
}
