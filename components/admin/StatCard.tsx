interface StatCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  color: string
  sub?: string
}

export default function StatCard({ title, value, icon, color, sub }: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        {/* min-w-0 + ยอดย่อลงบนจอเล็ก — ยอดหลักล้านไม่ดันไอคอนหลุดการ์ด */}
        <div className="min-w-0">
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="mt-1 text-lg sm:text-2xl font-bold text-gray-900 tabular-nums break-words">{value}</p>
          {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
        </div>
        <div className={`hidden sm:block shrink-0 p-3 rounded-xl ${color}`}>{icon}</div>
      </div>
    </div>
  )
}
