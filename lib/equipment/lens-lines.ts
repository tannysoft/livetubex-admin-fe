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
