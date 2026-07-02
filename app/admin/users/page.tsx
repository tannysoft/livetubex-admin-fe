'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  PlusIcon, TrashIcon, KeyIcon, NoSymbolIcon, CheckCircleIcon,
  ShieldCheckIcon, ExclamationCircleIcon, LockClosedIcon,
} from '@heroicons/react/24/outline'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import FormListbox from '@/components/ui/FormListbox'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/lib/auth-context'
import {
  listAdminUsers, createAdminUser, updateAdminUserRole,
  setAdminUserDisabled, deleteAdminUser, resetAdminUserPassword,
} from '@/lib/adminUsers'
import {
  ADMIN_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, ROLE_BADGE_COLOR, BOOTSTRAP_OWNER_EMAIL,
} from '@/lib/roles'
import { formatDate } from '@/lib/utils'
import type { AdminUser, AdminRole } from '@/lib/types'

const roleOptions = ADMIN_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))

function errMsg(e: unknown): string {
  const m = (e as { message?: string })?.message ?? ''
  return m.replace(/^.*?:\s*/, '') || 'เกิดข้อผิดพลาด'
}

export default function UsersPage() {
  const { user, role } = useAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState<string | null>(null) // uid ที่กำลังทำงาน
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null)

  const isOwner = role === 'owner'

  const load = async () => {
    setLoading(true)
    setLoadError('')
    try {
      setUsers(await listAdminUsers())
    } catch (e) {
      setLoadError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (isOwner) load() }, [isOwner])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const showToast = (ok: boolean, msg: string) => setToast({ ok, msg })

  const isBootstrap = (u: AdminUser) => u.email.toLowerCase() === BOOTSTRAP_OWNER_EMAIL
  const isSelf = (u: AdminUser) => u.uid === user?.uid

  const handleRoleChange = async (u: AdminUser, newRole: AdminRole) => {
    if (newRole === u.role) return
    setBusy(u.uid)
    try {
      await updateAdminUserRole(u.uid, newRole)
      setUsers((prev) => prev.map((x) => x.uid === u.uid ? { ...x, role: newRole } : x))
      showToast(true, `เปลี่ยน role ของ ${u.email} เป็น ${ROLE_LABELS[newRole]}`)
    } catch (e) {
      showToast(false, errMsg(e))
    } finally { setBusy(null) }
  }

  const handleToggleDisabled = async (u: AdminUser) => {
    setBusy(u.uid)
    try {
      await setAdminUserDisabled(u.uid, !u.disabled)
      setUsers((prev) => prev.map((x) => x.uid === u.uid ? { ...x, disabled: !u.disabled } : x))
      showToast(true, `${!u.disabled ? 'ปิดใช้งาน' : 'เปิดใช้งาน'} ${u.email} แล้ว`)
    } catch (e) {
      showToast(false, errMsg(e))
    } finally { setBusy(null) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const u = deleteTarget
    setBusy(u.uid)
    setDeleteTarget(null)
    try {
      await deleteAdminUser(u.uid)
      setUsers((prev) => prev.filter((x) => x.uid !== u.uid))
      showToast(true, `ลบ ${u.email} แล้ว`)
    } catch (e) {
      showToast(false, errMsg(e))
    } finally { setBusy(null) }
  }

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => !u.disabled).length,
  }), [users])

  if (!isOwner) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center gap-3">
        <LockClosedIcon className="w-12 h-12 text-gray-300" />
        <p className="text-gray-500">เฉพาะ <b>เจ้าของระบบ (Owner)</b> เท่านั้นที่จัดการผู้ใช้ได้</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">จัดการผู้ใช้</h1>
          <p className="text-gray-500 mt-1">
            ผู้ใช้แอดมิน {stats.total} คน · ใช้งานอยู่ {stats.active}
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#f73727] text-white text-sm font-medium rounded-xl hover:bg-red-600 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          เพิ่มผู้ใช้
        </button>
      </div>

      {/* role legend */}
      <div className="flex flex-wrap gap-3">
        {ADMIN_ROLES.map((r) => (
          <div key={r} className="flex items-center gap-2 text-xs bg-white border border-gray-100 rounded-xl px-3 py-2">
            <span className={`px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE_COLOR[r]}`}>{ROLE_LABELS[r]}</span>
            <span className="text-gray-500">{ROLE_DESCRIPTIONS[r]}</span>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
          </div>
        ) : loadError ? (
          <div className="py-16 text-center">
            <ExclamationCircleIcon className="w-10 h-10 text-amber-400 mx-auto" />
            <p className="text-gray-500 text-sm mt-3">โหลดรายชื่อไม่สำเร็จ: {loadError}</p>
            <p className="text-xs text-gray-400 mt-1">(ต้อง deploy Cloud Functions ก่อนใช้งาน)</p>
            <button onClick={load} className="mt-3 text-[#f73727] hover:underline text-sm">ลองใหม่</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold">ผู้ใช้</th>
                  <th className="px-5 py-3 text-left font-semibold w-44">Role</th>
                  <th className="px-5 py-3 text-center font-semibold">สถานะ</th>
                  <th className="px-5 py-3 text-left font-semibold">สร้างเมื่อ</th>
                  <th className="px-5 py-3 text-right font-semibold w-32"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map((u) => {
                  const locked = isBootstrap(u)
                  const rowBusy = busy === u.uid
                  return (
                    <tr key={u.uid} className={`hover:bg-gray-50 ${u.disabled ? 'opacity-50' : ''}`}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{u.email}</span>
                          {isSelf(u) && <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full">คุณ</span>}
                          {locked && <ShieldCheckIcon className="w-3.5 h-3.5 text-purple-500" title="Owner ตั้งต้น" />}
                        </div>
                        {u.name && <div className="text-xs text-gray-500">{u.name}</div>}
                      </td>
                      <td className="px-5 py-3">
                        {locked ? (
                          <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium ${ROLE_BADGE_COLOR[u.role]}`}>
                            {ROLE_LABELS[u.role]}
                          </span>
                        ) : (
                          <FormListbox
                            value={u.role}
                            onChange={(v) => handleRoleChange(u, v as AdminRole)}
                            options={roleOptions}
                            disabled={rowBusy}
                          />
                        )}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium ${
                          u.disabled ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'
                        }`}>
                          {u.disabled ? 'ปิดใช้งาน' : 'ใช้งานอยู่'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                        {u.createdAt ? formatDate(u.createdAt.slice(0, 10)) : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setResetTarget(u)}
                            disabled={rowBusy}
                            className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-40"
                            title="ตั้งรหัสผ่านใหม่"
                          >
                            <KeyIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleDisabled(u)}
                            disabled={rowBusy || locked || isSelf(u)}
                            className="p-2 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-40"
                            title={u.disabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                          >
                            {u.disabled ? <CheckCircleIcon className="w-4 h-4" /> : <NoSymbolIcon className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => setDeleteTarget(u)}
                            disabled={rowBusy || locked || isSelf(u)}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                            title="ลบผู้ใช้"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-lg text-sm font-medium ${
          toast.ok ? 'bg-green-500 text-white' : 'bg-yellow-500 text-white'
        }`}>
          {toast.ok ? <CheckCircleIcon className="w-5 h-5 shrink-0" /> : <ExclamationCircleIcon className="w-5 h-5 shrink-0" />}
          {toast.msg}
        </div>
      )}

      <AddUserModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(msg) => { setAddOpen(false); showToast(true, msg); load() }}
        onError={(msg) => showToast(false, msg)}
      />

      <ResetPasswordModal
        target={resetTarget}
        onClose={() => setResetTarget(null)}
        onDone={(msg) => { setResetTarget(null); showToast(true, msg) }}
        onError={(msg) => showToast(false, msg)}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="ลบผู้ใช้"
        message={`ต้องการลบผู้ใช้ ${deleteTarget?.email} ใช่หรือไม่? บัญชีล็อกอินจะถูกลบถาวร`}
        confirmLabel="ลบ"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
        danger
      />
    </div>
  )
}

const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#f73727]/30 focus:border-[#f73727]'
const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

function AddUserModal({ isOpen, onClose, onCreated, onError }: {
  isOpen: boolean
  onClose: () => void
  onCreated: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<AdminRole>('admin')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) { setEmail(''); setName(''); setPassword(''); setRole('admin'); setError('') }
  }, [isOpen])

  const submit = async () => {
    setError('')
    if (!email.includes('@')) { setError('อีเมลไม่ถูกต้อง'); return }
    if (password.length < 6) { setError('รหัสผ่านอย่างน้อย 6 ตัว'); return }
    setSaving(true)
    try {
      await createAdminUser({ email: email.trim(), password, name: name.trim() || undefined, role })
      onCreated(`เพิ่มผู้ใช้ ${email.trim()} แล้ว`)
    } catch (e) {
      const m = errMsg(e)
      setError(m)
      onError(m)
    } finally { setSaving(false) }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="เพิ่มผู้ใช้แอดมิน" size="md">
      <div className="space-y-4">
        <div>
          <label className={labelCls}>อีเมล *</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="user@example.com" autoComplete="off" />
        </div>
        <div>
          <label className={labelCls}>ชื่อ (ไม่บังคับ)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="ชื่อผู้ใช้" />
        </div>
        <div>
          <label className={labelCls}>รหัสผ่าน * (อย่างน้อย 6 ตัว)</label>
          <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="ตั้งรหัสผ่านให้ผู้ใช้" autoComplete="new-password" />
        </div>
        <div>
          <label className={labelCls}>Role *</label>
          <FormListbox value={role} onChange={(v) => setRole(v as AdminRole)} options={roleOptions} buttonClassName={inputCls} />
          <p className="text-xs text-gray-400 mt-1">{ROLE_DESCRIPTIONS[role]}</p>
        </div>

        {error && <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200">ยกเลิก</button>
          <button onClick={submit} disabled={saving} className="px-6 py-2.5 text-sm font-medium text-white bg-[#f73727] rounded-xl hover:bg-red-600 disabled:opacity-60 flex items-center gap-2">
            {saving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            เพิ่มผู้ใช้
          </button>
        </div>
      </div>
    </Modal>
  )
}

function ResetPasswordModal({ target, onClose, onDone, onError }: {
  target: AdminUser | null
  onClose: () => void
  onDone: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (target) { setPassword(''); setError('') } }, [target])

  const submit = async () => {
    setError('')
    if (password.length < 6) { setError('รหัสผ่านอย่างน้อย 6 ตัว'); return }
    if (!target) return
    setSaving(true)
    try {
      await resetAdminUserPassword(target.uid, password)
      onDone(`ตั้งรหัสผ่านใหม่ให้ ${target.email} แล้ว`)
    } catch (e) {
      const m = errMsg(e)
      setError(m)
      onError(m)
    } finally { setSaving(false) }
  }

  return (
    <Modal isOpen={!!target} onClose={onClose} title={`ตั้งรหัสผ่านใหม่ — ${target?.email ?? ''}`} size="sm">
      <div className="space-y-4">
        <div>
          <label className={labelCls}>รหัสผ่านใหม่ * (อย่างน้อย 6 ตัว)</label>
          <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="รหัสผ่านใหม่" autoComplete="new-password" />
        </div>
        {error && <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200">ยกเลิก</button>
          <button onClick={submit} disabled={saving} className="px-6 py-2.5 text-sm font-medium text-white bg-[#f73727] rounded-xl hover:bg-red-600 disabled:opacity-60 flex items-center gap-2">
            {saving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            บันทึก
          </button>
        </div>
      </div>
    </Modal>
  )
}
