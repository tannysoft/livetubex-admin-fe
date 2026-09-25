'use client'

import SharedPlanScreen from '@/components/share/SharedPlanScreen'

/** แผนงานแชร์ทีมงานใน LINE — https://liff.line.me/{liffId}/plan?s={shareId} (LIFF endpoint = /freelancer) */
export default function Page() {
  return (
    <div className="min-h-dvh bg-gray-50 text-gray-900">
      <SharedPlanScreen via="liff" />
    </div>
  )
}
