'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { adminApi, setAuthToken } from '@/lib/api';
import { clsx } from 'clsx';

interface SupplyItem {
  id: string; crop_name: string; qty_kg: number; quality_grade: string;
  status: string; farmer_name: string; farmer_phone: string;
  farm_location: string; state: string; district: string; created_at: string;
}

const STATUS_COLORS: Record<string,string> = {
  pending:    'bg-amber-900/30 text-amber-400 border-amber-800',
  verified:   'bg-green-900/30 text-green-400 border-green-800',
  aggregated: 'bg-blue-900/30 text-blue-400 border-blue-800',
};

export default function SupplyVerifyPage() {
  const { getToken } = useAuth();
  const [items, setItems] = useState<SupplyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [gradeMap, setGradeMap] = useState<Record<string,string>>({});

  const load = async () => {
    const token = await getToken(); setAuthToken(token);
    const { data } = await adminApi.getSupplyItems();
    setItems(data); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleVerify = async (id: string) => {
    setVerifying(id);
    try {
      await adminApi.verifySupplyItem(id, { quality_grade: gradeMap[id] || 'ungraded' });
      load();
    } finally { setVerifying(null); }
  };

  const pending = items.filter(i => i.status === 'pending');
  const others  = items.filter(i => i.status !== 'pending');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Supply Verification</h1>
        <p className="text-zinc-400 text-sm mt-0.5">Review and grade farmer-submitted produce</p>
      </div>

      {/* Pending */}
      <div>
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
          Pending Verification ({pending.length})
        </h2>
        {loading ? (
          <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="card animate-pulse h-28 bg-zinc-800" />)}</div>
        ) : pending.length === 0 ? (
          <div className="card border border-zinc-800 text-center py-10">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-zinc-400">All supply items verified — great work!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map(item => (
              <div key={item.id} className="card border border-amber-800/40 bg-amber-900/10">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-white">{item.crop_name}</h3>
                      <span className="badge bg-amber-900/40 text-amber-400 border border-amber-800">pending</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-sm text-zinc-400 mb-3">
                      <span>📦 {item.qty_kg?.toLocaleString()} kg</span>
                      <span>👤 {item.farmer_name}</span>
                      <span>📞 {item.farmer_phone || '—'}</span>
                      <span>📍 {item.district}, {item.state}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div>
                      <label className="label">Grade</label>
                      <select
                        className="input w-32"
                        value={gradeMap[item.id] || 'ungraded'}
                        onChange={e => setGradeMap(p => ({ ...p, [item.id]: e.target.value }))}>
                        {['A','B','C','ungraded'].map(g => <option key={g} value={g}>{g === 'ungraded' ? 'Ungraded' : `Grade ${g}`}</option>)}
                      </select>
                    </div>
                    <div className="mt-5">
                      <button onClick={() => handleVerify(item.id)} disabled={verifying === item.id}
                        className="btn-primary">
                        {verifying === item.id ? '…' : '✅ Verify'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Verified / Aggregated */}
      {others.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
            Recently Processed ({others.length})
          </h2>
          <div className="card border border-zinc-800 overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  {['Crop','Qty (kg)','Farmer','Location','Grade','Status'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs text-zinc-500 font-semibold uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {others.map(item => (
                  <tr key={item.id} className="table-row">
                    <td className="px-4 py-3 text-white font-medium">{item.crop_name}</td>
                    <td className="px-4 py-3 text-zinc-300">{item.qty_kg?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-zinc-300">{item.farmer_name}</td>
                    <td className="px-4 py-3 text-zinc-400">{item.district}, {item.state}</td>
                    <td className="px-4 py-3 text-zinc-300">{item.quality_grade}</td>
                    <td className="px-4 py-3">
                      <span className={clsx('badge border', STATUS_COLORS[item.status] || 'bg-zinc-800 text-zinc-400')}>{item.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
