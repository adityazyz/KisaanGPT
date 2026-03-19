'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { buyerApi, setAuthToken } from '@/lib/api';

interface Lot {
  id: string; crop_name: string; location: string; state: string; district: string;
  total_qty_kg: number; available_qty: number; quality_grade: string;
  price_per_kg: number; harvest_window_start: string; harvest_window_end: string;
}

const STATES = ['All','Andhra Pradesh','Bihar','Gujarat','Haryana','Karnataka','Madhya Pradesh','Maharashtra','Punjab','Rajasthan','Tamil Nadu','Telangana','Uttar Pradesh','West Bengal'];
const GRADE_COLORS: Record<string, string> = { A: 'bg-green-100 text-green-700', B: 'bg-blue-100 text-blue-700', C: 'bg-yellow-100 text-yellow-700', ungraded: 'bg-gray-100 text-gray-600' };

export default function SupplyPage() {
  const { getToken } = useAuth();
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [crop, setCrop] = useState('');
  const [state, setState] = useState('All');

  const load = async () => {
    setLoading(true);
    const token = await getToken(); setAuthToken(token);
    const { data } = await buyerApi.getSupply({ crop: crop || undefined, state: state !== 'All' ? state : undefined });
    setLots(data); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-slate-900">Browse Supply</h1>
        <p className="text-slate-500 text-sm mt-0.5">Verified, aggregated lots available for purchase</p>
      </div>

      <div className="card mb-6">
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-48">
            <label className="label">Search by Crop</label>
            <input className="input" placeholder="e.g. Wheat, Rice, Maize…" value={crop} onChange={e => setCrop(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} />
          </div>
          <div className="flex-1 min-w-48">
            <label className="label">Filter by State</label>
            <select className="input" value={state} onChange={e => setState(e.target.value)}>
              {STATES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button className="btn-primary" onClick={load}>Search</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">{[...Array(6)].map((_, i) => <div key={i} className="card animate-pulse h-40 bg-slate-100" />)}</div>
      ) : lots.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-5xl mb-4">🌾</div>
          <h2 className="font-display text-xl text-slate-700 mb-2">No supply lots found</h2>
          <p className="text-slate-500">Try adjusting your filters or check back later.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {lots.map(lot => (
            <div key={lot.id} className="card hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-3">
                <h3 className="font-bold text-slate-900 text-lg">{lot.crop_name}</h3>
                <span className={`badge ${GRADE_COLORS[lot.quality_grade] || GRADE_COLORS.ungraded}`}>Grade {lot.quality_grade}</span>
              </div>
              <p className="text-sm text-slate-500 mb-3">📍 {lot.location}</p>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-green-50 rounded-xl p-2.5 text-center">
                  <div className="font-bold text-green-700">{lot.available_qty?.toLocaleString()} kg</div>
                  <div className="text-xs text-slate-500">Available</div>
                </div>
                <div className="bg-blue-50 rounded-xl p-2.5 text-center">
                  <div className="font-bold text-blue-700">{lot.total_qty_kg?.toLocaleString()} kg</div>
                  <div className="text-xs text-slate-500">Total Lot</div>
                </div>
              </div>
              {lot.price_per_kg && (
                <p className="text-sm font-semibold text-slate-700 mb-2">₹{lot.price_per_kg}/kg</p>
              )}
              {lot.harvest_window_start && (
                <p className="text-xs text-slate-400">
                  Harvest window: {new Date(lot.harvest_window_start).toLocaleDateString('en-IN')} – {new Date(lot.harvest_window_end).toLocaleDateString('en-IN')}
                </p>
              )}
              <div className="mt-3 pt-3 border-t border-slate-100">
                <a href="/dashboard/demands" className="btn-primary w-full text-sm py-2 text-center block">Post Demand for This Crop</a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
