'use client'

import { pdf, type DocumentProps } from '@react-pdf/renderer'
import type { ReactElement } from 'react'
import { registerPdfFonts } from './setup'

export type PdfElement = ReactElement<DocumentProps>

/**
 * Generate PDF blob from a react-pdf <Document>
 */
export async function generatePdfBlob(element: PdfElement): Promise<Blob> {
  registerPdfFonts()
  return await pdf(element).toBlob()
}

/**
 * Download a generated PDF
 */
export async function downloadPdf(element: PdfElement, filename: string): Promise<void> {
  const blob = await generatePdfBlob(element)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Open PDF in new tab (for preview / printing)
 */
export async function openPdfInNewTab(element: PdfElement): Promise<void> {
  const blob = await generatePdfBlob(element)
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
