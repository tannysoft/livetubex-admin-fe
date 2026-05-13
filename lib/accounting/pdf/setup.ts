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
    ],
  })

  // ปิด hyphenation (default จะแบ่งคำ — ทำให้คำไทยพังได้)
  Font.registerHyphenationCallback((word) => [word])
}
