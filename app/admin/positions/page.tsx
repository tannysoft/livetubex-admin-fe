'use client'

import { useEffect, useState } from 'react'
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  CheckIcon,
  XMarkIcon,
  BriefcaseIcon,
} from '@heroicons/react/24/outline'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { getPositions, createPosition, updatePosition, deletePosition } from '@/lib/firebase-utils'
import type { Position } from '@/lib/types'
import { Skeleton } from '@/components/ui/Skeleton'

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Position | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      setPositions(await getPositions())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    if (!newName.trim()) { setError('กรุณากรอกชื่อตำแหน่ง'); return }
    setAdding(true)
    setError('')
    try {
      await createPosition(newName)
      setNewName('')
      await load()
    } finally {
      setAdding(false)
    }
  }

  const startEdit = (p: Position) => {
    setEditId(p.id)
    setEditName(p.name)
    setError('')
  }

  const cancelEdit = () => {
    setEditId(null)
    setEditName('')
  }

  const handleSaveEdit = async () => {
    if (!editName.trim()) { setError('กรุณากรอกชื่อตำแหน่ง'); return }
    if (!editId) return
    setSaving(true)
    setError('')
    try {
      await updatePosition(editId, editName)
      setEditId(null)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deletePosition(deleteTarget.id)
      setDeleteTarget(null)
      await load()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">จัดการตำแหน่ง</h1>
        <p className="text-gray-500 mt-1">{positions.length} ตำแหน่งทั้งหมด</p>
      </div>

      {/* Add new */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">เพิ่มตำแหน่งใหม่</h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setError('') }}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="เช่น ช่างภาพ, พิธีกร, ผู้ช่วยผู้กำกับ"
            className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727]"
          />
          <button
            onClick={handleAdd}
            disabled={adding}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#f73727] text-white text-sm font-medium rounded-xl hover:bg-red-600 transition-colors disabled:opacity-60"
          >
            <PlusIcon className="w-4 h-4" />
            {adding ? 'กำลังเพิ่ม...' : 'เพิ่ม'}
          </button>
        </div>
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
            <ul className="divide-y divide-gray-50">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 px-5 py-3.5">
                <Skeleton className="w-8 h-8 rounded-xl" />
                <Skeleton className="flex-1 h-4 rounded-md" />
                <Skeleton className="w-16 h-7 rounded-lg" />
              </li>
            ))}
          </ul>
        ) : positions.length === 0 ? (
          <div className="py-16 text-center">
            <BriefcaseIcon className="w-10 h-10 text-gray-300 mx-auto" />
            <p className="text-gray-400 text-sm mt-3">ยังไม่มีตำแหน่ง</p>
            <p className="text-gray-400 text-xs mt-1">เพิ่มตำแหน่งแรกด้านบน</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {positions.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-5 py-3.5">
                <div className="w-8 h-8 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <BriefcaseIcon className="w-4 h-4 text-[#f73727]" />
                </div>

                {editId === p.id ? (
                  /* Edit mode */
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') cancelEdit() }}
                      className="flex-1 px-3 py-1.5 rounded-xl border border-[#f73727] text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30"
                    />
                    <button
                      onClick={handleSaveEdit}
                      disabled={saving}
                      className="p-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-60"
                    >
                      <CheckIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="p-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  /* View mode */
                  <>
                    <span className="flex-1 text-sm font-medium text-gray-800">{p.name}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startEdit(p)}
                        className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(p)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="ลบตำแหน่ง"
        message={`ต้องการลบตำแหน่ง "${deleteTarget?.name}" ใช่หรือไม่?`}
        confirmLabel="ลบ"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
        danger
      />
    </div>
  )
}
