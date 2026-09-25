'use client'

import { useEffect, useState } from 'react'
import { ArrowTopRightOnSquareIcon, CheckIcon, ClipboardDocumentIcon, LinkIcon } from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import {
  getPlanShareStatus, planShareUrl, setPlanShare, shareErrorMessage, type PlanShareStatus,
} from '@/lib/equipment/plan-share'

interface SharePlanModalProps {
  isOpen: boolean
  onClose: () => void
  planId: string
  /** หน้าแชร์อ่านแผนจาก Firestore — บันทึกที่ค้างอยู่ก่อนเปิดดู/คัดลอกลิงก์ */
  flush: () => Promise<void>
}

const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand'

/**
 * แชร์แผนให้ทีมงานดูบนมือถือ: ลิงก์ + รหัสผ่าน (ไม่ต้อง login)
 * ทีมเห็นแผนล่าสุดที่บันทึกแล้วเสมอ — ไม่ต้องแชร์ใหม่ตอนแก้แผน
 */
export default function SharePlanModal({ isOpen, onClose, planId, flush }: SharePlanModalProps) {
  const [status, setStatus] = useState<PlanShareStatus | null | undefined>(undefined)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirmRegen, setConfirmRegen] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    let alive = true
    getPlanShareStatus(planId)
      .then((s) => { if (alive) setStatus(s) })
      .catch((e) => { if (alive) { setStatus(null); setError(shareErrorMessage(e)) } })
    return () => { alive = false }
  }, [isOpen, planId])

  const run = async (args: { enabled?: boolean; password?: string; regenerate?: boolean }, done: string) => {
    if (args.password !== undefined && args.password.length < 4) { setError('รหัสผ่านต้องยาวอย่างน้อย 4 ตัวอักษร'); return }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await flush()
      const s = await setPlanShare({ planId, ...args })
      setStatus(s)
      setPassword('')
      setNotice(done)
    } catch (e) {
      setError(shareErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  // ล้างสถานะตอนปิด — เปิดครั้งหน้าจะเริ่มจาก skeleton แล้วโหลดใหม่
  const close = () => {
    setStatus(undefined)
    setPassword('')
    setError('')
    setNotice('')
    onClose()
  }

  const url = status ? planShareUrl(status.shareId) : ''

  const copy = async () => {
    await flush()
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('คัดลอกไม่ได้ — กดค้างที่ลิงก์เพื่อคัดลอกเอง')
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={close} title="แชร์แผนให้ทีมงาน" size="md">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          ทีมงานเปิดลิงก์บนมือถือแล้วใส่รหัสผ่าน ดูได้ทั้งรายการอุปกรณ์ ผังระบบ และผังวาง (ซูมได้) — ไม่ต้องมีบัญชี
          ไม่เห็นต้นทุนหรือข้อมูลบัญชี และเห็นแผนล่าสุดที่บันทึกเสมอ
        </p>

        {status === undefined && <div className="skeleton h-24 rounded-xl" />}

        {status === null && (
          <form onSubmit={(e) => { e.preventDefault(); void run({ password, enabled: true }, 'สร้างลิงก์แล้ว — ส่งลิงก์และรหัสผ่านให้ทีมงาน') }} className="space-y-3">
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">ตั้งรหัสผ่าน</span>
              <input value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="อย่างน้อย 4 ตัวอักษร" autoComplete="new-password" />
            </label>
            <button type="submit" disabled={busy || !password} className="w-full py-2.5 bg-brand text-white text-sm font-medium rounded-xl hover:bg-brand-dark disabled:opacity-50">
              {busy ? 'กำลังสร้าง…' : 'สร้างลิงก์แชร์'}
            </button>
          </form>
        )}

        {status && (
          <>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 cursor-pointer">
              <span>
                <span className="block text-sm font-medium text-gray-900">{status.enabled ? 'เปิดลิงก์อยู่' : 'ปิดลิงก์อยู่'}</span>
                <span className="block text-xs text-gray-500">{status.enabled ? 'คนที่มีลิงก์และรหัสผ่านเปิดดูได้' : 'เปิดลิงก์แล้วจะขึ้นว่าลิงก์ถูกปิด'}</span>
              </span>
              <input
                type="checkbox"
                className="w-5 h-5 accent-[var(--brand)]"
                checked={status.enabled}
                disabled={busy}
                onChange={(e) => void run({ enabled: e.target.checked }, e.target.checked ? 'เปิดลิงก์แล้ว' : 'ปิดลิงก์แล้ว')}
              />
            </label>

            <div className={status.enabled ? '' : 'opacity-50'}>
              <span className="block text-sm font-medium text-gray-700 mb-1">ลิงก์</span>
              <div className="flex gap-2">
                <div className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm">
                  <LinkIcon className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="truncate select-all">{url}</span>
                </div>
                <button onClick={() => void copy()} className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50">
                  {copied ? <CheckIcon className="w-4 h-4 text-green-600" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
                  {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
                </button>
                <button
                  onClick={async () => { await flush(); window.open(url, '_blank', 'noopener') }}
                  title="เปิดดูแบบที่ทีมงานเห็น"
                  className="shrink-0 p-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); void run({ password }, 'เปลี่ยนรหัสผ่านแล้ว — คนที่เปิดอยู่ต้องใส่รหัสใหม่ตอนโหลดใหม่') }} className="space-y-1.5">
              <span className="block text-sm font-medium text-gray-700">เปลี่ยนรหัสผ่าน</span>
              <div className="flex gap-2">
                <input value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="รหัสใหม่ อย่างน้อย 4 ตัวอักษร" autoComplete="new-password" />
                <button type="submit" disabled={busy || !password} className="shrink-0 px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 disabled:opacity-50">บันทึก</button>
              </div>
              <p className="text-xs text-gray-400">รหัสผ่านเก็บแบบเข้ารหัส ดูย้อนหลังไม่ได้ — ลืมให้ตั้งใหม่</p>
            </form>

            <button onClick={() => setConfirmRegen(true)} disabled={busy} className="text-xs text-gray-500 underline underline-offset-2 hover:text-gray-700">
              สร้างลิงก์ใหม่ (ลิงก์เดิมจะใช้ไม่ได้)
            </button>
          </>
        )}

        {notice && <p className="text-sm text-green-700">{notice}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <ConfirmDialog
        isOpen={confirmRegen}
        onClose={() => setConfirmRegen(false)}
        onConfirm={() => { setConfirmRegen(false); void run({ regenerate: true }, 'สร้างลิงก์ใหม่แล้ว — ลิงก์เดิมใช้ไม่ได้แล้ว ส่งลิงก์ใหม่ให้ทีมงาน') }}
        title="สร้างลิงก์ใหม่?"
        message="ลิงก์เดิมที่ส่งให้ทีมงานไปแล้วจะเปิดไม่ได้ทันที (รหัสผ่านยังเหมือนเดิม)"
        confirmLabel="สร้างลิงก์ใหม่"
      />
    </Modal>
  )
}
