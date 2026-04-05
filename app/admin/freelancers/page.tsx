'use client'

import { useEffect, useState } from 'react'
import {
  PlusIcon,
  PencilIcon,
  MagnifyingGlassIcon,
  PhoneIcon,
  BanknotesIcon,
  UserCircleIcon,
  IdentificationIcon,
} from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import FreelancerForm from '@/components/admin/FreelancerForm'
import { getFreelancers, createFreelancer, updateFreelancer } from '@/lib/firebase-utils'
import { getStorageDownloadUrl } from '@/lib/firebase-storage'
import type { Freelancer } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { Skeleton, SkeletonImage } from '@/components/ui/Skeleton'

export default function FreelancersPage() {
  const [freelancers, setFreelancers] = useState<Freelancer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editFreelancer, setEditFreelancer] = useState<Freelancer | null>(null)
  const [saving, setSaving] = useState(false)
  const [idCardUrl, setIdCardUrl] = useState<string | null>(null)
  const [idCardName, setIdCardName] = useState('')

  // IdCardButton จัดการ loading state ของตัวเองต่อ card
  // เรียก getStorageDownloadUrl เพื่อขอ URL พร้อม token อัตโนมัติ (ต้อง login อยู่)
  const IdCardButton = ({ freelancer }: { freelancer: Freelancer }) => {
    const [loading, setLoading] = useState(false)
    const path = freelancer.idCardImagePath
    const legacyUrl = freelancer.idCardImageUrl
    if (!path && !legacyUrl) return null

    const handleClick = async () => {
      if (path) {
        setLoading(true)
        try {
          const url = await getStorageDownloadUrl(path)
          setIdCardUrl(url)
          setIdCardName(freelancer.name)
        } catch {
          // ไม่สามารถโหลดรูปได้
        } finally {
          setLoading(false)
        }
      } else if (legacyUrl) {
        // backward compat: ข้อมูลเก่าที่เก็บ URL โดยตรง
        setIdCardUrl(legacyUrl)
        setIdCardName(freelancer.name)
      }
    }

    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        title="ดูสำเนาบัตรประชาชน"
        className="p-1.5 text-blue-400 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-40"
      >
        {loading
          ? <span className="w-4 h-4 border-2 border-blue-300 border-t-transparent rounded-full animate-spin inline-block" />
          : <IdentificationIcon className="w-4 h-4" />
        }
      </button>
    )
  }

  const load = async () => {
    setLoading(true)
    try {
      const data = await getFreelancers()
      setFreelancers(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (data: Omit<Freelancer, 'id' | 'createdAt' | 'totalEarned'>) => {
    setSaving(true)
    try {
      await createFreelancer({ ...data, linePictureUrl: '' })
      setCreateOpen(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async (data: Partial<Freelancer>) => {
    if (!editFreelancer) return
    setSaving(true)
    try {
      await updateFreelancer(editFreelancer.id, data)
      setEditFreelancer(null)
      load()
    } finally {
      setSaving(false)
    }
  }

  const filtered = freelancers.filter(
    (f) =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.phone.includes(search) ||
      (f.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">จัดการ Freelancer</h1>
          <p className="text-gray-500 mt-1">{freelancers.length} คนทั้งหมด</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#f73727] text-white text-sm font-medium rounded-xl hover:bg-red-600 transition-colors shadow-md shadow-red-200"
        >
          <PlusIcon className="w-4 h-4" />
          เพิ่ม Freelancer
        </button>
      </div>

      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อ เบอร์โทร หรืออีเมล..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727] bg-white"
        />
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-12 h-12 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-28 rounded-md" />
                    <Skeleton className="h-3.5 w-14 rounded-full" />
                  </div>
                </div>
                <Skeleton className="w-7 h-7 rounded-lg" />
              </div>
              <div className="mt-4 space-y-2">
                <Skeleton className="h-3.5 w-32 rounded-md" />
                <Skeleton className="h-3.5 w-40 rounded-md" />
                <Skeleton className="h-3.5 w-28 rounded-md" />
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between">
                <Skeleton className="h-4 w-20 rounded-md" />
                <Skeleton className="h-4 w-16 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.length === 0 ? (
            <p className="col-span-full text-center text-gray-400 py-20">ไม่พบ Freelancer</p>
          ) : (
            filtered.map((f) => (
              <div
                key={f.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {f.linePictureUrl ? (
                      <img src={f.linePictureUrl} alt={f.name} className="w-12 h-12 rounded-full object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                        <UserCircleIcon className="w-8 h-8 text-gray-400" />
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-gray-900">{f.name}</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${f.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {f.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <IdCardButton freelancer={f} />
                    <button
                      onClick={() => setEditFreelancer(f)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-500">
                    <PhoneIcon className="w-4 h-4 flex-shrink-0" />
                    <span>{f.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-500">
                    <BanknotesIcon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{f.bankName} · {f.bankAccount}</span>
                  </div>
                  {f.lineDisplayName && (
                    <div className="flex items-center gap-2 text-gray-500">
                      <svg className="w-4 h-4 flex-shrink-0 text-green-500" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                      </svg>
                      <span>{f.lineDisplayName}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
                  <span className="text-xs text-gray-400">รายได้รวม</span>
                  <span className="font-semibold text-[#f73727]">{formatCurrency(f.totalEarned)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="เพิ่ม Freelancer ใหม่" size="xl">
        <FreelancerForm onSubmit={handleCreate} onCancel={() => setCreateOpen(false)} isLoading={saving} />
      </Modal>

      <Modal isOpen={!!editFreelancer} onClose={() => setEditFreelancer(null)} title="แก้ไขข้อมูล Freelancer" size="xl">
        {editFreelancer && (
          <FreelancerForm
            defaultValues={editFreelancer}
            onSubmit={handleEdit}
            onCancel={() => setEditFreelancer(null)}
            isLoading={saving}
          />
        )}
      </Modal>

      <Modal isOpen={!!idCardUrl} onClose={() => setIdCardUrl(null)} title={`สำเนาบัตรประชาชน — ${idCardName}`} size="md">
        {idCardUrl && (
          <div className="flex flex-col items-center gap-4">
            <SkeletonImage src={idCardUrl} alt="สำเนาบัตรประชาชน" />
            <a
              href={idCardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              เปิดในแท็บใหม่
            </a>
          </div>
        )}
      </Modal>
    </div>
  )
}
