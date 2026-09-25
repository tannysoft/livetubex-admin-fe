'use client'

import { useEffect, useState } from 'react'
import { ArrowPathIcon, EyeIcon, EyeSlashIcon, TrashIcon, UserGroupIcon } from '@heroicons/react/24/outline'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { deleteLineGroup, getLineGroups, lineGroupName, updateLineGroup, type LineGroup } from '@/lib/line-groups'
import { formatDateTime } from '@/lib/utils'

/**
 * กลุ่ม LINE ที่บอทอยู่ (function lineWebhook จดให้) — ตั้งชื่อเรียก / ซ่อนจากตัวเลือกตอนส่ง / เอาออกจากรายการ
 * ใช้ในหน้าตั้งค่า LINE
 */
export default function LineGroupsSection() {
  const [groups, setGroups] = useState<LineGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [removing, setRemoving] = useState<LineGroup | null>(null)

  const load = () => getLineGroups()
    .then((g) => { setGroups(g); setErr('') })
    .catch(() => setErr('โหลดรายการกลุ่มไม่สำเร็จ'))
    .finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const patch = async (g: LineGroup, p: { label?: string; hidden?: boolean }) => {
    setGroups((list) => list.map((x) => (x.id === g.id ? { ...x, ...p, ...(p.label !== undefined ? { label: p.label.trim() || undefined } : {}) } : x)))
    try { await updateLineGroup(g.id, p) } catch { setErr('บันทึกไม่สำเร็จ'); load() }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <UserGroupIcon className="w-5 h-5 text-brand" />
            กลุ่ม LINE
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            กลุ่มที่บอท LINE OA อยู่ — ใช้ส่งแผนจัดอุปกรณ์ / ผังระบบเข้ากลุ่ม (ปุ่ม “ส่ง LINE” ในหน้าแผน)
            · เชิญบอทเข้ากลุ่มแล้วขึ้นเอง กลุ่มที่บอทอยู่ก่อนตั้ง Webhook ให้พิมพ์ข้อความในกลุ่ม 1 ครั้ง
          </p>
        </div>
        <button onClick={() => { setLoading(true); load() }} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 shrink-0" title="โหลดใหม่">
          <ArrowPathIcon className="w-4 h-4" />
        </button>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
      <ul className="divide-y divide-gray-50 border border-gray-100 rounded-xl">
        {loading && <li className="px-4 py-6 text-center text-sm text-gray-400">กำลังโหลด…</li>}
        {!loading && groups.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-400">ยังไม่มีกลุ่ม — ตั้ง Webhook URL ด้านบน แล้วเชิญบอทเข้ากลุ่ม</li>}
        {!loading && groups.map((g) => (
          <li key={g.id} className={`flex items-center gap-3 px-4 py-3 ${g.hidden || !g.active ? 'opacity-60' : ''}`}>
            {g.pictureUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={g.pictureUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
              : <span className="w-9 h-9 rounded-full bg-green-50 text-green-700 flex items-center justify-center shrink-0"><UserGroupIcon className="w-4 h-4" /></span>}
            <div className="flex-1 min-w-0">
              <input
                defaultValue={g.label ?? ''}
                placeholder={g.name || 'กลุ่ม LINE'}
                onBlur={(e) => { if ((e.target.value.trim() || undefined) !== (g.label || undefined)) patch(g, { label: e.target.value }) }}
                className="w-full px-2 py-1 -mx-2 rounded-lg text-sm font-medium text-gray-900 border border-transparent hover:border-gray-200 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
                title="ชื่อเรียกในระบบ (ว่าง = ใช้ชื่อกลุ่มใน LINE)"
              />
              <p className="text-xs text-gray-500 truncate">
                {g.label ? `LINE: ${g.name} · ` : ''}
                {g.active ? `ล่าสุด ${formatDateTime(g.lastEventAt)}` : `บอทออกจากกลุ่มแล้ว${g.leftAt ? ` ${formatDateTime(g.leftAt)}` : ''}`}
                {g.hidden ? ' · ซ่อนอยู่' : ''}
              </p>
            </div>
            <button
              onClick={() => patch(g, { hidden: !g.hidden })}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
              title={g.hidden ? 'แสดงในตัวเลือกตอนส่ง' : 'ซ่อนจากตัวเลือกตอนส่ง'}
            >
              {g.hidden ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
            </button>
            <button onClick={() => setRemoving(g)} className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600" title="เอาออกจากรายการ">
              <TrashIcon className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        isOpen={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return
          const id = removing.id
          setRemoving(null)
          setGroups((list) => list.filter((x) => x.id !== id))
          try { await deleteLineGroup(id) } catch { setErr('ลบไม่สำเร็จ'); load() }
        }}
        title="เอากลุ่มออกจากรายการ"
        message={removing ? `เอา “${lineGroupName(removing)}” ออกจากรายการ? (บอทยังอยู่ในกลุ่ม — มีข้อความใหม่ในกลุ่มเมื่อไหร่จะกลับมาในรายการ ถ้าไม่ต้องการให้เตะบอทออกจากกลุ่มใน LINE)` : ''}
        confirmLabel="เอาออก"
        danger
      />
    </section>
  )
}
