'use client'

import { useSyncExternalStore } from 'react'

// เปิด/ปิด "แนวเลนส์" (กรวยมุมรับภาพของกล้อง) ในผังวาง 3D — ค่าเดียวใช้ทุกที่ (หน้าแก้ผัง, หน้าแชร์, หน้าพิมพ์)
// จำในเบราว์เซอร์นี้ (localStorage) เป็นความสะดวกของคนดู ไม่ใช่ข้อมูลของแผน
const KEY = 'layout:lensLines'
const listeners = new Set<() => void>()

function read(): boolean {
  try { return localStorage.getItem(KEY) !== '0' } catch { return true }
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  window.addEventListener('storage', cb) // แท็บอื่นเปลี่ยน → แท็บนี้ตาม
  return () => { listeners.delete(cb); window.removeEventListener('storage', cb) }
}

export function setLensLines(on: boolean) {
  try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* private mode — ใช้ได้แค่หน้านี้ */ }
  listeners.forEach((cb) => cb())
}

/** [เปิดอยู่ไหม, ตั้งค่า] — ตอน prerender/ยังไม่ hydrate = เปิด */
export function useLensLines(): [boolean, (on: boolean) => void] {
  return [useSyncExternalStore(subscribe, read, () => true), setLensLines]
}

// ── ขนาดป้ายชื่อในผังวาง 3D (S / M / L) — ค่าเดียวใช้ทุกที่ เหมือนแนวเลนส์ ──
export type LabelSize = 'S' | 'M' | 'L'
export const LABEL_SIZES: LabelSize[] = ['S', 'M', 'L']
/** ตัวคูณจากขนาดตั้งต้นของสถานที่ (labelSizeFor) */
export const LABEL_SCALE: Record<LabelSize, number> = { S: 0.6, M: 1, L: 1.6 }
const SIZE_KEY = 'layout:labelSize'

function readSize(): LabelSize {
  try { const v = localStorage.getItem(SIZE_KEY); return v === 'S' || v === 'L' ? v : 'M' } catch { return 'M' }
}

export function setLabelSize(size: LabelSize) {
  try { localStorage.setItem(SIZE_KEY, size) } catch { /* private mode */ }
  listeners.forEach((cb) => cb())
}

/** [ขนาดป้าย, ตั้งค่า] — ตอน prerender = M */
export function useLabelSize(): [LabelSize, (s: LabelSize) => void] {
  return [useSyncExternalStore(subscribe, readSize, () => 'M' as LabelSize), setLabelSize]
}

// ── โหมดสมจริงของผังวาง 3D (เก้าอี้ ราว หลังคา ฟ้า เงา) — ปิดเป็นค่าตั้งต้น: ผังแบบแผนผังอ่านตำแหน่งง่ายกว่าและเบากว่าบนมือถือ ──
const REAL_KEY = 'layout:realistic'

function readRealistic(): boolean {
  try { return localStorage.getItem(REAL_KEY) === '1' } catch { return false }
}

export function setRealistic(on: boolean) {
  try { localStorage.setItem(REAL_KEY, on ? '1' : '0') } catch { /* private mode */ }
  listeners.forEach((cb) => cb())
}

/** [เปิดอยู่ไหม, ตั้งค่า] — ตอน prerender = ปิด */
export function useRealistic(): [boolean, (on: boolean) => void] {
  return [useSyncExternalStore(subscribe, readRealistic, () => false), setRealistic]
}
