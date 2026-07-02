'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  PlusIcon, PencilIcon, TrashIcon, CheckIcon, XMarkIcon,
  TagIcon, ArrowDownTrayIcon, ArrowsPointingInIcon, ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  getExpenseCategories, createExpenseCategory, updateExpenseCategory,
  deleteExpenseCategory, seedDefaultCategoriesIfEmpty,
  mergeDuplicateCategories, countDuplicateCategories,
} from '@/lib/accounting/expense-categories'
import type { ExpenseCategory } from '@/lib/types'

export default function ExpenseCategoriesPage() {
  const [items, setItems] = useState<ExpenseCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)

  // add new
  const [newName, setNewName] = useState('')
  const [newWht, setNewWht] = useState<string>('')
  const [adding, setAdding] = useState(false)

  // edit
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editWht, setEditWht] = useState<string>('')
  const [saving, setSaving] = useState(false)

  // delete
  const [deleteTarget, setDeleteTarget] = useState<ExpenseCategory | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  // merge duplicates
  const [mergeOpen, setMergeOpen] = useState(false)
  const [merging, setMerging] = useState(false)
  const [mergeMsg, setMergeMsg] = useState('')
  const dupCount = useMemo(() => countDuplicateCategories(items), [items])

  const load = async () => {
    setLoading(true)
    try { setItems(await getExpenseCategories()) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleSeed = async () => {
    setSeeding(true)
    try {
      await seedDefaultCategoriesIfEmpty()
      await load()
    } finally {
      setSeeding(false)
    }
  }

  const handleAdd = async () => {
    if (!newName.trim()) { setError('กรุณากรอกชื่อหมวด'); return }
    setAdding(true)
    setError('')
    try {
      await createExpenseCategory({
        name: newName.trim(),
        defaultWhtRate: newWht ? Number(newWht) : undefined,
        order: (items[items.length - 1]?.order ?? 100) + 10,
      })
      setNewName('')
      setNewWht('')
      await load()
    } finally {
      setAdding(false)
    }
  }

  const startEdit = (c: ExpenseCategory) => {
    setEditId(c.id)
    setEditName(c.name)
    setEditWht(c.defaultWhtRate ? String(c.defaultWhtRate) : '')
    setError('')
  }

  const cancelEdit = () => {
    setEditId(null)
    setEditName('')
    setEditWht('')
  }

  const handleSaveEdit = async () => {
    if (!editName.trim() || !editId) return
    setSaving(true)
    try {
      await updateExpenseCategory(editId, {
        name: editName.trim(),
        defaultWhtRate: editWht ? Number(editWht) : undefined,
      })
      cancelEdit()
      await load()
    } finally {
      setSaving(false)
    }
  }

  const handleMerge = async () => {
    setMergeOpen(false)
    setMerging(true)
    setMergeMsg('')
    try {
      const r = await mergeDuplicateCategories()
      await load()
      setMergeMsg(`รวมหมวดซ้ำเสร็จ: ลบ ${r.deleted} หมวด, ย้าย ${r.reassigned} รายการ`)
    } catch (e) {
      setMergeMsg(`รวมไม่สำเร็จ: ${(e as Error)?.message ?? 'error'}`)
    } finally {
      setMerging(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteExpenseCategory(deleteTarget.id)
      setDeleteTarget(null)
      await load()
    } finally {
      setDeleting(false)
    }
  }

  const inputCls = 'px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727]'

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">หมวดค่าใช้จ่าย</h1>
          <p className="text-gray-500 mt-1">{items.length} หมวด — ใช้สำหรับจัดกลุ่ม Expense</p>
        </div>
        {items.length === 0 && !loading && (
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 text-sm font-medium rounded-xl hover:bg-blue-100 transition-colors disabled:opacity-60"
          >
            {seeding
              ? <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              : <ArrowDownTrayIcon className="w-4 h-4" />
            }
            เพิ่มหมวดมาตรฐาน
          </button>
        )}
      </div>

      {/* Duplicate warning + merge */}
      {(dupCount > 0 || mergeMsg) && (
        <div className={`flex items-center justify-between gap-3 px-5 py-3.5 rounded-2xl text-sm ${
          dupCount > 0 ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-green-50 border border-green-200 text-green-800'
        }`}>
          <span className="flex items-center gap-2">
            {dupCount > 0 ? <ExclamationTriangleIcon className="w-5 h-5 shrink-0" /> : <CheckIcon className="w-5 h-5 shrink-0" />}
            {dupCount > 0
              ? `พบหมวดที่ชื่อซ้ำกัน ${dupCount} รายการ — กด "รวมหมวดซ้ำ" เพื่อย้าย expense ไปหมวดหลักแล้วลบตัวซ้ำ`
              : mergeMsg}
          </span>
          {dupCount > 0 && (
            <button
              onClick={() => setMergeOpen(true)}
              disabled={merging}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-60 shrink-0"
            >
              {merging
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <ArrowsPointingInIcon className="w-4 h-4" />}
              รวมหมวดซ้ำ
            </button>
          )}
        </div>
      )}

      {/* Add */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">เพิ่มหมวดใหม่</h2>
        <div className="flex gap-3 flex-wrap">
          <input
            type="text"
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setError('') }}
            placeholder="ชื่อหมวด เช่น ค่าซ่อมบำรุง"
            className={`${inputCls} flex-1 min-w-[200px]`}
          />
          <input
            type="number"
            value={newWht}
            onChange={(e) => setNewWht(e.target.value)}
            placeholder="WHT % (เว้นว่างได้)"
            min="0"
            max="100"
            className={`${inputCls} w-44`}
          />
          <button
            onClick={handleAdd}
            disabled={adding}
            className="flex items-center gap-2 px-5 py-2 bg-[#f73727] text-white text-sm font-medium rounded-xl hover:bg-red-600 transition-colors disabled:opacity-60"
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
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 px-5 py-3.5">
                <Skeleton className="w-8 h-8 rounded-xl" />
                <Skeleton className="flex-1 h-4 rounded-md" />
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <TagIcon className="w-10 h-10 text-gray-300 mx-auto" />
            <p className="text-gray-400 text-sm mt-3">ยังไม่มีหมวดค่าใช้จ่าย</p>
            <p className="text-gray-400 text-xs mt-1">กด &quot;เพิ่มหมวดมาตรฐาน&quot; เพื่อ seed หมวดเริ่มต้น</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {items.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-5 py-3.5">
                <div className="w-8 h-8 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <TagIcon className="w-4 h-4 text-[#f73727]" />
                </div>

                {editId === c.id ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className={`${inputCls} flex-1`}
                    />
                    <input
                      type="number"
                      value={editWht}
                      onChange={(e) => setEditWht(e.target.value)}
                      placeholder="WHT %"
                      className={`${inputCls} w-24`}
                      min="0"
                      max="100"
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
                  <>
                    <div className="flex-1 flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">{c.name}</span>
                      {c.defaultWhtRate ? (
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                          หัก ณ ที่จ่าย {c.defaultWhtRate}%
                        </span>
                      ) : null}
                      {c.isFixed && (
                        <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                          พื้นฐาน
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startEdit(c)}
                        className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      {!c.isFixed && (
                        <button
                          onClick={() => setDeleteTarget(c)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        isOpen={mergeOpen}
        title="รวมหมวดที่ซ้ำกัน"
        message="ระบบจะเก็บหมวดหลัก (พื้นฐาน/เก่าสุด) แล้วย้าย expense ทั้งหมดจากหมวดชื่อซ้ำมาไว้ที่หมวดหลัก จากนั้นลบหมวดซ้ำทิ้ง — ทำซ้ำได้ปลอดภัย"
        confirmLabel="รวมหมวดซ้ำ"
        onConfirm={handleMerge}
        onClose={() => setMergeOpen(false)}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="ลบหมวดค่าใช้จ่าย"
        message={`ต้องการลบหมวด "${deleteTarget?.name}" ใช่หรือไม่? Expense ที่เคยใช้หมวดนี้จะยังคงข้อมูลเดิม (snapshot)`}
        confirmLabel={deleting ? 'กำลังลบ...' : 'ลบ'}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
        danger
      />
    </div>
  )
}
