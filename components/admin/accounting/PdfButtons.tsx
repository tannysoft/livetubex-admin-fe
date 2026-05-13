'use client'

import { useState } from 'react'
import { ArrowDownTrayIcon, EyeIcon } from '@heroicons/react/24/outline'
import { downloadPdf, openPdfInNewTab, type PdfElement } from '@/lib/accounting/pdf/generate'

interface Props {
  buildPdfElement: () => Promise<PdfElement> | PdfElement
  filename: string
}

export default function PdfButtons({ buildPdfElement, filename }: Props) {
  const [downloading, setDownloading] = useState(false)
  const [previewing, setPreviewing] = useState(false)

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const el = await buildPdfElement()
      await downloadPdf(el, filename)
    } catch (e) {
      console.error('Download PDF failed:', e)
    } finally {
      setDownloading(false)
    }
  }

  const handlePreview = async () => {
    setPreviewing(true)
    try {
      const el = await buildPdfElement()
      await openPdfInNewTab(el)
    } catch (e) {
      console.error('Preview PDF failed:', e)
    } finally {
      setPreviewing(false)
    }
  }

  return (
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
  )
}
