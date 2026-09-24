import * as THREE from 'three'
import type { LayoutObject, PlanLayout, VenueConfig } from '../types'
import { KIND_DEFAULTS, kindMeta } from './venues'

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

export function labelSizeFor(v: VenueConfig): number {
  // ป้ายเล็กลง ~30% จากเดิม (/40, 1.2–5) — ของวางชิดกันแล้วป้ายทับกันจนอ่านไม่ออก
  return Math.min(3.5, Math.max(0.8, Math.max(v.width, v.depth) / 56))
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

function floorMaterial(repeatX: number, repeatY: number): THREE.MeshLambertMaterial {
  const map = gridTexture().clone()
  map.repeat.set(repeatX, repeatY)
  map.needsUpdate = true
  return new THREE.MeshLambertMaterial({ map })
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

const AISLE_COLOR = 0xeee3cc // ทางเดินบนอัฒจันทร์ — สีทรายอ่อน แยกจากที่นั่งสีเทาฟ้า

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

/** สร้างสถานที่: พื้น, เวที, อัฒจันทร์, กรอบปริมาตร, grid 5 ม. และรูป floor plan (ถ้ามี) */
export function buildVenue(v: VenueConfig, floorImage?: HTMLImageElement | null): THREE.Group {
  const g = new THREE.Group()

  const curved = v.shape === 'arena' && !!v.tiers?.curved
  if (curved) {
    // พื้นวงรี — width/depth เป็นแกนของวงรี; UV ของ ExtrudeGeometry = พิกัดเมตร → repeat 1/5 = ช่อง 5 ม.
    const floor = ellipseSlab(v.width / 2, v.depth / 2, null, 0.2, 0xe5e7eb)
    floor.material = floorMaterial(1 / 5, 1 / 5)
    floor.position.y = -0.2
    g.add(floor)
  } else {
    const floor = groundBox(v.width, 0.2, v.depth, 0xe5e7eb)
    floor.material = floorMaterial(v.width / 5, v.depth / 5)
    floor.position.y = -0.1
    g.add(floor)
  }

  if (v.pitch) {
    // สนามกีฬากลาง — พื้นเขียว + เส้นขอบขาว วางเหนือพื้นนิดเดียว (ไม่ใช่ ground แยก พื้นหลักรับการวางอยู่แล้ว)
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(v.pitch.width, v.pitch.depth), new THREE.MeshLambertMaterial({ color: 0x86c98a }))
    grass.rotation.x = -Math.PI / 2
    grass.position.y = 0.05
    grass.raycast = () => {}
    const line = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(v.pitch.width, v.pitch.depth)),
      new THREE.LineBasicMaterial({ color: 0xffffff }),
    )
    line.rotation.x = -Math.PI / 2
    line.position.y = 0.08
    g.add(grass, line)
  }

  if (v.stage.enabled) {
    const s = v.stage
    const stage = groundBox(s.width, s.height, s.depth, 0x374151)
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
    for (let i = 0; i < steps; i++) {
      const h = rise * (i + 1)
      const shade = i % 2 === 0 ? 0xcbd5e1 : 0xb6c2d2
      if (curved) {
        // ชามวงรี: แต่ละขั้นเป็นวงแหวนวงรี ล้อมรอบพื้นทุกด้าน
        const a = v.width / 2 + run * i
        const b = v.depth / 2 + run * i
        g.add(ellipseSlab(a + run, b + run, [a, b], h, shade))
        continue
      }
      const isCross = cross > 0 && i === cross - 1 // ทั้งขั้นเป็นทางเดินขวาง
      // วางขั้นเป็นท่อนๆ ตามแนว axis — ช่วงที่ตรงกับทางเดินใช้สีทางเดิน (ยังเป็นผิวที่วางของได้)
      const tierRow = (axis: 'x' | 'z', a0: number, a1: number, fixed: number, gaps: [number, number][]) => {
        for (const [s0, s1, aisle] of splitSpan(a0, a1, isCross ? [] : gaps)) {
          const len = s1 - s0
          const color = isCross || aisle ? AISLE_COLOR : shade
          const box = axis === 'z' ? groundBox(run, h, len, color) : groundBox(len, h, run, color)
          if (axis === 'z') box.position.set(fixed, h / 2, (s0 + s1) / 2)
          else box.position.set((s0 + s1) / 2, h / 2, fixed)
          g.add(box)
        }
      }
      if (sides) {
        // ขั้นด้านข้างยืดไปคลุมมุมด้วย → มุมสูง = max(ขั้นข้าง, ขั้นหน้า/หลัง) ไม่มีรู
        const extBack = back ? run * (i + 1) : 0
        const extFront = front ? run * (i + 1) : 0
        for (const sign of [-1, 1]) tierRow('z', -v.depth / 2 - extFront, v.depth / 2 + extBack, sign * (v.width / 2 + run * i + run / 2), sideGaps)
      }
      const endHalf = v.width / 2 + (sides ? run * (i + 1) : 0)
      if (back) tierRow('x', -endHalf, endHalf, v.depth / 2 + run * i + run / 2, endGaps)
      if (front) tierRow('x', -endHalf, endHalf, -(v.depth / 2 + run * i + run / 2), endGaps)
    }
  }

  if (floorImage) {
    const w = v.floorImageWidth || v.width
    const d = w * (floorImage.naturalHeight / floorImage.naturalWidth)
    const tex = new THREE.Texture(floorImage)
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
  const bounds = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(e.maxX - e.minX, e.topY, e.maxZ - e.minZ)),
    new THREE.LineBasicMaterial({ color: 0x9ca3af }),
  )
  bounds.position.set((e.minX + e.maxX) / 2, e.topY / 2, (e.minZ + e.maxZ) / 2)
  g.add(bounds)

  return g
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
export function buildObject(o: LayoutObject, labelSize: number, selected: boolean, lensLines = true): THREE.Group {
  const g = new THREE.Group()
  g.userData.objectId = o.id
  g.position.set(o.x, o.y, o.z)
  g.rotation.y = -deg(o.rotation) // องศาเพิ่ม = หมุนตามเข็มเมื่อมองจากด้านบน
  const { color } = kindMeta(o.kind)
  const m = objectDims(o)
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
    // คนถือกิมบอล: ตัวคน (แคปซูลเทา) + ด้ามจับ + กล้องเล็กบนกิมบอลระดับอก
    const person = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.1, 4, 10), new THREE.MeshLambertMaterial({ color: 0x9ca3af }))
    person.position.set(0, 0.77, 0.25)
    const handle = box(0.5, 0.04, 0.04, '#111827')
    handle.position.set(0, m.mountHeight + 0.12, -0.05)
    const body = box(0.18, 0.14, 0.26, color)
    body.position.set(0, m.mountHeight, -0.1)
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.16, 10), new THREE.MeshLambertMaterial({ color: 0x111827 }))
    lens.rotation.x = Math.PI / 2
    lens.position.set(0, m.mountHeight, -0.3)
    g.add(person, handle, body, lens)
    if (lensLines) {
      const wedge = fovWedge(m.fov, m.range, color)
      wedge.position.y = m.mountHeight
      g.add(wedge)
    }
    top = 1.9
  } else if (o.kind === 'remote_head') {
    // หัวรีโมท: เสา + ฐานสามขา + แอก (yoke) รูปตัว U จับกล้องที่ระดับ mountHeight — ไม่มีคนประจำ
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

  if (selected) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(Math.max(m.w, m.d, 1.2) * 0.75, Math.max(m.w, m.d, 1.2) * 0.75 + 0.18, 40),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, depthTest: false }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.06
    ring.raycast = () => {}
    ring.renderOrder = 9
    g.add(ring)
  }

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
  g.add(leader, label)
  return g
}

export function disposeGroup(group: THREE.Object3D): void {
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    mesh.geometry?.dispose?.()
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    // texture ของ label อยู่ใน cache ใช้ซ้ำ — ไม่ dispose ที่นี่
    mats.forEach((m) => m.dispose())
  })
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
export async function snapshotLayout(
  layout: PlanLayout, view: 'top' | 'perspective', floorImageSrc?: string | null, width = 1800, height = 1100, lensLines = true, pixelRatio = 2,
): Promise<string> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(pixelRatio)
  renderer.setSize(width, height, false)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xffffff)
  addLights(scene)
  const img = floorImageSrc ? await loadImage(floorImageSrc).catch(() => null) : null
  const venue = buildVenue(layout.venue, img)
  scene.add(venue)
  const size = labelSizeFor(layout.venue)
  layout.objects.forEach((o) => scene.add(buildObject(o, size, false, lensLines)))

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
