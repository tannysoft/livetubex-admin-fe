import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

// ท่อเรนเดอร์ของโหมดสมจริง (ผังวาง 3D) — ⚠️ ดึง three.js import แบบ dynamic เท่านั้น
//
// RenderPass (MSAA 4x, HDR half-float) → GTAO (เงาตามซอก: ใต้เก้าอี้ ขั้นอัฒจันทร์ ขาตั้งกล้อง — ตัวที่ทำให้ภาพ "ดูเป็นเกม")
// → OutputPass (tone mapping ACES + sRGB ตาม renderer.toneMapping)
// โหมดปกติไม่ผ่านท่อนี้ — renderer.render() ตรงๆ เหมือนเดิม

/**
 * GTAO วาด normal ของทุกอย่างในฉากด้วย material ทับ → ป้ายชื่อ กรวยมุมภาพ ราวกระจก ไฟล์สแกน
 * จะกลายเป็นก้อนทึบในภาพ AO (เงาดำเป็นสี่เหลี่ยมรอบป้าย) — ซ่อนของโปร่ง/ป้าย/splat ระหว่างวาด normal
 */
class SceneAOPass extends GTAOPass {
  private hidden: THREE.Object3D[] = []
  _overrideVisibility() {
    this.scene.traverse((o) => {
      if (!o.visible) return
      const mesh = o as THREE.Mesh
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
      const skip = (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite
        || o.userData.noAO || mats.some((m) => m.transparent || !m.depthTest)
      if (skip) { o.visible = false; this.hidden.push(o) }
    })
  }
  _restoreVisibility() {
    for (const o of this.hidden) o.visible = true
    this.hidden = []
  }
}

export interface RealisticPipeline {
  render: () => void
  setSize: (w: number, h: number) => void
  dispose: () => void
}

export function createRealisticPipeline(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): RealisticPipeline {
  const size = renderer.getSize(new THREE.Vector2())
  const target = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples: 4 })
  const composer = new EffectComposer(renderer, target)
  composer.addPass(new RenderPass(scene, camera))
  const ao = new SceneAOPass(scene, camera, Math.max(1, size.x), Math.max(1, size.y))
  // ผังมีหน่วยเป็นเมตร สถานที่กว้างหลายสิบ–ร้อยเมตร: รัศมี ~1 ม. ให้เงาตามซอกขั้น/ใต้อุปกรณ์ ไม่ทำทั้งสนามมืด
  ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.2, thickness: 1.5, scale: 1, samples: 16 })
  ao.blendIntensity = 0.9
  composer.addPass(ao)
  composer.addPass(new OutputPass())
  // AO + MSAA ที่ความละเอียดจอ retina เต็มๆ หนักเกิน — จำกัด 1.5 เท่า (ภาพยังคม เพราะ MSAA ช่วยขอบ)
  const setSize = (w: number, h: number) => {
    composer.setPixelRatio(Math.min(renderer.getPixelRatio(), 1.5))
    composer.setSize(w, h)
  }
  setSize(Math.max(1, size.x), Math.max(1, size.y))
  return {
    render: () => composer.render(),
    setSize,
    dispose: () => {
      ao.dispose()
      composer.dispose()
      target.dispose()
    },
  }
}
