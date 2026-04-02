import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ป้องกัน /admin ทุก route — ถ้าไม่มี session cookie ให้ redirect ไป /login
// Firebase Auth ทำงาน client-side ดังนั้น proxy นี้ใช้ cookie ที่ set จาก AuthGuard
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/admin')) {
    const adminSession = request.cookies.get('admin_session')
    if (!adminSession) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
