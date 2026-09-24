'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  SwatchIcon,
} from '@heroicons/react/24/outline'
import {
  DEFAULT_BRAND,
  getBrand,
  isValidHexColor,
  monoLogoSvg,
  sanitizeSvg,
  saveBrand,
  type BrandSettings,
} from '@/lib/brand'
import { resetPdfBrand } from '@/lib/accounting/pdf/brand-runtime'
import { getStorageDownloadUrl, uploadBrandAsset } from '@/lib/firebase-storage'
import { Skeleton } from '@/components/ui/Skeleton'

const inputCls =
  'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30'

const PRESET_COLORS = ['#f73727', '#2563eb', '#059669', '#7c3aed', '#db2777', '#ea580c', '#0891b2', '#111827']

export default function BrandSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<BrandSettings>(DEFAULT_BRAND)
  const [toast, setToast] = useState<{ type: 'ok' | 'fail'; message: string } | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState<'brand-logo' | 'celebration' | null>(null)
  const svgInputRef = useRef<HTMLInputElement>(null)
  const pngInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getBrand()
      .then(async (b) => {
        setData(b)
        if (b.logoImagePath) {
          try {
            setLogoUrl(await getStorageDownloadUrl(b.logoImagePath))
          } catch {
            /* โลโก้ PDF หาไม่เจอ — ไม่เป็นไร */
          }
        }
      })
      .catch((e) => {
        // ปกติคือยังไม่ได้ deploy firestore rules ตัวใหม่ (publicSettings)
        console.error(e)
        setToast({ type: 'fail', message: 'อ่านแบรนด์ไม่ได้ — ตรวจว่า deploy firestore rules แล้วหรือยัง' })
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const update = <K extends keyof BrandSettings>(key: K, value: BrandSettings[K]) =>
    setData((prev) => ({ ...prev, [key]: value }))

  const handleSvgFile = async (file: File) => {
    const text = await file.text()
    const clean = sanitizeSvg(text)
    if (!clean) {
      setToast({ type: 'fail', message: 'ไฟล์นี้ไม่ใช่ SVG ที่ใช้ได้' })
      return
    }
    update('logoSvg', clean)
    setToast({ type: 'ok', message: 'อ่านโลโก้แล้ว — อย่าลืมกด "บันทึก"' })
  }

  const handleAssetUpload = async (kind: 'brand-logo' | 'celebration', file: File) => {
    setUploading(kind)
    try {
      const path = await uploadBrandAsset(kind, file)
      if (kind === 'brand-logo') {
        update('logoImagePath', path)
        setLogoUrl(await getStorageDownloadUrl(path))
      } else {
        update('celebrationImage', path)
      }
      setToast({ type: 'ok', message: 'อัพโหลดแล้ว — อย่าลืมกด "บันทึก"' })
    } catch (e) {
      console.error(e)
      setToast({ type: 'fail', message: 'อัพโหลดไม่สำเร็จ' })
    } finally {
      setUploading(null)
    }
  }

  const handleSave = async () => {
    if (!data.appName.trim()) {
      setToast({ type: 'fail', message: 'กรุณากรอกชื่อระบบ' })
      return
    }
    setSaving(true)
    try {
      await saveBrand(data)
      resetPdfBrand()
      setToast({ type: 'ok', message: 'บันทึกแบรนด์แล้ว — รีเฟรชหน้าเพื่อดูผลทั้งระบบ' })
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

  const colorValid = isValidHexColor(data.primaryColor)

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <SwatchIcon className="w-6 h-6 text-brand" />
          แบรนด์ / โลโก้
        </h1>
        <p className="text-gray-500 mt-1 text-sm">
          ชื่อระบบ โลโก้ และสีหลัก — มีผลกับทั้งหน้าแอดมิน, หน้า Freelancer, อีเมล และเอกสาร PDF
        </p>
      </div>

      {/* ── ตัวตน ───────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">ชื่อระบบ</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อระบบ (ไทย)</label>
            <input value={data.appName} onChange={(e) => update('appName', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อระบบ (อังกฤษ)</label>
            <input value={data.appNameEn} onChange={(e) => update('appNameEn', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">คำอธิบายสั้น (ต่อท้ายชื่อในแท็บ)</label>
            <input value={data.tagline} onChange={(e) => update('tagline', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">placeholder อีเมลหน้า login</label>
            <input
              value={data.loginEmailPlaceholder}
              onChange={(e) => update('loginEmailPlaceholder', e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
      </section>

      {/* ── สี ──────────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">สีหลัก</h2>
        <p className="text-sm text-gray-500">
          เฉดอื่น (hover, พื้นหลังอ่อน, เงา) คำนวณจากสีนี้ให้อัตโนมัติ ไม่ต้องตั้งทีละค่า
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="color"
            value={colorValid ? data.primaryColor : DEFAULT_BRAND.primaryColor}
            onChange={(e) => update('primaryColor', e.target.value)}
            className="w-12 h-10 rounded-lg border border-gray-200 cursor-pointer"
          />
          <input
            value={data.primaryColor}
            onChange={(e) => update('primaryColor', e.target.value)}
            className={`${inputCls} w-36 font-mono`}
          />
          {!colorValid && <span className="text-xs text-red-500">ต้องเป็น hex เช่น #2563eb</span>}
          <div className="flex gap-1.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => update('primaryColor', c)}
                style={{ backgroundColor: c }}
                className="w-7 h-7 rounded-full border border-black/10 hover:scale-110 transition-transform"
                aria-label={c}
              />
            ))}
          </div>
        </div>

        {/* preview */}
        {colorValid && (
          <div className="flex items-center gap-3 pt-2" style={{ ['--brand' as string]: data.primaryColor }}>
            <button type="button" className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-xl hover:bg-brand-dark">
              ปุ่มหลัก
            </button>
            <span className="px-3 py-1 bg-brand-soft text-brand text-sm font-medium rounded-xl">ป้ายอ่อน</span>
            <span className="text-brand text-sm font-semibold">ข้อความสีแบรนด์</span>
          </div>
        )}
      </section>

      {/* ── โลโก้ ───────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
        <div>
          <h2 className="font-semibold text-gray-900">โลโก้บนเว็บ (SVG)</h2>
          <p className="text-sm text-gray-500 mt-1">
            ใช้ในหน้า login, sidebar และหน้า Freelancer — ถ้าอยากให้บางส่วนเปลี่ยนสีตามแบรนด์
            ให้ตั้ง <code className="text-xs bg-gray-100 px-1 rounded">fill=&quot;var(--brand)&quot;</code> ใน SVG
          </p>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="border border-gray-200 rounded-xl px-4 py-3 bg-white" style={{ ['--brand' as string]: data.primaryColor }}>
            <div
              className="text-gray-900 w-40 h-8"
              dangerouslySetInnerHTML={{
                __html: data.logoSvg.replace(
                  /^<svg\b([^>]*)>/i,
                  (_m, a: string) =>
                    `<svg${a.replace(/\s(width|height|style|preserveAspectRatio)\s*=\s*("[^"]*"|'[^']*')/gi, '')}` +
                    ` width="100%" height="100%" preserveAspectRatio="xMinYMid meet" style="display:block">`,
                ),
              }}
            />
          </div>
          <div className="rounded-xl px-4 py-3 bg-brand" style={{ ['--brand' as string]: data.primaryColor }}>
            <div
              className="text-white w-40 h-8"
              dangerouslySetInnerHTML={{
                __html: monoLogoSvg(data.logoSvg).replace(
                  /^<svg\b([^>]*)>/i,
                  (_m, a: string) =>
                    `<svg${a.replace(/\s(width|height|style|preserveAspectRatio)\s*=\s*("[^"]*"|'[^']*')/gi, '')}` +
                    ` width="100%" height="100%" preserveAspectRatio="xMinYMid meet" style="display:block">`,
                ),
              }}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <input
            ref={svgInputRef}
            type="file"
            accept=".svg,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleSvgFile(f)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => svgInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-sm font-medium rounded-xl hover:bg-gray-50"
          >
            <ArrowUpTrayIcon className="w-4 h-4" />
            เลือกไฟล์ SVG
          </button>
          <button
            type="button"
            onClick={() => update('logoSvg', DEFAULT_BRAND.logoSvg)}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
          >
            คืนค่าเริ่มต้น
          </button>
        </div>

        <div className="border-t border-gray-100 pt-5">
          <h3 className="font-semibold text-gray-900">โลโก้สำหรับเอกสาร PDF (PNG/JPG)</h3>
          <p className="text-sm text-gray-500 mt-1">
            ใบเสนอราคา/ใบแจ้งหนี้/ใบกำกับภาษี/ใบเสร็จ ใช้ไฟล์นี้ — react-pdf ใส่ SVG ไม่ได้
          </p>

          {!data.logoImagePath && (
            <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
              <span>ยังไม่ได้อัพโหลด — เอกสาร PDF จะขึ้นโลโก้ตั้งต้นของระบบ</span>
            </div>
          )}

          <div className="mt-3 flex items-center gap-4">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-10 object-contain border border-gray-200 rounded-lg p-1" />
            )}
            <input
              ref={pngInputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleAssetUpload('brand-logo', f)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              disabled={uploading === 'brand-logo'}
              onClick={() => pngInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-sm font-medium rounded-xl hover:bg-gray-50 disabled:opacity-60"
            >
              <ArrowUpTrayIcon className="w-4 h-4" />
              {uploading === 'brand-logo' ? 'กำลังอัพโหลด…' : 'อัพโหลดโลโก้ PDF'}
            </button>
          </div>
        </div>
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
          <span
            className={`flex items-center gap-1.5 text-sm ${toast.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}
          >
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
