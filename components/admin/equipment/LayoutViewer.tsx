'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { ArrowsPointingInIcon } from '@heroicons/react/24/outline'
import {
  addLights, buildObject, buildVenue, declutterLabels, disposeGroup, labelSizeFor, venueExtent,
} from '@/lib/equipment/layout-scene'
import type { PlanLayout } from '@/lib/types'

interface LayoutViewerProps {
  layout: PlanLayout
  view: 'top' | 'perspective'
  lensLines: boolean
  className?: string
}

/**
 * ผังวาง 3D แบบดูอย่างเดียว (หน้าแชร์ทีมงาน) — วาดสดด้วย WebGL จึงซูมแล้วคม ไม่แตกเหมือนซูมรูป
 * มุมบน: ลาก = เลื่อน · มุมเอียง: ลาก = หมุน, 2 นิ้ว/คลิกขวา = เลื่อน · บีบ/ล้อเมาส์ = ซูม
 * ⚠️ ดึง three.js ทั้งก้อน — โหลดผ่าน next/dynamic ssr:false เท่านั้น
 */
export default function LayoutViewer({ layout, view, lensLines, className = '' }: LayoutViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const fitRef = useRef<() => void>(() => {})
  // เครื่องเก่า/ปิด hardware acceleration → ไม่มี WebGL (component นี้ ssr:false จึงมี document เสมอ)
  const [webgl] = useState(() => {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false }
  })

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || !webgl) return
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.touchAction = 'none'
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xffffff)
    addLights(scene)
    scene.add(buildVenue(layout.venue))
    const size = labelSizeFor(layout.venue)
    layout.objects.forEach((o) => scene.add(buildObject(o, size, false, lensLines)))

    const camera = new THREE.PerspectiveCamera(45, 1, 0.3, 5000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.maxPolarAngle = Math.PI / 2 - 0.02
    controls.screenSpacePanning = true
    const e = venueExtent(layout.venue)
    const cx = (e.minX + e.maxX) / 2
    const cz = (e.minZ + e.maxZ) / 2
    const span = Math.max(e.maxX - e.minX, e.maxZ - e.minZ)
    controls.minDistance = 2
    controls.maxDistance = span * 3
    if (view === 'top') {
      // มุมบน: ไม่หมุน — นิ้วเดียว/คลิกซ้ายเลื่อนแผนที่แทน
      controls.enableRotate = false
      controls.touches.ONE = THREE.TOUCH.PAN
      controls.mouseButtons.LEFT = THREE.MOUSE.PAN
    }

    let frame = 0
    const render = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        scene.updateMatrixWorld()
        declutterLabels(scene, camera, renderer.domElement.clientWidth, renderer.domElement.clientHeight)
        renderer.render(scene, camera)
      })
    }
    controls.addEventListener('change', render)

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
      controls.dispose()
      disposeGroup(scene)
      renderer.dispose()
      renderer.forceContextLoss()
      mount.removeChild(renderer.domElement)
    }
  }, [layout, view, lensLines, webgl])

  if (!webgl) {
    return <p className={`flex items-center justify-center text-center text-sm text-gray-400 ${className}`}>เครื่องนี้แสดงผังวางไม่ได้ (ต้องรองรับ WebGL)</p>
  }
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div ref={mountRef} className="absolute inset-0" />
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
