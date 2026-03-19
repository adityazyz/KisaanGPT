'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import { clsx } from 'clsx';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { href: '/dashboard/products', label: 'My Products', icon: '📦' },
  { href: '/dashboard/leads', label: 'Leads', icon: '💼' },
  { href: '/dashboard/notifications', label: 'Notifications', icon: '🔔' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-stone-50">
      <aside className={clsx('fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-stone-200 flex flex-col transition-transform lg:translate-x-0 lg:static', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="px-6 py-5 border-b border-stone-200 flex items-center gap-3">
          <span className="text-2xl">🧪</span>
          <div>
            <div className="font-display font-bold text-amber-800 text-lg leading-tight">AgriConnect</div>
            <div className="text-xs text-stone-500">Supplier Portal</div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(n => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
              className={clsx('flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                pathname === n.href ? 'bg-amber-100 text-amber-800' : 'text-stone-600 hover:bg-stone-100')}>
              <span className="text-lg">{n.icon}</span>{n.label}
            </Link>
          ))}
        </nav>
        <div className="px-6 py-4 border-t border-stone-200 flex items-center gap-3">
          <UserButton afterSignOutUrl="/" /><span className="text-sm text-stone-500">My Account</span>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/20 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-stone-200 px-6 py-4 flex items-center gap-4 lg:hidden">
          <button onClick={() => setOpen(true)} className="text-stone-500 text-xl">☰</button>
          <span className="font-display font-bold text-amber-800">AgriConnect</span>
        </header>
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
