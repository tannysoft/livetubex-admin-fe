/**
 * ลิงก์แผนที่ของงาน (Job.mapUrl) — แอดมินวางลิงก์แชร์จาก Google Maps เอง (ไม่ใช้ Maps API/ไม่ต้องมี key)
 * ใช้เป็นปุ่ม "เปิดแผนที่" ในข้อความ LINE, ปฏิทินงาน, รายการงาน · ⚠️ ฝาแฝดของ safeMapUrl ใน functions/src/index.ts
 */

/** รับเฉพาะ http(s) ยาวไม่เกิน 1000 (ขีดจำกัด uri ของปุ่ม LINE) — ไม่ผ่าน = '' */
export function safeMapUrl(v?: string | null): string {
  const s = (v ?? '').trim()
  if (!s || s.length > 1000) return ''
  try {
    const u = new URL(s)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : ''
  } catch {
    return ''
  }
}

/** แผนที่ฝังใน iframe จากคำค้น (embed แบบไม่ใช้ API key) — ใช้ใน MapSearchModal */
export function mapsEmbedUrl(query: string): string {
  // ปลายทางของ maps.google.com/maps?output=embed (ตัวนั้น redirect 301 พร้อม X-Frame-Options) — เรียกตรงไม่ผ่าน redirect
  // pb: !2m1!1s{คำค้น} · !6i16 = ซูม · ภาษาไทย · '!' ในคำค้นต้อง escape ไม่งั้นแตกเป็น field ใหม่
  const q = encodeURIComponent(query.trim()).replace(/%20/g, '+').replace(/!/g, '%21')
  return `https://www.google.com/maps/embed?origin=mfe&pb=!1m3!2m1!1s${q}!6i16!3m1!1sth!5m1!1sth`
}

/** ค้นชื่อสถานที่ใน Google Maps (แท็บใหม่) — ให้แอดมินกด "แชร์" แล้วคัดลอกลิงก์กลับมาวาง */
export function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query.trim())}`
}

/** พารามิเตอร์ติดตาม/ที่มาของลิงก์ (ตัดได้ ลิงก์ยังเปิดที่เดิม) — entry=ttu, g_ep=…, g_st=ic (แชร์จากมือถือ), utm_* */
const TRACKING_PARAMS = /^(entry|g_ep|g_st|utm_.+|shorturl|skid|hl_ep)$/i

/** ลิงก์ Google Maps ที่คัดลอกมา → ตัดพารามิเตอร์ติดตามทิ้ง (ลิงก์อื่นคืนตามเดิม) · ผ่าน safeMapUrl แล้ว */
export function cleanMapUrl(url?: string | null): string {
  const safe = safeMapUrl(url)
  if (!safe) return ''
  try {
    const u = new URL(safe)
    if (!/(^|\.)google\.[a-z.]+$|(^|\.)goo\.gl$/i.test(u.hostname)) return safe
    for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(k)) u.searchParams.delete(k)
    return u.toString().replace(/\?$/, '')
  } catch {
    return safe
  }
}

/**
 * อ่านชื่อ + พิกัดจากลิงก์หน้าสถานที่ของ Google Maps
 * `…/maps/place/IMPACT+Arena,+…/@13.91,100.54,17z/data=…!3d13.9126056!4d100.5477525…`
 * !3d!4d = หมุดของสถานที่ (แม่นกว่า @ ซึ่งเป็นกึ่งกลางจอ) · ลิงก์สั้น maps.app.goo.gl อ่านไม่ได้ = {}
 */
export function placeFromMapUrl(url?: string | null): { name?: string; lat?: number; lng?: number } {
  const safe = safeMapUrl(url)
  if (!safe) return {}
  let path = safe
  try { path = decodeURIComponent(new URL(safe).pathname) } catch { /* ใช้ทั้งลิงก์ */ }
  const nameMatch = path.match(/\/maps\/place\/([^/@]+)/)
  const name = nameMatch ? nameMatch[1].replace(/\+/g, ' ').trim() : undefined
  const pin = safe.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/) ?? safe.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  const lat = pin ? Number(pin[1]) : undefined
  const lng = pin ? Number(pin[2]) : undefined
  const okCoords = lat !== undefined && lng !== undefined && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  return { ...(name ? { name } : {}), ...(okCoords ? { lat, lng } : {}) }
}
