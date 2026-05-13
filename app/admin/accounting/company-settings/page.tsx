'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  BuildingOffice2Icon,
  PlusIcon,
  TrashIcon,
  BanknotesIcon,
  PencilSquareIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline'
import {
  DEFAULT_COMPANY_SETTINGS,
  getCompanySettings,
  saveCompanySettings,
} from '@/lib/accounting/company-settings'
import { uploadCompanySignature, getStorageDownloadUrl } from '@/lib/firebase-storage'
import type { BankAccount, CompanySettings } from '@/lib/types'
import { Skeleton } from '@/components/ui/Skeleton'

const emptyBank: BankAccount = { bankName: '', accountNo: '', accountName: '', branch: '' }

export default function CompanySettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<CompanySettings>(DEFAULT_COMPANY_SETTINGS)
  const [toast, setToast] = useState<{ type: 'ok' | 'fail'; message: string } | null>(null)
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  const [uploadingSig, setUploadingSig] = useState(false)
  const sigInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      try {
        const s = await getCompanySettings()
        setData(s)
        if (s.signaturePath) {
          try {
            const url = await getStorageDownloadUrl(s.signaturePath)
            setSignatureUrl(url)
          } catch { /* ignore */ }
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleSignatureUpload = async (file: File) => {
    setUploadingSig(true)
    try {
      const path = await uploadCompanySignature(file)
      setData((prev) => ({ ...prev, signaturePath: path }))
      const url = await getStorageDownloadUrl(path)
      setSignatureUrl(url)
      setToast({ type: 'ok', message: 'อัพโหลดลายเซ็นเรียบร้อย — อย่าลืมกด "บันทึกการตั้งค่า"' })
    } catch (e) {
      console.error(e)
      setToast({ type: 'fail', message: 'อัพโหลดลายเซ็นไม่สำเร็จ' })
    } finally {
      setUploadingSig(false)
    }
  }

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveCompanySettings(data)
      setToast({ type: 'ok', message: 'บันทึกข้อมูลบริษัทเรียบร้อย' })
    } catch {
      setToast({ type: 'fail', message: 'บันทึกไม่สำเร็จ กรุณาลองใหม่' })
    } finally {
      setSaving(false)
    }
  }

  const update = <K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) => {
    setData((prev) => ({ ...prev, [key]: value }))
  }

  const addBank = () => {
    setData((prev) => ({ ...prev, bankAccounts: [...prev.bankAccounts, { ...emptyBank }] }))
  }

  const updateBank = (idx: number, key: keyof BankAccount, value: string) => {
    setData((prev) => ({
      ...prev,
      bankAccounts: prev.bankAccounts.map((b, i) => (i === idx ? { ...b, [key]: value } : b)),
    }))
  }

  const removeBank = (idx: number) => {
    setData((prev) => ({ ...prev, bankAccounts: prev.bankAccounts.filter((_, i) => i !== idx) }))
  }

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727] transition-all'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ข้อมูลบริษัท</h1>
        <p className="text-gray-500 mt-1">ข้อมูลที่ใช้ออกใบเสนอราคา ใบแจ้งหนี้ ใบกำกับภาษี และใบเสร็จ</p>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-lg text-sm font-medium ${
          toast.type === 'ok' ? 'bg-green-500 text-white' : 'bg-yellow-500 text-white'
        }`}>
          {toast.type === 'ok'
            ? <CheckCircleIcon className="w-5 h-5 shrink-0" />
            : <ExclamationCircleIcon className="w-5 h-5 shrink-0" />
          }
          {toast.message}
        </div>
      )}

      {/* Card: Company Info */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <div className="p-2 bg-red-50 rounded-xl">
            <BuildingOffice2Icon className="w-5 h-5 text-[#f73727]" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">ข้อมูลทั่วไป</h2>
            <p className="text-xs text-gray-500 mt-0.5">ชื่อ ที่อยู่ และข้อมูลติดต่อ</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelCls}>ชื่อบริษัท (ไทย) *</label>
                <input value={data.name} onChange={(e) => update('name', e.target.value)} className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>ชื่อบริษัท (อังกฤษ)</label>
                <input value={data.nameEn ?? ''} onChange={(e) => update('nameEn', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>เลขทะเบียนนิติบุคคล *</label>
                <input value={data.taxId} onChange={(e) => update('taxId', e.target.value)} className={inputCls} placeholder="0105566147487" />
              </div>
              <div>
                <label className={labelCls}>สาขา *</label>
                <input value={data.branch} onChange={(e) => update('branch', e.target.value)} className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>ที่อยู่ *</label>
                <textarea value={data.address} onChange={(e) => update('address', e.target.value)} rows={3} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>เบอร์โทร</label>
                <input value={data.phone ?? ''} onChange={(e) => update('phone', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>อีเมล</label>
                <input value={data.email ?? ''} onChange={(e) => update('email', e.target.value)} className={inputCls} type="email" />
              </div>
              <div>
                <label className={labelCls}>เว็บไซต์</label>
                <input value={data.website ?? ''} onChange={(e) => update('website', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>อัตรา VAT (%)</label>
                <input
                  type="number"
                  value={data.vatRate}
                  onChange={(e) => update('vatRate', Number(e.target.value))}
                  className={inputCls}
                  min={0}
                  max={100}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Card: Bank Accounts */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-xl">
              <BanknotesIcon className="w-5 h-5 text-[#f73727]" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">บัญชีธนาคารบริษัท</h2>
              <p className="text-xs text-gray-500 mt-0.5">แสดงในใบแจ้งหนี้สำหรับลูกค้าโอนเงิน</p>
            </div>
          </div>
          <button
            onClick={addBank}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f73727] text-white text-sm font-medium rounded-xl hover:bg-red-600 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            เพิ่มบัญชี
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {loading ? (
            <Skeleton className="h-20 w-full rounded-xl" />
          ) : data.bankAccounts.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">ยังไม่มีบัญชีธนาคาร — กด &quot;เพิ่มบัญชี&quot;</p>
          ) : (
            data.bankAccounts.map((bank, idx) => (
              <div key={idx} className="bg-gray-50 rounded-xl p-4 space-y-3 relative">
                <button
                  onClick={() => removeBank(idx)}
                  className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>ธนาคาร</label>
                    <input value={bank.bankName} onChange={(e) => updateBank(idx, 'bankName', e.target.value)} className={inputCls} placeholder="กสิกรไทย" />
                  </div>
                  <div>
                    <label className={labelCls}>เลขบัญชี</label>
                    <input value={bank.accountNo} onChange={(e) => updateBank(idx, 'accountNo', e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>ชื่อบัญชี</label>
                    <input value={bank.accountName} onChange={(e) => updateBank(idx, 'accountName', e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>สาขา</label>
                    <input value={bank.branch ?? ''} onChange={(e) => updateBank(idx, 'branch', e.target.value)} className={inputCls} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Card: Signature */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <div className="p-2 bg-red-50 rounded-xl">
            <PencilSquareIcon className="w-5 h-5 text-[#f73727]" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">ลายเซ็นผู้มีอำนาจ</h2>
            <p className="text-xs text-gray-500 mt-0.5">จะแสดงในเอกสาร PDF (ใบเสนอราคา, ใบแจ้งหนี้, ใบกำกับภาษี, ใบเสร็จ)</p>
          </div>
        </div>
        <div className="px-6 py-5 space-y-3">
          {signatureUrl ? (
            <div className="relative inline-block bg-gray-50 rounded-xl p-4 border border-gray-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={signatureUrl} alt="ลายเซ็น" className="max-h-32 max-w-xs object-contain" />
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">ยังไม่มีลายเซ็น</p>
          )}

          <div className="flex gap-2">
            <input
              ref={sigInputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleSignatureUpload(file)
                e.target.value = ''
              }}
            />
            <button
              onClick={() => sigInputRef.current?.click()}
              disabled={uploadingSig}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-60"
            >
              {uploadingSig
                ? <span className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
                : <ArrowUpTrayIcon className="w-4 h-4" />
              }
              {signatureUrl ? 'เปลี่ยนลายเซ็น' : 'อัพโหลดลายเซ็น'}
            </button>
            {signatureUrl && (
              <button
                onClick={() => {
                  setData((prev) => ({ ...prev, signaturePath: '' }))
                  setSignatureUrl(null)
                }}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 text-sm font-medium rounded-xl hover:bg-red-100 transition-colors"
              >
                <TrashIcon className="w-4 h-4" />
                ลบลายเซ็น
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500">แนะนำ PNG พื้นหลังโปร่งใส ขนาดประมาณ 400×200 px</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#f73727] text-white text-sm font-medium rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50"
        >
          {saving && (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          )}
          <ArrowDownTrayIcon className="w-4 h-4" />
          บันทึกการตั้งค่า
        </button>
      </div>
    </div>
  )
}
