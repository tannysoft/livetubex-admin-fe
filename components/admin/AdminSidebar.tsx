'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  HomeIcon,
  VideoCameraIcon,
  UsersIcon,
  BanknotesIcon,
  BriefcaseIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  Bars3Icon,
  XMarkIcon,
  ArrowRightOnRectangleIcon,
  QueueListIcon,
  ChatBubbleLeftRightIcon,
  UserGroupIcon,
  BuildingOffice2Icon,
  DocumentTextIcon,
  DocumentDuplicateIcon,
  ReceiptPercentIcon,
  ClipboardDocumentCheckIcon,
  TruckIcon,
  CreditCardIcon,
  TagIcon,
  PresentationChartLineIcon,
  CalculatorIcon,
  ScaleIcon,
  RectangleStackIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import Logo from '@/components/ui/Logo'
import { useState } from 'react'
import { adminLogout } from '@/lib/auth'
import { useAuth } from '@/lib/auth-context'
import { sectionForPath, canAccessSection } from '@/lib/roles'

type NavItemDef = {
  href: string
  label: string
  icon: typeof HomeIcon
  exact?: boolean
}

type NavGroup = {
  title: string
  items: NavItemDef[]
}

const navGroups: NavGroup[] = [
  {
    title: 'เมนูหลัก',
    items: [
      { href: '/admin', label: 'Dashboard', icon: HomeIcon, exact: true },
      { href: '/admin/jobs', label: 'จัดการงานถ่ายทอดสด', icon: VideoCameraIcon },
      { href: '/admin/freelancers', label: 'Freelancer', icon: UsersIcon },
      { href: '/admin/positions', label: 'ตำแหน่ง', icon: BriefcaseIcon },
      { href: '/admin/payments', label: 'การเบิกจ่าย', icon: BanknotesIcon },
      { href: '/admin/payout', label: 'เตรียมจ่ายเงิน', icon: QueueListIcon },
      { href: '/admin/report', label: 'รายงานการจ่ายเงิน', icon: ChartBarIcon },
      { href: '/admin/line-messages', label: 'LINE Message Report', icon: ChatBubbleLeftRightIcon },
    ],
  },
  {
    title: 'บัญชี — ขาย',
    items: [
      { href: '/admin/accounting/customers', label: 'ลูกค้า', icon: UserGroupIcon },
      { href: '/admin/accounting/quotations', label: 'ใบเสนอราคา', icon: DocumentTextIcon },
      { href: '/admin/accounting/invoices', label: 'ใบแจ้งหนี้', icon: DocumentDuplicateIcon },
      { href: '/admin/accounting/tax-invoices', label: 'ใบกำกับภาษี', icon: ReceiptPercentIcon },
      { href: '/admin/accounting/receipts', label: 'ใบเสร็จรับเงิน', icon: ClipboardDocumentCheckIcon },
    ],
  },
  {
    title: 'บัญชี — รายจ่าย',
    items: [
      { href: '/admin/accounting/vendors', label: 'ผู้ขาย', icon: TruckIcon },
      { href: '/admin/accounting/expenses', label: 'รายจ่าย', icon: CreditCardIcon },
      { href: '/admin/accounting/expense-categories', label: 'หมวดค่าใช้จ่าย', icon: TagIcon },
      { href: '/admin/accounting/expense-report', label: 'รายงานรายจ่าย', icon: PresentationChartLineIcon },
    ],
  },
  {
    title: 'บัญชี — งบการเงิน',
    items: [
      { href: '/admin/accounting/profit-loss', label: 'งบกำไรขาดทุน (P&L)', icon: ScaleIcon },
      { href: '/admin/accounting/cash-flow', label: 'งบกระแสเงินสด', icon: BanknotesIcon },
      { href: '/admin/accounting/project-costs', label: 'ต้นทุนต่อโปรเจกต์', icon: RectangleStackIcon },
    ],
  },
  {
    title: 'บัญชี — ภาษี',
    items: [
      { href: '/admin/accounting/tax-reports/vat', label: 'ภพ.30 (VAT)', icon: ReceiptPercentIcon },
      { href: '/admin/accounting/tax-reports/wht', label: 'ภงด.3/53 (WHT)', icon: CalculatorIcon },
    ],
  },
  {
    title: 'บัญชี — ทั่วไป',
    items: [
      { href: '/admin/accounting/company-settings', label: 'ข้อมูลบริษัท', icon: BuildingOffice2Icon },
    ],
  },
  {
    title: 'ระบบ',
    items: [
      { href: '/admin/settings', label: 'ตั้งค่าระบบ', icon: Cog6ToothIcon },
      { href: '/admin/users', label: 'จัดการผู้ใช้', icon: ShieldCheckIcon },
    ],
  },
]

function NavItem({ href, label, icon: Icon, exact }: NavItemDef) {
  const pathname = usePathname()
  const active = exact ? pathname === href : pathname.startsWith(href)

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
        active
          ? 'bg-[#f73727] text-white shadow-md shadow-red-200'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      <span>{label}</span>
    </Link>
  )
}

export default function AdminSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const router = useRouter()
  const { user, role } = useAuth()

  const handleLogout = async () => {
    await adminLogout()
    router.replace('/login')
  }

  // กรองเมนูตามสิทธิ์ของ role — ซ่อนกลุ่มที่ไม่มีรายการเข้าถึงได้
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => role != null && canAccessSection(role, sectionForPath(item.href))),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-xl shadow-md border border-gray-100"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <XMarkIcon className="w-5 h-5" /> : <Bars3Icon className="w-5 h-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/30 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-100 z-40 flex flex-col transition-transform duration-300 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo area */}
        <div className="flex items-center px-6 py-5 border-b border-gray-100">
          <Logo width={140} height={21} />
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-4 overflow-y-auto">
          {visibleGroups.map((group) => (
            <div key={group.title} className="space-y-1">
              <p className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">{group.title}</p>
              {group.items.map((item) => (
                <NavItem key={item.href} {...item} />
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 space-y-2">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50">
            <div className="w-8 h-8 bg-[#f73727] rounded-full flex items-center justify-center text-white text-sm font-bold">A</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.email ?? 'Admin'}</p>
              <p className="text-xs text-gray-500">LiveTubeX</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
          >
            <ArrowRightOnRectangleIcon className="w-4 h-4" />
            ออกจากระบบ
          </button>
        </div>
      </aside>
    </>
  )
}
