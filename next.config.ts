import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactCompiler: true,

  // ── Firebase Hosting: export เป็น static files ──────────────────────────
  output: 'export',

  // trailing slash สำหรับ Firebase Hosting routing
  trailingSlash: true,

  // ปิด image optimization (ไม่มี server ใน static export)
  images: {
    unoptimized: true,
  },
}

export default nextConfig
