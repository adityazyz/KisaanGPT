'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import { clsx } from 'clsx';

const NAV = [
  { href: '/dashboard',           label: 'Overview',       icon: '📊' },
  { href: '/dashboard/supply',    label: 'Supply Verify',  icon: '✅' },
  { href: '/dashboard/lots',      label: 'Supply Lots',    icon: '📦' },
  { href: '/dashboard/demands',   label: 'Buyer Demands',  icon: '📝' },
  { href: '/dashboard/matches',   label: 'Matching',       icon: '🤝' },
  { href: '/dashboard/users',     label: 'Users',          icon: '👥' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-zinc-950">
      {/* Sidebar */}
      <aside className={clsx(
        'fixed inset-y-0 left-0 z-40 w-60 bg-zinc-900 border-r border-zinc-800 flex flex-col transition-transform lg:translate-x-0 lg:static',
        open ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-sm">⚙️</div>
            <div>
              <div className="font-bold text-white text-sm leading-tight">KisaanGPT</div>
              <div className="text-xs text-zinc-500">Admin Console</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV.map(n => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
              className={clsx(
                'flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                pathname === n.href
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-600/30'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              )}>
              <span>{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-zinc-800 flex items-center gap-3">
          <UserButton afterSignOutUrl="/" />
          <span className="text-xs text-zinc-500">Admin</span>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-zinc-900/80 backdrop-blur border-b border-zinc-800 px-5 py-3 flex items-center gap-3 lg:hidden">
          <button onClick={() => setOpen(true)} className="text-zinc-400 text-lg">☰</button>
          <span className="font-bold text-white text-sm">KisaanGPT Admin</span>
        </header>
        <main className="flex-1 p-5 overflow-auto max-w-screen-xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
