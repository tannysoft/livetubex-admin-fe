import type { CatalogProduct } from './blackmagic'

/**
 * DJI — Ronin (gimbal, หมวดขาตั้ง/Grip) + กล้อง (Osmo Pocket / Action / 360, โดรน, Ronin 4D) + ส่งภาพไร้สาย
 * ⚠️ port ต่อรุ่นมาจากความรู้ทั่วไป — ตรวจกับตัวเครื่องอีกครั้ง
 * gimbal ในผังระบบมักไม่ต่อสัญญาณ ใส่แค่ port คุมกล้อง (RSS/USB-C) ไว้เผื่อโยง
 */
const D = 'DJI'
const A = ['dji', 'ronin', 'โรนิน', 'gimbal', 'กิมบอล', 'stabilizer']

const g = (name: string, ios: string[], extra: string[] = []): CatalogProduct =>
  ({ brand: D, name, category: 'support', aliases: [...A, ...extra], ios })

type Ports = Pick<CatalogProduct, 'inputs' | 'outputs' | 'ios'>
// กล้อง DJI ไม่ใช่ gimbal — ใช้คำค้นแค่ยี่ห้อ + คำของรุ่น (ไม่เอา 'ronin'/'gimbal' ของกลุ่มบน)
const cam = (name: string, ports: Ports, extra: string[] = []): CatalogProduct =>
  ({ brand: D, name, category: 'camera', aliases: ['dji', 'osmo', ...extra], ...ports })
const POCKET: Ports = { outputs: ['USB-C (UVC webcam)'], ios: ['LIVE RTMP (แอป)'] }
const ACTION: Ports = { outputs: ['USB-C (UVC webcam)'], ios: ['LIVE RTMP (แอป)'] }
const DRONE = ['drone', 'โดรน', 'aerial', 'uav']

export const DJI_PRODUCTS: CatalogProduct[] = [
  g('DJI RS 4 Mini', ['USB-C (camera control)'], ['rs4 mini', 'rs 4']),
  g('DJI RS 4', ['RSS (camera control)', 'USB-C'], ['rs4']),
  g('DJI RS 4 Pro', ['RSS (camera control)', 'RSA', 'USB-C'], ['rs4 pro', 'rs 4']),
  g('DJI RS 4 Pro Combo', ['RSS (camera control)', 'RSA', 'USB-C'], ['rs4 pro', 'rs 4', 'combo', 'focus motor', 'ชุด']),
  g('DJI RS 3 Mini', ['USB-C (camera control)'], ['rs3 mini', 'rs 3']),
  g('DJI RS 3', ['RSS (camera control)', 'USB-C'], ['rs3']),
  g('DJI RS 3 Pro', ['RSS (camera control)', 'RSA', 'USB-C'], ['rs3 pro', 'rs 3']),
  g('DJI RS 3 Pro Combo', ['RSS (camera control)', 'RSA', 'USB-C'], ['rs3 pro', 'rs 3', 'combo', 'ชุด']),
  g('DJI RS 2', ['RSS (camera control)', 'USB-C'], ['rs2', 'รุ่นเก่า']),
  g('DJI RSC 2', ['RSS (camera control)', 'USB-C'], ['rsc2', 'รุ่นเก่า']),
  g('DJI Ronin-S', ['USB-C'], ['ronin s', 'รุ่นเก่า']),
  g('DJI Ronin-SC', ['USB-C'], ['ronin sc', 'รุ่นเก่า']),
  g('DJI Ronin 2', ['SDI IN', 'SDI OUT', 'CAN', 'D-TAP'], ['ronin2', 'heavy', 'รุ่นใหญ่']),
  { brand: D, name: 'DJI Ronin 4D 6K', category: 'camera', aliases: [...A, '4d', 'ronin4d', 'zenmuse x9'],
    inputs: ['XLR 1', 'XLR 2', 'TIMECODE IN'], outputs: ['SDI OUT', 'HDMI OUT'], ios: ['USB-C', 'LAN'] },
  { brand: D, name: 'DJI Ronin 4D 8K', category: 'camera', aliases: [...A, '4d', 'ronin4d', 'zenmuse x9'],
    inputs: ['XLR 1', 'XLR 2', 'TIMECODE IN'], outputs: ['SDI OUT', 'HDMI OUT'], ios: ['USB-C', 'LAN'] },
  // ── กล้องมือถือ / action cam — ไม่มี HDMI เอาภาพออกทาง USB-C (UVC webcam) หรือไลฟ์ RTMP จากแอป ──
  cam('DJI Osmo Pocket 3', POCKET, ['pocket 3', 'pocket3', 'osmo pocket', 'vlog', '1 inch']),
  cam('DJI Osmo Pocket 3 Creator Combo', POCKET, ['pocket 3', 'pocket3', 'osmo pocket', 'combo', 'ชุด', 'dji mic']),
  cam('DJI Osmo Pocket 2', POCKET, ['pocket 2', 'pocket2', 'osmo pocket', 'รุ่นเก่า']),
  cam('DJI Osmo Action 5 Pro', ACTION, ['action 5', 'action5', 'osmo action', 'actioncam', 'แอคชั่นแคม', 'gopro']),
  cam('DJI Osmo Action 4', ACTION, ['action 4', 'action4', 'osmo action', 'actioncam', 'แอคชั่นแคม', 'gopro']),
  cam('DJI Osmo Action 3', ACTION, ['action 3', 'action3', 'osmo action', 'actioncam', 'แอคชั่นแคม', 'gopro', 'รุ่นเก่า']),
  cam('DJI Osmo 360', ACTION, ['osmo 360', '360', 'actioncam', 'แอคชั่นแคม', 'panorama']),
  cam('DJI Osmo Nano', ACTION, ['osmo nano', 'nano', 'actioncam', 'แอคชั่นแคม', 'wearable', 'กล้องติดตัว']),
  // ── โดรน — ภาพออกทางรีโมท: RC Pro / RC Plus มี HDMI OUT, รีโมทรุ่นเล็ก (RC-N, RC 2) ไลฟ์ผ่านแอปเท่านั้น ──
  cam('DJI Inspire 3', { outputs: ['HDMI OUT (RC Plus)'], ios: ['LIVE RTMP (แอป)'] }, [...DRONE, 'inspire 3', 'inspire3', 'x9', 'cinema', 'รุ่นใหญ่']),
  cam('DJI Mavic 4 Pro', { outputs: ['HDMI OUT (RC Pro 2)'], ios: ['LIVE RTMP (แอป)'] }, [...DRONE, 'mavic 4', 'mavic4', 'hasselblad']),
  cam('DJI Mavic 3 Pro', { outputs: ['HDMI OUT (RC Pro)'], ios: ['LIVE RTMP (แอป)'] }, [...DRONE, 'mavic 3', 'mavic3', 'hasselblad']),
  cam('DJI Air 3S', { ios: ['LIVE RTMP (แอป)'] }, [...DRONE, 'air 3s', 'air3s', 'air']),
  cam('DJI Mini 5 Pro', { ios: ['LIVE RTMP (แอป)'] }, [...DRONE, 'mini 5', 'mini5', 'mini']),
  cam('DJI Mini 4 Pro', { ios: ['LIVE RTMP (แอป)'] }, [...DRONE, 'mini 4', 'mini4', 'mini']),
  cam('DJI Avata 2', { ios: ['LIVE RTMP (แอป)'] }, [...DRONE, 'avata 2', 'avata2', 'fpv']),
  cam('DJI Flip', { ios: ['LIVE RTMP (แอป)'] }, [...DRONE, 'flip', 'vlog']),
  cam('DJI Neo', { ios: ['LIVE RTMP (แอป)'] }, [...DRONE, 'neo', 'vlog', 'selfie']),
  // ส่งภาพไร้สาย — ขายเป็นชุด TX + RX (ตัวรับมีจอในตัว) → 1 รายการ = 1 กล่องในผัง
  // ขาเข้า = ตัวส่ง (ฝั่งกล้อง), ขาออก = ตัวรับ (ฝั่งสวิตเชอร์) เหมือนชุด Vaxis
  { brand: D, name: 'DJI Transmission (ชุด TX+RX)', model: 'DJI Transmission', category: 'wireless',
    aliases: [...A, 'transmission', 'wireless', 'ไร้สาย', 'tx', 'rx', 'set', 'ชุด', 'คู่', 'combo'],
    inputs: ['HDMI IN (TX)'], outputs: ['SDI OUT (RX)', 'HDMI OUT (RX)'], ios: ['USB-C (TX)', 'USB-C (RX)'] },
]
