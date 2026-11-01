import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import type { LayoutCable, LayoutObject, PlanLayout, VenueConfig, VenueModelKind } from '../types'
import { KIND_DEFAULTS, isCameraKind, kindMeta } from './venues'
import { signalMeta } from './constants'

// ฉาก 3D ของผังวางอุปกรณ์ — ใช้ร่วมกันทั้งตัวแก้ไข (LayoutEditor) และ snapshot ตอนพิมพ์
// ⚠️ ไฟล์นี้ดึง three.js ทั้งก้อน — import แบบ dynamic เท่านั้น (next/dynamic หรือ await import)
//
// พิกัด: เมตร, x = ซ้าย-ขวา, z = ลึก (เวทีอยู่ฝั่ง -z), y = สูง, จุด (0,0,0) = กลางพื้นที่ราบ

const deg = (d: number) => (d * Math.PI) / 180

export function venueExtent(v: VenueConfig) {
  const tiers = v.shape === 'arena' ? v.tiers : undefined
  const t = tiers ? tiers.steps * tiers.run : 0
  const all = !!tiers?.curved
  const side = all || tiers?.sides ? t : 0
  const back = all || tiers?.back ? t : 0
  const front = all || tiers?.front ? t : 0
  return {
    minX: -v.width / 2 - side, maxX: v.width / 2 + side,
    minZ: -v.depth / 2 - front, maxZ: v.depth / 2 + back,
    topY: Math.max(v.height, 1),
  }
}

/** scale = ตัวคูณที่ผู้ใช้เลือก (S/M/L ใน lens-lines.ts) */
export function labelSizeFor(v: VenueConfig, scale = 1): number {
  // ป้ายเล็กลง ~30% จากเดิม (/40, 1.2–5) — ของวางชิดกันแล้วป้ายทับกันจนอ่านไม่ออก
  return Math.min(3.5, Math.max(0.8, Math.max(v.width, v.depth) / 56)) * scale
}

// ── labels ─────────────────────────────────────────────────────────────────
const labelCache = new Map<string, THREE.CanvasTexture>()
/** วาดป้ายละเอียดกว่าที่เห็นปกติ 3 เท่า — ซูมเข้าใกล้แล้วตัวหนังสือยังคม (สัดส่วนป้ายไม่เปลี่ยน) */
const LABEL_RES = 3
/** กรองภาพเอียง — ป้าย/ตารางพื้นที่มองเฉียงไม่เบลอ (renderer ตัดเหลือเท่าที่การ์ดจอรองรับเอง) */
const ANISOTROPY = 8

function labelTexture(text: string, color: string): { tex: THREE.CanvasTexture; aspect: number } {
  const key = `${color}|${text}`
  let tex = labelCache.get(key)
  if (!tex) {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const k = LABEL_RES
    const font = `600 ${44 * k}px "Noto Sans Thai", system-ui, sans-serif`
    ctx.font = font
    const w = Math.ceil(ctx.measureText(text).width) + 36 * k
    canvas.width = w
    canvas.height = 68 * k
    ctx.font = font
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.roundRect(0, 0, w, 68 * k, 14 * k)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 18 * k, 36 * k)
    tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = ANISOTROPY
    labelCache.set(key, tex)
  }
  const img = tex.image as HTMLCanvasElement
  return { tex, aspect: img.width / img.height }
}

function makeLabel(text: string, color: string, height: number): THREE.Sprite {
  const { tex, aspect } = labelTexture(text || '—', color)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }))
  sprite.scale.set(height * aspect, height, 1)
  sprite.renderOrder = 10
  sprite.raycast = () => {}
  return sprite
}

/** ป้ายที่ declutterLabels จัดตำแหน่งให้ — fixed = ไม่ขยับ (เป็นสิ่งกีดขวางให้ป้ายอื่นหลบ) */
function markLabel(sprite: THREE.Sprite, fixed: boolean) {
  sprite.userData.isLabel = true
  sprite.userData.fixed = fixed
  sprite.userData.base = sprite.position.clone()
}

interface LabelBox { x0: number; y0: number; x1: number; y1: number }
const overlaps = (a: LabelBox, b: LabelBox) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

/**
 * กันป้ายชื่อทับกัน — เรียกก่อน render ทุกครั้ง (มุมกล้องเปลี่ยน = ตำแหน่งบนจอเปลี่ยน)
 * วัดกรอบป้ายเป็นพิกเซลบนจอ ไล่วางทีละป้าย ทับของที่วางแล้ว → ลองขยับขึ้น/ข้าง/ลง จนเจอที่ว่าง
 * แล้วแปลงระยะพิกเซลกลับเป็นพิกัดโลก (ตามแกนขวา/บนของกล้อง) + โชว์เส้นโยงไปหาวัตถุ
 */
export function declutterLabels(root: THREE.Object3D, camera: THREE.Camera, width: number, height: number): void {
  if (width <= 0 || height <= 0) return
  const labels: THREE.Sprite[] = []
  root.traverse((o) => { if (o.userData.isLabel && o.visible) labels.push(o as THREE.Sprite) })
  if (labels.length === 0) return
  camera.updateMatrixWorld()
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize()
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize()
  const toPx = (p: THREE.Vector3) => {
    const v = p.clone().project(camera)
    return { x: (v.x + 1) / 2 * width, y: (1 - v.y) / 2 * height, behind: v.z > 1 || v.z < -1 }
  }

  type Item = { s: THREE.Sprite; anchor: THREE.Vector3; cx: number; cy: number; w: number; h: number; fixed: boolean }
  const items: Item[] = []
  for (const s of labels) {
    s.position.copy(s.userData.base as THREE.Vector3)
    s.updateMatrixWorld()
    const anchor = s.getWorldPosition(new THREE.Vector3())
    const c = toPx(anchor)
    const leader = s.userData.leader as THREE.Line | undefined
    if (leader) leader.visible = false
    if (c.behind) continue
    const a = toPx(anchor.clone().addScaledVector(right, s.scale.x / 2).addScaledVector(up, s.scale.y / 2))
    items.push({ s, anchor, cx: c.x, cy: c.y, w: Math.abs(a.x - c.x) * 2, h: Math.abs(a.y - c.y) * 2, fixed: !!s.userData.fixed })
  }
  // ป้ายตายตัวลงก่อน แล้วไล่จากบนลงล่าง ซ้ายไปขวา — ลำดับคงที่ ป้ายไม่กระโดดไปมาตอนหมุนกล้อง
  items.sort((a, b) => Number(b.fixed) - Number(a.fixed) || a.cy - b.cy || a.cx - b.cx)

  const placed: LabelBox[] = []
  const boxAt = (it: Item, dx: number, dy: number): LabelBox => ({
    x0: it.cx + dx - it.w / 2 - 2, x1: it.cx + dx + it.w / 2 + 2, y0: it.cy + dy - it.h / 2 - 1, y1: it.cy + dy + it.h / 2 + 1,
  })
  for (const it of items) {
    let best: [number, number] = [0, 0]
    if (!it.fixed) {
      const step = it.h + 3
      const side = it.w + 6
      const cands: [number, number][] = [[0, 0]]
      for (let k = 1; k <= 8; k++) {
        cands.push([0, -k * step], [side, -(k - 1) * step], [-side, -(k - 1) * step], [0, k * step], [side, k * step], [-side, k * step])
      }
      best = cands.find(([dx, dy]) => !placed.some((b) => overlaps(b, boxAt(it, dx, dy)))) ?? [0, 0]
    }
    placed.push(boxAt(it, best[0], best[1]))
    if (best[0] === 0 && best[1] === 0) continue
    // พิกเซล → เมตร ตามขนาดป้ายเอง (perspective: ไกล = พิกเซลต่อเมตรน้อยลง)
    const perPx = it.s.scale.y / Math.max(it.h, 1e-6)
    const world = it.anchor.clone().addScaledVector(right, best[0] * perPx).addScaledVector(up, -best[1] * perPx)
    const parent = it.s.parent
    if (!parent) continue
    it.s.position.copy(parent.worldToLocal(world))
    const leader = it.s.userData.leader as THREE.Line | undefined
    if (leader) {
      leader.geometry.setFromPoints([it.s.userData.leaderFrom as THREE.Vector3, it.s.position.clone()])
      leader.visible = true
    }
  }
}

// ── venue ──────────────────────────────────────────────────────────────────
let gridTex: THREE.CanvasTexture | null = null
/** ลายตาราง 5 ม. เป็น texture บนพื้น — GridHelper เป็นสี่เหลี่ยมจึงล้นออกนอกพื้นวงรี */
function gridTexture(): THREE.CanvasTexture {
  if (gridTex) return gridTex
  const c = document.createElement('canvas')
  // 512px ต่อช่อง 5 ม. — ซูมใกล้แล้วเส้นตารางไม่แตกเป็นขั้นบันได
  const n = 512
  c.width = c.height = n
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#e5e7eb'
  ctx.fillRect(0, 0, n, n)
  ctx.strokeStyle = '#c4c9d1'
  ctx.lineWidth = 6
  ctx.strokeRect(0, 0, n, n)
  gridTex = new THREE.CanvasTexture(c)
  gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping
  gridTex.colorSpace = THREE.SRGBColorSpace
  gridTex.anisotropy = ANISOTROPY
  return gridTex
}

/** tint = สีคูณทับลายตาราง (โหมดสมจริงใช้โทนพื้นปูน — ตารางยังเห็นจางๆ ไว้กะระยะ) */
function floorMaterial(repeatX: number, repeatY: number, tint = 0xffffff): THREE.MeshLambertMaterial {
  const map = gridTexture().clone()
  map.repeat.set(repeatX, repeatY)
  map.needsUpdate = true
  return new THREE.MeshLambertMaterial({ map, color: tint })
}
function groundBox(w: number, h: number, d: number, color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }))
  mesh.userData.ground = true // ลากวัตถุมาวางบนผิวนี้ได้
  return mesh
}

/** แผ่นวงรี (มีรูวงรีตรงกลางได้) หนา h วางบนพื้น y=0..h — ใช้ทำพื้นและขั้นอัฒจันทร์แบบชามโค้ง */
function ellipseSlab(a: number, b: number, hole: [number, number] | null, h: number, color: number): THREE.Mesh {
  const shape = new THREE.Shape()
  shape.absellipse(0, 0, a, b, 0, Math.PI * 2, false, 0)
  if (hole) {
    const inner = new THREE.Path()
    inner.absellipse(0, 0, hole[0], hole[1], 0, Math.PI * 2, true, 0)
    shape.holes.push(inner)
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 48 })
  geo.rotateX(-Math.PI / 2) // shape อยู่ระนาบ xy, extrude ไป +z → พลิกให้นอนราบ ความหนาชี้ขึ้น +y
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }))
  mesh.userData.ground = true
  return mesh
}

/**
 * ขั้นอัฒจันทร์ตรงมุมโค้ง: วงแหวน 1/4 รอบจุด (cx, cz) รัศมี r0..r1 หนา h — sx/sz = ทิศของมุม (±1)
 * shape อยู่ระนาบ xy แล้วพลิกลงพื้น: shape (x, y) → world (x, −y) จึงใส่ y = −z
 */
function cornerSlab(cx: number, cz: number, sx: number, sz: number, r0: number, r1: number, h: number, color: number): THREE.Mesh {
  const mid = Math.atan2(-sz, sx)
  const a0 = mid - Math.PI / 4, a1 = mid + Math.PI / 4
  const shape = new THREE.Shape()
  shape.absarc(cx, -cz, r1, a0, a1, false)
  shape.absarc(cx, -cz, r0, a1, a0, true)
  shape.closePath()
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 16 })
  geo.rotateX(-Math.PI / 2)
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }))
  mesh.userData.ground = true
  return mesh
}

const AISLE_COLOR = 0xeee3cc // ทางเดินบนอัฒจันทร์ — สีทรายอ่อน แยกจากที่นั่งสีเทาฟ้า

/** สีของสถานที่: ปกติ = โทนแผนผัง (เทาฟ้า อ่านง่ายเวลาพิมพ์) · สมจริง = โทนปูน */
const PALETTE = {
  plan: { floorTint: 0xffffff, tierA: 0xcbd5e1, tierB: 0xb6c2d2, aisle: AISLE_COLOR, stage: 0x374151 },
  real: { floorTint: 0xd9d4cb, tierA: 0xc9c5bd, tierB: 0xbfbab1, aisle: 0xa8a29e, stage: 0x1f2937 },
}

/**
 * ช่วงทางเดินตามขอบพื้นยาว base (จัดกึ่งกลาง): แบ่งที่นั่งเป็นบล็อกกว้างใกล้ section ที่สุด คั่นด้วยทางเดินกว้าง aisle
 * คืน [เริ่ม, จบ] ของแต่ละทางเดิน (พิกัดเทียบกึ่งกลางขอบ)
 */
function aisleGaps(base: number, section: number, aisle: number): [number, number][] {
  const n = Math.max(1, Math.round((base + aisle) / (Math.max(section, 1) + aisle)))
  const s = (base - (n - 1) * aisle) / n
  const gaps: [number, number][] = []
  for (let k = 1; k < n; k++) {
    const start = -base / 2 + k * s + (k - 1) * aisle
    gaps.push([start, start + aisle])
  }
  return gaps
}

/** ตัดช่วง [a0,a1] เป็นท่อน — [เริ่ม, จบ, เป็นทางเดินไหม] (ทางเดินที่หลุดช่วงถูกตัดทิ้ง) */
function splitSpan(a0: number, a1: number, gaps: [number, number][]): [number, number, boolean][] {
  const out: [number, number, boolean][] = []
  let cur = a0
  for (const [g0, g1] of gaps) {
    const s0 = Math.max(g0, a0), s1 = Math.min(g1, a1)
    if (s1 <= s0) continue
    if (s0 > cur) out.push([cur, s0, false])
    out.push([s0, s1, true])
    cur = s1
  }
  if (a1 > cur) out.push([cur, a1, false])
  return out
}

// ── เก้าอี้บนอัฒจันทร์ (โหมดสมจริง) — InstancedMesh ก้อนเดียว วาดได้หลายหมื่นตัว ─────────────
/** x, y, z = จุดวางบนผิวขั้น · r = หมุนรอบแกนตั้ง (เก้าอี้ตั้งต้นหันไป -z) */
type Seat = { x: number; y: number; z: number; r: number }
const SEAT_GAP = 0.5   // ระยะเก้าอี้ตามแถว (ม.)
const SEAT_ROW = 0.85  // ขั้นลึกเกินนี้ = นั่งได้หลายแถวต่อขั้น
const MAX_SEATS = 90_000
const faceAngle = (dx: number, dz: number) => Math.atan2(-dx, -dz)

/** ระยะจากขอบในของขั้นถึงแต่ละแถวเก้าอี้ */
function seatRowOffsets(run: number): number[] {
  const n = Math.max(1, Math.floor(run / SEAT_ROW))
  return Array.from({ length: n }, (_, k) => (run * (k + 0.5)) / n)
}
function seatsOnLine(out: Seat[], ax: number, az: number, bx: number, bz: number, y: number, r: number) {
  const len = Math.hypot(bx - ax, bz - az)
  const n = Math.floor(len / SEAT_GAP)
  if (n < 1) return
  const pad = (len - n * SEAT_GAP) / 2 + SEAT_GAP / 2
  for (let k = 0; k < n; k++) {
    const t = (pad + k * SEAT_GAP) / len
    out.push({ x: ax + (bx - ax) * t, y, z: az + (bz - az) * t, r })
  }
}
/** โค้งรอบจุด (cx, cz) รัศมี rad จากมุม a0 → a1 (มุมในระนาบ x-z) — หันเข้าหาศูนย์กลาง */
function seatsOnArc(out: Seat[], cx: number, cz: number, rad: number, a0: number, a1: number, y: number) {
  const n = Math.floor((Math.abs(a1 - a0) * rad) / SEAT_GAP)
  for (let k = 0; k < n; k++) {
    const a = a0 + ((a1 - a0) * (k + 0.5)) / n
    const dx = Math.cos(a), dz = Math.sin(a)
    out.push({ x: cx + dx * rad, y, z: cz + dz * rad, r: faceAngle(-dx, -dz) })
  }
}
function seatsOnEllipse(out: Seat[], a: number, b: number, y: number) {
  // เส้นรอบวงโดยประมาณ (Ramanujan) — ระยะตามแนวไม่เท่ากันเป๊ะ แต่ใกล้พอสำหรับภาพ
  const per = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)))
  const n = Math.floor(per / SEAT_GAP)
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2
    const x = a * Math.cos(t), z = b * Math.sin(t)
    const nx = Math.cos(t) / a, nz = Math.sin(t) / b // ตั้งฉากกับขอบ ชี้ออก
    out.push({ x, y, z, r: faceAngle(-nx, -nz) })
  }
}

/** เบาะ + พนัก (สร้างใหม่ทุกครั้ง — disposeGroup ทิ้ง geometry พร้อมสถานที่) */
function seatGeometry(): THREE.BufferGeometry {
  const seat = new THREE.BoxGeometry(0.44, 0.07, 0.4).translate(0, 0.42, -0.02)
  const back = new THREE.BoxGeometry(0.44, 0.4, 0.06).translate(0, 0.62, 0.19)
  const geo = mergeGeometries([seat, back])!
  seat.dispose()
  back.dispose()
  return geo
}

function buildSeats(seats: Seat[], color: string): THREE.InstancedMesh {
  const step = seats.length > MAX_SEATS ? seats.length / MAX_SEATS : 1
  const count = Math.min(seats.length, MAX_SEATS)
  const mesh = new THREE.InstancedMesh(seatGeometry(), new THREE.MeshLambertMaterial({ color: 0xffffff }), count)
  const base = new THREE.Color(color)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const one = new THREE.Vector3(1, 1, 1)
  const c = new THREE.Color()
  for (let i = 0; i < count; i++) {
    const s = seats[Math.floor(i * step)]
    q.setFromAxisAngle(up, s.r)
    mesh.setMatrixAt(i, m.compose(new THREE.Vector3(s.x, s.y, s.z), q, one))
    // ความสว่างต่างกันนิดหน่อยต่อตัว (คงที่ทุกครั้ง) — สีเดียวทั้งสนามดูเป็นพลาสติกก้อนเดียว
    const jitter = 0.9 + ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.18
    mesh.setColorAt(i, c.copy(base).multiplyScalar(jitter))
  }
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.computeBoundingSphere()
  mesh.raycast = () => {} // ray ไปชนขั้นอัฒจันทร์แทน (ผิววางของ) — 9 หมื่นตัวยิง ray ทุกครั้งที่ขยับเมาส์ไม่ไหว
  mesh.receiveShadow = true
  return mesh
}

export const SEAT_COLORS: { value: string; label: string }[] = [
  { value: '#1d4ed8', label: 'น้ำเงิน' },
  { value: '#dc2626', label: 'แดง' },
  { value: '#15803d', label: 'เขียว' },
  { value: '#ea580c', label: 'ส้ม' },
  { value: '#eab308', label: 'เหลือง' },
  { value: '#6b7280', label: 'เทา' },
]
const DEFAULT_SEAT_COLOR = '#1d4ed8'

// ── สนามหญ้า (โหมดสมจริง): ลายตัดหญ้า + เส้นสนามฟุตบอล ─────────────────────────
function pitchTexture(width: number, depth: number): THREE.CanvasTexture {
  const along = depth >= width // แนวยาวของสนามตามแกน z
  const L = along ? depth : width
  const W = along ? width : depth
  const px = 12 // พิกเซลต่อเมตร
  const c = document.createElement('canvas')
  c.width = Math.round(width * px)
  c.height = Math.round(depth * px)
  const ctx = c.getContext('2d')!
  // ลายตัดหญ้าเป็นแถบขวางแนวยาว
  const stripes = Math.max(6, Math.round(L / 5.5))
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 ? '#4f8f45' : '#5a9c4f'
    const s0 = (i * L) / stripes * px, s1 = ((i + 1) * L) / stripes * px
    if (along) ctx.fillRect(0, s0, c.width, s1 - s0)
    else ctx.fillRect(s0, 0, s1 - s0, c.height)
  }
  // เส้นสนาม — วาดในพิกัด (u = ตามกว้าง, v = ตามยาว) แล้วสลับแกนถ้าสนามยาวตาม x
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = Math.max(2, 0.12 * px)
  const P = (u: number, v: number): [number, number] => (along ? [u * px, v * px] : [v * px, u * px])
  const rect = (u0: number, v0: number, w: number, h: number) => {
    const [x0, y0] = P(u0, v0), [x1, y1] = P(u0 + w, v0 + h)
    ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0))
  }
  const m = 1 // ขอบเส้นห่างขอบหญ้า
  rect(m, m, W - 2 * m, L - 2 * m)
  ctx.beginPath(); ctx.moveTo(...P(m, L / 2)); ctx.lineTo(...P(W - m, L / 2)); ctx.stroke()
  ctx.beginPath(); ctx.arc(...P(W / 2, L / 2), Math.min(9.15, W / 6) * px, 0, Math.PI * 2); ctx.stroke()
  const box = Math.min(40.3, W * 0.6), boxD = Math.min(16.5, L * 0.16)
  const six = Math.min(18.3, W * 0.28), sixD = Math.min(5.5, L * 0.055)
  rect((W - box) / 2, m, box, boxD)
  rect((W - box) / 2, L - m - boxD, box, boxD)
  rect((W - six) / 2, m, six, sixD)
  rect((W - six) / 2, L - m - sixD, six, sixD)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = ANISOTROPY
  return tex
}

// ── วัสดุแบบ PBR (โหมดสมจริง) ─────────────────────────────────────────────
let concreteTex: THREE.CanvasTexture | null = null
/** ผิวปูนเป็นจุดๆ (สีเทาอ่อน–ขาว คูณทับสีเดิม) — ผิวเรียบสีเดียวคือสิ่งที่ทำให้ฉากดูเป็นแผนผัง ไม่ใช่สถานที่ */
function concreteTexture(): THREE.CanvasTexture {
  if (concreteTex) return concreteTex
  const n = 256
  const c = document.createElement('canvas')
  c.width = c.height = n
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(n, n)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < n * n; i++) {
    const v = 214 + rnd() * 41 // 214..255
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  // คราบ/รอยด่างใหญ่ๆ ให้ไม่เป็นลายซ้ำชัดเกิน
  for (let k = 0; k < 40; k++) {
    ctx.fillStyle = `rgba(0,0,0,${0.01 + rnd() * 0.02})`
    ctx.beginPath()
    ctx.arc(rnd() * n, rnd() * n, 8 + rnd() * 30, 0, Math.PI * 2)
    ctx.fill()
  }
  concreteTex = new THREE.CanvasTexture(c)
  concreteTex.wrapS = concreteTex.wrapT = THREE.RepeatWrapping
  concreteTex.colorSpace = THREE.SRGBColorSpace
  concreteTex.anisotropy = ANISOTROPY
  return concreteTex
}

/** Lambert → Standard (PBR) คงสี/texture/ความโปร่ง — โหมดปกติยังใช้ Lambert (เบา + สีตรงตามที่ตั้ง) */
function toStandard(m: THREE.Material, roughness: number, metalness = 0): THREE.Material {
  if (!(m instanceof THREE.MeshLambertMaterial)) return m
  const out = new THREE.MeshStandardMaterial({
    color: m.color, map: m.map, emissive: m.emissive, transparent: m.transparent, opacity: m.opacity,
    side: m.side, depthWrite: m.depthWrite, depthTest: m.depthTest, roughness, metalness,
  })
  m.dispose()
  return out
}
function convertMaterials(mesh: THREE.Mesh, roughness: number, metalness = 0) {
  mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => toStandard(m, roughness, metalness)) : toStandard(mesh.material, roughness, metalness)
}

/** ผิวสถานที่ (ขั้นอัฒจันทร์ ผนัง) ใส่ลายปูน — repeat ตามขนาดจริง (กล่อง: UV 0..1 ต่อหน้า, Extrude: UV = เมตร) */
function concreteSurface(mesh: THREE.Mesh) {
  const mat = mesh.material as THREE.MeshLambertMaterial
  if (!(mat instanceof THREE.MeshLambertMaterial) || mat.map) return
  const tex = concreteTexture().clone()
  const geo = mesh.geometry as THREE.BufferGeometry & { parameters?: { width?: number; height?: number; depth?: number } }
  const p = geo.parameters
  if (geo.type === 'BoxGeometry' && p) {
    const big = Math.max(p.width ?? 1, p.depth ?? 1)
    tex.repeat.set(big / 3, Math.max(1, (p.height ?? 1) / 3))
  } else tex.repeat.set(1 / 3, 1 / 3)
  tex.needsUpdate = true
  mat.map = tex
}

/**
 * อุปกรณ์ในผัง (กล้อง รถ OB ฯลฯ) แบบสมจริง: กล่องเป็นขอบมน + วัสดุ PBR + ทอดเงา
 * แก้ที่ตัวที่สร้างจาก buildObject แล้ว — ไม่ต้องแตะโค้ดวาดอุปกรณ์แต่ละชนิด
 */
export function realisticObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || (o as unknown as THREE.Sprite).isSprite) return
    const geo = mesh.geometry as THREE.BufferGeometry & { parameters?: { width: number; height: number; depth: number } }
    if (geo.type === 'BoxGeometry' && geo.parameters) {
      const { width: w, height: h, depth: d } = geo.parameters
      const r = Math.min(0.08, Math.min(w, h, d) * 0.18)
      if (r > 0.004) { mesh.geometry = new RoundedBoxGeometry(w, h, d, 2, r); geo.dispose() }
    }
    convertMaterials(mesh, 0.45, 0.15)
    const mat = mesh.material as THREE.Material
    mesh.castShadow = !mat.transparent && mat.depthTest
    mesh.receiveShadow = true
  })
}

// ── ของบนเวที (โหมดสมจริง): จอ LED หลังเวที + truss + ลำโพงแขวน ───────────────
let ledTex: THREE.CanvasTexture | null = null
function ledTexture(): THREE.CanvasTexture {
  if (ledTex) return ledTex
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 512, 256)
  g.addColorStop(0, '#1e3a8a')
  g.addColorStop(0.5, '#6d28d9')
  g.addColorStop(1, '#0e7490')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 512, 256)
  // ตาราง cabinet ของจอ LED
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 2
  for (let x = 0; x <= 512; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke() }
  for (let y = 0; y <= 256; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke() }
  ledTex = new THREE.CanvasTexture(c)
  ledTex.colorSpace = THREE.SRGBColorSpace
  return ledTex
}

function stageDressing(v: VenueConfig): THREE.Group {
  const g = new THREE.Group()
  const s = v.stage
  const back = -v.depth / 2 + s.offset
  const front = back + s.depth
  const steel = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.35, metalness: 0.8 })
  const black = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.6, metalness: 0.2 })
  // จอ LED กว้าง ~70% ของเวที ยืนชิดขอบหลังเวที
  const ledW = s.width * 0.7
  const ledH = Math.max(2.5, Math.min(ledW * 9 / 16, v.height * 0.5, 9))
  const led = new THREE.Mesh(new THREE.PlaneGeometry(ledW, ledH), new THREE.MeshBasicMaterial({ map: ledTexture(), toneMapped: false }))
  led.position.set(0, s.height + 0.6 + ledH / 2, back + 0.4)
  const frame = new THREE.Mesh(new THREE.BoxGeometry(ledW + 0.3, ledH + 0.3, 0.3), black)
  frame.position.set(0, led.position.y, back + 0.22)
  g.add(frame, led)
  // truss: เสา 2 ต้นหน้าเวที + คานขวาง สูงไม่เกินเพดาน
  const trussH = Math.max(s.height + 4, Math.min(v.height - 1.5, s.height + 10))
  const tw = 0.4
  for (const sx of [-1, 1]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(tw, trussH, tw), steel)
    tower.position.set(sx * (s.width / 2 + 0.5), trussH / 2, front - 0.6)
    g.add(tower)
    // ลำโพง line array แขวนข้างเวที
    for (let k = 0; k < 8; k++) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.32, 0.6), black)
      box.position.set(sx * (s.width / 2 + 2.4), trussH - 1.2 - k * 0.34, front - 0.2)
      box.rotation.x = -0.03 * k // ลำโพงล่างๆ ก้มลงหาผู้ชม
      g.add(box)
    }
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(s.width + 1 + tw, tw, tw), steel)
  beam.position.set(0, trussH, front - 0.6)
  g.add(beam)
  // ไฟบนคาน (moving head) — จุดเล็กๆ ทุก ~2 ม.
  const n = Math.max(3, Math.round(s.width / 2.2))
  for (let i = 0; i < n; i++) {
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.36, 12), black)
    head.position.set(-s.width / 2 + (i + 0.5) * (s.width / n), trussH - 0.4, front - 0.6)
    g.add(head)
  }
  g.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh) { mesh.castShadow = mesh !== led; mesh.receiveShadow = true }
  })
  return decor(g)
}

/**
 * ผนังฮอลล์ในร่ม แบบบ้านตุ๊กตา: หันผิวเข้าด้านใน (BackSide) → ผนังฝั่งที่หันหากล้องถูกตัดทิ้งเอง
 * มองจากมุมไหนก็เห็นข้างใน + เห็นผนังฝั่งไกลเป็นฉากหลัง
 */
function hallWalls(v: VenueConfig): THREE.Mesh {
  const e = venueExtent(v)
  const curved = v.shape === 'arena' && !!v.tiers?.curved
  const h = Math.max(4, v.height)
  // วงรี = ทรงกระบอก 64 ด้าน · สี่เหลี่ยม = ทรงกระบอก 4 ด้านหมุน 45° (รัศมี √2 → ครึ่งด้าน = 1)
  const geo = curved ? new THREE.CylinderGeometry(1, 1, h, 64, 1, true) : new THREE.CylinderGeometry(Math.SQRT2, Math.SQRT2, h, 4, 1, true, Math.PI / 4)
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xd4d0ca, roughness: 0.95, side: THREE.BackSide }))
  mesh.scale.set((e.maxX - e.minX) / 2 + 0.5, 1, (e.maxZ - e.minZ) / 2 + 0.5)
  mesh.position.set((e.minX + e.maxX) / 2, h / 2 - 0.2, (e.minZ + e.maxZ) / 2)
  mesh.receiveShadow = true
  mesh.userData.noAO = true
  mesh.userData.noShadow = true // ผนังฝั่งใกล้ถูกตัดทิ้งในภาพแต่ยังบังแดด → เงาแถบใหญ่บนพื้น
  return decor(mesh)
}

// ── หลังคา / ราวกันตก (โหมดสมจริง) ─────────────────────────────────────────
const glassMaterial = () => new THREE.MeshLambertMaterial({ color: 0xa5c8e4, transparent: true, opacity: 0.35, depthWrite: false })
/** ทำให้เป็นของประกอบฉาก — ไม่ใช่ผิววางของ ray ไม่ชน */
function decor<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => { c.userData.ground = false; c.raycast = () => {} })
  return o
}

/** หลังคา/โครงเพดาน — มุมบนต้องซ่อน (setRoofVisible) ไม่งั้นบังทั้งผัง */
export function setRoofVisible(root: THREE.Object3D | null | undefined, visible: boolean): void {
  root?.traverse((o) => { if (o.userData.roof) o.visible = visible })
}

/**
 * normal = สถานที่จากตัวเลขตามปกติ · ghost = เส้นโปร่งไว้เทียบกับโมเดล (ไม่ใช่ผิววางของ)
 * hidden = มองไม่เห็นแต่ยังเป็นผิววางของ (ใต้ไฟล์สแกน) · none = ไม่สร้าง (โมเดล .glb เป็นผิววางของแทน)
 * เวที รูป floor plan และป้าย STAGE ไม่อยู่ในส่วนนี้ — มีเสมอ (เวทีเป็นของงาน ไม่ใช่ของสถานที่)
 */
export type VenueShell = 'normal' | 'ghost' | 'hidden' | 'none'

/** loaded = ชนิดโมเดลที่โหลดสำเร็จแล้ว (ยังไม่โหลด/โหลดไม่ได้ = null → ใช้สถานที่จากตัวเลข) */
export function venueShell(v: VenueConfig, loaded: VenueModelKind | null): VenueShell {
  if (!loaded || !v.model) return 'normal'
  if (loaded === 'mesh') return v.model.showVenue ? 'ghost' : 'none'
  return v.model.showVenue ? 'normal' : 'hidden'
}

export interface VenueBuildOptions {
  floorImage?: HTMLImageElement | null
  /** โหมดสมจริง: เก้าอี้ ราวกันตก หลังคา ลายหญ้า พื้นรอบสถานที่ เงา */
  realistic?: boolean
  shell?: VenueShell
}

/** สร้างสถานที่: พื้น, เวที, อัฒจันทร์, กรอบปริมาตร, grid 5 ม. และรูป floor plan (ถ้ามี) */
export function buildVenue(v: VenueConfig, opts: VenueBuildOptions = {}): THREE.Group {
  const g = new THREE.Group()
  const shellMode = opts.shell ?? 'normal'
  const real = !!opts.realistic && shellMode === 'normal'
  const pal = real ? PALETTE.real : PALETTE.plan
  // สถานที่จากตัวเลข — แยกกลุ่มไว้ ซ่อน/ทำโปร่งได้ทั้งก้อนเมื่อมีโมเดลจริง
  const shell = new THREE.Group()
  const seats: Seat[] = []

  const curved = v.shape === 'arena' && !!v.tiers?.curved
  if (curved) {
    // พื้นวงรี — width/depth เป็นแกนของวงรี; UV ของ ExtrudeGeometry = พิกัดเมตร → repeat 1/5 = ช่อง 5 ม.
    const floor = ellipseSlab(v.width / 2, v.depth / 2, null, 0.2, 0xe5e7eb)
    floor.material = floorMaterial(1 / 5, 1 / 5, pal.floorTint)
    floor.userData.rough = 0.8
    floor.position.y = -0.2
    shell.add(floor)
  } else {
    const floor = groundBox(v.width, 0.2, v.depth, 0xe5e7eb)
    // ฮอลล์ในร่ม (ไม่มีสนาม) = พื้นขัดเงาสีเข้มขึ้น สะท้อนแสงนิดๆ
    floor.material = floorMaterial(v.width / 5, v.depth / 5, real && !v.pitch ? 0x9d9a94 : pal.floorTint)
    floor.userData.rough = real && !v.pitch ? 0.4 : 0.8
    floor.position.y = -0.1
    shell.add(floor)
  }

  if (v.pitch && real && curved) shell.add(runningTrack(v))
  if (v.pitch) {
    // สนามกีฬากลาง — พื้นเขียว + เส้นขอบขาว วางเหนือพื้นนิดเดียว (ไม่ใช่ ground แยก พื้นหลักรับการวางอยู่แล้ว)
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(v.pitch.width, v.pitch.depth),
      real ? new THREE.MeshLambertMaterial({ map: pitchTexture(v.pitch.width, v.pitch.depth) }) : new THREE.MeshLambertMaterial({ color: 0x86c98a }),
    )
    grass.rotation.x = -Math.PI / 2
    grass.position.y = 0.05
    grass.raycast = () => {}
    shell.add(grass)
    if (!real) {
      const line = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(v.pitch.width, v.pitch.depth)),
        new THREE.LineBasicMaterial({ color: 0xffffff }),
      )
      line.rotation.x = -Math.PI / 2
      line.position.y = 0.08
      shell.add(line)
    }
  }

  if (v.stage.enabled) {
    const s = v.stage
    const stage = groundBox(s.width, s.height, s.depth, pal.stage)
    stage.position.set(0, s.height / 2, -v.depth / 2 + s.offset + s.depth / 2)
    g.add(stage)
    const label = makeLabel('STAGE', '#374151', labelSizeFor(v))
    label.position.set(0, s.height + labelSizeFor(v), stage.position.z)
    // ป้าย STAGE ไม่ขยับ — ป้ายวัตถุต้องหลบมันแทน
    markLabel(label, true)
    g.add(label)
  }

  if (v.shape === 'arena' && v.tiers) {
    const { steps, rise, run, back, sides } = v.tiers
    const front = !!v.tiers.front
    // ทางเดิน: ตำแหน่งคิดจากขอบพื้นราบ แล้วใช้ตำแหน่งเดียวกันทุกขั้น → ทางเดินเป็นแนวตรงขึ้นไปถึงขั้นบนสุด
    const aisleW = v.tiers.aisleWidth && v.tiers.aisleWidth > 0 ? v.tiers.aisleWidth : 0
    const sideGaps = aisleW ? aisleGaps(v.depth, v.tiers.sectionWidth ?? 10, aisleW) : []
    const endGaps = aisleW ? aisleGaps(v.width, v.tiers.sectionWidth ?? 10, aisleW) : []
    const cross = v.tiers.crossAisle ?? 0
    // ผนังตรงใต้แถวแรก: ทุกขั้นยกขึ้น wallSteps ขั้น → หน้าแถวแรกเป็นผนังตั้งฉากจากพื้น (นั่ง/วางของที่ผนังไม่ได้)
    const wall = Math.max(0, Math.round(v.tiers.wallSteps ?? 0))
    // รัศมีมุมโค้ง (ที่ขอบพื้นราบ) — ไม่เกินครึ่งด้านที่สั้นกว่า
    const R = Math.max(0, Math.min(v.tiers.cornerRadius ?? 0, v.width / 2, v.depth / 2))
    const rows = seatRowOffsets(run)
    for (let i = 0; i < steps; i++) {
      const h = rise * (i + 1 + wall)
      const shade = i % 2 === 0 ? pal.tierA : pal.tierB
      const isCross = cross > 0 && i === cross - 1 // ทั้งขั้นเป็นทางเดินขวาง
      const seated = real && !isCross
      if (curved) {
        // ชามวงรี: แต่ละขั้นเป็นวงแหวนวงรี ล้อมรอบพื้นทุกด้าน
        const a = v.width / 2 + run * i
        const b = v.depth / 2 + run * i
        shell.add(ellipseSlab(a + run, b + run, [a, b], h, shade))
        if (seated) for (const off of rows) seatsOnEllipse(seats, a + off, b + off, h)
        continue
      }
      // วางขั้นเป็นท่อนๆ ตามแนว axis — ช่วงที่ตรงกับทางเดินใช้สีทางเดิน (ยังเป็นผิวที่วางของได้)
      // fixed = กึ่งกลางความลึกของขั้น (บวก = ฝั่ง +x/+z) · seatSpan = ช่วงที่วางเก้าอี้ (กันซ้อนกับแถวหน้า/หลังตรงมุม)
      const tierRow = (axis: 'x' | 'z', a0: number, a1: number, fixed: number, gaps: [number, number][], seatSpan: [number, number] = [a0, a1]) => {
        const out = Math.sign(fixed) || 1
        const inner = fixed - (out * run) / 2
        for (const [s0, s1, aisle] of splitSpan(a0, a1, isCross ? [] : gaps)) {
          const len = s1 - s0
          const color = isCross || aisle ? pal.aisle : shade
          const box = axis === 'z' ? groundBox(run, h, len, color) : groundBox(len, h, run, color)
          if (axis === 'z') box.position.set(fixed, h / 2, (s0 + s1) / 2)
          else box.position.set((s0 + s1) / 2, h / 2, fixed)
          shell.add(box)
          const c0 = Math.max(s0, seatSpan[0]), c1 = Math.min(s1, seatSpan[1])
          if (!seated || aisle || c1 <= c0) continue
          for (const off of rows) {
            const p = inner + out * off
            // เก้าอี้หันเข้าหาพื้นราบ (ทิศตรงข้ามกับฝั่งที่อยู่)
            if (axis === 'z') seatsOnLine(seats, p, c0, p, c1, h, faceAngle(-out, 0))
            else seatsOnLine(seats, c0, p, c1, p, h, faceAngle(0, -out))
          }
        }
      }
      if (R > 0 && sides) {
        // มุมโค้ง: ข้าง/หน้า/หลังเป็นแนวตรงถึงจุดเริ่มโค้ง แล้วต่อด้วยวงแหวน 1/4 รอบศูนย์กลางที่ร่นเข้ามา R จากมุมพื้น
        const zBack = back ? v.depth / 2 - R : v.depth / 2
        const zFront = front ? -(v.depth / 2 - R) : -v.depth / 2
        for (const sign of [-1, 1]) tierRow('z', zFront, zBack, sign * (v.width / 2 + run * i + run / 2), sideGaps)
        const xHalf = v.width / 2 - R
        if (back) tierRow('x', -xHalf, xHalf, v.depth / 2 + run * i + run / 2, endGaps)
        if (front) tierRow('x', -xHalf, xHalf, -(v.depth / 2 + run * i + run / 2), endGaps)
        const cornerColor = isCross ? pal.aisle : shade
        for (const sx of [-1, 1]) {
          for (const sz of [...(back ? [1] : []), ...(front ? [-1] : [])]) {
            const cx = sx * xHalf, cz = sz * (v.depth / 2 - R)
            shell.add(cornerSlab(cx, cz, sx, sz, R + run * i, R + run * (i + 1), h, cornerColor))
            const mid = Math.atan2(sz, sx) // ทิศของมุมในระนาบ x-z
            if (seated) for (const off of rows) seatsOnArc(seats, cx, cz, R + run * i + off, mid - Math.PI / 4, mid + Math.PI / 4, h)
          }
        }
        continue
      }
      if (sides) {
        // ขั้นด้านข้างยืดไปคลุมมุมด้วย → มุมสูง = max(ขั้นข้าง, ขั้นหน้า/หลัง) ไม่มีรู
        const extBack = back ? run * (i + 1) : 0
        const extFront = front ? run * (i + 1) : 0
        // เก้าอี้ฝั่งข้างหยุดก่อนมุม — มุมเป็นของแถวหน้า/หลัง (ไม่ซ้อนกัน)
        const span: [number, number] = [-v.depth / 2 - (front ? run * i : 0), v.depth / 2 + (back ? run * i : 0)]
        for (const sign of [-1, 1]) tierRow('z', -v.depth / 2 - extFront, v.depth / 2 + extBack, sign * (v.width / 2 + run * i + run / 2), sideGaps, span)
      }
      const endHalf = v.width / 2 + (sides ? run * (i + 1) : 0)
      if (back) tierRow('x', -endHalf, endHalf, v.depth / 2 + run * i + run / 2, endGaps)
      if (front) tierRow('x', -endHalf, endHalf, -(v.depth / 2 + run * i + run / 2), endGaps)
    }

    if (real) {
      if (seats.length) shell.add(buildSeats(seats, v.seatColor || DEFAULT_SEAT_COLOR))
      // ราวกระจกขอบหน้าแถวแรก (บนผนังล่าง) สูง 1 ม.
      const y0 = rise * (1 + wall)
      const rail = new THREE.Group()
      const RH = 1, T = 0.06
      if (curved) {
        const ring = ellipseSlab(v.width / 2 + T, v.depth / 2 + T, [v.width / 2, v.depth / 2], RH, 0)
        ring.material = glassMaterial()
        rail.add(ring)
      } else {
        const zB = back && R > 0 && sides ? v.depth / 2 - R : v.depth / 2
        const zF = front && R > 0 && sides ? -(v.depth / 2 - R) : -v.depth / 2
        const xH = R > 0 && sides && (back || front) ? v.width / 2 - R : v.width / 2
        const seg = (w: number, d: number, x: number, z: number) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, RH, d), glassMaterial())
          m.position.set(x, RH / 2, z)
          rail.add(m)
        }
        if (sides) for (const s of [-1, 1]) seg(T, zB - zF, s * (v.width / 2 + T / 2), (zB + zF) / 2)
        if (back) seg(xH * 2, T, 0, v.depth / 2 + T / 2)
        if (front) seg(xH * 2, T, 0, -v.depth / 2 - T / 2)
        if (R > 0 && sides) {
          for (const sx of [-1, 1]) {
            for (const sz of [...(back ? [1] : []), ...(front ? [-1] : [])]) {
              const arc = cornerSlab(sx * xH, sz * (v.depth / 2 - R), sx, sz, R, R + T, RH, 0)
              arc.material = glassMaterial()
              rail.add(arc)
            }
          }
        }
      }
      rail.position.y = y0
      shell.add(decor(rail))
    }
  }

  if (real && v.roof) shell.add(buildRoof(v))
  if (real && !v.pitch) shell.add(hallWalls(v))
  if (opts.realistic && v.stage.enabled) g.add(stageDressing(v))

  if (shellMode === 'ghost') {
    // เส้นโปร่งไว้เทียบตำแหน่งกับโมเดล — ไม่ใช่ผิววางของ (โมเดลเป็นผิววางของแทน)
    shell.traverse((o) => {
      const mesh = o as THREE.Mesh
      o.userData.ground = false
      o.raycast = () => {}
      if (!mesh.isMesh) return
      mesh.material = new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.12, depthWrite: false })
    })
  }
  if (shellMode === 'hidden') shell.visible = false // ray ยังชน (Raycaster ไม่สนใจ visible) → ใต้ไฟล์สแกนยังวางของได้
  if (shellMode !== 'none') g.add(shell)

  if (opts.floorImage) {
    const img = opts.floorImage
    const w = v.floorImageWidth || v.width
    const d = w * (img.naturalHeight / img.naturalWidth)
    const tex = new THREE.Texture(img)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = ANISOTROPY
    tex.needsUpdate = true
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.9, depthWrite: false }),
    )
    plane.rotation.x = -Math.PI / 2
    plane.position.set(v.floorImageOffsetX ?? 0, 0.03, v.floorImageOffsetZ ?? 0)
    plane.raycast = () => {}
    g.add(plane)
  }

  const e = venueExtent(v)
  if (opts.realistic) {
    // พื้นรอบสถานที่ (ลานปูน/ถนน) — ของที่วางนอกสถานที่ เช่น รถ OB ไม่ลอยกลางความว่าง
    const span = Math.max(e.maxX - e.minX, e.maxZ - e.minZ)
    // สีเรียบ — ลายปูนที่ repeat บนพื้นกว้างหลายร้อยเมตรเห็นเป็นตารางซ้ำ ดูปลอม
    const around = new THREE.Mesh(new THREE.PlaneGeometry(span * 4, span * 4), new THREE.MeshLambertMaterial({ color: 0x84827c }))
    around.rotation.x = -Math.PI / 2
    around.position.set((e.minX + e.maxX) / 2, -0.22, (e.minZ + e.maxZ) / 2)
    around.receiveShadow = true
    g.add(decor(around))
  } else if (shellMode !== 'none' && shellMode !== 'hidden') {
    const bounds = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(e.maxX - e.minX, e.topY, e.maxZ - e.minZ)),
      new THREE.LineBasicMaterial({ color: 0x9ca3af }),
    )
    bounds.position.set((e.minX + e.maxX) / 2, e.topY / 2, (e.minZ + e.maxZ) / 2)
    g.add(bounds)
  }

  if (opts.realistic) {
    g.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      if ((mesh as THREE.InstancedMesh).isInstancedMesh) { convertMaterials(mesh, 0.5); return } // เก้าอี้พลาสติก
      if (o.userData.ground && real) concreteSurface(mesh)
      convertMaterials(mesh, (o.userData.rough as number | undefined) ?? (o.userData.ground ? 0.85 : 0.6))
      const mat = mesh.material as THREE.Material
      mesh.receiveShadow = true
      mesh.castShadow = !o.userData.noShadow && (!mat.transparent || !!o.userData.roof)
    })
  }
  return g
}

/** ลู่วิ่งสีแดงรอบสนาม (ชามวงรีที่มีสนามหญ้า) — กว้าง 8 ลู่ × 1.22 ม. ตามขอบพื้นราบ + เส้นแบ่งลู่ */
function runningTrack(v: VenueConfig): THREE.Group {
  const g = new THREE.Group()
  const a = v.width / 2 - 0.3, b = v.depth / 2 - 0.3
  const W = Math.min(8 * 1.22, a * 0.25, b * 0.25)
  const ring = ellipseSlab(a, b, [a - W, b - W], 0.02, 0xb4533c)
  ring.position.y = 0.01
  ring.userData.rough = 0.9
  g.add(ring)
  for (let k = 0; k <= 8; k++) {
    const d = (W * k) / 8
    const pts = new THREE.EllipseCurve(0, 0, a - d, b - d).getPoints(160).map((p) => new THREE.Vector3(p.x, 0.04, p.y))
    g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })))
  }
  return decor(g)
}

/**
 * หลังคา: มีสนามหญ้า = สนามกลางแจ้ง → หลังคายื่นคลุมอัฒจันทร์ (ไม่คลุมสนาม)
 * ไม่มีสนาม = ในร่ม → โครง truss เพดานเป็นเส้น (มองทะลุได้ ไม่บังของในผัง)
 */
function buildRoof(v: VenueConfig): THREE.Group {
  const g = new THREE.Group()
  const e = venueExtent(v)
  const tiers = v.shape === 'arena' ? v.tiers : undefined
  const t = tiers ? tiers.steps * tiers.run : 0
  const top = tiers ? tiers.rise * (tiers.steps + (tiers.wallSteps ?? 0)) : 0
  if (v.pitch && tiers && t > 0) {
    // หลังคาเมมเบรนทึบคลุมอัฒจันทร์ครึ่งบน (แถวล่างกลางแจ้ง) + เสาค้ำรอบนอก — แบบสนามกีฬาส่วนใหญ่
    const y = Math.max(v.height, top + 8)
    const mat = new THREE.MeshLambertMaterial({ color: 0xf3f4f6, side: THREE.DoubleSide })
    const steel = new THREE.MeshLambertMaterial({ color: 0x9ca3af })
    const inset = t * 0.5
    const column = (x: number, z: number) => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, y, 10), steel)
      c.position.set(x, y / 2, z)
      g.add(c)
    }
    if (tiers.curved) {
      const A = v.width / 2 + t + 1, B = v.depth / 2 + t + 1
      const ring = ellipseSlab(A, B, [v.width / 2 + inset, v.depth / 2 + inset], 0.6, 0)
      ring.material = mat
      ring.position.y = y
      g.add(ring)
      // ขอบหน้าหลังคา (fascia) เป็นคานเหล็กรอบวง
      const edge = ellipseSlab(v.width / 2 + inset + 0.6, v.depth / 2 + inset + 0.6, [v.width / 2 + inset, v.depth / 2 + inset], 1.6, 0)
      edge.material = steel
      edge.position.y = y - 1
      g.add(edge)
      const per = Math.PI * (3 * (A + B) - Math.sqrt((3 * A + B) * (A + 3 * B)))
      const n = Math.max(8, Math.round(per / 16))
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; column(Math.cos(a) * (A - 0.5), Math.sin(a) * (B - 0.5)) }
    } else {
      const slab = (w: number, d: number, x: number, z: number) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, d), mat)
        m.position.set(x, y, z)
        g.add(m)
      }
      const deep = t + 1 - inset
      for (let x = e.minX; x <= e.maxX + 0.01; x += 16) { if (tiers.back) column(x, e.maxZ - 0.5); if (tiers.front) column(x, e.minZ + 0.5) }
      for (let z = e.minZ; z <= e.maxZ + 0.01; z += 16) if (tiers.sides) { column(e.minX + 0.5, z); column(e.maxX - 0.5, z) }
      if (tiers.sides) for (const s of [-1, 1]) slab(deep, e.maxZ - e.minZ, s * (v.width / 2 + inset + deep / 2), (e.minZ + e.maxZ) / 2)
      if (tiers.back) slab(v.width + 2 * inset, deep, 0, v.depth / 2 + inset + deep / 2)
      if (tiers.front) slab(v.width + 2 * inset, deep, 0, -(v.depth / 2 + inset + deep / 2))
    }
  } else {
    // โครง truss: ตารางคานทุก 6 ม. + คานรอบนอก ที่ความสูงเพดาน
    const y = v.height
    const pts: number[] = []
    const STEP = 6
    for (let x = e.minX; x <= e.maxX + 0.01; x += STEP) pts.push(x, y, e.minZ, x, y, e.maxZ)
    for (let z = e.minZ; z <= e.maxZ + 0.01; z += STEP) pts.push(e.minX, y, z, e.maxX, y, z)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x6b7280, transparent: true, opacity: 0.6 })))
    const beam = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), new THREE.MeshLambertMaterial({ color: 0x4b5563 }))
      m.position.set(x, y, z)
      g.add(m)
    }
    const W = e.maxX - e.minX, D = e.maxZ - e.minZ, cx = (e.minX + e.maxX) / 2, cz = (e.minZ + e.maxZ) / 2
    beam(W, 0.5, cx, e.minZ); beam(W, 0.5, cx, e.maxZ); beam(0.5, D, e.minX, cz); beam(0.5, D, e.maxX, cz)
  }
  g.traverse((o) => { o.userData.roof = true })
  return decor(g)
}

// ── บรรยากาศ: ท้องฟ้า แสง เงา ──────────────────────────────────────────────
/** ทิศแดด (บ่ายแก่ — เงาทอดยาวพอให้เห็นมิติ แต่ไม่มืดทั้งอัฒจันทร์) — ใช้ทั้งท้องฟ้าและไฟแดด ให้เงาตรงกับดวงอาทิตย์บนฟ้า */
const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(50), THREE.MathUtils.degToRad(35))

const skyCache = new WeakMap<THREE.WebGLRenderer, THREE.Texture>()
/**
 * ท้องฟ้าแบบฟิสิกส์ (Sky shader ของ three — กระเจิงแสง Rayleigh/Mie) อบเป็น PMREM ครั้งเดียวต่อ renderer
 * ใช้เป็นทั้งพื้นหลังและแสงสะท้อนรอบตัว (วัสดุ PBR สะท้อนฟ้าจริง ไม่ใช่ห้องสตูดิโอ)
 */
function skyEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  let tex = skyCache.get(renderer)
  if (!tex) {
    const sky = new Sky()
    sky.scale.setScalar(1000)
    const u = sky.material.uniforms
    u.turbidity.value = 3
    u.rayleigh.value = 1.2
    u.mieCoefficient.value = 0.004
    u.mieDirectionalG.value = 0.8
    u.sunPosition.value.copy(SUN_DIR)
    const skyScene = new THREE.Scene()
    skyScene.add(sky)
    const pmrem = new THREE.PMREMGenerator(renderer)
    tex = pmrem.fromScene(skyScene, 0).texture
    pmrem.dispose()
    sky.geometry.dispose()
    sky.material.dispose()
    skyCache.set(renderer, tex)
  }
  return tex
}

/**
 * ตั้งพื้นหลัง + แสงของฉาก (แทนของเดิมทั้งชุด เรียกซ้ำได้)
 * realistic = ฟ้าไล่สี + แดดทอดเงา (shadow map ครอบทั้งสถานที่) + แสงสะท้อนรอบตัว
 * box = ขอบเขตที่ต้องมีเงา (สถานที่ + โมเดล) · shadowSize = ความละเอียดเงา (มือถือใช้เล็กลง)
 */
export function applyAtmosphere(
  scene: THREE.Scene, renderer: THREE.WebGLRenderer,
  opts: { realistic: boolean; background: number; box: { minX: number; maxX: number; minZ: number; maxZ: number }; shadowSize?: number },
): void {
  scene.children.filter((c) => c.userData.atmo).forEach((c) => {
    scene.remove(c)
    const light = c as THREE.DirectionalLight
    light.shadow?.map?.dispose()
  })
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  // ACES = สีแบบภาพยนตร์/เกม (ไฮไลต์ไม่แตก) — โหมดปกติไม่ใช้ สีวัตถุต้องตรงตามสีที่ตั้ง
  renderer.toneMapping = opts.realistic ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping
  renderer.toneMappingExposure = opts.realistic ? 0.5 : 1 // ท้องฟ้าฟิสิกส์สว่างระดับ HDR — exposure ต่ำให้ฟ้ายังเป็นสีฟ้า
  const add = (o: THREE.Object3D) => { o.userData.atmo = true; scene.add(o) }
  if (!opts.realistic) {
    scene.background = new THREE.Color(opts.background)
    scene.environment = null
    add(new THREE.AmbientLight(0xffffff, 1.6))
    const sun = new THREE.DirectionalLight(0xffffff, 1.8)
    sun.position.set(60, 120, 80)
    add(sun)
    return
  }
  const sky = skyEnvironment(renderer)
  scene.background = sky
  scene.environment = sky
  scene.environmentIntensity = 0.7
  add(new THREE.HemisphereLight(0xdbeafe, 0x6b6358, 0.35))
  const { minX, maxX, minZ, maxZ } = opts.box
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2
  const half = Math.max(maxX - minX, maxZ - minZ) / 2 + 15
  const sun = new THREE.DirectionalLight(0xfff1dc, 4.5)
  sun.position.set(cx, 0, cz).addScaledVector(SUN_DIR, half * 2.5)
  sun.target.position.set(cx, 0, cz)
  sun.castShadow = true
  const size = opts.shadowSize ?? 4096
  sun.shadow.mapSize.set(size, size)
  const cam = sun.shadow.camera
  cam.left = -half * 1.2; cam.right = half * 1.2; cam.top = half * 1.2; cam.bottom = -half * 1.2
  cam.near = 1; cam.far = half * 6
  cam.updateProjectionMatrix()
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.04
  add(sun)
  add(sun.target)
}

/**
 * ผิวที่ ray ชนจริง: ข้ามจุดที่สูงเกิน userData.maxY ของ mesh นั้น (โมเดลที่ตัดหลังคาออก — ส่วนที่ถูกตัดมองไม่เห็นก็ต้องไม่รับของ)
 */
export function firstGroundHit(hits: THREE.Intersection[]): THREE.Intersection | undefined {
  return hits.find((h) => h.point.y <= ((h.object.userData.maxY as number | undefined) ?? Infinity) + 1e-3)
}

// ── objects ────────────────────────────────────────────────────────────────
function box(w: number, h: number, d: number, color: string, opacity = 1): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity }),
  )
}

/** กรวยมุมรับภาพแนวนอน — แบนราบที่ระดับเลนส์ หันไป -z ของวัตถุ */
function fovWedge(fov: number, range: number, color: string): THREE.Group {
  const g = new THREE.Group()
  const half = deg(fov) / 2
  const geo = new THREE.CircleGeometry(range, 32, Math.PI / 2 - half, half * 2)
  const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false,
  }))
  fill.raycast = () => {}
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 }))
  edge.raycast = () => {}
  g.add(fill, edge)
  g.userData.wedge = true
  g.rotation.x = -Math.PI / 2 // วงกลมอยู่ระนาบ xy (+y = ข้างหน้า) → พลิกลงระนาบพื้น ให้ +y ไปเป็น -z
  return g
}

export function objectDims(o: LayoutObject) {
  const d = KIND_DEFAULTS[o.kind]
  return {
    w: o.w ?? d.w ?? 1, d: o.d ?? d.d ?? 1, h: o.h ?? d.h ?? 1,
    mountHeight: o.mountHeight ?? d.mountHeight ?? 1.6,
    fov: o.fov ?? d.fov ?? 30,
    range: o.range ?? d.range ?? 40,
  }
}

/** lensLines = วาดกรวยมุมรับภาพของกล้อง (ปิดได้เมื่อผังแน่นจนดูตำแหน่งยาก) */

/** ขาตั้ง 3 ขา: เอียงจากพื้น (รัศมี footR) ขึ้นไปบรรจบที่ (0, legH, 0) — หมุนแกน Y ของทรงกระบอกให้ตรงแนวขา */
function tripodLegs(g: THREE.Group, legH: number, footR: number, legR: number, mat: THREE.Material) {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6
    const foot = new THREE.Vector3(Math.sin(a) * footR, 0, Math.cos(a) * footR)
    const dir = new THREE.Vector3(0, legH, 0).sub(foot)
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(legR, legR, dir.length(), 6), mat)
    leg.position.copy(foot).addScaledVector(dir, 0.5)
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
    g.add(leg)
  }
}

/**
 * ตัวคูณขนาดโมเดลกล้อง — ขนาดจริงเล็กจนแทบมองไม่เห็นในผังสถานที่หลายสิบเมตร
 * สร้างโมเดลที่ความสูง mountHeight / S แล้วขยายทั้งก้อน S เท่า → ระดับเลนส์ยังตรงค่าจริง ขาตั้งยังถึงพื้น
 * (กรวยมุมภาพย้ายออกมานอกก้อนที่ขยาย ระยะจึงไม่เพี้ยน) · jib ไม่ขยาย เพราะขนาดเป็นเมตรที่ผู้ใช้ตั้งเอง
 */
const CAMERA_MODEL_SCALE = 1.6

/**
 * boost = ขยายโมเดลกล้องเพิ่มอีก (หน้าพิมพ์ — กระดาษย่อทั้งสถานที่จนกล้องเหลือจุดเดียว) ขยายจากพื้นทั้งก้อน กล้องจึงดูสูงขึ้นตาม
 * ไม่ใช่ขนาดจริง แต่อ่านออก · ระยะกรวยมุมภาพยังคงค่าจริง
 */
export function buildObject(o: LayoutObject, labelSize: number, selected: boolean, lensLines = true, boost = 1): THREE.Group {
  const root = new THREE.Group()
  root.userData.objectId = o.id
  root.position.set(o.x, o.y, o.z)
  root.rotation.y = -deg(o.rotation) // องศาเพิ่ม = หมุนตามเข็มเมื่อมองจากด้านบน
  // jib / dolly ไม่ขยาย — ความยาวแขน/รางเป็นเมตรจริงที่ผู้ใช้ตั้ง
  const S = isCameraKind(o.kind) && o.kind !== 'jib' && o.kind !== 'dolly' ? CAMERA_MODEL_SCALE : 1
  const E = S === 1 ? 1 : S * boost // ตัวคูณจริงของก้อน (ความสูงคงค่าจริงเฉพาะส่วน S)
  const g = new THREE.Group()
  g.scale.setScalar(E)
  root.add(g)
  const { color } = kindMeta(o.kind)
  const real = objectDims(o)
  const m = S === 1 ? real : { ...real, mountHeight: real.mountHeight / S }
  let top = m.h

  if (o.kind === 'camera') {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.35, m.mountHeight, 8), new THREE.MeshLambertMaterial({ color: 0x4b5563 }))
    leg.position.y = m.mountHeight / 2
    const body = box(0.4, 0.35, 0.7, color)
    body.position.y = m.mountHeight
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.45, 12), new THREE.MeshLambertMaterial({ color: 0x111827 }))
    lens.rotation.x = Math.PI / 2
    lens.position.set(0, m.mountHeight, -0.55)
    g.add(leg, body, lens)
    if (lensLines) {
      const wedge = fovWedge(m.fov, m.range, color)
      wedge.position.y = m.mountHeight
      g.add(wedge)
    }
    top = m.mountHeight + 0.3
  } else if (o.kind === 'gimbal') {
    // Ronin / DJI RS: ด้ามจับตั้ง → มอเตอร์ pan → แขนขึ้นหลังกล้อง → มอเตอร์ roll → แขน L ลงข้างกล้อง → มอเตอร์ tilt
    // ไม่วาดคน — ขยายตัวกิมบอลให้ปลายด้ามแตะพื้น กล้องอยู่ที่ mountHeight (ตัวกิมบอลเองเป็น "ขา" ที่มองเห็นทั้งฮอลล์)
    const rig = new THREE.Group()
    const dark = new THREE.MeshLambertMaterial({ color: 0x1f2937 })
    const motor = (r: number, h: number) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), dark)
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.26, 10), new THREE.MeshLambertMaterial({ color: 0x374151 }))
    grip.position.set(0, -0.32, 0.1)
    const pan = motor(0.05, 0.07)
    pan.position.set(0, -0.16, 0.1)
    const panArm = box(0.03, 0.2, 0.03, '#111827')
    panArm.position.set(0, -0.03, 0.1)
    const roll = motor(0.05, 0.06)
    roll.rotation.x = Math.PI / 2                       // แกน roll ชี้ไปหน้ากล้อง
    roll.position.set(0, 0.1, 0.1)
    const rollArm = box(0.17, 0.03, 0.03, '#111827')
    rollArm.position.set(0.085, 0.1, 0.1)
    const rollDown = box(0.03, 0.03, 0.17, '#111827')
    rollDown.position.set(0.17, 0.1, 0.02)
    const tiltArm = box(0.03, 0.1, 0.03, '#111827')
    tiltArm.position.set(0.17, 0.05, -0.06)
    const tilt = motor(0.045, 0.05)
    tilt.rotation.z = Math.PI / 2                       // แกน tilt ชี้ซ้าย-ขวา
    tilt.position.set(0.15, 0, -0.06)
    const body = box(0.2, 0.15, 0.24, color)
    body.position.set(0, 0, -0.06)
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.16, 12), new THREE.MeshLambertMaterial({ color: 0x111827 }))
    lens.rotation.x = Math.PI / 2
    lens.position.set(0, 0, -0.26)
    rig.add(grip, pan, panArm, roll, rollArm, rollDown, tiltArm, tilt, body, lens)
    const k = Math.min(3.5, Math.max(1.6, m.mountHeight / 0.45)) // ปลายด้าม (−0.45 ในหน่วยของ rig) ลงถึงพื้น
    rig.scale.setScalar(k)
    rig.position.set(0, m.mountHeight, 0)
    g.add(rig)
    if (lensLines) {
      const wedge = fovWedge(m.fov, m.range, color)
      wedge.position.y = m.mountHeight
      g.add(wedge)
    }
    top = m.mountHeight + 0.15 * k
  } else if (o.kind === 'mirrorless') {
    // กล้อง mirrorless บนขาตั้งถ่ายภาพ: ขาเรียว 3 ขา + แกนกลาง → หัวบอล → บอดี้เล็ก + เลนส์สั้น + จอ monitor เล็กบนตัว
    const grey = new THREE.MeshLambertMaterial({ color: 0x374151 })
    const legH = m.mountHeight - 0.35
    tripodLegs(g, legH, 0.35, 0.016, grey)
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.25, 8), grey)
    column.position.y = legH + 0.12
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshLambertMaterial({ color: 0x111827 }))
    ball.position.y = legH + 0.27
    const body = box(0.2, 0.14, 0.12, color)
    body.position.set(0, m.mountHeight, 0.02)
    const grip = box(0.05, 0.12, 0.1, '#111827')
    grip.position.set(0.11, m.mountHeight - 0.005, 0)
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.052, 0.17, 16), new THREE.MeshLambertMaterial({ color: 0x111827 }))
    lens.rotation.x = Math.PI / 2
    lens.position.set(0, m.mountHeight, -0.12)
    const monitor = box(0.14, 0.09, 0.02, '#1f2937')
    monitor.position.set(0, m.mountHeight + 0.14, 0.04)
    g.add(column, ball, body, grip, lens, monitor)
    if (lensLines) {
      const wedge = fovWedge(m.fov, m.range, color)
      wedge.position.y = m.mountHeight
      g.add(wedge)
    }
    top = m.mountHeight + 0.22
  } else if (o.kind === 'rack') {
    // ตู้ Rack 19" บนล้อ: ตัวตู้ + เครื่อง 1U/2U เรียงด้านหน้า (-z) พร้อมไฟสถานะ — จุดรวมสายในห้องคอนโทรล
    const { w, d, h } = m
    const wheel = 0.08
    const cab = box(w, h - wheel, d, color)
    cab.position.y = wheel + (h - wheel) / 2
    g.add(cab)
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10), new THREE.MeshLambertMaterial({ color: 0x111827 }))
      c.rotation.z = Math.PI / 2
      c.position.set((x * (w / 2 - 0.07)), 0.04, z * (d / 2 - 0.07))
      g.add(c)
    }
    const leds = ['#22c55e', '#3b82f6', '#f59e0b', '#22c55e']
    const unit = 0.13
    const rows = Math.max(1, Math.floor((h - wheel - 0.12) / unit))
    for (let i = 0; i < rows; i++) {
      const y = wheel + 0.08 + i * unit + unit / 2
      const panel = box(w * 0.86, unit * 0.78, 0.02, i % 3 === 0 ? '#9ca3af' : '#4b5563')
      panel.position.set(0, y, -d / 2 - 0.011)
      const led = box(0.03, 0.03, 0.01, leds[i % leds.length])
      led.position.set(w * 0.33, y, -d / 2 - 0.025)
      g.add(panel, led)
    }
  } else if (o.kind === 'tele_lens') {
    // กล้อง + เลนส์ tele แบบถือ (ENG เช่น Canon CJ45, Fujinon UA46x): ขาตั้ง 3 ขา → หัวแพน + ด้ามแพน → บอดี้กล้อง
    // → เลนส์ทรงกระบอกยาวยื่นไปหน้า มีแท่งรองเลนส์ด้านล่าง (เล็กกว่า box lens มาก ไม่มีกล่อง)
    const grey = new THREE.MeshLambertMaterial({ color: 0x4b5563 })
    const legH = m.mountHeight - 0.3
    tripodLegs(g, legH, 0.45, 0.028, grey)
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.1, 12), grey)
    bowl.position.y = legH + 0.04
    const panHead = box(0.22, 0.12, 0.26, '#111827')
    panHead.position.y = legH + 0.15
    const panBar = box(0.035, 0.035, 0.65, '#111827')
    panBar.position.set(0.14, legH + 0.16, 0.45)
    panBar.rotation.x = -0.35
    const body = box(0.2, 0.26, 0.42, color)
    body.position.set(0, m.mountHeight, 0.1)
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.62, 16), new THREE.MeshLambertMaterial({ color: 0x111827 }))
    lens.rotation.x = Math.PI / 2
    lens.position.set(0, m.mountHeight + 0.01, -0.42)
    const front = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.1, 16), new THREE.MeshLambertMaterial({ color: 0x374151 }))
    front.rotation.x = Math.PI / 2
    front.position.set(0, m.mountHeight + 0.01, -0.78)
    const support = box(0.04, 0.04, 0.5, '#6b7280')
    support.position.set(0, m.mountHeight - 0.13, -0.3)
    const vf = box(0.18, 0.14, 0.16, '#1f2937')
    vf.position.set(0, m.mountHeight + 0.2, -0.05)
    g.add(bowl, panHead, panBar, body, lens, front, support, vf)
    if (lensLines) {
      const wedge = fovWedge(m.fov, m.range, color)
      wedge.position.y = m.mountHeight
      g.add(wedge)
    }
    top = m.mountHeight + 0.3
  } else if (o.kind === 'box_lens') {
    // กล้อง Box Lens: ขาตั้งงานหนัก 3 ขา + spreader → หัวแพน + ด้ามแพน → บอดี้กล้อง → เลนส์กล่องใหญ่ยื่นไปหน้า + จอ viewfinder บนตัว
    const grey = new THREE.MeshLambertMaterial({ color: 0x4b5563 })
    const legH = m.mountHeight - 0.35
    tripodLegs(g, legH, 0.55, 0.035, grey)
    const spreader = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.03, 3), grey)
    spreader.position.y = 0.25
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.14, 12), grey)
    bowl.position.y = legH + 0.05
    const panHead = box(0.3, 0.14, 0.34, '#111827')
    panHead.position.y = legH + 0.19
    const panBar = box(0.04, 0.04, 0.8, '#111827')
    panBar.position.set(0.18, legH + 0.2, 0.55)
    panBar.rotation.x = -0.35
    const body = box(0.34, 0.36, 0.55, color)
    body.position.set(0, m.mountHeight, 0.12)
    const lensBox = box(0.36, 0.42, 0.9, '#111827')
    lensBox.position.set(0, m.mountHeight + 0.02, -0.6)
    const hood = box(0.42, 0.36, 0.08, '#374151')
    hood.position.set(0, m.mountHeight + 0.02, -1.08)
    const vf = box(0.26, 0.2, 0.22, '#1f2937')
    vf.position.set(0, m.mountHeight + 0.3, -0.15)
    g.add(spreader, bowl, panHead, panBar, body, lensBox, hood, vf)
    if (lensLines) {
      const wedge = fovWedge(m.fov, m.range, color)
      wedge.position.y = m.mountHeight
      g.add(wedge)
    }
    top = m.mountHeight + 0.45
  } else if (o.kind === 'ptz') {
    // กล้อง PTZ: ขาตั้งสามขา + เสา → ฐานเหลี่ยม (มอเตอร์ pan) → แอก U → หัวกล้องทรงกระบอกนอน + เลนส์หน้า
    const grey = new THREE.MeshLambertMaterial({ color: 0x4b5563 })
    const baseH = m.mountHeight - 0.32
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, Math.max(0.1, baseH - 0.2), 8), grey)
    pole.position.y = 0.2 + Math.max(0.1, baseH - 0.2) / 2
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.45, 0.2, 3), grey)
    foot.position.y = 0.1
    const base = box(0.34, 0.14, 0.34, '#e5e7eb')
    base.position.y = baseH + 0.07
    const yokeL = box(0.04, 0.26, 0.16, '#d1d5db')
    yokeL.position.set(-0.15, baseH + 0.27, 0)
    const yokeR = yokeL.clone()
    yokeR.position.x = 0.15
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.26, 20), new THREE.MeshLambertMaterial({ color: new THREE.Color(color) }))
    head.rotation.z = Math.PI / 2
    head.position.y = m.mountHeight
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 16), new THREE.MeshLambertMaterial({ color: 0x111827 }))
    glass.rotation.x = Math.PI / 2
    glass.position.set(0, m.mountHeight, -0.12)
    g.add(foot, pole, base, yokeL, yokeR, head, glass)
    if (lensLines) {
      const wedge = fovWedge(m.fov, m.range, color)
      wedge.position.y = m.mountHeight
      g.add(wedge)
    }
    top = m.mountHeight + 0.2
  } else if (o.kind === 'action_cam') {
    // Action cam บนไม้ถือสั้น: ด้าม + ข้อต่อ + กล้องกล่องเล็ก + เลนส์กลมหน้ากล้อง
    // ไม่วาดคน — ขยายให้ปลายด้ามแตะพื้น (ของจริงเล็กมาก มองไม่เห็นเมื่อดูทั้งฮอลล์) กล้องอยู่ที่ mountHeight
    const rig = new THREE.Group()
    const dark = new THREE.MeshLambertMaterial({ color: 0x1f2937 })
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.34, 10), dark)
    stick.position.y = -0.23
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 10), new THREE.MeshLambertMaterial({ color: 0x374151 }))
    grip.position.y = -0.34
    const joint = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), dark)
    joint.position.y = -0.05
    const cam = box(0.07, 0.05, 0.035, color)
    const lensC = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 14), new THREE.MeshLambertMaterial({ color: 0x111827 }))
    lensC.rotation.x = Math.PI / 2
    lensC.position.set(-0.012, 0.004, -0.023)
    rig.add(stick, grip, joint, cam, lensC)
    const k = Math.min(4.5, Math.max(2, m.mountHeight / 0.4)) // ปลายด้าม (−0.4 ในหน่วยของ rig) ลงถึงพื้น
    rig.scale.setScalar(k)
    rig.position.set(0, m.mountHeight, 0)
    g.add(rig)
    if (lensLines) {
      const wedge = fovWedge(m.fov, m.range, color)
      wedge.position.y = m.mountHeight
      g.add(wedge)
    }
    top = m.mountHeight + 0.05 * k
  } else if (o.kind === 'remote_head') {
    // Remote head (หัว Jimmy Jib ไม่มีตัวเครน): ท่อน truss ด้านบน → ก้านห้อย → มอเตอร์ pan → แอกคว่ำ (U หัวกลับ) จับกล้องใต้หัว
    const dark = new THREE.MeshLambertMaterial({ color: 0x111827 })
    const truss = box(1.6, 0.3, 0.3, '#9ca3af')
    truss.position.y = m.mountHeight + 1.05
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.55, 8), new THREE.MeshLambertMaterial({ color: 0x4b5563 }))
    rod.position.y = m.mountHeight + 0.62
    const clamp = box(0.2, 0.08, 0.34, '#4b5563')
    clamp.position.y = m.mountHeight + 0.9
    const panH = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.14, 16), dark)
    panH.position.y = m.mountHeight + 0.3
    const plate = box(0.66, 0.05, 0.2, '#111827')
    plate.position.y = m.mountHeight + 0.22
    const armL = box(0.05, 0.36, 0.14, '#111827')
    armL.position.set(-0.3, m.mountHeight + 0.04, 0)
    const armR = armL.clone()
    armR.position.x = 0.3
    const tiltL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 12), dark)
    tiltL.rotation.z = Math.PI / 2
    tiltL.position.set(-0.3, m.mountHeight, 0)
    const tiltR = tiltL.clone()
    tiltR.position.x = 0.3
    const hBody = box(0.4, 0.3, 0.6, color)
    hBody.position.y = m.mountHeight
    const hLens = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.35, 12), dark)
    hLens.rotation.x = Math.PI / 2
    hLens.position.set(0, m.mountHeight, -0.47)
    g.add(truss, rod, clamp, panH, plate, armL, armR, tiltL, tiltR, hBody, hLens)
    if (lensLines) {
      const wedge = fovWedge(m.fov, m.range, color)
      wedge.position.y = m.mountHeight
      g.add(wedge)
    }
    top = m.mountHeight + 1.2
  } else if (o.kind === 'micro_stand') {
    // ขา Micro: เสา + ฐานสามขา + แอก (yoke) รูปตัว U จับกล้องเล็กที่ระดับ mountHeight — ไม่มีคนประจำ
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, m.mountHeight - 0.25, 8), new THREE.MeshLambertMaterial({ color: 0x4b5563 }))
    pole.position.y = (m.mountHeight - 0.25) / 2
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.5, 0.25, 3), new THREE.MeshLambertMaterial({ color: 0x4b5563 }))
    foot.position.y = 0.125
    const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 16), new THREE.MeshLambertMaterial({ color: 0x111827 }))
    pan.position.y = m.mountHeight - 0.3
    const armL = box(0.05, 0.4, 0.12, '#111827')
    armL.position.set(-0.26, m.mountHeight - 0.08, 0)
    const armR = armL.clone()
    armR.position.x = 0.26
    const body = box(0.4, 0.3, 0.6, color)
    body.position.y = m.mountHeight
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.35, 12), new THREE.MeshLambertMaterial({ color: 0x111827 }))
    lens.rotation.x = Math.PI / 2
    lens.position.set(0, m.mountHeight, -0.47)
    g.add(pole, foot, pan, armL, armR, body, lens)
    if (lensLines) {
      const wedge = fovWedge(m.fov, m.range, color)
      wedge.position.y = m.mountHeight
      g.add(wedge)
    }
    top = m.mountHeight + 0.3
  } else if (o.kind === 'dolly') {
    // ราง dolly: หมอนรอง + ราง 2 เส้นตามแกน x (ยาว w) → รถ dolly กลางราง + ล้อ → เสา pedestal → หัวกล้อง + เลนส์หันไป -z
    const railW = Math.min(m.d, 1.2)
    const dark = new THREE.MeshLambertMaterial({ color: 0x374151 })
    const steel = new THREE.MeshLambertMaterial({ color: 0x9ca3af })
    const n = Math.max(2, Math.round(m.w / 0.6) + 1)
    for (let i = 0; i < n; i++) {
      const sl = box(0.12, 0.04, railW + 0.2, '#78716c')
      sl.position.set(-m.w / 2 + (i * m.w) / (n - 1), 0.02, 0)
      g.add(sl)
    }
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, m.w, 10), steel)
      rail.rotation.z = Math.PI / 2
      rail.position.set(0, 0.07, (side * railW) / 2)
      g.add(rail)
    }
    const deck = box(0.9, 0.08, railW + 0.1, color)
    deck.position.y = 0.17
    g.add(deck)
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), dark)
      wheel.rotation.x = Math.PI / 2
      wheel.position.set(x * 0.32, 0.11, (z * railW) / 2)
      g.add(wheel)
    }
    const colH = Math.max(0.2, m.mountHeight - 0.4)
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, colH, 10), dark)
    column.position.y = 0.21 + colH / 2
    const head = box(0.4, 0.35, 0.6, color)
    head.position.y = m.mountHeight
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.4, 12), new THREE.MeshLambertMaterial({ color: 0x111827 }))
    lens.rotation.x = Math.PI / 2
    lens.position.set(0, m.mountHeight, -0.48)
    const seat = box(0.3, 0.06, 0.3, '#111827')
    seat.position.set(0.32, 0.55, 0.3)
    const seatPost = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.34, 6), dark)
    seatPost.position.set(0.32, 0.38, 0.3)
    g.add(column, head, lens, seat, seatPost)
    if (lensLines) {
      const wedge = fovWedge(m.fov, m.range, color)
      wedge.position.y = m.mountHeight
      g.add(wedge)
    }
    top = m.mountHeight + 0.3
  } else if (o.kind === 'jib') {
    const base = box(m.w, m.h, m.w, '#4b5563')
    base.position.y = m.h / 2
    // แขน jib: จากฐานยื่นไปข้างหน้า ปลายสูงเท่า mountHeight
    const arm = box(0.18, 0.18, m.d, color)
    const rise = m.mountHeight - m.h
    arm.position.set(0, m.h + rise / 2, -m.d / 2 + m.w / 2)
    arm.rotation.x = Math.atan2(rise, m.d)
    const head = box(0.4, 0.35, 0.6, color)
    head.position.set(0, m.mountHeight, -m.d + m.w / 2)
    g.add(base, arm, head)
    if (lensLines) {
      const wedge = fovWedge(m.fov, m.range, color)
      wedge.position.copy(head.position)
      g.add(wedge)
    }
    top = m.mountHeight + 0.3
  } else if (o.kind === 'control_room') {
    // ห้องคอนโทรล: พื้นห้อง + ผนังโปร่งใส (มองเห็นข้างใน) + กรอบเส้นขอบ · ประตูช่องว่างที่ผนังหน้า (-z) · ข้างในโต๊ะยาว + จอ 3 จอหันหาผนังหลัง
    const { w, d, h } = m
    const t = 0.12
    const floor = box(w, 0.08, d, '#e2e8f0')
    floor.position.y = 0.04
    // ผนังโปร่ง — ไม่เขียน depth ไม่งั้นบังโต๊ะ/จอข้างใน
    const wall = (ww: number, hh: number, dd: number) => { const mesh = box(ww, hh, dd, color, 0.28); (mesh.material as THREE.Material).depthWrite = false; return mesh }
    const back = wall(w, h, t); back.position.set(0, h / 2, d / 2 - t / 2)
    const left = wall(t, h, d); left.position.set(-w / 2 + t / 2, h / 2, 0)
    const right = wall(t, h, d); right.position.set(w / 2 - t / 2, h / 2, 0)
    const door = Math.min(1.2, w * 0.3)
    const seg = (w - door) / 2
    const frontL = wall(seg, h, t); frontL.position.set(-w / 2 + seg / 2, h / 2, -d / 2 + t / 2)
    const frontR = wall(seg, h, t); frontR.position.set(w / 2 - seg / 2, h / 2, -d / 2 + t / 2)
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), new THREE.LineBasicMaterial({ color }))
    frame.position.y = h / 2
    frame.raycast = () => {}
    const deskW = Math.min(w - 0.8, 4)
    const desk = box(deskW, 0.75, 0.8, '#475569')
    desk.position.set(0, 0.375, d / 2 - 0.9)
    g.add(floor, back, left, right, frontL, frontR, frame, desk)
    for (let i = -1; i <= 1; i++) {
      const mon = box(deskW / 3.6, 0.45, 0.06, '#111827')
      mon.position.set((i * deskW) / 3, 1.05, d / 2 - 0.65)
      g.add(mon)
    }
  } else if (o.kind === 'screen') {
    // จอยกลอยจากพื้น 1.5 ม. หน้าจอหันไป -z (ด้านหน้าของวัตถุ)
    const panel = box(m.w, m.h, m.d, color)
    panel.position.y = 1.5 + m.h / 2
    const face = box(m.w * 0.96, m.h * 0.94, 0.02, '#3b82f6')
    face.position.set(0, panel.position.y, -m.d / 2 - 0.02)
    g.add(panel, face)
    top = 1.5 + m.h
  } else if (o.kind === 'podium') {
    // แท่นพูด: ตัวตู้ + ท็อปลาดเอียงลงหาผู้พูด (+z) + ป้ายหน้า (-z) + ไมค์คอห่าน
    const bodyH = m.h * 0.92
    const body = box(m.w, bodyH, m.d, color)
    body.position.y = bodyH / 2
    const lid = box(m.w + 0.08, 0.04, m.d + 0.08, color)
    lid.position.y = bodyH + (m.h - bodyH) / 2
    lid.rotation.x = Math.atan2(m.h - bodyH, m.d) // ขอบหน้า (-z) สูงกว่า ลาดลงหาผู้พูด
    const sign = box(m.w * 0.7, bodyH * 0.35, 0.02, '#f3f4f6')
    sign.position.set(0, bodyH * 0.7, -m.d / 2 - 0.011)
    const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 6), new THREE.MeshLambertMaterial({ color: 0x111827 }))
    mic.position.set(0, bodyH + 0.22, -m.d / 2 + 0.12)
    mic.rotation.x = 0.5
    g.add(body, lid, sign, mic)
  } else {
    const body = box(m.w, m.h, m.d, color, o.kind === 'riser' ? 0.85 : 1)
    body.position.y = m.h / 2
    // Riser เป็นพื้นผิวที่วางของทับได้ เหมือนเวที/อัฒจันทร์ — กล้องที่ลากมาจะขึ้นไปอยู่บนแท่น
    if (o.kind === 'riser') body.userData.ground = true
    g.add(body)
    // ขีดบอกด้านหน้า
    const nose = box(Math.min(0.4, m.w / 3), 0.06, 0.3, '#ffffff')
    nose.position.set(0, m.h + 0.03, -m.d / 2 + 0.2)
    g.add(nose)
  }

  // ใต้อัฒจันทร์: ขั้นอัฒจันทร์เป็นก้อนทึบ → วาดแบบ x-ray (ไม่เทสต์ความลึก วาดทับทีหลัง) ให้เห็นห้องทะลุที่นั่ง
  if (o.underTier) {
    g.traverse((c) => {
      const mesh = c as THREE.Mesh
      if (!mesh.material) return
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        mat.depthTest = false
        mat.transparent = true
        mat.opacity = Math.min(mat.opacity, 0.85)
      }
      c.renderOrder = 6
    })
  }

  // กรวยมุมภาพออกจากก้อนที่ขยาย: ตำแหน่งคูณ S ให้ตรงเลนส์ แต่ระยะ/มุมคงค่าจริง
  for (const w of g.children.filter((c) => c.userData.wedge)) {
    g.remove(w)
    w.position.multiplyScalar(E)
    root.add(w)
  }
  top *= E

  if (selected) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(Math.max(m.w, m.d, 1.2) * 0.75 * E, Math.max(m.w, m.d, 1.2) * 0.75 * E + 0.18, 40),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, depthTest: false }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.06
    ring.raycast = () => {}
    ring.renderOrder = 9
    root.add(ring)
  }

  // โพเดียมไม่ต้องมีป้าย — รูปทรงบอกอยู่แล้ว และมักวางกลางเวทีบังป้ายกล้อง
  if (o.kind === 'podium') return root

  const label = makeLabel(o.label, color, labelSize)
  label.position.y = top + labelSize * 0.9
  markLabel(label, false)
  // เส้นโยงจากตัววัตถุไปหาป้าย — โชว์เฉพาะตอนป้ายถูกขยับหนีป้ายอื่น (declutterLabels)
  const leader = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, top, 0), label.position.clone()]),
    new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.8 }),
  )
  leader.visible = false
  leader.renderOrder = 9
  leader.raycast = () => {}
  label.userData.leader = leader
  label.userData.leaderFrom = new THREE.Vector3(0, top, 0)
  root.add(leader, label)
  return root
}

// ── การควบคุมมุมมอง (ใช้ทั้งตัวแก้และหน้าแชร์) ─────────────────────────────────
/**
 * OrbitControls ค่าเริ่มต้นซูมเข้าหา "จุดหมุน" กลางสถานที่ → ยิ่งซูมใกล้ยิ่งช้าจนหยุด และแพนได้ทีละนิดเพราะความเร็วแพนแปรตามระยะ
 * zoomToCursor = ซูมไปหาตำแหน่งเมาส์ (จุดหมุนเลื่อนตาม) · screenSpacePanning = แพนตามระนาบจอ
 */
export function tuneOrbit(controls: { zoomToCursor: boolean; screenSpacePanning: boolean; minDistance: number; zoomSpeed: number; panSpeed: number }) {
  controls.zoomToCursor = true
  controls.screenSpacePanning = true
  controls.minDistance = 1
  controls.zoomSpeed = 1.3
  controls.panSpeed = 1.2
}

/** ดับเบิลคลิก → ย้ายจุดหมุนไปที่จุดนั้น แล้วขยับกล้องเข้าไปใกล้ (ไม่เกิน dist ม.) โดยคงมุมมองเดิม */
export function focusAt(camera: THREE.Camera, controls: { target: THREE.Vector3; update: () => void }, point: THREE.Vector3, dist = 20) {
  const offset = camera.position.clone().sub(controls.target)
  const len = Math.min(offset.length(), dist)
  controls.target.copy(point)
  camera.position.copy(point).add(offset.setLength(Math.max(len, 2)))
  controls.update()
}

// ── แนวสาย ─────────────────────────────────────────────────────────────────
// สายวาดแนบผิว (พื้น/เวที/ขั้นอัฒจันทร์) โดยสุ่มจุดทุก CABLE_STEP ม. ตามแนวที่ผู้ใช้ลาก แล้วยิง ray ลงหาผิวบนสุด
// → ความยาวที่ได้รวมขึ้น-ลงขั้นบันไดแล้ว · ป้ายบอกความยาวเผื่อ CABLE_SLACK ปัดขึ้นทีละ 5 ม. (ขนาดม้วนสายที่ต้องเบิก)

const CABLE_STEP = 0.5
export const CABLE_SLACK = 0.1

export interface CableRun { cable: LayoutCable; path: THREE.Vector3[]; length: number; underTier: boolean }

/** ผิวที่วางของ/เดินสายได้ในกลุ่มนี้ (userData.ground) — ต้อง updateMatrixWorld ก่อน */
export function groundsOf(root: THREE.Object3D): THREE.Object3D[] {
  const out: THREE.Object3D[] = []
  root.traverse((o) => { if (o.userData.ground) out.push(o) })
  return out
}

const DOWN = new THREE.Vector3(0, -1, 0)
function surfaceAt(grounds: THREE.Object3D[], x: number, z: number): number {
  const hit = firstGroundHit(new THREE.Raycaster(new THREE.Vector3(x, 500, z), DOWN).intersectObjects(grounds, false))
  return hit ? Math.max(0, hit.point.y) : 0
}

/** เส้นทางจริงของสายแต่ละเส้น (แนบผิว) + ความยาว — วัตถุต้นทาง/ปลายทางหาย = ข้ามเส้นนั้น */
export function cableRuns(layout: PlanLayout, grounds: THREE.Object3D[]): CableRun[] {
  const byId = new Map(layout.objects.map((o) => [o.id, o]))
  return (layout.cables ?? []).flatMap((cable) => {
    const a = byId.get(cable.from)
    const b = byId.get(cable.to)
    if (!a || !b) return []
    const pts = [{ x: a.x, z: a.z }, ...cable.points, { x: b.x, z: b.z }]
    const path: THREE.Vector3[] = []
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1]
      const n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / CABLE_STEP))
      for (let k = i === 0 ? 0 : 1; k <= n; k++) {
        const x = p.x + ((q.x - p.x) * k) / n
        const z = p.z + ((q.z - p.z) * k) / n
        path.push(new THREE.Vector3(x, surfaceAt(grounds, x, z), z))
      }
    }
    // ปลายทั้งสองอยู่ที่ระดับวัตถุ (อาจยืนบน riser ซึ่งไม่อยู่ในผิวของสถานที่)
    path[0].y = Math.max(path[0].y, a.y)
    path[path.length - 1].y = Math.max(path[path.length - 1].y, b.y)
    // ปลายที่อยู่ใต้อัฒจันทร์: สายวิ่งบนพื้นจริงใต้ที่นั่งจนโผล่ออกพื้นโล่ง แล้วค่อยแนบผิวตามปกติ
    const under = (end: LayoutObject, idx: number[]) => {
      if (!end.underTier) return
      for (const i of idx) { if (path[i].y <= 0.05) break; path[i].y = end.y }
    }
    under(a, path.map((_, i) => i))
    under(b, path.map((_, i) => path.length - 1 - i))
    let length = 0
    for (let i = 1; i < path.length; i++) length += path[i].distanceTo(path[i - 1])
    return [{ cable, path, length, underTier: !!(a.underTier || b.underTier) }]
  })
}

/** ความยาวที่ต้องเบิก: + CABLE_SLACK แล้วปัดขึ้นทีละ 5 ม. */
export function cableOrderLength(length: number): number {
  return Math.max(5, Math.ceil((length * (1 + CABLE_SLACK)) / 5) * 5)
}

/** วาดสาย: ท่อสีตามชนิดสัญญาณ + ป้ายความยาวกลางเส้น · selected = หนาขึ้นและมีจุดหักเลี้ยวให้ลาก (userData.cablePoint) */
export function buildCables(runs: CableRun[], labelSize: number, selectedId?: string | null, showLabels = true): THREE.Group {
  const g = new THREE.Group()
  for (const { cable, path, length, underTier } of runs) {
    const color = signalMeta(cable.signal).color
    const selected = cable.id === selectedId
    const lifted = path.map((p) => p.clone().setY(p.y + 0.08))
    const curve = new THREE.CatmullRomCurve3(lifted, false, 'catmullrom', 0) // tension 0 = แนวตรงตามจุด ไม่โค้งเกิน
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, Math.max(8, lifted.length * 2), selected ? 0.2 : 0.11, 6, false),
      new THREE.MeshLambertMaterial({ color, emissive: selected ? 0x333333 : 0x000000 }),
    )
    tube.userData.cableId = cable.id
    // สายจากห้องใต้อัฒจันทร์ลอดใต้ที่นั่ง → วาดมองทะลุเหมือนตัวห้อง
    if (underTier) {
      const mat = tube.material as THREE.Material
      mat.depthTest = false
      mat.transparent = true
      mat.opacity = 0.9
      tube.renderOrder = 5
    }
    g.add(tube)
    if (showLabels) {
      const mid = lifted[Math.floor(lifted.length / 2)]
      const label = makeLabel(`${cable.label?.trim() || signalMeta(cable.signal).label} ${cableOrderLength(length)} ม.`, color, labelSize * 0.6)
      label.position.set(mid.x, mid.y + labelSize * 0.6, mid.z)
      markLabel(label, false)
      g.add(label)
    }
    if (selected) {
      cable.points.forEach((pt, index) => {
        const y = path.reduce((best, p) => (Math.hypot(p.x - pt.x, p.z - pt.z) < Math.hypot(best.x - pt.x, best.z - pt.z) ? p : best), path[0]).y
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), new THREE.MeshLambertMaterial({ color: 0xf59e0b }))
        knob.position.set(pt.x, y + 0.3, pt.z)
        knob.userData.cablePoint = { cableId: cable.id, index }
        g.add(knob)
      })
    }
  }
  return g
}

/** เส้นร่างระหว่างกำลังลากสาย (ยังไม่แนบผิว) */
export function buildCableDraft(points: THREE.Vector3[]): THREE.Group {
  const g = new THREE.Group()
  if (points.length < 2) return g
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points.map((p) => p.clone().setY(p.y + 0.15))),
    new THREE.LineDashedMaterial({ color: 0xf59e0b, dashSize: 1, gapSize: 0.6, depthTest: false }),
  )
  line.computeLineDistances()
  line.renderOrder = 11
  line.raycast = () => {}
  g.add(line)
  for (const p of points.slice(0, -1)) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), new THREE.MeshBasicMaterial({ color: 0xf59e0b }))
    dot.position.copy(p).setY(p.y + 0.15)
    dot.raycast = () => {}
    g.add(dot)
  }
  return g
}

/**
 * ความยาวสายทุกเส้นโดยไม่ต้องมี renderer (หน้าพิมพ์/ตาราง)
 * model = โมเดล .glb ที่โหลดแล้ว (จัดตำแหน่งแล้ว) — สายแนบผิวโมเดลแทนสถานที่จากตัวเลข
 */
export function measureCables(layout: PlanLayout, model?: THREE.Object3D | null): { cable: LayoutCable; length: number }[] {
  if (!layout.cables?.length) return []
  const venue = buildVenue(layout.venue, { shell: model ? venueShell(layout.venue, 'mesh') : 'normal' })
  venue.updateMatrixWorld(true)
  const runs = cableRuns(layout, [...groundsOf(venue), ...(model ? groundsOf(model) : [])]).map(({ cable, length }) => ({ cable, length }))
  disposeGroup(venue)
  return runs
}

/** ทิ้ง geometry/material ทั้งก้อน — ข้ามก้อนที่ userData.keep (โมเดลสถานที่/SparkRenderer ที่ใช้ซ้ำข้ามการสร้างฉากใหม่) */
export function disposeGroup(group: THREE.Object3D): void {
  if (group.userData.keep) return
  const mesh = group as THREE.Mesh
  mesh.geometry?.dispose?.()
  const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
  // texture ของ label อยู่ใน cache ใช้ซ้ำ — ไม่ dispose ที่นี่
  mats.forEach((m) => m.dispose())
  for (const child of group.children) disposeGroup(child)
}

export function addLights(scene: THREE.Scene): void {
  scene.add(new THREE.AmbientLight(0xffffff, 1.6))
  const sun = new THREE.DirectionalLight(0xffffff, 1.8)
  sun.position.set(60, 120, 80)
  scene.add(sun)
}

/** ตำแหน่ง/ทิศของเลนส์ — ใช้ทำ "มองจากกล้องตัวนี้" */
export function cameraPose(o: LayoutObject) {
  const m = objectDims(o)
  const yaw = deg(o.rotation)
  const flat = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw))
  const pos = new THREE.Vector3(o.x, o.y + m.mountHeight, o.z)
  if (o.kind === 'jib') pos.addScaledVector(flat, m.d - m.w / 2)
  const tilt = deg(o.tilt ?? 0)
  const dir = new THREE.Vector3(flat.x * Math.cos(tilt), -Math.sin(tilt), flat.z * Math.cos(tilt))
  return { pos, dir, fov: m.fov }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/**
 * render ผังเป็นรูป (data URL) สำหรับหน้า print — สร้าง renderer ชั่วคราวแล้วทิ้ง
 * pixelRatio 2 = รูปจริงใหญ่เป็น 2 เท่าของ width/height ซูมดูบนจอ/พิมพ์แล้วยังคม
 */
const PRINT_LABEL_BOOST = 2
const PRINT_MODEL_BOOST = 2

/** model = โมเดล .glb ของสถานที่ที่โหลด+จัดตำแหน่งแล้ว (ไฟล์สแกนไม่ลงหน้าพิมพ์ — ใช้สถานที่จากตัวเลข) */
export async function snapshotLayout(
  layout: PlanLayout, view: 'top' | 'perspective', floorImageSrc?: string | null, width = 1800, height = 1100, lensLines = true, pixelRatio = 2,
  labelScale = 1, model?: THREE.Object3D | null,
): Promise<string> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(pixelRatio)
  renderer.setSize(width, height, false)
  renderer.localClippingEnabled = true // ระดับตัดหลังคาของโมเดล
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xffffff)
  addLights(scene)
  const img = floorImageSrc ? await loadImage(floorImageSrc).catch(() => null) : null
  const venue = buildVenue(layout.venue, { floorImage: img, shell: model ? venueShell(layout.venue, 'mesh') : 'normal' })
  scene.add(venue)
  if (model) scene.add(model)
  // กระดาษ A4 ย่อทั้งสถานที่ → ป้ายและกล้องขนาดเท่าบนจอเล็กจนอ่านไม่ออก ขยายเพิ่มเฉพาะหน้าพิมพ์
  const size = labelSizeFor(layout.venue, labelScale) * PRINT_LABEL_BOOST
  layout.objects.forEach((o) => scene.add(buildObject(o, size, false, lensLines, PRINT_MODEL_BOOST)))
  venue.updateMatrixWorld(true)
  scene.add(buildCables(cableRuns(layout, [...groundsOf(venue), ...(model ? groundsOf(model) : [])]), size))

  const e = venueExtent(layout.venue)
  const cx = (e.minX + e.maxX) / 2
  const cz = (e.minZ + e.maxZ) / 2
  const spanX = e.maxX - e.minX
  const spanZ = e.maxZ - e.minZ
  let camera: THREE.Camera
  if (view === 'top') {
    // กระดาษแนวนอน → ถ้าสถานที่ลึกกว่ากว้าง หมุนให้แกนลึกไปตามแนวยาวของกระดาษ
    const rotate = spanZ > spanX
    const [a, b] = rotate ? [spanZ, spanX] : [spanX, spanZ]
    const scale = Math.max(a / width, b / height) * 1.08
    const cam = new THREE.OrthographicCamera(-width * scale / 2, width * scale / 2, height * scale / 2, -height * scale / 2, 0.1, 2000)
    cam.position.set(cx, 500, cz)
    cam.up.set(rotate ? 1 : 0, 0, rotate ? 0 : -1)
    cam.lookAt(cx, 0, cz)
    camera = cam
  } else {
    const cam = new THREE.PerspectiveCamera(40, width / height, 0.5, 5000)
    const span = Math.max(spanX, spanZ)
    cam.position.set(cx + span * 0.55, span * 0.6, e.maxZ + span * 0.45)
    cam.lookAt(cx, 0, cz - spanZ * 0.1)
    camera = cam
  }
  scene.updateMatrixWorld(true)
  declutterLabels(scene, camera, width, height)
  renderer.render(scene, camera)
  const url = renderer.domElement.toDataURL('image/jpeg', 0.92)
  model?.removeFromParent() // โมเดลใช้ต่อในรูปถัดไป — ไม่ทิ้ง
  disposeGroup(scene)
  renderer.dispose()
  renderer.forceContextLoss()
  return url
}

/** วัตถุที่ "ยืนอยู่บน" riser ตัวนี้ — ใช้ตอนย้าย riser ให้ของบนแท่นตามไปด้วย */
export function ridersOf(riser: LayoutObject, all: LayoutObject[]): LayoutObject[] {
  const m = objectDims(riser)
  const t = deg(riser.rotation)
  return all.filter((o) => {
    if (o.id === riser.id || Math.abs(o.y - (riser.y + m.h)) > 0.15) return false
    const dx = o.x - riser.x
    const dz = o.z - riser.z
    // world → พิกัดท้องถิ่นของแท่น (แท่นหมุนด้วย rotation.y = -t)
    const lx = dx * Math.cos(t) + dz * Math.sin(t)
    const lz = -dx * Math.sin(t) + dz * Math.cos(t)
    return Math.abs(lx) <= m.w / 2 && Math.abs(lz) <= m.d / 2
  })
}
