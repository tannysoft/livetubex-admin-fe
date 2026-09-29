'use client'

import { useState } from 'react'
import { ArrowTopRightOnSquareIcon, MagnifyingGlassIcon, MapPinIcon } from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import { cleanMapUrl, mapsEmbedUrl, mapsSearchUrl, placeFromMapUrl } from '@/lib/job-map'

/**
 * ค้นหาสถานที่บนแผนที่ Google (iframe แบบ embed — ไม่ต้องมี API key)
 * พิมพ์ค้น → ดูหมุดบนแผนที่ → "ใช้ตำแหน่งนี้" = ลิงก์ค้นหาของ Google Maps (เปิดแล้วเจอที่เดียวกับที่เห็น)
 * ต้องการหมุดเป๊ะ/หน้าสถานที่ → เปิดใน Google Maps คลิกสถานที่ แล้วคัดลอก URL จาก address bar มาวางช่องล่าง
 *   (ลิงก์ /maps/place/… ไม่มี API ไหนสร้างได้) — ตัดพารามิเตอร์ติดตาม + อ่านชื่อ/พิกัดมาโชว์ตัวอย่างให้
 * (iframe ข้ามโดเมน — อ่านจุดที่ผู้ใช้จิ้มในแผนที่ไม่ได้)
 */
export default function MapSearchModal({ initialQuery, onPick, onClose }: {
  initialQuery: string
  /** name = ชื่อสถานที่ที่อ่านจากลิงก์ (ถ้ามี) — ฟอร์มเติมช่องสถานที่ให้เมื่อยังว่าง */
  onPick: (mapUrl: string, name?: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState(initialQuery.trim())
  const [shown, setShown] = useState(initialQuery.trim())
  const [pasted, setPasted] = useState('')
  const search = () => setShown(q.trim())
  const pastedOk = cleanMapUrl(pasted)
  const pastedPlace = placeFromMapUrl(pastedOk)
  // วางลิงก์หน้าสถานที่ → แผนที่ตัวอย่างย้ายไปที่หมุดของลิงก์นั้น
  const preview = pastedPlace.lat !== undefined ? `${pastedPlace.lat},${pastedPlace.lng}` : shown

  return (
    <Modal isOpen onClose={onClose} title="ค้นหาสถานที่บน Google Maps" size="2xl">
      <div className="space-y-3">
        <div className="flex gap-2">
          <label className="relative flex-1 min-w-0">
            <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search() } }}
              placeholder="ชื่อสถานที่ หรือที่อยู่ เช่น อิมแพค อารีน่า"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
              autoFocus
            />
          </label>
          <button type="button" onClick={search} disabled={!q.trim()} className="shrink-0 px-4 rounded-xl text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40">ค้นหา</button>
        </div>

        <div className="relative w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-50 aspect-[4/3] sm:aspect-[16/9]">
          {preview ? (
            <iframe
              key={preview}
              src={mapsEmbedUrl(preview)}
              title="แผนที่"
              className="absolute inset-0 w-full h-full"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">พิมพ์ชื่อสถานที่แล้วกดค้นหา</div>
          )}
        </div>

        {shown && !pastedOk && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { onPick(mapsSearchUrl(shown)); onClose() }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-brand text-white hover:bg-brand-dark"
            >
              <MapPinIcon className="w-4 h-4" /> ใช้ตำแหน่งนี้
            </button>
            <a href={mapsSearchUrl(shown)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100">
              <ArrowTopRightOnSquareIcon className="w-4 h-4" /> เปิดใน Google Maps
            </a>
            <span className="text-xs text-gray-400">หมุดไม่ตรง = ลองพิมพ์ชื่อให้ละเอียดขึ้น เช่น ใส่เขต/จังหวัด</span>
          </div>
        )}

        <div className="border-t border-gray-100 pt-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">หรือวางลิงก์จาก Google Maps (หน้าสถานที่ / ลิงก์แชร์)</label>
          <p className="text-[11px] text-gray-400 mb-1.5">กด “เปิดใน Google Maps” → คลิกสถานที่ → คัดลอก URL จากแถบที่อยู่ของเบราว์เซอร์ มาวางที่นี่</p>
          <div className="flex gap-2">
            <input
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder="https://maps.app.goo.gl/..."
              inputMode="url"
              className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
            <button type="button" onClick={() => { onPick(pastedOk, pastedPlace.name); onClose() }} disabled={!pastedOk} className="shrink-0 px-4 rounded-xl text-sm font-medium bg-brand text-white hover:bg-brand-dark disabled:opacity-40">ใช้ลิงก์นี้</button>
          </div>
          {pastedOk && (
            <p className="mt-1.5 text-xs text-gray-600">
              {pastedPlace.name ? <>📍 <span className="font-medium">{pastedPlace.name}</span></> : 'ลิงก์สั้น — อ่านชื่อ/พิกัดไม่ได้ แต่ใช้เปิดแผนที่ได้ปกติ'}
              {pastedPlace.lat !== undefined && <span className="text-gray-400 tabular-nums"> · {pastedPlace.lat.toFixed(5)}, {pastedPlace.lng!.toFixed(5)}</span>}
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}
