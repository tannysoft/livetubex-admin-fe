'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  PlusIcon, TrashIcon, XMarkIcon, EyeIcon, EyeSlashIcon, CubeTransparentIcon, MapIcon, ArrowUpTrayIcon, DocumentDuplicateIcon,
} from '@heroicons/react/24/outline'
import FormListbox from '@/components/ui/FormListbox'
import FormCheckbox from '@/components/ui/FormCheckbox'
import type { LayoutObject, LayoutObjectKind, PlanItem, PlanLayout, VenueConfig } from '@/lib/types'
import {
  KIND_DEFAULTS, OBJECT_KINDS, isCameraKind, VENUE_PRESETS, cloneVenue, kindForCategory, kindMeta,
} from '@/lib/equipment/venues'
import {
  addLights, buildObject, buildVenue, cameraPose, declutterLabels, disposeGroup, labelSizeFor, loadImage, objectDims, ridersOf, venueExtent,
} from '@/lib/equipment/layout-scene'
import { getPlanAsset, uploadPlanAsset } from '@/lib/equipment/plan-assets'
import { newId } from '@/lib/equipment/plans'
import { LABEL_SCALE, useLabelSize, useLensLines } from '@/lib/equipment/lens-lines'
import LabelSizePicker from './LabelSizePicker'
import { ORIGIN_LABEL, isRentalItem, itemOrigin } from '@/lib/equipment/rental-cost'

interface LayoutEditorProps {
  planId: string
  layout: PlanLayout
  onChange: (next: PlanLayout) => void
  planItems: PlanItem[]
  onRequestAdd?: () => void
}

type Three = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  venue: THREE.Group | null
  objects: THREE.Group
  render: () => void
}

const inputCls = 'w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand'

/** ตัวแก้ผังวางอุปกรณ์ 3D — ลากวัตถุบนพื้น/เวที/อัฒจันทร์, Shift+ลาก = หันหน้า, มองจากกล้องได้ */
export default function LayoutEditor({ planId, layout, onChange, planItems, onRequestAdd }: LayoutEditorProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const three = useRef<Three | null>(null)
  const latest = useRef({ layout, onChange })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [povId, setPovId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'3d' | 'top'>('3d')
  const [lensLines, setLensLines] = useLensLines()
  const [labelSizeKey] = useLabelSize()
  const [panel, setPanel] = useState<'objects' | 'venue'>('objects')
  const [floorImg, setFloorImg] = useState<HTMLImageElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const venue = layout.venue
  const selected = layout.objects.find((o) => o.id === selectedId)
  const povObject = layout.objects.find((o) => o.id === povId)

  // pointer handler ถูกผูกครั้งเดียวตอน mount → ต้องอ่าน layout/onChange ล่าสุดผ่าน ref
  useEffect(() => { latest.current = { layout, onChange } })

  const patchObject = (id: string, patch: Partial<LayoutObject>) => {
    const { layout: l, onChange: emit } = latest.current
    emit({ ...l, objects: l.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)) })
  }
  const patchVenue = (patch: Partial<VenueConfig>) => onChange({ ...layout, venue: { ...venue, ...patch } })

  // ── three.js lifecycle ───────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.touchAction = 'none'

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf3f4f6)
    addLights(scene)
    const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 5000)
    const objects = new THREE.Group()
    scene.add(objects)

    let frame = 0
    const render = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        // ป้ายชื่อหลบกันตามมุมกล้องปัจจุบัน — ต้องจัดใหม่ทุกเฟรมเพราะหมุน/ซูมแล้วตำแหน่งบนจอเปลี่ยน
        scene.updateMatrixWorld()
        declutterLabels(scene, camera, renderer.domElement.clientWidth, renderer.domElement.clientHeight)
        renderer.render(scene, camera)
      })
    }

    // ── ลากวัตถุ: ผูกแบบ capture ให้ทำงานก่อน OrbitControls แล้วปิด controls ถ้าโดนวัตถุ ──
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    let dragId: string | null = null
    let downAt: { x: number; y: number } | null = null

    const setRay = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
    }
    // พื้นผิวที่วางของได้ = สถานที่ (พื้น/เวที/อัฒจันทร์) + Riser ทุกตัว ยกเว้นตัวที่กำลังลาก
    const groundsExcept = (excludeId: string | null): THREE.Object3D[] => {
      const out: THREE.Object3D[] = []
      three.current?.venue?.traverse((o) => { if (o.userData.ground) out.push(o) })
      for (const child of objects.children) {
        if (child.userData.objectId === excludeId) continue
        child.traverse((o) => { if (o.userData.ground) out.push(o) })
      }
      return out
    }
    const down = new THREE.Vector3(0, -1, 0)
    const groundPoint = (excludeId: string | null): THREE.Vector3 | null => {
      const grounds = groundsExcept(excludeId)
      const hit = raycaster.intersectObjects(grounds, false)[0]
      // นอกสถานที่ (เช่น รถ OB จอดข้างนอก) → วางบนระนาบพื้น y=0
      const p = hit ? hit.point.clone() : raycaster.ray.intersectPlane(floorPlane, new THREE.Vector3())
      if (!p) return null
      // ray อาจชน "ด้านข้าง" ของแท่น/ขั้นบันได → ความสูงจริงต้องยิงลงตรงๆ ที่ x,z นั้น ให้ได้ผิวบนสุด
      const top = new THREE.Raycaster(new THREE.Vector3(p.x, 500, p.z), down).intersectObjects(grounds, false)[0]
      p.y = top ? top.point.y : 0
      return p
    }
    let riders: string[] = []
    const onDown = (e: PointerEvent) => {
      if (!controls.enabled && !dragId) return // อยู่ในมุมมองจากกล้อง
      downAt = { x: e.clientX, y: e.clientY }
      setRay(e)
      const hit = raycaster.intersectObjects(objects.children, true)[0]
      let node: THREE.Object3D | null = hit?.object ?? null
      while (node && !node.userData.objectId) node = node.parent
      if (node) {
        dragId = node.userData.objectId as string
        const all = latest.current.layout.objects
        const dragged = all.find((o) => o.id === dragId)
        riders = dragged?.kind === 'riser' ? ridersOf(dragged, all).map((o) => o.id) : []
        setSelectedId(dragId)
        setPanel('objects')
        controls.enabled = false
        renderer.domElement.setPointerCapture(e.pointerId)
      }
    }
    const onMove = (e: PointerEvent) => {
      if (!dragId) return
      setRay(e)
      const p = groundPoint(dragId)
      const obj = latest.current.layout.objects.find((o) => o.id === dragId)
      if (!p || !obj) return
      if (e.shiftKey) {
        const deg = (Math.atan2(p.x - obj.x, -(p.z - obj.z)) * 180) / Math.PI
        patchObject(dragId, { rotation: Math.round(((deg % 360) + 360) % 360) })
      } else {
        const r = (n: number) => Math.round(n * 10) / 10
        const next = { x: r(p.x), z: r(p.z), y: r(Math.max(0, p.y)) }
        const [dx, dz, dy] = [next.x - obj.x, next.z - obj.z, next.y - obj.y]
        // ย้าย riser → ของที่ยืนอยู่บนแท่นตามไปด้วย
        const { layout: l, onChange: emit } = latest.current
        emit({
          ...l,
          objects: l.objects.map((o) => {
            if (o.id === dragId) return { ...o, ...next }
            if (riders.includes(o.id)) return { ...o, x: r(o.x + dx), z: r(o.z + dz), y: r(Math.max(0, o.y + dy)) }
            return o
          }),
        })
      }
    }
    const onUp = (e: PointerEvent) => {
      if (dragId) {
        dragId = null
        riders = []
        controls.enabled = true
        if (renderer.domElement.hasPointerCapture(e.pointerId)) renderer.domElement.releasePointerCapture(e.pointerId)
      } else if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 4) {
        setSelectedId(null) // คลิกที่ว่าง (ไม่ใช่ลากหมุนมุมมอง)
      }
      downAt = null
    }
    const el = renderer.domElement
    el.addEventListener('pointerdown', onDown, { capture: true })
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)

    const controls = new OrbitControls(camera, el)
    controls.maxPolarAngle = Math.PI / 2 - 0.02
    controls.addEventListener('change', render)

    const resize = () => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / Math.max(h, 1)
      camera.updateProjectionMatrix()
      render()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)

    three.current = { renderer, scene, camera, controls, venue: null, objects, render }
    resize()

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      el.removeEventListener('pointerdown', onDown, { capture: true })
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      controls.dispose()
      disposeGroup(scene)
      renderer.dispose()
      renderer.forceContextLoss()
      mount.removeChild(el)
      three.current = null
    }
  }, [])

  // รูป floor plan
  useEffect(() => {
    let alive = true
    if (!venue.floorImageId) return
    getPlanAsset(venue.floorImageId)
      .then((src) => (src ? loadImage(src) : null))
      .then((img) => { if (alive) setFloorImg(img) })
      .catch(() => { if (alive) setFloorImg(null) })
    return () => { alive = false }
  }, [venue.floorImageId])
  const activeFloorImg = venue.floorImageId ? floorImg : null

  // สถานที่เปลี่ยน → สร้างใหม่ทั้งก้อน (ถูกพอ ไม่ต้อง diff)
  const venueKey = JSON.stringify(venue)
  useEffect(() => {
    const t = three.current
    if (!t) return
    if (t.venue) { t.scene.remove(t.venue); disposeGroup(t.venue) }
    t.venue = buildVenue(venue, activeFloorImg)
    t.scene.add(t.venue)
    t.venue.updateMatrixWorld(true)
    t.render()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueKey, activeFloorImg])

  const labelSize = labelSizeFor(venue, LABEL_SCALE[labelSizeKey])
  useEffect(() => {
    const t = three.current
    if (!t) return
    const old = [...t.objects.children]
    old.forEach((c) => { t.objects.remove(c); disposeGroup(c) })
    // ในมุมมองจากกล้อง ซ่อนตัวกล้องนั้นเอง ไม่งั้นบังเลนส์
    layout.objects.filter((o) => o.id !== povId).forEach((o) => t.objects.add(buildObject(o, labelSize, o.id === selectedId, lensLines)))
    // three อัปเดต matrixWorld ตอน render เท่านั้น แต่ pointermove ถัดไปอาจ raycast ก่อน frame นั้น
    // → ไม่อัปเดตเอง ray จะเห็น riser ที่เพิ่งสร้างใหม่อยู่ที่จุด (0,0,0) แล้ววางของทับไม่ติด
    t.objects.updateMatrixWorld(true)
    t.render()
  }, [layout.objects, selectedId, povId, labelSize, lensLines])

  // มุมมอง: 3D / Top / จากกล้อง
  const frameKey = `${venue.width}|${venue.depth}|${venue.tiers?.steps ?? 0}|${venue.shape}|${venue.tiers?.curved}|${venue.tiers?.front}`
  useEffect(() => {
    const t = three.current
    if (!t) return
    const e = venueExtent(latest.current.layout.venue)
    const cx = (e.minX + e.maxX) / 2
    const cz = (e.minZ + e.maxZ) / 2
    const span = Math.max(e.maxX - e.minX, e.maxZ - e.minZ)
    if (povObject) {
      const pose = cameraPose(povObject)
      t.controls.enabled = false
      t.camera.position.copy(pose.pos)
      t.camera.lookAt(pose.pos.clone().add(pose.dir))
      // fov ของวัตถุเป็นแนวนอน → three ใช้แนวตั้ง
      t.camera.fov = (2 * Math.atan(Math.tan((pose.fov * Math.PI) / 360) / t.camera.aspect) * 180) / Math.PI
    } else {
      t.controls.enabled = true
      t.camera.fov = 45
      t.controls.target.set(cx, 0, cz)
      if (viewMode === 'top') {
        t.camera.position.set(cx, span * 1.35, cz + 0.01)
        t.controls.enableRotate = false
      } else {
        t.camera.position.set(cx + span * 0.5, span * 0.55, e.maxZ + span * 0.4)
        t.controls.enableRotate = true
      }
      t.controls.update()
    }
    t.camera.updateProjectionMatrix()
    t.render()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, povId, frameKey, povObject?.x, povObject?.z, povObject?.y, povObject?.rotation, povObject?.tilt, povObject?.fov, povObject?.mountHeight])

  // ── actions ──────────────────────────────────────────────────────────────
  const surfaceY = (x: number, z: number): number => {
    const t = three.current
    if (!t?.venue) return 0
    const grounds: THREE.Object3D[] = []
    t.venue.traverse((o) => { if (o.userData.ground) grounds.push(o) })
    t.objects.traverse((o) => { if (o.userData.ground) grounds.push(o) }) // riser
    const hit = new THREE.Raycaster(new THREE.Vector3(x, 500, z), new THREE.Vector3(0, -1, 0)).intersectObjects(grounds, false)[0]
    return hit ? Math.max(0, Math.round(hit.point.y * 10) / 10) : 0
  }

  const addObject = (kind: LayoutObjectKind, label: string, planItemId?: string) => {
    const t = three.current
    const n = layout.objects.length
    const x = Math.round(((t?.controls.target.x ?? 0) + (n % 5) * 2) * 10) / 10
    const z = Math.round(((t?.controls.target.z ?? 0) + (n % 5) * 2) * 10) / 10
    const obj: LayoutObject = { id: newId(), planItemId, kind, label, x, z, y: surfaceY(x, z), rotation: 0, ...KIND_DEFAULTS[kind] }
    onChange({ ...layout, objects: [...layout.objects, obj] })
    setSelectedId(obj.id)
  }

  const nextLabel = (kind: LayoutObjectKind) => {
    const count = layout.objects.filter((o) => o.kind === kind).length + 1
    return kind === 'camera' ? `CAM ${count}` : kind === 'jib' ? `JIB ${count}` : kind === 'gimbal' ? `RONIN ${count}` : kind === 'remote_head' ? `RH ${count}` : kind === 'micro_stand' ? `MICRO ${count}` : kind === 'action_cam' ? `ACTION ${count}` : kind === 'ptz' ? `PTZ ${count}` : kind === 'tele_lens' ? `TELE ${count}` : kind === 'box_lens' ? `BOX ${count}` : `${kindMeta(kind).label.split(' ')[0]} ${count}`
  }

  /** ปรับความสูง riser → ของที่ยืนอยู่บนแท่นต้องขึ้น/ลงตาม ไม่งั้นลอยหรือจมแท่น */
  const changeHeight = (obj: LayoutObject, h: number) => {
    const delta = h - objectDims(obj).h
    const riderIds = obj.kind === 'riser' ? ridersOf(obj, layout.objects).map((o) => o.id) : []
    onChange({
      ...layout,
      objects: layout.objects.map((o) => {
        if (o.id === obj.id) return { ...o, h }
        if (riderIds.includes(o.id)) return { ...o, y: Math.max(0, Math.round((o.y + delta) * 10) / 10) }
        return o
      }),
    })
  }

  const removeSelected = () => {
    if (!selected) return
    onChange({ ...layout, objects: layout.objects.filter((o) => o.id !== selected.id) })
    setSelectedId(null)
    if (povId === selected.id) setPovId(null)
  }

  const duplicateSelected = () => {
    if (!selected) return
    const copy = { ...selected, id: newId(), x: selected.x + 2, label: `${selected.label} (2)` }
    onChange({ ...layout, objects: [...layout.objects, copy] })
    setSelectedId(copy.id)
  }

  const applyPreset = (presetId: string) => {
    const preset = VENUE_PRESETS.find((p) => p.presetId === presetId)
    if (!preset) return
    // เก็บรูป floor plan เดิมไว้ — เปลี่ยน preset ไม่ควรทำรูปที่อัปโหลดหาย
    onChange({
      ...layout,
      venue: {
        ...cloneVenue(preset),
        floorImageId: venue.floorImageId, floorImageWidth: venue.floorImageWidth,
        floorImageOffsetX: venue.floorImageOffsetX, floorImageOffsetZ: venue.floorImageOffsetZ,
      },
    })
  }

  const handleUpload = async (file: File) => {
    setUploading(true)
    setUploadError('')
    try {
      const { id } = await uploadPlanAsset(planId, file)
      patchVenue({ floorImageId: id, floorImageWidth: venue.floorImageWidth ?? venue.width })
    } catch (e) {
      console.error(e)
      setUploadError('อัปโหลดไม่สำเร็จ — ลองใช้รูปที่เล็กลง')
    } finally {
      setUploading(false)
    }
  }

  // ไม่ลบ doc ของรูปทิ้ง — แผนที่ถูกสำเนาไปอาจยังอ้างรูปเดียวกันอยู่
  const removeFloorImage = () => {
    patchVenue({ floorImageId: '', floorImageWidth: undefined, floorImageOffsetX: undefined, floorImageOffsetZ: undefined })
  }

  const isCam = !!selected && isCameraKind(selected.kind)
  const dims = selected ? objectDims(selected) : null

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <div className="relative flex-1 min-w-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div ref={mountRef} className="w-full h-[68vh] min-h-[420px]" />

        <div className="absolute top-3 left-3 flex items-center gap-1 bg-white/95 border border-gray-200 rounded-xl shadow-sm p-1">
          {([['3d', '3D', CubeTransparentIcon], ['top', 'มุมบน', MapIcon]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => { setPovId(null); setViewMode(key) }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium ${!povId && viewMode === key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
          <span className="w-px h-5 bg-gray-200 mx-0.5" aria-hidden />
          <button
            onClick={() => setLensLines(!lensLines)}
            aria-pressed={lensLines}
            title={lensLines ? 'ซ่อนแนวเลนส์ (กรวยมุมรับภาพ)' : 'แสดงแนวเลนส์ (กรวยมุมรับภาพ)'}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium ${lensLines ? 'bg-brand-soft text-gray-900' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            {lensLines ? <EyeIcon className="w-4 h-4" /> : <EyeSlashIcon className="w-4 h-4" />} แนวเลนส์
          </button>
          <LabelSizePicker className="!border-0 !p-0" />
        </div>

        {povObject && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-gray-900/90 text-white text-xs pl-3 pr-1.5 py-1.5 rounded-full">
            <EyeIcon className="w-4 h-4" /> มุมมองจาก {povObject.label} · {dims && povObject.id === selected?.id ? `${dims.fov}°` : ''}
            <button onClick={() => setPovId(null)} className="px-2.5 py-1 bg-white/15 hover:bg-white/25 rounded-full">ออก</button>
          </div>
        )}

        <p className="absolute bottom-3 left-3 text-[11px] text-gray-500 bg-white/90 rounded-lg px-2.5 py-1.5">
          ลากวัตถุเพื่อย้าย · <b>Shift+ลาก</b> เพื่อหันหน้า · ลากพื้นที่ว่างเพื่อหมุนมุมมอง · scroll เพื่อซูม · 1 ช่อง = 5 ม.
        </p>
      </div>

      <div className="w-full lg:w-80 shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 lg:h-[68vh] lg:min-h-[420px] overflow-y-auto">
        {selected && dims ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-800">{kindMeta(selected.kind).label}</p>
              <button onClick={() => setSelectedId(null)} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><XMarkIcon className="w-4 h-4" /></button>
            </div>
            <Field label="ชื่อ">
              <input className={inputCls} value={selected.label} onChange={(e) => patchObject(selected.id, { label: e.target.value })} />
            </Field>
            <Field label="ชนิด">
              <FormListbox
                value={selected.kind}
                onChange={(v) => patchObject(selected.id, { kind: v as LayoutObjectKind, w: undefined, d: undefined, h: undefined })}
                options={OBJECT_KINDS}
              />
            </Field>
            <Field label={`หันหน้า ${selected.rotation}° (0° = หาเวที)`}>
              <input type="range" min={0} max={359} value={selected.rotation} onChange={(e) => patchObject(selected.id, { rotation: Number(e.target.value) })} className="w-full accent-[var(--brand)]" />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Num label="X (ม.)" value={selected.x} step={0.5} onChange={(v) => patchObject(selected.id, { x: v })} />
              <Num label="Z (ม.)" value={selected.z} step={0.5} onChange={(v) => patchObject(selected.id, { z: v })} />
              <Num label="ระดับพื้น" value={selected.y} step={0.1} onChange={(v) => patchObject(selected.id, { y: Math.max(0, v) })} />
            </div>
            {isCam ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <Num label="สูงเลนส์" value={dims.mountHeight} step={0.1} onChange={(v) => patchObject(selected.id, { mountHeight: Math.max(0.2, v) })} />
                  <Num label="FOV °" value={dims.fov} step={1} onChange={(v) => patchObject(selected.id, { fov: Math.min(120, Math.max(1, v)) })} />
                  <Num label="ระยะ (ม.)" value={dims.range} step={5} onChange={(v) => patchObject(selected.id, { range: Math.max(1, v) })} />
                </div>
                <Field label={`ก้ม/เงย ${selected.tilt ?? 0}° (มีผลในมุมมองจากกล้อง)`}>
                  <input type="range" min={-30} max={45} value={selected.tilt ?? 0} onChange={(e) => patchObject(selected.id, { tilt: Number(e.target.value) })} className="w-full accent-[var(--brand)]" />
                </Field>
                <button
                  onClick={() => setPovId(povId === selected.id ? null : selected.id)}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
                >
                  <EyeIcon className="w-4 h-4" /> {povId === selected.id ? 'ออกจากมุมกล้อง' : 'มองจากกล้องตัวนี้'}
                </button>
              </>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <Num label="กว้าง" value={dims.w} step={0.1} onChange={(v) => patchObject(selected.id, { w: Math.max(0.1, v) })} />
                <Num label="ลึก" value={dims.d} step={0.1} onChange={(v) => patchObject(selected.id, { d: Math.max(0.1, v) })} />
                <Num label="สูง" value={dims.h} step={0.1} onChange={(v) => changeHeight(selected, Math.max(0.1, v))} />
              </div>
            )}
            <Field label="หมายเหตุ (เลนส์, ผู้ควบคุม, ฯลฯ)">
              <textarea className={inputCls} rows={2} value={selected.note ?? ''} onChange={(e) => patchObject(selected.id, { note: e.target.value })} />
            </Field>
            <div className="flex gap-2">
              <button onClick={duplicateSelected} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors">
                <DocumentDuplicateIcon className="w-4 h-4" /> สำเนา
              </button>
              <button onClick={removeSelected} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm text-red-600 hover:bg-red-50 transition-colors">
                <TrashIcon className="w-4 h-4" /> ลบ
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              {([['objects', 'วางอุปกรณ์'], ['venue', 'สถานที่']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setPanel(key)} className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${panel === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                  {label}
                </button>
              ))}
            </div>

            {panel === 'objects' ? (
              <>
                <div className="grid grid-cols-2 gap-1.5">
                  {OBJECT_KINDS.map((k) => (
                    <button
                      key={k.value}
                      onClick={() => addObject(k.value, nextLabel(k.value))}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 text-left"
                    >
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: k.color }} />
                      <span className="truncate">{k.label}</span>
                    </button>
                  ))}
                </div>
                {onRequestAdd && (
                  <button onClick={onRequestAdd} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-brand-soft text-sm font-medium text-brand hover:bg-brand-tint transition-colors">
                    <PlusIcon className="w-4 h-4" /> เลือกอุปกรณ์เพิ่ม (บริษัท / ของเช่า)
                  </button>
                )}
                {planItems.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1.5">จากรายการอุปกรณ์ของแผน</p>
                    <ul className="space-y-0.5">
                      {planItems.map((item) => {
                        const placed = layout.objects.filter((o) => o.planItemId === item.id).length
                        return (
                          <li key={item.id}>
                            <button
                              onClick={() => addObject(kindForCategory(item.category), item.quantity > 1 ? `${item.name} #${placed + 1}` : item.name, item.id)}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left hover:bg-gray-50"
                            >
                              <span className="flex-1 min-w-0 text-sm text-gray-800 truncate">
                                {item.name || '—'}
                                {isRentalItem(item) && <span className={`ml-1.5 px-1 py-0.5 rounded text-[10px] font-medium ${itemOrigin(item) === 'partner' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>{ORIGIN_LABEL[itemOrigin(item)]}</span>}
                              </span>
                              {placed > 0
                                ? <span className="text-[11px] text-green-600 font-medium shrink-0">วางแล้ว {placed}</span>
                                : <PlusIcon className="w-4 h-4 text-gray-400 shrink-0" />}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <Field label="เริ่มจากสถานที่">
                  <FormListbox
                    value={venue.presetId ?? ''}
                    onChange={applyPreset}
                    options={[{ value: '', label: 'กำหนดเอง' }, ...VENUE_PRESETS.map((p) => ({ value: p.presetId, label: p.name }))]}
                  />
                </Field>
                <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-2">
                  ขนาดของ preset เป็นค่า<b>โดยประมาณ</b> ไม่ใช่แบบจริงของสถานที่ — ตรวจกับ floor plan ที่ได้จากสถานที่ แล้วแก้ตัวเลขด้านล่าง
                </p>
                <Field label="ชื่อสถานที่">
                  <input className={inputCls} value={venue.name} onChange={(e) => patchVenue({ name: e.target.value, presetId: '' })} />
                </Field>
                <div className="grid grid-cols-3 gap-2">
                  <Num label="กว้าง (ม.)" value={venue.width} step={1} onChange={(v) => patchVenue({ width: Math.max(5, v), presetId: '' })} />
                  <Num label="ลึก (ม.)" value={venue.depth} step={1} onChange={(v) => patchVenue({ depth: Math.max(5, v), presetId: '' })} />
                  <Num label="สูง (ม.)" value={venue.height} step={1} onChange={(v) => patchVenue({ height: Math.max(2, v), presetId: '' })} />
                </div>

                <FormCheckbox size="sm" checked={venue.stage.enabled} onChange={(v) => patchVenue({ stage: { ...venue.stage, enabled: v } })} label="มีเวที" />
                {venue.stage.enabled && (
                  <div className="grid grid-cols-2 gap-2">
                    <Num label="เวทีกว้าง" value={venue.stage.width} step={1} onChange={(v) => patchVenue({ stage: { ...venue.stage, width: Math.max(1, v) } })} />
                    <Num label="เวทีลึก" value={venue.stage.depth} step={1} onChange={(v) => patchVenue({ stage: { ...venue.stage, depth: Math.max(1, v) } })} />
                    <Num label="เวทีสูง" value={venue.stage.height} step={0.1} onChange={(v) => patchVenue({ stage: { ...venue.stage, height: Math.max(0.1, v) } })} />
                    <Num label="ห่างผนังหลัง" value={venue.stage.offset} step={1} onChange={(v) => patchVenue({ stage: { ...venue.stage, offset: Math.max(0, v) } })} />
                  </div>
                )}

                <FormCheckbox
                  size="sm"
                  checked={!!venue.pitch}
                  onChange={(v) => patchVenue({ pitch: v ? venue.pitch ?? { width: 68, depth: 105 } : undefined, presetId: '' })}
                  label="มีสนามกีฬากลาง (พื้นหญ้า)"
                />
                {venue.pitch && (
                  <div className="grid grid-cols-2 gap-2">
                    <Num label="สนามกว้าง" value={venue.pitch.width} step={1} onChange={(v) => patchVenue({ pitch: { ...venue.pitch!, width: Math.max(1, v) } })} />
                    <Num label="สนามยาว" value={venue.pitch.depth} step={1} onChange={(v) => patchVenue({ pitch: { ...venue.pitch!, depth: Math.max(1, v) } })} />
                  </div>
                )}

                <FormCheckbox
                  size="sm"
                  checked={venue.shape === 'arena'}
                  onChange={(v) => patchVenue({ shape: v ? 'arena' : 'hall', tiers: v ? venue.tiers ?? { steps: 10, rise: 0.85, run: 1.6, back: true, sides: true } : venue.tiers, presetId: '' })}
                  label="มีอัฒจันทร์ (Arena)"
                />
                {venue.shape === 'arena' && venue.tiers && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <Num label="จำนวนขั้น" value={venue.tiers.steps} step={1} onChange={(v) => patchVenue({ tiers: { ...venue.tiers!, steps: Math.min(40, Math.max(1, Math.round(v))) } })} />
                      <Num label="ขั้นสูง" value={venue.tiers.rise} step={0.05} onChange={(v) => patchVenue({ tiers: { ...venue.tiers!, rise: Math.max(0.1, v) } })} />
                      <Num label="ขั้นลึก" value={venue.tiers.run} step={0.1} onChange={(v) => patchVenue({ tiers: { ...venue.tiers!, run: Math.max(0.3, v) } })} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 items-end">
                      {/* ผนังตรงใต้แถวแรก (นั่งไม่ได้) — อัฒจันทร์เริ่มสูงจากพื้น เช่น Impact Arena ~3 ขั้น */}
                      <Num label="ผนังล่าง (ขั้น)" value={venue.tiers.wallSteps ?? 0} step={1} onChange={(v) => patchVenue({ tiers: { ...venue.tiers!, wallSteps: Math.min(10, Math.max(0, Math.round(v))) } })} />
                      <p className="col-span-2 text-[11px] text-gray-400 pb-1.5">ขอบตรงลงพื้น สูง {((venue.tiers.wallSteps ?? 0) * venue.tiers.rise).toFixed(1)} ม. ก่อนถึงแถวแรก</p>
                      {!venue.tiers.curved && venue.tiers.sides && (venue.tiers.back || venue.tiers.front) && (
                        <>
                          <Num label="มุมโค้ง รัศมี (ม.)" value={venue.tiers.cornerRadius ?? 0} step={1} onChange={(v) => patchVenue({ tiers: { ...venue.tiers!, cornerRadius: Math.max(0, v) } })} />
                          <p className="col-span-2 text-[11px] text-gray-400 pb-1.5">0 = มุมเหลี่ยม</p>
                        </>
                      )}
                    </div>
                    <FormCheckbox
                      size="sm"
                      checked={!!venue.tiers.curved}
                      onChange={(v) => patchVenue({ tiers: { ...venue.tiers!, curved: v }, presetId: '' })}
                      label="ชามโค้งวงรี ล้อมรอบทุกด้าน"
                      description="กว้าง/ลึกของสถานที่ = แกนของพื้นวงรี"
                    />
                    {!venue.tiers.curved && (
                      <>
                        <div className="flex gap-4 flex-wrap">
                          <FormCheckbox size="sm" checked={venue.tiers.sides} onChange={(v) => patchVenue({ tiers: { ...venue.tiers!, sides: v } })} label="ด้านข้าง" />
                          <FormCheckbox size="sm" checked={venue.tiers.back} onChange={(v) => patchVenue({ tiers: { ...venue.tiers!, back: v } })} label="ด้านหลัง" />
                          <FormCheckbox size="sm" checked={!!venue.tiers.front} onChange={(v) => patchVenue({ tiers: { ...venue.tiers!, front: v } })} label="ด้านหน้า" />
                        </div>
                        <FormCheckbox
                          size="sm"
                          checked={!!venue.tiers.aisleWidth}
                          onChange={(v) => patchVenue({ tiers: { ...venue.tiers!, aisleWidth: v ? 1.4 : 0, sectionWidth: venue.tiers!.sectionWidth ?? 10 } })}
                          label="แบ่งทางเดินขึ้นอัฒจันทร์"
                        />
                        {!!venue.tiers.aisleWidth && (
                          <div className="grid grid-cols-3 gap-2">
                            <Num label="บล็อกที่นั่งกว้าง" value={venue.tiers.sectionWidth ?? 10} step={0.5} onChange={(v) => patchVenue({ tiers: { ...venue.tiers!, sectionWidth: Math.max(2, v) } })} />
                            <Num label="ทางเดินกว้าง" value={venue.tiers.aisleWidth} step={0.1} onChange={(v) => patchVenue({ tiers: { ...venue.tiers!, aisleWidth: Math.max(0.5, v) } })} />
                            <Num label="ทางขวางที่ขั้น" value={venue.tiers.crossAisle ?? 0} step={1} onChange={(v) => patchVenue({ tiers: { ...venue.tiers!, crossAisle: Math.min(venue.tiers!.steps, Math.max(0, Math.round(v))) } })} />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div className="border-t border-gray-100 pt-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-500">รูป floor plan จริง (ปูบนพื้น)</p>
                  <label className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-gray-300 text-sm text-gray-600 hover:border-brand hover:text-brand cursor-pointer transition-colors">
                    <ArrowUpTrayIcon className="w-4 h-4" /> {uploading ? 'กำลังอัปโหลด...' : venue.floorImageId ? 'เปลี่ยนรูป' : 'อัปโหลดรูป (JPG/PNG)'}
                    <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }} />
                  </label>
                  {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
                  {venue.floorImageId && (
                    <>
                      <div className="grid grid-cols-3 gap-2">
                        <Num label="กว้างจริง (ม.)" value={venue.floorImageWidth ?? venue.width} step={1} onChange={(v) => patchVenue({ floorImageWidth: Math.max(1, v) })} />
                        <Num label="เลื่อน X" value={venue.floorImageOffsetX ?? 0} step={0.5} onChange={(v) => patchVenue({ floorImageOffsetX: v })} />
                        <Num label="เลื่อน Z" value={venue.floorImageOffsetZ ?? 0} step={0.5} onChange={(v) => patchVenue({ floorImageOffsetZ: v })} />
                      </div>
                      <p className="text-[11px] text-gray-400">ใส่ความกว้างจริงของพื้นที่ที่รูปครอบคลุม เพื่อให้สเกลตรง (เทียบกับ grid 5 ม.)</p>
                      <button onClick={removeFloorImage} className="text-xs text-red-600 hover:underline">เอารูปออก</button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 mb-1.5">{label}</p>
      {children}
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
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(n) }}
        className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
      />
    </div>
  )
}
