import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'
import type { VenueModelConfig, VenueModelKind } from '../types'

// โมเดล 3D ของสถานที่จริงในผังวาง — ⚠️ ดึง three.js ทั้งก้อน import แบบ dynamic เท่านั้น (เหมือน layout-scene.ts)
//
// mesh (.glb): ทุก mesh เป็นผิววางของ (userData.ground) + BVH (three-mesh-bvh) ให้ ray ตอนลากของไม่หน่วงแม้โมเดลหลักล้านเหลี่ยม
//              cutHeight = ตัดส่วนที่สูงเกินด้วย clipping plane (ซ่อนหลังคา) และ ray ที่ชนเหนือระดับนั้นไม่นับ (userData.maxY)
// splat (สแกน): วาดด้วย Spark (@sparkjsdev/spark — โหลดเฉพาะตอนมีไฟล์สแกน) เป็นภาพอย่างเดียว ไม่เป็นผิววางของ
//
// โมเดลถูกใช้ซ้ำข้ามการสร้างฉากใหม่ → root มี userData.keep ให้ disposeGroup() ข้าม · ทิ้งจริงด้วย dispose() ของ LoadedVenueModel

const deg = (d: number) => (d * Math.PI) / 180

export interface LoadedVenueModel {
  kind: VenueModelKind
  /** ตัวที่จัดตำแหน่ง/หมุน/สเกลตามค่าที่ตั้ง — ใส่ลง scene ตัวนี้ */
  root: THREE.Group
  /** เนื้อโมเดลดิบ (พิกัดของไฟล์) */
  content: THREE.Object3D
  dispose: () => void
}

/** ทาง draco decoder (wasm) — คัดลอกจาก three/examples/jsm/libs/draco/gltf ไว้ใน public/draco/ ⚠️ อัปเกรด three แล้วคัดลอกใหม่ */
const DRACO_PATH = '/draco/'

function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.geometry) {
      if ((mesh.geometry as THREE.BufferGeometry & { boundsTree?: unknown }).boundsTree) disposeBoundsTree.call(mesh.geometry)
      mesh.geometry.dispose()
    }
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const m of mats) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose()
      m.dispose()
    }
  })
}

async function loadMesh(buf: ArrayBuffer): Promise<THREE.Object3D> {
  const loader = new GLTFLoader()
  const draco = new DRACOLoader().setDecoderPath(DRACO_PATH)
  loader.setDRACOLoader(draco)
  loader.setMeshoptDecoder(MeshoptDecoder)
  try {
    const gltf = await loader.parseAsync(buf, '')
    const scene = gltf.scene
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.userData.ground = true
      // BVH ใช้ได้กับ Mesh ธรรมดา — Instanced/Skinned ใช้ raycast ปกติ
      if (!(mesh as THREE.InstancedMesh).isInstancedMesh && !(mesh as THREE.SkinnedMesh).isSkinnedMesh) {
        computeBoundsTree.call(mesh.geometry)
        mesh.raycast = acceleratedRaycast
      }
    })
    return scene
  } finally {
    draco.dispose()
  }
}

async function loadSplat(buf: ArrayBuffer, fileName: string): Promise<THREE.Object3D> {
  const { SplatMesh } = await import('@sparkjsdev/spark')
  const splat = new SplatMesh({ fileBytes: new Uint8Array(buf), fileName, raycastable: false })
  await splat.initialized
  splat.raycast = () => {}
  splat.userData.noAO = true // AO วาด normal ทับด้วย material ธรรมดา → splat กลายเป็นก้อนทึบ
  return splat
}

export async function loadVenueModel(buf: ArrayBuffer, kind: VenueModelKind, fileName: string): Promise<LoadedVenueModel> {
  const content = kind === 'mesh' ? await loadMesh(buf) : await loadSplat(buf, fileName)
  const root = new THREE.Group()
  root.userData.keep = true
  root.userData.venueModel = kind
  root.add(content)
  return {
    kind, root, content,
    dispose: () => {
      root.removeFromParent()
      if (kind === 'splat') (content as THREE.Object3D & { dispose?: () => void }).dispose?.()
      else disposeObject(content)
    },
  }
}

/**
 * Spark ต้องมี SparkRenderer อยู่ใน scene — สร้างครั้งเดียวต่อ scene
 * onDirty = Spark เรียงลำดับ splat ใน worker เสร็จ → ต้องวาดใหม่ (ฉากเราวาดเฉพาะตอนมีการเปลี่ยน ไม่ได้วาดทุกเฟรม)
 */
export async function ensureSpark(scene: THREE.Scene, renderer: THREE.WebGLRenderer, onDirty: () => void): Promise<void> {
  if (scene.userData.spark) return
  const { SparkRenderer } = await import('@sparkjsdev/spark')
  if (scene.userData.spark) return
  const spark = new SparkRenderer({ renderer, onDirty })
  spark.userData.keep = true
  spark.userData.noAO = true
  scene.userData.spark = spark
  scene.add(spark)
}

export function disposeSpark(scene: THREE.Scene): void {
  const spark = scene.userData.spark as (THREE.Object3D & { dispose?: () => void }) | undefined
  if (!spark) return
  spark.removeFromParent()
  spark.dispose?.()
  delete scene.userData.spark
}

/** จัดตำแหน่ง/หมุน/สเกล + ระดับตัดหลังคา ตามค่าที่ตั้ง — เรียกซ้ำได้ (ไม่โหลดใหม่) */
export function applyModelTransform(model: LoadedVenueModel, cfg: VenueModelConfig): void {
  const { root } = model
  root.position.set(cfg.x || 0, cfg.y || 0, cfg.z || 0)
  // ลำดับ YXZ: เอียง/พลิกในพิกัดโมเดลก่อน แล้วค่อยหมุนรอบแกนตั้ง · องศาเพิ่ม = ตามเข็ม (เหมือน LayoutObject)
  root.rotation.set(deg(cfg.tiltX ?? 0) + (cfg.flip ? Math.PI : 0), -deg(cfg.rotation || 0), deg(cfg.tiltZ ?? 0), 'YXZ')
  root.scale.setScalar(cfg.scale > 0 ? cfg.scale : 1)
  root.updateMatrixWorld(true)
  if (model.kind !== 'mesh') return
  const cut = cfg.cutHeight && cfg.cutHeight > 0 ? cfg.cutHeight : 0
  // plane (0,-1,0) ค่าคงที่ cut → เก็บส่วนที่ y ≤ cut (พิกัดโลก ไม่ขึ้นกับสเกลโมเดล)
  const planes = cut ? [new THREE.Plane(new THREE.Vector3(0, -1, 0), cut)] : null
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.userData.maxY = cut || undefined
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const had = !!m.clippingPlanes?.length
      m.clippingPlanes = planes
      if (had !== !!planes) m.needsUpdate = true
    }
  })
}

/** กรอบของโมเดลในพิกัดโลก (ตามค่าที่ตั้งปัจจุบัน) — สแกนนับเฉพาะจุดกลาง splat กันฝุ่นลอยไกลทำกรอบบวม */
export function modelBox(model: LoadedVenueModel): THREE.Box3 {
  model.root.updateMatrixWorld(true)
  if (model.kind === 'splat') {
    const splat = model.content as THREE.Object3D & { getBoundingBox: (centersOnly?: boolean) => THREE.Box3 }
    return splat.getBoundingBox(true).clone().applyMatrix4(splat.matrixWorld)
  }
  return new THREE.Box3().setFromObject(model.root)
}

/** วางให้พอดี: กลางโมเดลอยู่กลางผัง (x/z = 0) และจุดต่ำสุดแตะพื้น (y = 0) — ไม่เปลี่ยนสเกล/การหมุน */
export function fitModelToFloor(model: LoadedVenueModel, cfg: VenueModelConfig): Pick<VenueModelConfig, 'x' | 'y' | 'z'> {
  applyModelTransform(model, { ...cfg, x: 0, y: 0, z: 0 })
  const box = modelBox(model)
  const c = box.getCenter(new THREE.Vector3())
  const r = (n: number) => Math.round(n * 100) / 100
  const out = { x: r(-c.x), y: r(-box.min.y), z: r(-c.z) }
  applyModelTransform(model, { ...cfg, ...out })
  return out
}

/** สเกลที่ทำให้ด้านที่ยาวกว่าบนพื้น (x/z) ยาวเท่า meters */
export function scaleForSize(model: LoadedVenueModel, cfg: VenueModelConfig, meters: number): number {
  const size = modelBox(model).getSize(new THREE.Vector3())
  const now = Math.max(size.x, size.z)
  if (!(now > 0) || !(meters > 0)) return cfg.scale
  return Math.round(((cfg.scale || 1) * meters / now) * 10000) / 10000
}

/** ผิววางของในโมเดล (mesh เท่านั้น) */
export function modelGrounds(model: LoadedVenueModel | null): THREE.Object3D[] {
  if (!model || model.kind !== 'mesh') return []
  const out: THREE.Object3D[] = []
  model.root.traverse((o) => { if (o.userData.ground) out.push(o) })
  return out
}

/** เงาของโมเดล (โหมดสมจริง) */
export function setModelShadows(model: LoadedVenueModel, on: boolean): void {
  if (model.kind !== 'mesh') return
  model.root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = on
    mesh.receiveShadow = on
  })
}
