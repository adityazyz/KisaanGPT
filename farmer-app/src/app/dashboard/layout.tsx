'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import { clsx } from 'clsx';
import { useLanguage, Lang } from '@/context/LanguageContext';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { lang, setLang, t } = useLanguage();

  const NAV = [
    { href: '/dashboard',               label: t('nav_dashboard'),     icon: '🏠' },
    { href: '/dashboard/farms',         label: t('nav_farms'),         icon: '🌾' },
    { href: '/dashboard/crop-plans',    label: t('nav_crop_plans'),    icon: '📋' },
    { href: '/dashboard/production',    label: t('nav_production'),    icon: '📦' },
    { href: '/dashboard/supply',        label: t('nav_supply'),        icon: '🚜' },
    { href: '/dashboard/crop-analysis', label: t('nav_crop_ai'),       icon: '🔬', badge: t('badge_ai') },
    { href: '/dashboard/inputs',        label: t('nav_inputs'),        icon: '🧪' },
    { href: '/dashboard/notifications', label: t('nav_notifications'), icon: '🔔' },
  ];

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className={clsx(
        'fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-[#e8ddd0] flex flex-col transition-transform lg:translate-x-0 lg:static',
        open ? 'translate-x-0' : '-translate-x-full'
      )}>

        {/* Logo */}
        <div className="px-6 py-5 border-b border-[#e8ddd0] flex items-center gap-3">
          <span className="text-2xl">🌿</span>
          <div>
            <div className="font-display font-bold text-leaf-800 text-lg leading-tight">{t('app_name')}</div>
            <div className="text-xs text-[#7a6652]">{t('app_tagline')}</div>
          </div>
        </div>

        {/* ── Language Switcher ─────────────────────────────────────── */}
        <div className="px-4 py-3 border-b border-[#e8ddd0]">
          <div className="flex items-center gap-1 bg-[#fdf8f0] rounded-xl p-1">
            <button
              onClick={() => setLang('en')}
              className={clsx(
                'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all',
                lang === 'en'
                  ? 'bg-white text-leaf-800 shadow-sm'
                  : 'text-[#7a6652] hover:text-[#2d1f0e]'
              )}>
              <span>🇬🇧</span> English
            </button>
            <button
              onClick={() => setLang('hi')}
              className={clsx(
                'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all',
                lang === 'hi'
                  ? 'bg-white text-leaf-800 shadow-sm'
                  : 'text-[#7a6652] hover:text-[#2d1f0e]'
              )}>
              <span>🇮🇳</span> हिंदी
            </button>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href}
              onClick={() => setOpen(false)}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                pathname === n.href
                  ? 'bg-leaf-100 text-leaf-800'
                  : 'text-[#7a6652] hover:bg-earth-50 hover:text-[#2d1f0e]'
              )}>
              <span className="text-lg">{n.icon}</span>
              <span className="flex-1">{n.label}</span>
              {n.badge && (
                <span className="text-xs bg-leaf-600 text-white px-1.5 py-0.5 rounded-full leading-none">
                  {n.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>

        {/* Account */}
        <div className="px-6 py-4 border-t border-[#e8ddd0] flex items-center gap-3">
          <UserButton afterSignOutUrl="/" />
          <span className="text-sm text-[#7a6652]">{t('nav_my_account')}</span>
        </div>
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-30 bg-black/20 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-[#e8ddd0] px-6 py-4 flex items-center gap-4 lg:hidden">
          <button onClick={() => setOpen(true)} className="text-[#7a6652] text-xl">☰</button>
          <span className="font-display font-bold text-leaf-800">{t('app_name')}</span>
        </header>
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
