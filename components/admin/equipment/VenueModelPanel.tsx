'use client'

import { useEffect, useState } from 'react'
import { ArrowUpTrayIcon, TrashIcon, ArrowsPointingInIcon } from '@heroicons/react/24/outline'
import FormListbox from '@/components/ui/FormListbox'
import FormCheckbox from '@/components/ui/FormCheckbox'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import type { VenueModelConfig } from '@/lib/types'
import {
  MODEL_ACCEPT, MAX_MODEL_BYTES, defaultModelConfig, deleteVenueModel, formatBytes, listVenueModels, uploadVenueModel, type VenueModelMeta,
} from '@/lib/equipment/venue-models'
import { fitModelToFloor, scaleForSize, type LoadedVenueModel } from '@/lib/equipment/venue-model-scene'

interface Props {
  config?: VenueModelConfig
  onChange: (next: VenueModelConfig | undefined) => void
  /** โมเดลที่โหลดเสร็จแล้ว (null = ยังไม่มี/กำลังโหลด/โหลดไม่ได้) */
  model: LoadedVenueModel | null
  loading: boolean
  progress: number
  error: string
}

/**
 * แผงโมเดล 3D ของสถานที่จริง (ในแท็บ "สถานที่" ของผังวาง) — อัปโหลด .glb / ไฟล์สแกน หรือเลือกไฟล์ที่เคยอัปโหลด
 * แล้วจัดตำแหน่ง/สเกล/หมุน ให้ตรงกับผัง (grid 5 ม.)
 */
export default function VenueModelPanel({ config, onChange, model, loading, progress, error }: Props) {
  const [list, setList] = useState<VenueModelMeta[] | null>(null)
  const [uploading, setUploading] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [deleting, setDeleting] = useState<VenueModelMeta | null>(null)
  const [realWidth, setRealWidth] = useState('')

  useEffect(() => {
    let alive = true
    listVenueModels().then((l) => { if (alive) setList(l) }).catch(() => { if (alive) setList([]) })
    return () => { alive = false }
  }, [])

  const patch = (p: Partial<VenueModelConfig>) => config && onChange({ ...config, ...p })

  const handleUpload = async (file: File) => {
    setUploading(0)
    setUploadError('')
    try {
      const meta = await uploadVenueModel(file, setUploading)
      setList((l) => [meta, ...(l ?? [])])
      onChange(defaultModelConfig(meta))
    } catch (e) {
      console.error(e)
      setUploadError(e instanceof Error ? e.message : 'อัปโหลดไม่สำเร็จ')
    } finally {
      setUploading(null)
    }
  }

  const confirmDelete = async () => {
    const target = deleting
    setDeleting(null)
    if (!target) return
    try {
      await deleteVenueModel(target.id)
      setList((l) => (l ?? []).filter((m) => m.id !== target.id))
      if (config?.assetId === target.id) onChange(undefined)
    } catch (e) {
      console.error(e)
      setUploadError('ลบไม่สำเร็จ')
    }
  }

  const current = list?.find((m) => m.id === config?.assetId)
  const isSplat = config?.kind === 'splat'

  return (
    <div className="border-t border-gray-100 pt-3 space-y-2">
      <p className="text-xs font-semibold text-gray-500">โมเดล 3D ของสถานที่จริง</p>
      <p className="text-[11px] text-gray-400">
        .glb ที่ปั้นไว้ (Blender / Sketchfab) หรือไฟล์สแกน Gaussian splat (.spz .ply .splat .ksplat จาก Polycam, Luma, Scaniverse) · ไม่เกิน {MAX_MODEL_BYTES / 1024 / 1024} MB
      </p>

      {list && list.length > 0 && (
        <FormListbox
          value={config?.assetId ?? ''}
          onChange={(id) => {
            if (!id) return onChange(undefined)
            const meta = list.find((m) => m.id === id)
            if (meta) onChange(defaultModelConfig(meta))
          }}
          options={[{ value: '', label: 'ไม่ใช้โมเดล' }, ...list.map((m) => ({ value: m.id, label: `${m.name} · ${m.kind === 'splat' ? 'สแกน' : 'glb'} · ${formatBytes(m.size)}` }))]}
        />
      )}

      <label className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-gray-300 text-sm text-gray-600 hover:border-brand hover:text-brand cursor-pointer transition-colors">
        <ArrowUpTrayIcon className="w-4 h-4" />
        {uploading !== null ? `กำลังอัปโหลด ${Math.round(uploading * 100)}%` : 'อัปโหลดไฟล์ใหม่'}
        <input type="file" accept={MODEL_ACCEPT} className="hidden" disabled={uploading !== null} onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.target.value = '' }} />
      </label>
      {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}

      {config && (
        <div className="space-y-2 rounded-xl bg-gray-50 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-gray-700 truncate"><b>{config.fileName}</b>{isSplat ? ' (สแกน)' : ''}</p>
            {current && (
              <button onClick={() => setDeleting(current)} title="ลบไฟล์นี้ออกจากระบบ" className="p-1 text-gray-400 hover:text-red-600 rounded-lg shrink-0">
                <TrashIcon className="w-4 h-4" />
              </button>
            )}
          </div>
          {loading && (
            <div>
              <p className="text-[11px] text-gray-500">กำลังโหลดโมเดล {Math.round(progress * 100)}%</p>
              <div className="mt-1 h-1.5 rounded-full bg-gray-200 overflow-hidden"><div className="h-full bg-brand transition-all" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
            </div>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            disabled={!model}
            onClick={() => model && patch(fitModelToFloor(model, config))}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            <ArrowsPointingInIcon className="w-4 h-4" /> วางกลางผัง + แตะพื้น
          </button>
          <div className="grid grid-cols-[1fr_auto] gap-1.5 items-end">
            <Num label="ด้านยาวจริง (ม.) → ตั้งสเกล" value={realWidth === '' ? NaN : Number(realWidth)} step={1} onChange={(v) => setRealWidth(String(v))} />
            <button
              disabled={!model || !(Number(realWidth) > 0)}
              onClick={() => model && patch({ scale: scaleForSize(model, config, Number(realWidth)) })}
              className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              ตั้ง
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Num label="สเกล" value={config.scale} step={0.01} onChange={(v) => patch({ scale: Math.max(0.0001, v) })} />
            <Num label="หมุน °" value={config.rotation} step={1} onChange={(v) => patch({ rotation: v })} />
            <Num label="ยก Y (ม.)" value={config.y} step={0.1} onChange={(v) => patch({ y: v })} />
            <Num label="เลื่อน X" value={config.x} step={0.5} onChange={(v) => patch({ x: v })} />
            <Num label="เลื่อน Z" value={config.z} step={0.5} onChange={(v) => patch({ z: v })} />
          </div>
          <FormCheckbox size="sm" checked={!!config.flip} onChange={(v) => patch({ flip: v || undefined })} label="พลิกกลับหัว" description="ไฟล์สแกนหลายตัวแกนตั้งชี้ลง" />
          <div className="grid grid-cols-3 gap-2">
            <Num label="เอียง X °" value={config.tiltX ?? 0} step={0.5} onChange={(v) => patch({ tiltX: v || undefined })} />
            <Num label="เอียง Z °" value={config.tiltZ ?? 0} step={0.5} onChange={(v) => patch({ tiltZ: v || undefined })} />
          </div>

          {!isSplat && (
            <>
              <Num label="ตัดส่วนที่สูงเกิน (ม.) — 0 = ไม่ตัด" value={config.cutHeight ?? 0} step={1} onChange={(v) => patch({ cutHeight: v > 0 ? v : undefined })} />
              <p className="text-[11px] text-gray-400">ซ่อนหลังคาให้มองเห็นข้างใน — ส่วนที่ถูกตัดวางของไม่ได้ด้วย</p>
            </>
          )}
          <FormCheckbox
            size="sm"
            checked={!!config.showVenue}
            onChange={(v) => patch({ showVenue: v || undefined })}
            label={isSplat ? 'แสดงพื้น/อัฒจันทร์จากตัวเลข' : 'แสดงกรอบสถานที่จากตัวเลข (เทียบตำแหน่ง)'}
          />
          <p className="text-[11px] text-gray-400">
            {isSplat
              ? 'ไฟล์สแกนเป็นภาพอย่างเดียว — การวางของ/เดินสายยึดพื้นและอัฒจันทร์จากตัวเลขด้านบน (ซ่อนไว้) ปรับตัวเลขให้ตรงกับสแกน'
              : 'พื้นและอัฒจันทร์ในโมเดลเป็นผิววางของและเดินสายแทนสถานที่จากตัวเลข · เวทียังมาจากค่าที่ตั้ง'}
          </p>
          <button onClick={() => onChange(undefined)} className="text-xs text-red-600 hover:underline">เอาโมเดลออกจากผังนี้</button>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        title="ลบไฟล์โมเดล"
        message={`ลบ "${deleting?.fileName ?? ''}" ออกจากระบบ — ผังทุกแผนที่ใช้ไฟล์นี้จะกลับไปใช้สถานที่จากตัวเลข`}
        confirmLabel="ลบ"
        danger
      />
    </div>
  )
}

function Num({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (v: number) => void }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-gray-500 mb-1 truncate">{label}</p>
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => { const n = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(n)) onChange(n) }}
        className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
      />
    </div>
  )
}
