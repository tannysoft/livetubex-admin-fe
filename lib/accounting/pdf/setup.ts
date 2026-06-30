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
    fonts: [
      { src: '/fonts/Sarabun-Regular.woff', fontWeight: 'normal' },
      { src: '/fonts/Sarabun-SemiBold.woff', fontWeight: 'semibold' },
      { src: '/fonts/Sarabun-Bold.woff', fontWeight: 'bold' },
      // Sarabun ไม่มีไฟล์ italic → map italic ไปใช้ตัวปกติของแต่ละน้ำหนัก
      // กัน react-pdf หา font ไม่เจอแล้ว throw ("Could not resolve font ... italic")
      { src: '/fonts/Sarabun-Regular.woff', fontWeight: 'normal', fontStyle: 'italic' },
      { src: '/fonts/Sarabun-SemiBold.woff', fontWeight: 'semibold', fontStyle: 'italic' },
      { src: '/fonts/Sarabun-Bold.woff', fontWeight: 'bold', fontStyle: 'italic' },
    ],
  })

  // ปิด hyphenation (default จะแบ่งคำ — ทำให้คำไทยพังได้)
  Font.registerHyphenationCallback((word) => [word])
}
