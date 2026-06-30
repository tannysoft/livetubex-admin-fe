'use client'

import { useState } from 'react'
import { ArrowDownTrayIcon, EyeIcon } from '@heroicons/react/24/outline'
import { downloadPdf, createPdfObjectUrl, type PdfElement } from '@/lib/accounting/pdf/generate'

interface Props {
  buildPdfElement: () => Promise<PdfElement> | PdfElement
  filename: string
}

export default function PdfButtons({ buildPdfElement, filename }: Props) {
  const [downloading, setDownloading] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [error, setError] = useState('')

  const handleDownload = async () => {
    setDownloading(true)
    setError('')
    try {
      const el = await buildPdfElement()
      await downloadPdf(el, filename)
    } catch (e) {
      console.error('Download PDF failed:', e)
      setError(`ดาวน์โหลด PDF ไม่สำเร็จ: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      setDownloading(false)
    }
  }

  const handlePreview = async () => {
    // เปิดแท็บทันทีตอนคลิก (ยังอยู่ใน user gesture) กัน popup blocker
    // แล้วค่อยใส่ URL หลังสร้าง PDF เสร็จ
    const win = window.open('', '_blank')
    setPreviewing(true)
    setError('')
    try {
      const el = await buildPdfElement()
      const url = await createPdfObjectUrl(el)
      if (win && !win.closed) {
        win.location.href = url
      } else {
        // popup ถูกบล็อก → fallback เปิด/ดาวน์โหลดในแท็บปัจจุบัน
        const a = document.createElement('a')
        a.href = url
        a.target = '_blank'
        a.rel = 'noopener'
        a.click()
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e) {
      win?.close()
      console.error('Preview PDF failed:', e)
      setError(`เปิด PDF ไม่สำเร็จ: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      setPreviewing(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={handlePreview}
          disabled={previewing || downloading}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-60"
        >
          {previewing
            ? <span className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
            : <EyeIcon className="w-4 h-4" />
          }
          ดู PDF
        </button>
        <button
          onClick={handleDownload}
          disabled={previewing || downloading}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-700 text-sm font-medium rounded-xl hover:bg-blue-100 transition-colors disabled:opacity-60"
        >
          {downloading
            ? <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            : <ArrowDownTrayIcon className="w-4 h-4" />
          }
          ดาวน์โหลด
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}
    </div>
  )
}
