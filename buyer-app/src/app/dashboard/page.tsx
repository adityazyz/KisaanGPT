'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { buyerApi, setAuthToken } from '@/lib/api';

export default function BuyerDashboardPage() {
  const { getToken } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      setAuthToken(token);

      // Stamp role first — idempotent, runs on every dashboard load.
      // Ensures role is set even if sign-up redirect fired before RoleStamper could run.
      // set-role also directly updates the DB row (not just Clerk metadata),
      // so no webhook timing dependency.
      await fetch('/api/set-role', { method: 'POST' });

      try {
        const { data } = await buyerApi.getDashboard();
        setStats(data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const cards = [
    { label: 'Active Demands',  value: stats?.activeDemands  ?? '—', icon: '📝', color: 'bg-brand-50 border-brand-200'  },
    { label: 'Pending Matches', value: stats?.pendingMatches ?? '—', icon: '🤝', color: 'bg-amber-50 border-amber-200' },
    { label: 'Available Lots',  value: stats?.availableLots  ?? '—', icon: '🌾', color: 'bg-green-50 border-green-200'  },
  ];

  return (
    <div>
      <h1 className="text-2xl font-display font-bold text-slate-900 mb-1">Buyer Dashboard</h1>
      <p className="text-slate-500 mb-8">Source fresh produce directly from verified farmers.</p>

      {loading ? (
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[...Array(3)].map((_, i) => <div key={i} className="card animate-pulse h-28 bg-slate-100" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {cards.map(c => (
            <div key={c.label} className={`card border ${c.color}`}>
              <div className="text-3xl mb-2">{c.icon}</div>
              <div className="text-2xl font-bold text-slate-900">{c.value}</div>
              <div className="text-sm text-slate-500">{c.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="font-display font-semibold text-lg text-slate-900 mb-4">Quick Actions</h2>
          <div className="space-y-2">
            {[
              { label: '📝 Post a new demand',          href: '/dashboard/demands' },
              { label: '🌾 Browse available supply lots', href: '/dashboard/supply'  },
              { label: '🤝 View my matches',             href: '/dashboard/matches' },
            ].map(a => (
              <a key={a.href} href={a.href}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl hover:bg-brand-50 text-slate-700 text-sm font-medium transition-colors">
                {a.label}
              </a>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="font-display font-semibold text-lg text-slate-900 mb-4">How It Works</h2>
          <ol className="space-y-3 text-sm text-slate-600">
            {[
              { n: 1, t: 'Post your demand',    d: 'Specify crop, quantity, price, and delivery location'         },
              { n: 2, t: 'Admin matches supply', d: 'Our team finds verified supply lots that fit your needs'     },
              { n: 3, t: 'Accept the match',    d: 'Review and confirm the match details'                         },
              { n: 4, t: 'Coordinate delivery', d: 'Admin assists with logistics and final handover'              },
            ].map(s => (
              <li key={s.n} className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold">{s.n}</span>
                <div><span className="font-semibold text-slate-800">{s.t}</span> — {s.d}</div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}