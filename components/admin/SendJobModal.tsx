'use client'

import FormCheckbox from '@/components/ui/FormCheckbox'
import { useEffect, useMemo, useState } from 'react'
import { CheckCircleIcon, ExclamationTriangleIcon, MagnifyingGlassIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import Modal from '@/components/ui/Modal'
import { getPlansByJob } from '@/lib/equipment/plans'
import { getPlanShareStatus } from '@/lib/equipment/plan-share'
import { getFreelancers, getJobSendLogs, getPaymentsByJob, sendJobDetails, updateJob, type SendJobDetailsResult } from '@/lib/firebase-utils'
import { formatDate, formatDateTime } from '@/lib/utils'
import type { Freelancer, Job } from '@/lib/types'

/**
 * ส่ง LINE ให้ freelancer — ไม่ส่งราคา · 1 คน = นับโควตา LINE 1 ข้อความ (ดูที่เมนู LINE Messages)
 * mode details = รายละเอียดงาน (ปุ่มดูแผน + เพิ่มลงปฏิทิน)
 * mode completed = งานเสร็จสิ้น ชวนเบิกเงิน (ปุ่ม "เบิกเงิน" เปิด LIFF พร้อมเลือกงานให้) + เปลี่ยนสถานะงานเป็นเสร็จสิ้น
 *   เลือกคนที่เคยได้รายละเอียดงานนี้ไว้ให้ (ยกเว้นคนที่ขอเบิกงานนี้แล้ว)
 */
export default function SendJobModal({ job, onClose, mode = 'details', onJobChanged }: {
  job: Job
  onClose: () => void
  mode?: 'details' | 'completed'
  /** แก้ข้อมูลงานแล้ว (สถานะ/แสดงใน LIFF) — ให้หน้าที่เปิดอัปเดตรายการ */
  onJobChanged?: (patch: Partial<Job>) => void
}) {
  const done = mode === 'completed'
  const [markCompleted, setMarkCompleted] = useState(job.status !== 'completed')
  const [showInLiff, setShowInLiff] = useState(true)
  const [claimed, setClaimed] = useState<Set<string>>(new Set())
  const [freelancers, setFreelancers] = useState<Freelancer[]>([])
  const [sentAt, setSentAt] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SendJobDetailsResult | null>(null)
  const [err, setErr] = useState('')
  // แผนจัดอุปกรณ์ของงานนี้ + ลิงก์แชร์เปิดอยู่ไหม → ปุ่ม "ดูแผนงาน" ในข้อความ LINE (server หาเองอีกรอบตอนส่ง)
  const [plans, setPlans] = useState<{ id: string; title: string; shared: boolean }[]>([])
  const [includePlans, setIncludePlans] = useState(true)
  useEffect(() => {
    let alive = true
    getPlansByJob(job.id)
      .then((list) => Promise.all(list.map(async (p) => ({ id: p.id, title: p.title, shared: !!(await getPlanShareStatus(p.id).catch(() => null))?.enabled }))))
      .then((list) => { if (alive) setPlans(list) })
      .catch(() => {})
    return () => { alive = false }
  }, [job.id])
  const sharedPlans = plans.filter((p) => p.shared).slice(0, 3)

  useEffect(() => {
    Promise.all([getFreelancers(), getJobSendLogs(job.id).catch(() => []), done ? getPaymentsByJob(job.id).catch(() => []) : Promise.resolve([])])
      .then(([fl, logs, pays]) => {
        const active = fl.filter((f) => f.isActive !== false).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'th'))
        setFreelancers(active)
        // ป้าย "ส่งแล้ว" นับเฉพาะข้อความชนิดเดียวกับที่กำลังส่ง
        const kind = done ? 'job_done' : 'job'
        const m = new Map<string, string>()
        for (const l of logs) if ((l.kind ?? 'payout') === kind && (!m.has(l.freelancerId) || m.get(l.freelancerId)! < l.sentAt)) m.set(l.freelancerId, l.sentAt)
        setSentAt(m)
        if (done) {
          const claimedIds = new Set(pays.filter((p) => p.status !== 'rejected').map((p) => p.freelancerId))
          setClaimed(claimedIds)
          // คนที่เคยได้รายละเอียดงานนี้ = ทีมงานของงาน → เลือกไว้ให้ (ยกเว้นเบิกแล้ว/แจ้งไปแล้ว/ไม่มี LINE)
          const team = new Set(logs.filter((l) => l.kind === 'job').map((l) => l.freelancerId))
          setPicked(new Set(active.filter((f) => team.has(f.id) && f.lineUserId && !claimedIds.has(f.id) && !m.has(f.id)).map((f) => f.id)))
        }
      })
      .catch((e) => { console.error(e); setErr('โหลดรายชื่อ freelancer ไม่สำเร็จ') })
      .finally(() => setLoading(false))
  }, [job.id, done])

  /** เปลี่ยนสถานะงานเป็นเสร็จสิ้น (+ เปิดให้เห็นใน LIFF เพื่อให้เลือกเบิกได้) */
  const applyJobChanges = async () => {
    const patch: Partial<Job> = {}
    if (done && markCompleted && job.status !== 'completed') patch.status = 'completed'
    if (done && showInLiff && job.showInLiff === false) patch.showInLiff = true
    if (!Object.keys(patch).length) return
    await updateJob(job.id, patch)
    onJobChanged?.(patch)
  }

  const kw = q.trim().toLowerCase()
  const list = useMemo(
    () => freelancers.filter((f) => !kw || [f.name, f.lineDisplayName, f.phone].some((v) => v?.toLowerCase().includes(kw))),
    [freelancers, kw],
  )
  const canSend = (f: Freelancer) => !!f.lineUserId
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const selectable = list.filter(canSend)
  const allPicked = selectable.length > 0 && selectable.every((f) => picked.has(f.id))

  const send = async () => {
    setSending(true)
    setErr('')
    try {
      await applyJobChanges()
      const r = await sendJobDetails(job.id, [...picked], message, { includePlans, template: mode })
      setResult(r)
      const now = new Date().toISOString()
      setSentAt((m) => { const n = new Map(m); for (const id of r.sent) n.set(id, now); return n })
      setPicked(new Set(r.failed.map((f) => f.id)))
    } catch (e) {
      console.error(e)
      setErr(e instanceof Error ? e.message : 'ส่งไม่สำเร็จ')
    } finally {
      setSending(false)
    }
  }

  const dateText = job.date ? `${formatDate(job.date)}${job.endDate && job.endDate !== job.date ? ` – ${formatDate(job.endDate)}` : ''}` : '-'

  return (
    <Modal isOpen onClose={onClose} title={done ? `งานเสร็จสิ้น — แจ้ง Freelancer เบิกเงิน` : 'ส่งรายละเอียดงานให้ Freelancer'} size="2xl">
      {done && (
        <div className="mb-4 rounded-xl bg-green-50 border border-green-100 px-4 py-3 text-sm space-y-2">
          <p className="font-medium text-gray-900">{job.title}</p>
          {job.status !== 'completed' && (
            <FormCheckbox size="sm" checked={markCompleted} onChange={setMarkCompleted} label="เปลี่ยนสถานะงานเป็น “เสร็จสิ้น”" />
          )}
          {job.showInLiff === false && (
            <FormCheckbox size="sm" checked={showInLiff} onChange={setShowInLiff} label={<span className="text-amber-800">งานนี้ซ่อนจาก LIFF อยู่ — เปิดให้เห็น เพื่อให้ Freelancer เลือกเบิกได้</span>} />
          )}
          <p className="text-xs text-gray-500">เลือกคนที่เคยได้รายละเอียดงานนี้ไว้ให้แล้ว · ปุ่ม “เบิกเงิน” ใน LINE เปิดฟอร์มเบิกพร้อมเลือกงานนี้และตำแหน่งของแต่ละคนให้</p>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-[1fr_300px]">
        <div className="space-y-3 min-w-0">
          <label className="relative block">
            <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ, ชื่อ LINE, เบอร์โทร" className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
          </label>
          <div className="flex items-center gap-3 text-xs">
            <button
              onClick={() => setPicked((s) => { const n = new Set(s); for (const f of selectable) { if (allPicked) n.delete(f.id); else n.add(f.id) } return n })}
              className="text-brand hover:underline disabled:opacity-40"
              disabled={selectable.length === 0}
            >
              {allPicked ? 'ไม่เลือกทั้งหมด' : 'เลือกทั้งหมด'}
            </button>
            <span className="text-gray-400">เลือก {picked.size} คน</span>
          </div>
          <ul className="max-h-[55vh] overflow-y-auto divide-y divide-gray-50 border border-gray-100 rounded-xl">
            {loading && <li className="px-4 py-8 text-center text-sm text-gray-400">กำลังโหลด…</li>}
            {!loading && list.length === 0 && <li className="px-4 py-8 text-center text-sm text-gray-400">ไม่พบ freelancer</li>}
            {list.map((f) => {
              const ok = canSend(f)
              const last = sentAt.get(f.id)
              return (
                <li key={f.id}>
                  <FormCheckbox
                    size="sm"
                    disabled={!ok}
                    checked={picked.has(f.id)}
                    onChange={() => toggle(f.id)}
                    className={`px-4 py-2.5 ${ok ? 'hover:bg-gray-50' : ''}`}
                    label={<span className="flex items-center gap-3">
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-gray-900 truncate">{f.name || f.lineDisplayName}</span>
                      <span className="block text-xs text-gray-500 truncate">{f.lineDisplayName ? `LINE: ${f.lineDisplayName}` : ''}{f.phone ? ` · ${f.phone}` : ''}</span>
                    </span>
                    {!ok && <span className="text-[11px] text-gray-400">ไม่มี LINE</span>}
                    {done && claimed.has(f.id) && <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">เบิกแล้ว</span>}
                    {last && <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded bg-green-50 text-green-700" title={formatDateTime(last)}>{done ? 'แจ้งแล้ว' : 'ส่งแล้ว'}</span>}
                  </span>} />
                </li>
              )
            })}
          </ul>
        </div>

        {/* ตัวอย่างข้อความที่ส่ง (ใกล้เคียง flex message ใน LINE) */}
        <div className="space-y-3">
          <div className="rounded-2xl overflow-hidden border border-gray-200 text-sm">
            <div className={`${done ? 'bg-green-600' : 'bg-brand'} text-white px-4 py-3`}>
              <p className="text-[10px] opacity-75 font-semibold">ตัวอย่างใน LINE</p>
              <p className="font-bold">{done ? 'งานเสร็จสิ้น ✅' : 'รายละเอียดงาน 🎬'}</p>
            </div>
            <div className="px-4 py-3 space-y-1.5">
              <p className="font-bold text-gray-900">{job.title}</p>
              <p className="text-xs"><span className="text-gray-500">วันที่ </span>{dateText}</p>
              <p className="text-xs"><span className="text-gray-500">สถานที่ </span>{job.location || '-'}</p>
              {job.clientName && <p className="text-xs"><span className="text-gray-500">ลูกค้า </span>{job.clientName}</p>}
              {done
                ? <p className="text-xs text-gray-800 border-t border-gray-100 pt-1.5">ขอบคุณที่ร่วมงานนี้ 🙏 งานเสร็จสิ้นแล้ว — ส่งเบิกค่าจ้างได้เลย</p>
                : job.description && <p className="text-xs text-gray-600 whitespace-pre-wrap line-clamp-4 border-t border-gray-100 pt-1.5">{job.description}</p>}
              {message.trim() && <p className="text-xs rounded-lg bg-yellow-50 text-yellow-900 px-2 py-1.5 whitespace-pre-wrap">{message.trim()}</p>}
              {done ? (
                <div className="pt-1"><div className="text-center text-xs rounded-md bg-green-600 text-white py-1.5">เบิกเงิน</div></div>
              ) : (
              <div className="pt-1 space-y-1">
                {includePlans && sharedPlans.map((p) => (
                  <div key={p.id} className="text-center text-xs rounded-md bg-brand text-white py-1.5 truncate px-2">{sharedPlans.length > 1 ? `ดูแผน: ${p.title}` : 'ดูแผนงาน / ผัง'}</div>
                ))}
                {/* ยังแนบไม่ได้ — โชว์ช่องปุ่มไว้พร้อมเหตุผล จะได้รู้ว่าต้องทำอะไรก่อน */}
                {sharedPlans.length === 0 && (
                  <div className="text-center text-xs rounded-md border border-dashed border-gray-300 text-gray-400 py-1.5 px-2">
                    ดูแผนงาน / ผัง
                    <span className="block text-[10px]">{plans.length === 0 ? 'ยังไม่มีแผนที่ผูกกับงานนี้' : 'แผนยังไม่เปิดลิงก์แชร์'}</span>
                  </div>
                )}
                <div className={`text-center text-xs rounded-md py-1.5 ${includePlans && sharedPlans.length ? 'bg-gray-100 text-gray-700' : 'bg-brand text-white'}`}>เพิ่มลงปฏิทิน</div>
              </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">ข้อความเพิ่มเติม (ไม่บังคับ)</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} rows={4} placeholder={done ? 'เช่น เบิกภายในวันศุกร์นี้ รอบจ่ายกลางเดือน' : 'เช่น เข้างาน 06:00 ที่ประตู 3, แต่งกายชุดดำ'} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
          </div>
          {!done && plans.length === 0 && (
            <div className="rounded-xl border border-gray-100 px-3 py-2 text-[11px] text-gray-500">
              จะมีปุ่ม “ดูแผนงาน” เมื่องานนี้มีแผนจัดอุปกรณ์ (เลือกงานนี้ตอนสร้างแผน) และเปิดลิงก์แชร์ทีมงาน ·{' '}
              <Link href="/admin/equipment/plans" className="text-brand hover:underline">ไปหน้าแผน</Link>
            </div>
          )}
          {!done && plans.length > 0 && (
            <div className="rounded-xl border border-gray-100 px-3 py-2 space-y-1.5">
              <FormCheckbox size="sm" checked={includePlans} onChange={setIncludePlans} disabled={sharedPlans.length === 0} label={<span className="text-xs font-medium">แนบปุ่มดูแผนงาน</span>} />
              {plans.map((p) => (
                <p key={p.id} className="text-[11px] text-gray-500 flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${p.shared ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span className="truncate">{p.title}</span>
                  {!p.shared && <Link href={`/admin/equipment/plans/edit?id=${p.id}`} className="shrink-0 text-brand hover:underline">ยังไม่เปิดแชร์</Link>}
                </p>
              ))}
              <p className="text-[11px] text-gray-400">เปิดใน LINE แล้ว Freelancer ที่ลงทะเบียนดูได้เลย ไม่ต้องใส่รหัส</p>
            </div>
          )}
          <p className="text-[11px] text-gray-400">ไม่ส่งราคางาน · ส่ง 1 คน = ใช้โควตา LINE 1 ข้อความ</p>
        </div>
      </div>

      {result && (
        <div className="mt-4 space-y-1.5 text-sm">
          {result.sent.length > 0 && <p className="flex items-center gap-1.5 text-green-700"><CheckCircleIcon className="w-5 h-5" /> ส่งแล้ว {result.sent.length} คน</p>}
          {result.failed.map((f) => (
            <p key={f.id} className="flex items-center gap-1.5 text-red-600"><ExclamationTriangleIcon className="w-5 h-5 shrink-0" /> {f.name}: {f.reason}</p>
          ))}
        </div>
      )}
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100">{result ? 'ปิด' : 'ยกเลิก'}</button>
        {done && !result && job.status !== 'completed' && markCompleted && (
          <button
            onClick={async () => { setSending(true); try { await applyJobChanges(); onClose() } catch (e) { setErr(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ') } finally { setSending(false) } }}
            disabled={sending}
            className="px-4 py-2 rounded-xl text-sm text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
          >
            เสร็จสิ้นโดยไม่ส่ง LINE
          </button>
        )}
        <button onClick={send} disabled={picked.size === 0 || sending} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-brand text-white hover:bg-brand-dark disabled:opacity-40">
          <PaperAirplaneIcon className="w-4 h-4" />
          {sending ? 'กำลังส่ง…' : `ส่งทาง LINE${picked.size ? ` (${picked.size} คน)` : ''}`}
        </button>
      </div>
    </Modal>
  )
}
