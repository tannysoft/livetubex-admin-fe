'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircleIcon, ClipboardDocumentIcon, ExclamationTriangleIcon, MagnifyingGlassIcon, PaperAirplaneIcon, UserGroupIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import Modal from '@/components/ui/Modal'
import FormCheckbox from '@/components/ui/FormCheckbox'
import { getPlanShareStatus } from '@/lib/equipment/plan-share'
import { getFreelancers } from '@/lib/firebase-utils'
import { getLineGroups, getPlanSendLogs, lineGroupName, lineWebhookUrl, sendPlanToLine, type LineGroup, type SendPlanResult } from '@/lib/line-groups'
import { formatDate, formatDateTime } from '@/lib/utils'
import type { EquipmentPlan, Freelancer } from '@/lib/types'

/**
 * ส่งแผนจัดอุปกรณ์ / ผังระบบ ทาง LINE — เลือกกลุ่ม LINE (ที่บอทอยู่) และ/หรือ freelancer รายคน
 * ปุ่มในข้อความเปิด LIFF หน้าแชร์แผน (แท็บอุปกรณ์/ผังระบบ/ผังวาง) → ต้องเปิดลิงก์แชร์ทีมงานก่อน
 */
export default function SendPlanModal({ plan, onClose, onOpenShare, flush }: {
  plan: EquipmentPlan
  onClose: () => void
  /** เปิดหน้าต่าง "แชร์ทีมงาน" (ยังไม่ได้เปิดลิงก์แชร์) */
  onOpenShare: () => void
  /** บันทึกแผนที่ค้างก่อนส่ง */
  flush?: () => Promise<void>
}) {
  const [shared, setShared] = useState<boolean | null>(null)
  const [groups, setGroups] = useState<LineGroup[]>([])
  const [freelancers, setFreelancers] = useState<Freelancer[]>([])
  const [sentAt, setSentAt] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [pickedGroups, setPickedGroups] = useState<Set<string>>(new Set())
  const [pickedPeople, setPickedPeople] = useState<Set<string>>(new Set())
  const [showPeople, setShowPeople] = useState(false)
  const [q, setQ] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SendPlanResult | null>(null)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    Promise.all([
      getPlanShareStatus(plan.id).catch(() => null),
      getLineGroups().catch(() => []),
      getFreelancers().catch(() => []),
      getPlanSendLogs(plan.id).catch(() => []),
    ])
      .then(([share, gs, fl, logs]) => {
        setShared(!!share?.enabled)
        setGroups(gs.filter((g) => !g.hidden))
        setFreelancers(fl.filter((f) => f.isActive !== false).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'th')))
        const m = new Map<string, string>()
        for (const l of logs) {
          const key = l.target === 'group' ? l.groupId ?? '' : l.freelancerId
          if (key && (!m.has(key) || m.get(key)! < l.sentAt)) m.set(key, l.sentAt)
        }
        setSentAt(m)
      })
      .finally(() => setLoading(false))
  }, [plan.id])

  const kw = q.trim().toLowerCase()
  const people = useMemo(
    () => freelancers.filter((f) => !kw || [f.name, f.lineDisplayName, f.phone].some((v) => v?.toLowerCase().includes(kw))),
    [freelancers, kw],
  )
  const toggle = (set: (fn: (s: Set<string>) => Set<string>) => void, id: string) =>
    set((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const total = pickedGroups.size + pickedPeople.size
  const send = async () => {
    setSending(true)
    setErr('')
    try {
      await flush?.()
      const r = await sendPlanToLine({ planId: plan.id, groupIds: [...pickedGroups], freelancerIds: [...pickedPeople], message })
      setResult(r)
      const now = new Date().toISOString()
      setSentAt((m) => { const n = new Map(m); for (const id of r.sent) n.set(id, now); return n })
      const failedIds = new Set(r.failed.map((f) => f.id))
      setPickedGroups((s) => new Set([...s].filter((id) => failedIds.has(id))))
      setPickedPeople((s) => new Set([...s].filter((id) => failedIds.has(id))))
    } catch (e) {
      console.error(e)
      setErr(e instanceof Error ? e.message : 'ส่งไม่สำเร็จ')
    } finally {
      setSending(false)
    }
  }

  const nodeCount = plan.diagrams.reduce((n, d) => n + d.nodes.length, 0)
  const layoutCount = (plan.layouts ?? []).filter((l) => l.objects.length > 0).length
  const dateText = plan.date ? `${formatDate(plan.date)}${plan.endDate && plan.endDate !== plan.date ? ` – ${formatDate(plan.endDate)}` : ''}` : '-'
  const webhook = lineWebhookUrl()
  const nameOf = (id: string) => {
    const g = groups.find((x) => x.id === id)
    return g ? lineGroupName(g) : freelancers.find((f) => f.id === id)?.name ?? id
  }

  return (
    <Modal isOpen onClose={onClose} title="ส่งแผน / ผังระบบ ทาง LINE" size="2xl">
      {shared === false && (
        <div className="mb-4 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm flex flex-wrap items-center gap-2">
          <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 shrink-0" />
          <span className="flex-1 min-w-0 text-amber-900">ต้องเปิดลิงก์แชร์ทีมงานก่อน — ปุ่มในข้อความ LINE เปิดหน้าแชร์แผน</span>
          <button onClick={onOpenShare} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-amber-200 text-amber-900 hover:bg-amber-100">ตั้งค่าแชร์ทีมงาน</button>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-[1fr_300px]">
        <div className="space-y-4 min-w-0">
          {/* กลุ่ม LINE */}
          <div>
            <p className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-1.5"><UserGroupIcon className="w-4 h-4" /> กลุ่ม LINE</p>
            <ul className="max-h-[32vh] overflow-y-auto divide-y divide-gray-50 border border-gray-100 rounded-xl">
              {loading && <li className="px-4 py-6 text-center text-sm text-gray-400">กำลังโหลด…</li>}
              {!loading && groups.length === 0 && (
                <li className="px-4 py-4 text-xs text-gray-600 space-y-2">
                  <p className="font-medium text-gray-800">ยังไม่มีกลุ่ม — เชิญบอท LINE OA เข้ากลุ่มก่อน</p>
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>LINE Developers → Messaging API → ตั้ง Webhook URL เป็น
                      {webhook && (
                        <span className="flex items-center gap-1.5 mt-1">
                          <code className="flex-1 min-w-0 truncate rounded bg-gray-100 px-1.5 py-0.5 text-[11px]">{webhook}</code>
                          <button
                            onClick={() => { navigator.clipboard.writeText(webhook).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {}) }}
                            className="shrink-0 p-1 rounded hover:bg-gray-100"
                            title="คัดลอก"
                          >
                            {copied ? <CheckCircleIcon className="w-4 h-4 text-green-600" /> : <ClipboardDocumentIcon className="w-4 h-4 text-gray-500" />}
                          </button>
                        </span>
                      )}
                      แล้วเปิด Use webhook
                    </li>
                    <li>เปิด “Allow bot to join group chats” (LINE Official Account Manager → ตั้งค่า)</li>
                    <li>เชิญบอทเข้ากลุ่ม — กลุ่มที่บอทอยู่แล้ว พิมพ์ข้อความในกลุ่ม 1 ครั้ง</li>
                  </ol>
                  <p className="text-gray-400">จัดการกลุ่มได้ที่ <Link href="/admin/settings/line" className="text-brand hover:underline">ตั้งค่า LINE</Link></p>
                </li>
              )}
              {groups.map((g) => {
                const last = sentAt.get(g.id)
                return (
                  <li key={g.id}>
                    <FormCheckbox
                      size="sm"
                      align="center"
                      disabled={!g.active}
                      checked={pickedGroups.has(g.id)}
                      onChange={() => toggle(setPickedGroups, g.id)}
                      className={`px-4 py-3 gap-3 ${g.active ? 'hover:bg-gray-50' : ''}`}
                      label={<span className="flex items-center gap-3">
                        {g.pictureUrl
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={g.pictureUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                          : <span className="w-8 h-8 rounded-full bg-green-50 text-green-700 flex items-center justify-center shrink-0"><UserGroupIcon className="w-4 h-4" /></span>}
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium text-gray-900 truncate">{lineGroupName(g)}</span>
                          {g.label && <span className="block text-xs text-gray-500 truncate">LINE: {g.name}</span>}
                        </span>
                        {!g.active && <span className="text-[11px] text-gray-400">บอทออกจากกลุ่มแล้ว</span>}
                        {last && <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded bg-green-50 text-green-700" title={formatDateTime(last)}>ส่งแล้ว</span>}
                      </span>}
                    />
                  </li>
                )
              })}
            </ul>
          </div>

          {/* ส่งรายคน */}
          <div>
            <button onClick={() => setShowPeople((v) => !v)} className="text-sm font-medium text-gray-900 hover:text-brand">
              {showPeople ? '▾' : '▸'} ส่งรายคน (Freelancer){pickedPeople.size ? ` · เลือก ${pickedPeople.size} คน` : ''}
            </button>
            {showPeople && (
              <div className="mt-2 space-y-2">
                <label className="relative block">
                  <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ, ชื่อ LINE, เบอร์โทร" className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
                </label>
                <ul className="max-h-[32vh] overflow-y-auto divide-y divide-gray-50 border border-gray-100 rounded-xl">
                  {people.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-400">ไม่พบ freelancer</li>}
                  {people.map((f) => {
                    const ok = !!f.lineUserId
                    const last = sentAt.get(f.id)
                    return (
                      <li key={f.id}>
                        <FormCheckbox
                          size="sm"
                          align="center"
                          disabled={!ok}
                          checked={pickedPeople.has(f.id)}
                          onChange={() => toggle(setPickedPeople, f.id)}
                          className={`px-4 py-2 ${ok ? 'hover:bg-gray-50' : ''}`}
                          label={<span className="flex items-center gap-3">
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm text-gray-900 truncate">{f.name || f.lineDisplayName}</span>
                              {f.position && <span className="block text-xs text-gray-500 truncate">{f.position}</span>}
                            </span>
                            {!ok && <span className="text-[11px] text-gray-400">ไม่มี LINE</span>}
                            {last && <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded bg-green-50 text-green-700" title={formatDateTime(last)}>ส่งแล้ว</span>}
                          </span>}
                        />
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* ตัวอย่างข้อความ (ใกล้เคียง flex message ใน LINE) */}
        <div className="space-y-3">
          <div className="rounded-2xl overflow-hidden border border-gray-200 text-sm">
            <div className="bg-brand text-white px-4 py-3">
              <p className="text-[10px] opacity-75 font-semibold">ตัวอย่างใน LINE</p>
              <p className="font-bold">แผนจัดอุปกรณ์ / ผังระบบ 📋</p>
            </div>
            <div className="px-4 py-3 space-y-1.5">
              <p className="font-bold text-gray-900">{plan.title || 'แผนงาน'}</p>
              {plan.jobTitle && <p className="text-xs"><span className="text-gray-500">งาน </span>{plan.jobTitle}</p>}
              <p className="text-xs"><span className="text-gray-500">วันที่ </span>{dateText}</p>
              <p className="text-xs"><span className="text-gray-500">สถานที่ </span>{plan.location || '-'}</p>
              <p className="text-xs"><span className="text-gray-500">อุปกรณ์ </span>{plan.items.length} รายการ</p>
              {nodeCount > 0 && <p className="text-xs"><span className="text-gray-500">ผังระบบ </span>{nodeCount} กล่อง</p>}
              {message.trim() && <p className="text-xs rounded-lg bg-yellow-50 text-yellow-900 px-2 py-1.5 whitespace-pre-wrap">{message.trim()}</p>}
              <div className="pt-1 space-y-1">
                <div className="text-center text-xs rounded-md bg-brand text-white py-1.5">ดูรายการอุปกรณ์</div>
                {nodeCount > 0 && <div className="text-center text-xs rounded-md bg-brand text-white py-1.5">ดูผังระบบ</div>}
                {layoutCount > 0 && <div className="text-center text-xs rounded-md bg-gray-100 text-gray-700 py-1.5">ดูผังวาง 3D</div>}
                <p className="text-center text-[10px] text-gray-400">ทีมงานที่ลงทะเบียนใน LINE แล้วเปิดดูได้เลย ไม่ต้องใส่รหัส</p>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">ข้อความเพิ่มเติม (ไม่บังคับ)</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} rows={3} placeholder="เช่น ตรวจรายการก่อนโหลดของขึ้นรถ 05:00" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
          </div>
          <p className="text-[11px] text-gray-400">ไม่ส่งต้นทุน/ค่าเช่า · คนที่ยังไม่ลงทะเบียน Freelancer ต้องใส่รหัสแชร์ · ส่งเข้ากลุ่มใช้โควตา LINE ตามจำนวนสมาชิกกลุ่ม</p>
        </div>
      </div>

      {result && (
        <div className="mt-4 space-y-1.5 text-sm">
          {result.sent.length > 0 && <p className="flex items-center gap-1.5 text-green-700"><CheckCircleIcon className="w-5 h-5" /> ส่งแล้ว {result.sent.length} ปลายทาง</p>}
          {result.failed.map((f) => (
            <p key={f.id} className="flex items-center gap-1.5 text-red-600"><ExclamationTriangleIcon className="w-5 h-5 shrink-0" /> {f.name || nameOf(f.id)}: {f.reason}</p>
          ))}
        </div>
      )}
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100">{result ? 'ปิด' : 'ยกเลิก'}</button>
        <button onClick={send} disabled={total === 0 || sending || shared === false} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-brand text-white hover:bg-brand-dark disabled:opacity-40">
          <PaperAirplaneIcon className="w-4 h-4" />
          {sending ? 'กำลังส่ง…' : `ส่งทาง LINE${total ? ` (${[pickedGroups.size ? `${pickedGroups.size} กลุ่ม` : '', pickedPeople.size ? `${pickedPeople.size} คน` : ''].filter(Boolean).join(' + ')})` : ''}`}
        </button>
      </div>
    </Modal>
  )
}
