'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { adminApi, setAuthToken } from '@/lib/api';
import { clsx } from 'clsx';

interface Lot {
  id: string; crop_name: string; location: string; state: string; district: string;
  total_qty_kg: number; available_qty: number; quality_grade: string; status: string;
  item_count: number; price_per_kg: number; created_at: string;
}

const STATUS_COLORS: Record<string,string> = {
  open:    'bg-green-900/30 text-green-400 border-green-800',
  matched: 'bg-blue-900/30 text-blue-400 border-blue-800',
  closed:  'bg-zinc-800 text-zinc-500 border-zinc-700',
};

export default function LotsPage() {
  const { getToken } = useAuth();
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [aggregating, setAggregating] = useState(false);
  const [result, setResult] = useState<any>(null);

  const load = async () => {
    const token = await getToken(); setAuthToken(token);
    const { data } = await adminApi.getLots();
    setLots(data); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleAggregate = async () => {
    setAggregating(true);
    try { const { data } = await adminApi.runAggregate(); setResult(data); load(); }
    finally { setAggregating(false); }
  };

  const totalKg = lots.filter(l => l.status === 'open').reduce((s, l) => s + (l.available_qty || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Supply Lots</h1>
          <p className="text-zinc-400 text-sm mt-0.5">Aggregated supply by crop and location</p>
        </div>
        <div className="flex items-center gap-3">
          {result && <span className="text-xs text-green-400 bg-green-900/30 border border-green-800 px-3 py-1.5 rounded-xl">✓ {result.lotsCreated} created, {result.lotsUpdated} updated</span>}
          <button onClick={handleAggregate} disabled={aggregating} className="btn-primary">
            {aggregating ? '⏳…' : '⚙️ Run Aggregation'}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card border border-zinc-800">
          <div className="text-xl font-bold text-green-400">{lots.filter(l => l.status === 'open').length}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Open Lots</div>
        </div>
        <div className="card border border-zinc-800">
          <div className="text-xl font-bold text-white">{(totalKg / 1000).toFixed(2)} T</div>
          <div className="text-xs text-zinc-500 mt-0.5">Available Tonnage</div>
        </div>
        <div className="card border border-zinc-800">
          <div className="text-xl font-bold text-blue-400">{lots.filter(l => l.status === 'matched').length}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Matched Lots</div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="card h-20 bg-zinc-800 animate-pulse" />)}</div>
      ) : lots.length === 0 ? (
        <div className="card border border-zinc-800 text-center py-12">
          <p className="text-zinc-500">No lots yet. Run aggregation after verifying supply items.</p>
        </div>
      ) : (
        <div className="card border border-zinc-800 overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                {['Crop','Location','Total Qty','Available','Grade','Items','Status','Created'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-zinc-500 font-semibold uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lots.map(lot => (
                <tr key={lot.id} className="table-row">
                  <td className="px-4 py-3 text-white font-semibold">{lot.crop_name}</td>
                  <td className="px-4 py-3 text-zinc-300">{lot.location}</td>
                  <td className="px-4 py-3 text-zinc-300">{lot.total_qty_kg?.toLocaleString()} kg</td>
                  <td className="px-4 py-3 text-green-400 font-medium">{lot.available_qty?.toLocaleString()} kg</td>
                  <td className="px-4 py-3 text-zinc-300">{lot.quality_grade}</td>
                  <td className="px-4 py-3 text-zinc-400">{lot.item_count}</td>
                  <td className="px-4 py-3">
                    <span className={clsx('badge border', STATUS_COLORS[lot.status] || 'bg-zinc-800 text-zinc-400')}>{lot.status}</span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{new Date(lot.created_at).toLocaleDateString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
