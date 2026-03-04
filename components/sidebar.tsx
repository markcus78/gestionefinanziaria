'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import {
  LayoutDashboard,
  TrendingUp,
  Calendar,
  ClipboardList,
  Wallet,
  BarChart3,
  ArrowLeftRight,
  Settings,
  Building2,
  LogOut,
  Flag,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react'
import { signOut } from '@/app/login/actions'

const ReportModal = dynamic(() => import('./report-modal').then(m => m.ReportModal), { ssr: false })

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/operations', label: 'Incassi', icon: TrendingUp },
  { href: '/schedule', label: 'Scadenzario', icon: Calendar },
  { href: '/impegni', label: 'Impegni', icon: ClipboardList },
  { href: '/treasury', label: 'Tesoreria', icon: Wallet },
  { href: '/forecast', label: 'Previsione 6 mesi', icon: BarChart3 },
  { href: '/intercompany', label: 'Intercompany', icon: ArrowLeftRight },
]

type SidebarProps = {
  unreadCount?: number
  isStrategic?: boolean
}

export function Sidebar({ unreadCount, isStrategic }: SidebarProps) {
  const pathname = usePathname()
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <aside className="w-56 bg-zinc-900 border-r border-zinc-800 flex flex-col h-full shrink-0">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-100 leading-tight">GestFin</p>
            <p className="text-xs text-zinc-500">Wellness Town Group</p>
          </div>
        </div>
      </div>

      {/* Nav principale */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          )
        })}

        {/* Segnalazioni — solo strategic */}
        {isStrategic && (
          <Link
            href="/reports"
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              pathname === '/reports' || pathname.startsWith('/reports/')
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
            }`}
          >
            <Flag className="w-4 h-4 shrink-0" />
            <span className="flex-1">Segnalazioni</span>
            {unreadCount != null && unreadCount > 0 && (
              <span className="bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {unreadCount}
              </span>
            )}
          </Link>
        )}

        {/* Audit Log — solo strategic */}
        {isStrategic && (
          <Link
            href="/audit"
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              pathname === '/audit' || pathname.startsWith('/audit/')
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4 shrink-0" />
            Audit Log
          </Link>
        )}
      </nav>

      {/* Bottom */}
      <div className="px-2 py-3 border-t border-zinc-800 space-y-0.5">
        {/* Bottone Segnala — visibile a tutti */}
        <button
          onClick={() => setModalOpen(true)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
        >
          <MessageSquare className="w-4 h-4 shrink-0" />
          Segnala
        </button>

        <Link
          href="/settings"
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            pathname.startsWith('/settings')
              ? 'bg-indigo-600 text-white'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
          }`}
        >
          <Settings className="w-4 h-4 shrink-0" />
          Impostazioni
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Esci
          </button>
        </form>
      </div>

      {modalOpen && <ReportModal onClose={() => setModalOpen(false)} />}
    </aside>
  )
}
