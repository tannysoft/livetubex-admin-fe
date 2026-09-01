'use client'

import { useEffect, useState } from 'react'
import {
  CheckCircleIcon,
  ClipboardDocumentIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import {
  DEFAULT_LINE_CONFIG,
  channelIdFromLiffId,
  getLineConfig,
  isValidChannelId,
  isValidLiffId,
  saveLineConfig,
  type LineConfig,
} from '@/lib/line-config'
import { Skeleton } from '@/components/ui/Skeleton'

const inputCls =
  'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30'

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <code className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-700 truncate">
          {value}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(value).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            })
          }}
          className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-sm rounded-xl hover:bg-gray-50 shrink-0"
        >
          <ClipboardDocumentIcon className="w-4 h-4" />
          {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
        </button>
      </div>
    </div>
  )
}

export default function LineSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<LineConfig>(DEFAULT_LINE_CONFIG)
  const [origin, setOrigin] = useState('')
  const [toast, setToast] = useState<{ type: 'ok' | 'fail'; message: string } | null>(null)

  useEffect(() => {
    // อ่าน origin พร้อมกับ config — ทั้งคู่ใช้แค่ตอน render หลัง loading เสร็จ
    // (อ่าน window ตอน render ตรงๆ ไม่ได้ เพราะหน้านี้ถูก prerender ตอน build)
    getLineConfig()
      .then((c) => {
        setData(c)
        setOrigin(window.location.origin)
      })
      .catch(() => setToast({ type: 'fail', message: 'โหลดค่าไม่สำเร็จ' }))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const handleSave = async () => {
    if (!isValidLiffId(data.liffId)) {
      setToast({ type: 'fail', message: 'รูปแบบ LIFF ID ไม่ถูกต้อง (เช่น 2009681467-TEcRBohh)' })
      return
    }
    const channelId = data.loginChannelId.trim() || channelIdFromLiffId(data.liffId)
    if (!isValidChannelId(channelId)) {
      setToast({ type: 'fail', message: 'Channel ID ต้องเป็นตัวเลข 8–12 หลัก' })
      return
    }
    setSaving(true)
    try {
      await saveLineConfig({ ...data, loginChannelId: channelId })
      setToast({ type: 'ok', message: 'บันทึกแล้ว — freelancer ต้องปิดแล้วเปิด LIFF ใหม่' })
    } catch (e) {
      console.error(e)
      setToast({ type: 'fail', message: 'บันทึกไม่สำเร็จ' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const liffValid = isValidLiffId(data.liffId)

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ตั้งค่า LINE</h1>
        <p className="text-gray-500 mt-1 text-sm">
          เชื่อม LIFF app ของบริษัทเข้ากับระบบ — แก้แล้วมีผลทันที ไม่ต้อง build ใหม่
        </p>
      </div>

      {/* ── LIFF ID ─────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900">LIFF ID</h2>
          <p className="text-sm text-gray-500 mt-1">
            จาก LINE Developers Console → LINE Login channel → LIFF →{' '}
            <span className="font-medium">LIFF ID</span>
          </p>
        </div>

        <div>
          <input
            value={data.liffId}
            onChange={(e) => {
              const liffId = e.target.value
              // channel ID ที่ derive มาเอง ให้อัพเดตตาม LIFF ID
              // (ถ้าแอดมินพิมพ์ทับเองแล้ว จะไม่ไปยุ่ง)
              const derived = channelIdFromLiffId(data.liffId)
              const keepManual = data.loginChannelId !== '' && data.loginChannelId !== derived
              setData({
                ...data,
                liffId,
                loginChannelId: keepManual ? data.loginChannelId : channelIdFromLiffId(liffId),
              })
            }}
            placeholder="2009681467-TEcRBohh"
            className={`${inputCls} font-mono ${data.liffId && !liffValid ? 'border-red-400' : ''}`}
          />
          {data.liffId && !liffValid && (
            <p className="text-xs text-red-500 mt-1.5">
              รูปแบบไม่ถูกต้อง — ต้องเป็นเลข channel ตามด้วยขีดและรหัส เช่น 2009681467-TEcRBohh
            </p>
          )}
        </div>

        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
          <span>
            เปลี่ยน LIFF ID แล้ว freelancer ที่เปิดค้างไว้ต้องปิดแล้วเปิดใหม่
            และต้องตั้ง Endpoint URL ใน LINE Console ให้ตรงกับด้านล่างด้วย
          </span>
        </div>
      </section>

      {/* ── Login channel ID (ความปลอดภัย) ───────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <ShieldCheckIcon className="w-5 h-5 text-brand" />
            LINE Login Channel ID
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            ระบบใช้ค่านี้ตรวจว่า LINE access token ที่ส่งเข้ามา
            <span className="font-medium text-gray-700"> ออกจาก channel ของบริษัทนี้จริง</span> —
            ถ้าไม่ตรงจะปฏิเสธการ login กันคนเอา token จาก LIFF app อื่นมาสวมรอย
          </p>
        </div>

        <div>
          <input
            value={data.loginChannelId}
            onChange={(e) => setData({ ...data, loginChannelId: e.target.value })}
            placeholder={channelIdFromLiffId(data.liffId) || '2009681467'}
            className={`${inputCls} font-mono ${
              data.loginChannelId && !isValidChannelId(data.loginChannelId) ? 'border-red-400' : ''
            }`}
          />
          <p className="text-xs text-gray-500 mt-1.5">
            ปกติคือตัวเลขหน้าขีดของ LIFF ID — ระบบเติมให้อัตโนมัติ
            แก้เองได้ถ้า LIFF app อยู่คนละ channel กับที่ใช้ login
          </p>
        </div>

        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
          <span>
            ใส่ผิด = freelancer login ไม่ได้ทั้งระบบ (ขึ้น &quot;token ไม่ได้ออกโดย channel ของระบบนี้&quot;)
            แก้แล้วมีผลภายในไม่กี่นาที — Cloud Functions cache ค่าไว้จนกว่า instance จะรีไซเคิล
          </span>
        </div>
      </section>

      {/* ── ค่าที่ต้องไปตั้งใน LINE Console ─────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900">ค่าที่ต้องไปตั้งใน LINE Console</h2>
          <p className="text-sm text-gray-500 mt-1">คัดลอกไปวางใน LINE Developers Console</p>
        </div>
        <CopyRow label="LIFF Endpoint URL" value={`${origin}/freelancer`} />
        <CopyRow label="Callback URL (LINE Login)" value={`${origin}/freelancer`} />
        {liffValid && <CopyRow label="ลิงก์เปิด LIFF (ส่งให้ freelancer)" value={`https://liff.line.me/${data.liffId}`} />}
      </section>

      {/* ── Messaging API token ─────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <LockClosedIcon className="w-5 h-5 text-gray-400" />
          Channel Access Token (Messaging API)
        </h2>
        <p className="text-sm text-gray-500 mt-2">
          ใช้ push แจ้งเตือนโอนเงินเข้า LINE ของ freelancer —{' '}
          <span className="font-medium text-gray-700">ตั้งจากหน้านี้ไม่ได้โดยตั้งใจ</span>{' '}
          เพราะเป็นความลับ ใครได้ไปจะส่งข้อความในนามบริษัทได้ จึงเก็บใน Google Secret Manager
          ไม่ใช่ Firestore
        </p>
        <pre className="mt-3 px-3 py-2.5 bg-gray-900 text-gray-100 rounded-xl text-xs overflow-x-auto">
          firebase functions:secrets:set LINE_CHANNEL_ACCESS_TOKEN
        </pre>
        <p className="text-xs text-gray-400 mt-2">ตั้งเสร็จต้อง deploy functions ใหม่หนึ่งครั้ง</p>
      </section>

      {/* ── save ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand text-white text-sm font-medium rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50"
        >
          {saving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          บันทึก
        </button>
        {toast && (
          <span className={`flex items-center gap-1.5 text-sm ${toast.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
            {toast.type === 'ok' ? (
              <CheckCircleIcon className="w-4 h-4" />
            ) : (
              <ExclamationCircleIcon className="w-4 h-4" />
            )}
            {toast.message}
          </span>
        )}
      </div>
    </div>
  )
}
