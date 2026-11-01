'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { ArrowsPointingInIcon } from '@heroicons/react/24/outline'
import {
  applyAtmosphere, buildCables, buildObject, buildVenue, cableRuns, declutterLabels, disposeGroup, groundsOf, labelSizeFor, venueExtent, focusAt, tuneOrbit,
  setRoofVisible, realisticObject, venueShell,
} from '@/lib/equipment/layout-scene'
import {
  applyModelTransform, disposeSpark, ensureSpark, loadVenueModel, modelBox, modelGrounds, setModelShadows, type LoadedVenueModel,
} from '@/lib/equipment/venue-model-scene'
import { createRealisticPipeline } from '@/lib/equipment/realistic-render'
import type { PlanLayout } from '@/lib/types'

interface LayoutViewerProps {
  layout: PlanLayout
  view: 'top' | 'perspective'
  lensLines: boolean
  /** ตัวคูณขนาดป้าย (S/M/L) */
  labelScale?: number
  /** โหมดสมจริง (เก้าอี้ หลังคา ฟ้า เงา) */
  realistic?: boolean
  /** โหลดไฟล์โมเดลสถานที่ (หน้าแชร์อ่านผ่าน function) — ไม่ส่ง = ไม่โหลดโมเดล ใช้สถานที่จากตัวเลข */
  loadModel?: (assetId: string, onProgress: (p: number) => void) => Promise<ArrayBuffer>
  className?: string
}

/**
 * ผังวาง 3D แบบดูอย่างเดียว (หน้าแชร์ทีมงาน) — วาดสดด้วย WebGL จึงซูมแล้วคม ไม่แตกเหมือนซูมรูป
 * มุมบน: ลาก = เลื่อน · มุมเอียง: ลาก = หมุน, 2 นิ้ว/คลิกขวา = เลื่อน · บีบ/ล้อเมาส์ = ซูม
 * ⚠️ ดึง three.js ทั้งก้อน — โหลดผ่าน next/dynamic ssr:false เท่านั้น
 */
export default function LayoutViewer({ layout, view, lensLines, labelScale = 1, realistic = false, loadModel, className = '' }: LayoutViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const fitRef = useRef<() => void>(() => {})
  // เครื่องเก่า/ปิด hardware acceleration → ไม่มี WebGL (component นี้ ssr:false จึงมี document เสมอ)
  const [webgl] = useState(() => {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false }
  })

  // โมเดลสถานที่: โหลดครั้งเดียวต่อไฟล์ ใช้ซ้ำข้ามการสร้างฉากใหม่ (เปลี่ยนมุม/ขนาดป้าย)
  const cfg = layout.venue.model
  const assetId = loadModel && webgl ? cfg?.assetId : undefined
  const [loaded, setLoaded] = useState<{ assetId: string; model: LoadedVenueModel } | null>(null)
  const [progress, setProgress] = useState<{ assetId: string; p: number } | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  useEffect(() => {
    if (!assetId || !loadModel || !cfg) return
    let alive = true
    let result: LoadedVenueModel | null = null
    ;(async () => {
      const buf = await loadModel(assetId, (p) => { if (alive) setProgress({ assetId, p }) })
      if (!alive) return
      result = await loadVenueModel(buf, cfg.kind, cfg.fileName)
      if (!alive) { result.dispose(); return }
      setLoaded({ assetId, model: result })
    })().catch((e) => { console.error(e); if (alive) setFailed(assetId) })
    return () => { alive = false; result?.dispose() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId])
  const model = loaded && loaded.assetId === assetId ? loaded.model : null
  const modelLoading = !!assetId && !model && failed !== assetId

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || !webgl) return
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.localClippingEnabled = true
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.touchAction = 'none'
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const venue = buildVenue(layout.venue, { realistic, shell: venueShell(layout.venue, model?.kind ?? null) })
    setRoofVisible(venue, view !== 'top')
    scene.add(venue)
    if (model && cfg) {
      applyModelTransform(model, cfg)
      setModelShadows(model, realistic)
      scene.add(model.root)
    }
    const size = labelSizeFor(layout.venue, labelScale)
    layout.objects.forEach((o) => {
      const obj = buildObject(o, size, false, lensLines)
      if (realistic) realisticObject(obj)
      scene.add(obj)
    })
    venue.updateMatrixWorld(true)
    scene.add(buildCables(cableRuns(layout, [...groundsOf(venue), ...modelGrounds(model)]), size))

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.maxPolarAngle = Math.PI / 2 - 0.02
    tuneOrbit(controls)
    let e = venueExtent(layout.venue)
    if (model) {
      const b = modelBox(model)
      if (!b.isEmpty()) e = { minX: Math.min(e.minX, b.min.x), maxX: Math.max(e.maxX, b.max.x), minZ: Math.min(e.minZ, b.min.z), maxZ: Math.max(e.maxZ, b.max.z), topY: e.topY }
    }
    // มือถือ: เงาความละเอียดต่ำลง (หน่วยความจำการ์ดจอน้อย)
    applyAtmosphere(scene, renderer, { realistic, background: 0xffffff, box: e, shadowSize: window.innerWidth < 768 ? 2048 : 4096 })
    const cx = (e.minX + e.maxX) / 2
    const cz = (e.minZ + e.maxZ) / 2
    const span = Math.max(e.maxX - e.minX, e.maxZ - e.minZ)
    controls.maxDistance = span * 3
    if (view === 'top') {
      // มุมบน: ไม่หมุน — นิ้วเดียว/คลิกซ้ายเลื่อนแผนที่แทน
      controls.enableRotate = false
      controls.touches.ONE = THREE.TOUCH.PAN
      controls.mouseButtons.LEFT = THREE.MOUSE.PAN
    }

    // โหมดสมจริง = ท่อ AO + tone mapping
    const pipeline = realistic ? createRealisticPipeline(renderer, scene, camera) : null
    let frame = 0
    const render = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        scene.updateMatrixWorld()
        declutterLabels(scene, camera, renderer.domElement.clientWidth, renderer.domElement.clientHeight)
        if (pipeline) pipeline.render()
        else renderer.render(scene, camera)
      })
    }
    controls.addEventListener('change', render)
    // ไฟล์สแกน: Spark เรียงลำดับ splat ใน worker เสร็จแล้วขอวาดใหม่
    if (model?.kind === 'splat') void ensureSpark(scene, renderer, render).then(render)

    // ดับเบิลคลิก/แตะ 2 ครั้งที่พื้น → ซูมไปจุดนั้น
    const raycaster = new THREE.Raycaster()
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const onDbl = (ev: MouseEvent) => {
      const r = renderer.domElement.getBoundingClientRect()
      raycaster.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camera)
      const hit = raycaster.intersectObject(venue, true)[0]
      const p = hit ? hit.point : raycaster.ray.intersectPlane(floorPlane, new THREE.Vector3())
      if (p) { focusAt(camera, controls, p); render() }
    }
    renderer.domElement.addEventListener('dblclick', onDbl)

    const fit = () => {
      controls.target.set(cx, 0, cz)
      if (view === 'top') camera.position.set(cx, span * 1.25, cz + 0.01)
      else camera.position.set(cx + span * 0.5, span * 0.55, e.maxZ + span * 0.4)
      controls.update()
      render()
    }
    fitRef.current = fit

    const resize = () => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      renderer.setSize(w, h)
      pipeline?.setSize(w, h)
      camera.aspect = w / Math.max(h, 1)
      camera.updateProjectionMatrix()
      render()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()
    fit()

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      renderer.domElement.removeEventListener('dblclick', onDbl)
      controls.dispose()
      model?.root.removeFromParent()
      disposeSpark(scene)
      disposeGroup(scene)
      pipeline?.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      mount.removeChild(renderer.domElement)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, view, lensLines, labelScale, webgl, realistic, model])

  if (!webgl) {
    return <p className={`flex items-center justify-center text-center text-sm text-gray-400 ${className}`}>เครื่องนี้แสดงผังวางไม่ได้ (ต้องรองรับ WebGL)</p>
  }
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div ref={mountRef} className="absolute inset-0" />
      {modelLoading && (
        <p className="absolute left-2 top-2 text-[11px] text-gray-600 bg-white/90 rounded-lg px-2.5 py-1.5 shadow-sm">
          กำลังโหลดโมเดลสถานที่ {Math.round((progress?.assetId === assetId ? progress.p : 0) * 100)}%
        </p>
      )}
      <button
        type="button"
        onClick={() => fitRef.current()}
        aria-label="พอดีจอ"
        className="absolute right-2 bottom-2 w-10 h-10 flex items-center justify-center rounded-full bg-white/95 border border-gray-200 shadow-sm text-gray-700 active:bg-gray-100"
      >
        <ArrowsPointingInIcon className="w-5 h-5" />
      </button>
    </div>
  )
}
