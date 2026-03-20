'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { adminApi, setAuthToken } from '@/lib/api';

export default function AdminDashboardPage() {
  const { getToken } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [aggregating, setAggregating] = useState(false);
  const [aggResult, setAggResult] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      setAuthToken(token);

      // Stamp role before any API call — guaranteed sync to DB via /api/internal/set-role
      await fetch('/api/set-role', { method: 'POST' });

      try {
        const { data: d } = await adminApi.getDashboard();
        setData(d);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleAggregate = async () => {
    setAggregating(true);
    try {
      const { data: res } = await adminApi.runAggregate();
      setAggResult(res);
    } finally { setAggregating(false); }
  };

  const usersByRole  = data?.users?.reduce((acc: any, u: any) => { acc[u.role] = parseInt(u.count); return acc; }, {}) || {};
  const supplyByStatus = data?.supply?.reduce((acc: any, s: any) => { acc[s.status] = { count: parseInt(s.count), qty: parseFloat(s.total_qty) }; return acc; }, {}) || {};
  const matchByStatus  = data?.matches?.reduce((acc: any, m: any) => { acc[m.status] = parseInt(m.count); return acc; }, {}) || {};

  if (loading) return (
    <div className="space-y-4">
      <div className="h-8 w-48 bg-zinc-800 rounded-lg animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => <div key={i} className="card h-24 bg-zinc-800 animate-pulse" />)}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Platform Overview</h1>
          <p className="text-zinc-400 text-sm mt-0.5">Real-time AgriConnect operations dashboard</p>
        </div>
        <div className="flex items-center gap-3">
          {aggResult && (
            <span className="text-xs text-green-400 bg-green-900/30 border border-green-800 px-3 py-1.5 rounded-xl">
              ✓ {aggResult.lotsCreated} lots created, {aggResult.lotsUpdated} updated
            </span>
          )}
          {/* <button onClick={handleAggregate} disabled={aggregating} className="btn-primary">
            {aggregating ? '⏳ Aggregating…' : '⚙️ Run Aggregation'}
          </button> */}
        </div>
      </div>

      <div>
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Users</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { role: 'farmer',   icon: '🌾', color: 'text-green-400',  bg: 'bg-green-900/20 border-green-800/40'   },
            { role: 'buyer',    icon: '🛒', color: 'text-blue-400',   bg: 'bg-blue-900/20 border-blue-800/40'     },
            { role: 'supplier', icon: '🧪', color: 'text-amber-400',  bg: 'bg-amber-900/20 border-amber-800/40'   },
            { role: 'admin',    icon: '⚙️', color: 'text-indigo-400', bg: 'bg-indigo-900/20 border-indigo-800/40' },
          ].map(u => (
            <div key={u.role} className={`card border ${u.bg}`}>
              <div className="text-2xl mb-1">{u.icon}</div>
              <div className={`text-2xl font-bold ${u.color}`}>{usersByRole[u.role] ?? 0}</div>
              <div className="text-xs text-zinc-500 capitalize">{u.role}s</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Operations</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="card border border-zinc-800">
            <div className="text-2xl mb-1">🏗️</div>
            <div className="text-2xl font-bold text-white">{data?.farmCount ?? 0}</div>
            <div className="text-xs text-zinc-500">Total Farms</div>
          </div>
          <div className="card border border-zinc-800">
            <div className="text-2xl mb-1">📝</div>
            <div className="text-2xl font-bold text-white">{data?.activeDemands ?? 0}</div>
            <div className="text-xs text-zinc-500">Active Demands</div>
          </div>
          <div className="card border border-zinc-800">
            <div className="text-2xl mb-1">✅</div>
            <div className="text-2xl font-bold text-amber-400">{supplyByStatus['open']?.count ?? 0}</div>
            <div className="text-xs text-zinc-500">Open Lots · {((supplyByStatus['open']?.qty ?? 0) / 1000).toFixed(1)}T</div>
          </div>
          <div className="card border border-zinc-800">
            <div className="text-2xl mb-1">🔔</div>
            <div className="text-2xl font-bold text-red-400">{data?.unreadLeads ?? 0}</div>
            <div className="text-xs text-zinc-500">Unread Leads</div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card border border-zinc-800">
          <h3 className="font-semibold text-white mb-4">Match Pipeline</h3>
          <div className="space-y-3">
            {['proposed','accepted','completed','rejected'].map(s => (
              <div key={s} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${s === 'proposed' ? 'bg-amber-400' : s === 'accepted' ? 'bg-green-400' : s === 'completed' ? 'bg-blue-400' : 'bg-red-400'}`} />
                  <span className="text-zinc-300 text-sm capitalize">{s}</span>
                </div>
                <span className="text-white font-bold">{matchByStatus[s] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card border border-zinc-800">
          <h3 className="font-semibold text-white mb-4">Crop Plan Status</h3>
          <div className="space-y-3">
            {data?.cropPlans?.map((p: any) => (
              <div key={p.status} className="flex items-center justify-between">
                <span className="text-zinc-300 text-sm capitalize">{p.status}</span>
                <span className="text-white font-bold">{p.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card border border-zinc-800">
        <h3 className="font-semibold text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: '✅ Verify Supply', href: '/dashboard/supply'   },
            { label: '🤝 Create Match',  href: '/dashboard/matches'  },
            { label: '📦 View Lots',     href: '/dashboard/lots'     },
            { label: '👥 Manage Users',  href: '/dashboard/users'    },
          ].map(a => (
            <a key={a.href} href={a.href}
              className="px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-sm font-medium transition-colors text-center">
              {a.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
