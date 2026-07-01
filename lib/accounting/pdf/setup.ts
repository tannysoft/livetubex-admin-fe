import { Font } from '@react-pdf/renderer'

let registered = false

/**
 * register Sarabun font กับ react-pdf (เรียกครั้งเดียวก่อน render)
 * โหลด font จาก public/fonts/ (browser จะ fetch จาก same-origin)
 */
export function registerPdfFonts() {
  if (registered) return
  registered = true

  Font.register({
    family: 'Sarabun',
    // ใช้ TTF เต็ม (glyph ครบ) — เดิมเป็น woff subset 12KB ที่ตัด glyph ออก
    // ทำให้ browser render ตัวอักษรท้ายคำหาย (จำกัด→จำก, และอื่นๆ→และอื่น)
    fonts: [
      { src: '/fonts/Sarabun-Regular.ttf', fontWeight: 'normal' },
      { src: '/fonts/Sarabun-SemiBold.ttf', fontWeight: 'semibold' },
      { src: '/fonts/Sarabun-Bold.ttf', fontWeight: 'bold' },
      // Sarabun ไม่มีไฟล์ italic → map italic ไปใช้ตัวปกติของแต่ละน้ำหนัก
      // กัน react-pdf หา font ไม่เจอแล้ว throw ("Could not resolve font ... italic")
      { src: '/fonts/Sarabun-Regular.ttf', fontWeight: 'normal', fontStyle: 'italic' },
      { src: '/fonts/Sarabun-SemiBold.ttf', fontWeight: 'semibold', fontStyle: 'italic' },
      { src: '/fonts/Sarabun-Bold.ttf', fontWeight: 'bold', fontStyle: 'italic' },
    ],
  })

  // ปิด hyphenation (default จะแบ่งคำ — ทำให้คำไทยพังได้)
  Font.registerHyphenationCallback((word) => [word])
}
