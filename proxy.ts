import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ป้องกันเฉพาะ /admin — /freelancer ใช้ LINE LIFF + custom token (แยกจากแอดมิน)
// ฝั่งแอดมินต้องเป็น Firebase Email/Password เท่านั้น (ดู AuthGuard + isFirebaseEmailPasswordAdmin)
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const adminSession = request.cookies.get('admin_session')
    if (!adminSession) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin', '/admin/:path*'],
}
