'use client'

import { useMemo, useState } from 'react'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import type { DiagramNode, PlanDiagram } from '@/lib/types'
import {
  ATEM_UNSET, type AtemAux, type AtemInput, type AtemMultiview,
  atemAuxes, atemInputs, atemMeCount, atemMultiviews, atemSources, buildAtemXml, multiviewCount, patchAtemXml,
} from '@/lib/equipment/atem-export'

interface Props {
  isOpen: boolean
  onClose: () => void
  diagram: PlanDiagram
  switcher: DiagramNode
}

type Section = 'inputs' | 'aux' | 'mv'

const cellCls = 'w-full px-2 py-1 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand'

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/xml' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Export ตั้งค่า ATEM จากผังระบบ (ชื่อ input / AUX / Multiview) → ไฟล์ XML ให้ ATEM Software Control (File → Restore) */
export default function AtemExportModal({ isOpen, onClose, diagram, switcher }: Props) {
  // เริ่มจากผังทุกครั้งที่เปิด (key ที่ตัวแม่) แล้วให้ผู้ใช้แก้ก่อนดาวน์โหลด
  const [inputs, setInputs] = useState<AtemInput[]>(() => atemInputs(diagram, switcher))
  const [auxes, setAuxes] = useState<AtemAux[]>(() => atemAuxes(diagram, switcher, atemInputs(diagram, switcher)))
  const mvCount = multiviewCount(switcher)
  const [mvWindows, setMvWindows] = useState(10)
  const [mvs, setMvs] = useState<AtemMultiview[]>(() => atemMultiviews(mvCount, 10, atemInputs(diagram, switcher)))
  const [include, setInclude] = useState<Record<Section, boolean>>({ inputs: true, aux: true, mv: true })
  const [tab, setTab] = useState<Section>('inputs')
  const [base, setBase] = useState<{ name: string; xml: string } | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const sources = useMemo(() => atemSources(inputs, atemMeCount(switcher.label), mvCount), [inputs, switcher.label, mvCount])

  const setWindowCount = (n: number) => {
    setMvWindows(n)
    setMvs((list) => list.map((m) => ({ ...m, windows: Array.from({ length: n }, (_, i) => m.windows[i] ?? ATEM_UNSET) })))
  }

  const config = () => ({
    inputs: include.inputs ? inputs : [],
    auxes: include.aux ? auxes : [],
    multiviews: include.mv ? mvs : [],
  })

  const onFile = async (f: File | undefined) => {
    setMsg(null)
    if (!f) { setBase(null); return }
    const xml = await f.text()
    if (!patchAtemXml(xml, { inputs: [], auxes: [], multiviews: [] })) {
      setBase(null)
      setMsg({ ok: false, text: 'ไฟล์นี้ไม่ใช่ไฟล์ตั้งค่าของ ATEM (ต้องเป็น .xml จาก File → Save As ใน ATEM Software Control)' })
      return
    }
    setBase({ name: f.name, xml })
  }

  const exportXml = () => {
    const c = config()
    if (base) {
      const r = patchAtemXml(base.xml, c)
      if (!r) return
      download(base.name.replace(/\.xml$/i, '') + '-plan.xml', r.xml)
      const done = [r.inputs && `ชื่อ input ${r.inputs}`, r.auxes && `AUX ${r.auxes}`, r.windows && `ช่อง multiview ${r.windows}`].filter(Boolean).join(' · ')
      setMsg({
        ok: r.missing.length === 0,
        text: `แก้แล้ว: ${done || 'ไม่มี'}${r.missing.length ? ` — ไม่พบในไฟล์ (ข้าม): ${r.missing.slice(0, 8).join(', ')}${r.missing.length > 8 ? ` +${r.missing.length - 8}` : ''}` : ''}`,
      })
    } else {
      download(`${switcher.label.replace(/[^\w-]+/g, '_')}-atem.xml`, buildAtemXml(switcher.label, c))
      setMsg({ ok: true, text: 'ดาวน์โหลดแล้ว — ไฟล์นี้สร้างเอง (ไม่มีไฟล์ฐาน) ถ้า ATEM ไม่ยอมเปิด หรือ AUX/Multiview ไม่เปลี่ยน ให้แนบไฟล์จากเครื่องจริงแล้ว export ใหม่' })
    }
  }

  const sourceSelect = (value: number, onChange: (v: number) => void) => (
    <select className={cellCls} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      <option value={ATEM_UNSET}>— ไม่แตะ —</option>
      {sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
    </select>
  )

  const TABS: [Section, string, number][] = [
    ['inputs', 'ชื่อ input', inputs.length],
    ['aux', 'AUX', auxes.filter((a) => a.source !== ATEM_UNSET).length],
    ['mv', 'Multiview', mvs.reduce((n, m) => n + m.windows.filter((w) => w !== ATEM_UNSET).length, 0)],
  ]

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Export ตั้งค่า ATEM — ${switcher.label}`} size="2xl">
      <div className="space-y-4 text-sm">
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {TABS.map(([key, label, n]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <input
                type="checkbox"
                checked={include[key]}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setInclude((x) => ({ ...x, [key]: e.target.checked }))}
                title="รวมส่วนนี้ในไฟล์"
              />
              {label} <span className="text-xs text-gray-400">{n}</span>
            </button>
          ))}
        </div>

        <div className="max-h-[46vh] overflow-y-auto">
          {tab === 'inputs' && (inputs.length === 0 ? (
            <p className="text-gray-500">ยังไม่มีสายเข้า input ของกล่องนี้ในผัง — โยงกล้องเข้าสวิตเชอร์ก่อน</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-500 text-left">
                  <th className="py-1 pr-2 w-16">Input</th>
                  <th className="py-1 pr-2">ชื่อยาว (≤20)</th>
                  <th className="py-1 pr-2 w-24">ชื่อย่อ (≤4)</th>
                  <th className="py-1 text-gray-400 font-normal">port ในผัง</th>
                </tr>
              </thead>
              <tbody>
                {inputs.map((r, i) => (
                  <tr key={`${r.id}-${i}`}>
                    <td className="py-1 pr-2">
                      <input type="number" min={1} className={cellCls} value={r.id} onChange={(e) => setInputs((l) => l.map((x, j) => (j === i ? { ...x, id: Math.max(1, Number(e.target.value) || 1) } : x)))} />
                    </td>
                    <td className="py-1 pr-2"><input className={cellCls} maxLength={20} value={r.longName} onChange={(e) => setInputs((l) => l.map((x, j) => (j === i ? { ...x, longName: e.target.value } : x)))} /></td>
                    <td className="py-1 pr-2"><input className={cellCls} maxLength={4} value={r.shortName} onChange={(e) => setInputs((l) => l.map((x, j) => (j === i ? { ...x, shortName: e.target.value.toUpperCase() } : x)))} /></td>
                    <td className="py-1 text-xs text-gray-400 truncate max-w-[140px]">{r.port}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

          {tab === 'aux' && (auxes.length === 0 ? (
            <p className="text-gray-500">ยังไม่มีสายออกจาก port SDI OUT / AUX ของกล่องนี้ในผัง</p>
          ) : (
            <>
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-gray-500 text-left">
                    <th className="py-1 pr-2 w-20">AUX</th>
                    <th className="py-1 pr-2">ไปที่ (จากผัง)</th>
                    <th className="py-1 w-56">แหล่งภาพ</th>
                  </tr>
                </thead>
                <tbody>
                  {auxes.map((a, i) => (
                    <tr key={a.index}>
                      <td className="py-1 pr-2 whitespace-nowrap">AUX {a.index + 1}<span className="block text-[11px] text-gray-400">{a.port}</span></td>
                      <td className="py-1 pr-2 text-xs text-gray-600">{a.dest}</td>
                      <td className="py-1">{sourceSelect(a.source, (v) => setAuxes((l) => l.map((x, j) => (j === i ? { ...x, source: v } : x))))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-gray-400 mt-2">เดาจากป้ายสาย (PGM / Clean / MV / CAM n) — เดาไม่ได้ขึ้น “ไม่แตะ” ให้เลือกเอง</p>
            </>
          ))}

          {tab === 'mv' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                จำนวนช่องต่อจอ
                {[10, 16].map((n) => (
                  <button key={n} onClick={() => setWindowCount(n)} className={`px-2.5 py-1 rounded-lg border ${mvWindows === n ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 hover:bg-gray-50'}`}>
                    {n}{n === 10 ? ' (PVW/PGM ใหญ่ + 8)' : ' (4×4)'}
                  </button>
                ))}
              </div>
              {mvs.map((m, mi) => (
                <div key={m.index}>
                  <p className="text-xs font-semibold text-gray-600 mb-1.5">Multiview {m.index + 1}</p>
                  <div className={`grid gap-1.5 ${mvWindows === 16 ? 'grid-cols-4' : 'grid-cols-2 sm:grid-cols-5'}`}>
                    {m.windows.map((w, wi) => (
                      <label key={wi} className={`block ${mvWindows === 10 && wi < 2 ? 'sm:col-span-2' : ''} ${mvWindows === 10 && wi === 1 ? 'sm:col-start-4' : ''}`}>
                        <span className="text-[10px] text-gray-400">ช่อง {wi + 1}</span>
                        {sourceSelect(w, (v) => setMvs((l) => l.map((x, j) => (j === mi ? { ...x, windows: x.windows.map((y, k) => (k === wi ? v : y)) } : x))))}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl bg-gray-50 p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-600">ไฟล์ตั้งค่าจากเครื่อง (แนะนำมาก)</p>
          <p className="text-xs text-gray-500">
            ใน ATEM Software Control กด <b>File → Save As…</b> แล้วแนบไฟล์ .xml ที่ได้ — ระบบแก้เฉพาะค่าที่เลือกไว้ ส่วนอื่นคงเดิม ไฟล์ตรงรุ่นแน่นอน
            ไม่แนบ = สร้างไฟล์ขั้นต่ำให้ (ส่วน AUX / Multiview อาจไม่ติด เพราะรูปแบบไฟล์ของ ATEM ไม่มีเอกสารทางการ)
          </p>
          <input type="file" accept=".xml,application/xml,text/xml" onChange={(e) => onFile(e.target.files?.[0])} className="text-xs" />
          {base && <p className="text-xs text-green-700">ใช้ไฟล์ {base.name} เป็นฐาน</p>}
        </div>

        <p className="text-xs text-gray-500">นำเข้า: ATEM Software Control → <b>File → Restore…</b> เลือกไฟล์ แล้วติ๊กเฉพาะส่วนที่ต้องการ</p>
        {msg && <p className={`text-xs ${msg.ok ? 'text-green-700' : 'text-amber-700'}`}>{msg.text}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100">ปิด</button>
          <button
            onClick={exportXml}
            disabled={!include.inputs && !include.aux && !include.mv}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40"
          >
            <ArrowDownTrayIcon className="w-4 h-4" /> ดาวน์โหลด .xml
          </button>
        </div>
      </div>
    </Modal>
  )
}
