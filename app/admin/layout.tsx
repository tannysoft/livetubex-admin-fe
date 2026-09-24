import { AuthProvider } from '@/lib/auth-context'
import AuthGuard from '@/components/admin/AuthGuard'
import AdminSidebar from '@/components/admin/AdminSidebar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGuard>
        <div className="min-h-screen bg-gray-50 print:bg-white">
          <AdminSidebar />
          <main className="lg:ml-64 print:ml-0 min-h-screen">
            <div className="p-6 lg:p-8 print:p-0">{children}</div>
          </main>
        </div>
      </AuthGuard>
    </AuthProvider>
  )
}
