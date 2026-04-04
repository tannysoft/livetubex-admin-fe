interface SkeletonProps {
  className?: string
}

/** กล่อง skeleton เดี่ยว ปรับขนาดด้วย className */
export function Skeleton({ className }: SkeletonProps) {
  return <div className={`skeleton${className ? ` ${className}` : ''}`} />
}

/** Skeleton สำหรับ card ใน admin (row ที่มีชื่อ + metadata + ปุ่ม) */
export function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-2/5 rounded-lg" />
          <Skeleton className="h-4 w-3/5 rounded-lg" />
          <div className="flex gap-4 mt-3">
            <Skeleton className="h-3.5 w-24 rounded-md" />
            <Skeleton className="h-3.5 w-20 rounded-md" />
            <Skeleton className="h-3.5 w-16 rounded-md" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

/** Skeleton สำหรับ stats card */
export function SkeletonStat() {
  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
      <Skeleton className="h-4 w-24 rounded-md" />
      <Skeleton className="h-8 w-32 rounded-lg mt-3" />
      <Skeleton className="h-3.5 w-16 rounded-md mt-2" />
    </div>
  )
}

/** Skeleton row ในตาราง */
export function SkeletonTableRow({ cols = 6 }: { cols?: number }) {
  const widths = ['w-28', 'w-40', 'w-32', 'w-20', 'w-16', 'w-12']
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-5 py-4">
          <Skeleton className={`h-4 ${widths[i % widths.length]} rounded-md`} />
        </td>
      ))}
    </tr>
  )
}

/** Skeleton สำหรับ freelancer payment card ใน LIFF */
export function SkeletonPaymentCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3 rounded-md" />
          <Skeleton className="h-3 w-1/2 rounded-md" />
          <Skeleton className="h-3 w-2/5 rounded-md" />
        </div>
        <div className="text-right space-y-2">
          <Skeleton className="h-5 w-20 rounded-md" />
          <Skeleton className="h-3 w-16 rounded-md" />
          <Skeleton className="h-5 w-16 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

/** Skeleton header profile ใน LIFF */
export function SkeletonProfile() {
  return (
    <div className="flex items-center gap-3 mt-5 pb-5">
      <Skeleton className="w-14 h-14 rounded-full" />
      <div className="space-y-2">
        <Skeleton className="h-5 w-32 rounded-md" />
        <Skeleton className="h-4 w-24 rounded-md" />
      </div>
    </div>
  )
}
