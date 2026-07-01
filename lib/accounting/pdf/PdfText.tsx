import { Text as RPText } from '@react-pdf/renderer'
import { Children, type ComponentProps, type ReactNode } from 'react'

/**
 * Text wrapper สำหรับ react-pdf ที่แก้ bug ตัวอักษรท้ายคำหายเมื่อเจอ "ำ" (สระอำ)
 *
 * react-pdf normalize "ำ" (U+0E33) → นิคหิต + สระอา (2 ตัว) ตอน render แต่ยังใช้
 * ความยาว string เดิม → ตัวท้าย string หลุด 1 ตัวต่อ "ำ" 1 ตัว
 * (diegomura/react-pdf#3295). แก้โดยแทน "ำ" ด้วย "ํา" (U+0E4D + U+0E32) เอง
 * ก่อนส่งให้ react-pdf — แสดงผลเหมือนเดิมทุกประการ แต่ length ไม่เพี้ยน
 *
 * ใช้แทน `Text` จาก '@react-pdf/renderer' ในทุก PDF template
 */
function fixSaraAm(children: ReactNode): ReactNode {
  return Children.map(children, (child) =>
    typeof child === 'string' ? child.replace(/ำ/g, 'ํา') : child,
  )
}

export function Text(props: ComponentProps<typeof RPText>) {
  // react-pdf Text เป็น union (มี SVG variant) → cast เพื่ออ่าน children
  const children = (props as { children?: ReactNode }).children
  return <RPText {...props}>{fixSaraAm(children)}</RPText>
}
