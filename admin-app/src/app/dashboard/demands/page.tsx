'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { adminApi, setAuthToken } from '@/lib/api';

interface Demand { id: string; crop_name: string; quantity_kg: number; price_per_kg: number; delivery_state: string; delivery_district: string; required_by: string; quality_pref: string; notes: string; buyer_name: string; buyer_email: string; match_count: number; created_at: string; }

export default function AdminDemandsPage() {
  const { getToken } = useAuth();
  const [demands, setDemands] = useState<Demand[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getToken(); setAuthToken(token);
      const { data } = await adminApi.getDemands();
      setDemands(data); setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Buyer Demands</h1>
        <p className="text-zinc-400 text-sm mt-0.5">All active demand posts from buyers</p>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="card h-24 bg-zinc-800 animate-pulse" />)}</div>
      ) : demands.length === 0 ? (
        <div className="card border border-zinc-800 text-center py-12 text-zinc-500">No active demands</div>
      ) : (
        <div className="card border border-zinc-800 overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                {['Crop','Qty (kg)','Max Price','Delivery','Buyer','Grade Pref','Required By','Matches'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-zinc-500 font-semibold uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {demands.map(d => (
                <tr key={d.id} className="table-row">
                  <td className="px-4 py-3 text-white font-semibold">{d.crop_name}</td>
                  <td className="px-4 py-3 text-zinc-300">{d.quantity_kg?.toLocaleString()}</td>
                  <td className="px-4 py-3 text-zinc-300">{d.price_per_kg ? `₹${d.price_per_kg}` : '—'}</td>
                  <td className="px-4 py-3 text-zinc-400">{d.delivery_district}, {d.delivery_state}</td>
                  <td className="px-4 py-3">
                    <div className="text-zinc-300">{d.buyer_name}</div>
                    <div className="text-zinc-500 text-xs">{d.buyer_email}</div>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{d.quality_pref || 'Any'}</td>
                  <td className="px-4 py-3 text-zinc-400">{d.required_by ? new Date(d.required_by).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="px-4 py-3">
                    {d.match_count > 0
                      ? <span className="badge bg-green-900/30 text-green-400 border border-green-800">{d.match_count}</span>
                      : <span className="text-zinc-600">0</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
