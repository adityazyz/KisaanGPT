'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { supplierApi, setAuthToken } from '@/lib/api';

export default function SupplierDashboardPage() {
  const { getToken } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      setAuthToken(token);

      // Stamp role before any API call — guaranteed sync to DB via /api/internal/set-role
      await fetch('/api/set-role', { method: 'POST' });

      try {
        const { data } = await supplierApi.getDashboard();
        setStats(data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const cards = [
    { label: 'Active Products', value: stats?.activeProducts ?? '—', icon: '📦', color: 'bg-amber-50 border-amber-200' },
    { label: 'Total Leads',     value: stats?.totalLeads     ?? '—', icon: '💼', color: 'bg-stone-50 border-stone-200' },
    { label: 'Unread Leads',    value: stats?.unreadLeads    ?? '—', icon: '🔔', color: 'bg-red-50 border-red-200'     },
  ];

  return (
    <div>
      <h1 className="text-2xl font-display font-bold text-stone-900 mb-1">Supplier Dashboard</h1>
      <p className="text-stone-500 mb-8">Manage your products and respond to farmer enquiries.</p>

      {loading ? (
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[...Array(3)].map((_, i) => <div key={i} className="card animate-pulse h-28 bg-stone-100" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {cards.map(c => (
            <div key={c.label} className={`card border ${c.color}`}>
              <div className="text-3xl mb-2">{c.icon}</div>
              <div className="text-2xl font-bold text-stone-900">{c.value}</div>
              <div className="text-sm text-stone-500">{c.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="font-display font-semibold text-lg text-stone-900 mb-4">Quick Actions</h2>
          <div className="space-y-2">
            {[
              { label: '📦 Add a new product',    href: '/dashboard/products' },
              { label: '💼 View incoming leads',  href: '/dashboard/leads'    },
            ].map(a => (
              <a key={a.href} href={a.href}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl hover:bg-amber-50 text-stone-700 text-sm font-medium transition-colors">
                {a.label}
              </a>
            ))}
          </div>
        </div>

        {/* <div className="card">
          <h2 className="font-display font-semibold text-lg text-stone-900 mb-4">How It Works</h2>
          <ol className="space-y-3 text-sm text-stone-600">
            {[
              { n: 1, t: 'List your products', d: 'Add seeds, fertilizers, pesticides or equipment'     },
              { n: 2, t: 'Get discovered',     d: 'Farmers browsing relevant crop plans see your listings' },
              { n: 3, t: 'Receive leads',      d: 'Interested farmers send enquiries directly to you'    },
              { n: 4, t: 'Close sales',        d: 'Contact farmers directly using their phone/email'     },
            ].map(s => (
              <li key={s.n} className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold">{s.n}</span>
                <div><span className="font-semibold text-stone-800">{s.t}</span> — {s.d}</div>
              </li>
            ))}
          </ol>
        </div> */}
      </div>
    </div>
  );
}
