'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  PlusIcon, PencilIcon, TrashIcon, MagnifyingGlassIcon,
  BuildingOffice2Icon, UserIcon, UsersIcon,
} from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import VendorForm, { type VendorFormData } from '@/components/admin/accounting/VendorForm'
import { Skeleton } from '@/components/ui/Skeleton'
import { getVendors, createVendor, updateVendor, deleteVendor } from '@/lib/accounting/vendors'
import type { Vendor, VendorType } from '@/lib/types'

const typeIcon: Record<VendorType, typeof BuildingOffice2Icon> = {
  company: BuildingOffice2Icon,
  individual: UserIcon,
  freelancer: UsersIcon,
}

const typeLabel: Record<VendorType, string> = {
  company: 'บริษัท',
  individual: 'บุคคล',
  freelancer: 'Freelancer',
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Vendor | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = async () => {
    setLoading(true)
    try { setVendors(await getVendors()) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return vendors
    return vendors.filter((v) =>
      v.name.toLowerCase().includes(q) ||
      v.code.toLowerCase().includes(q) ||
      (v.taxId ?? '').includes(q) ||
      (v.phone ?? '').includes(q),
    )
  }, [vendors, search])

  const openCreate = () => {
    setEditing(null)
    setShowForm(true)
  }

  const openEdit = (v: Vendor) => {
    setEditing(v)
    setShowForm(true)
  }

  const handleSubmit = async (data: VendorFormData) => {
    setSaving(true)
    try {
      if (editing) {
        await updateVendor(editing.id, data)
      } else {
        await createVendor(data)
      }
      setShowForm(false)
      setEditing(null)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteVendor(deleteTarget.id)
      setDeleteTarget(null)
      await load()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ผู้ขาย / คู่ค้า</h1>
          <p className="text-gray-500 mt-1">{vendors.length} ราย — รายชื่อผู้ขายสำหรับบันทึกค่าใช้จ่าย</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#f73727] text-white text-sm font-medium rounded-xl hover:bg-red-600 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          เพิ่มผู้ขาย
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="relative">
          <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาด้วยชื่อ, รหัส, เลขผู้เสียภาษี, เบอร์โทร"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727]"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <ul className="divide-y divide-gray-50">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 px-5 py-4">
                <Skeleton className="w-10 h-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48 rounded-md" />
                  <Skeleton className="h-3 w-32 rounded-md" />
                </div>
              </li>
            ))}
          </ul>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <BuildingOffice2Icon className="w-10 h-10 text-gray-300 mx-auto" />
            <p className="text-gray-400 text-sm mt-3">
              {search ? 'ไม่พบผู้ขายที่ตรงกับคำค้น' : 'ยังไม่มีผู้ขาย'}
            </p>
            {!search && (
              <button onClick={openCreate} className="text-[#f73727] hover:underline text-sm mt-2">
                เพิ่มผู้ขายรายแรก
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {filtered.map((v) => {
              const Icon = typeIcon[v.type]
              return (
                <li key={v.id} className="flex items-center gap-3 px-5 py-4">
                  <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-[#f73727]" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900 truncate">{v.name}</span>
                      <span className="text-xs text-gray-400 font-mono">{v.code}</span>
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{typeLabel[v.type]}</span>
                      {!v.isActive && (
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">ไม่ใช้งาน</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      {v.taxId && <span>เลขผู้เสียภาษี: {v.taxId}</span>}
                      {v.phone && <span>· {v.phone}</span>}
                      {v.bankName && <span>· {v.bankName} {v.bankAccount}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(v)}
                      className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(v)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <Modal
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditing(null) }}
        title={editing ? `แก้ไขผู้ขาย — ${editing.code}` : 'เพิ่มผู้ขายใหม่'}
        size="xl"
      >
        <VendorForm
          defaultValues={editing ?? undefined}
          onSubmit={handleSubmit}
          onCancel={() => { setShowForm(false); setEditing(null) }}
          isLoading={saving}
        />
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="ลบผู้ขาย"
        message={`ต้องการลบผู้ขาย "${deleteTarget?.name}" (${deleteTarget?.code}) ใช่หรือไม่? Expense ที่เคยอ้างอิงจะยังคงข้อมูลเดิม`}
        confirmLabel={deleting ? 'กำลังลบ...' : 'ลบ'}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
        danger
      />
    </div>
  )
}
