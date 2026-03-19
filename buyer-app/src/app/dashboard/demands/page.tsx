'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { buyerApi, setAuthToken } from '@/lib/api';

interface Demand {
  id: string; crop_name: string; quantity_kg: number; price_per_kg: number;
  delivery_state: string; delivery_district: string; required_by: string;
  quality_pref: string; notes: string; is_active: boolean; match_count: number;
  created_at: string;
}

const STATES = ['Andhra Pradesh','Bihar','Gujarat','Haryana','Karnataka','Madhya Pradesh',
  'Maharashtra','Punjab','Rajasthan','Tamil Nadu','Telangana','Uttar Pradesh','West Bengal'];

export default function DemandsPage() {
  const { getToken } = useAuth();
  const [demands, setDemands] = useState<Demand[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    crop_name: '', quantity_kg: '', price_per_kg: '',
    delivery_state: '', delivery_district: '', required_by: '',
    quality_pref: '', notes: '',
  });

  // Always refresh token before any API call
  const withToken = async () => {
    const token = await getToken();
    setAuthToken(token);
  };

  const load = async () => {
    await withToken();
    const { data } = await buyerApi.getDemands();
    setDemands(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Refresh token on every submit — never rely on stale axios header
      await withToken();
      await buyerApi.createDemand({
        ...form,
        quantity_kg:  parseFloat(form.quantity_kg),
        price_per_kg: form.price_per_kg ? parseFloat(form.price_per_kg) : null,
        quality_pref: form.quality_pref || null,
      });
      setShowForm(false);
      setForm({ crop_name: '', quantity_kg: '', price_per_kg: '', delivery_state: '',
        delivery_district: '', required_by: '', quality_pref: '', notes: '' });
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deactivate this demand?')) return;
    await withToken();
    await buyerApi.deleteDemand(id);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">My Demands</h1>
          <p className="text-slate-500 text-sm mt-0.5">Post what you need — we'll find matching supply</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>+ Post Demand</button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="card animate-pulse h-28 bg-slate-100" />)}
        </div>
      ) : demands.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-5xl mb-4">📝</div>
          <h2 className="font-display text-xl text-slate-700 mb-2">No demands yet</h2>
          <p className="text-slate-500 mb-6">Tell us what you need and we'll match you with verified supply.</p>
          <button className="btn-primary" onClick={() => setShowForm(true)}>Post Your First Demand</button>
        </div>
      ) : (
        <div className="space-y-4">
          {demands.map(d => (
            <div key={d.id} className={`card ${!d.is_active ? 'opacity-50' : ''}`}>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">{d.crop_name}</h3>
                  <p className="text-slate-500 text-sm">📍 {d.delivery_district}, {d.delivery_state}</p>
                </div>
                <div className="flex items-center gap-2">
                  {d.match_count > 0 && (
                    <span className="badge bg-green-100 text-green-700">
                      {d.match_count} match{d.match_count > 1 ? 'es' : ''}
                    </span>
                  )}
                  <span className={`badge ${d.is_active ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                    {d.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-slate-600 mb-3">
                <span>📦 {d.quantity_kg?.toLocaleString()} kg</span>
                {d.price_per_kg  && <span>💰 ₹{d.price_per_kg}/kg max</span>}
                {d.required_by   && <span>📅 By {new Date(d.required_by).toLocaleDateString('en-IN')}</span>}
                {d.quality_pref  && <span>⭐ Grade {d.quality_pref} preferred</span>}
              </div>
              {d.notes && <p className="text-sm text-slate-500 mb-3">{d.notes}</p>}
              <div className="flex gap-2 pt-2 border-t border-slate-100">
                {d.is_active && (
                  <button onClick={() => handleDelete(d.id)}
                    className="px-4 py-1.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 text-sm font-medium transition-colors">
                    Deactivate
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="font-display font-bold text-xl text-slate-900 mb-4">Post a Demand</h2>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="label">Crop Name</label>
                <input className="input" required value={form.crop_name}
                  onChange={e => setForm(p => ({ ...p, crop_name: e.target.value }))}
                  placeholder="e.g. Wheat" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Quantity (kg)</label>
                  <input className="input" type="number" required value={form.quantity_kg}
                    onChange={e => setForm(p => ({ ...p, quantity_kg: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Max Price (₹/kg)</label>
                  <input className="input" type="number" step="0.01" value={form.price_per_kg}
                    onChange={e => setForm(p => ({ ...p, price_per_kg: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Delivery State</label>
                  <select className="input" required value={form.delivery_state}
                    onChange={e => setForm(p => ({ ...p, delivery_state: e.target.value }))}>
                    <option value="">Select state</option>
                    {STATES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Delivery District</label>
                  <input className="input" value={form.delivery_district}
                    onChange={e => setForm(p => ({ ...p, delivery_district: e.target.value }))}
                    placeholder="District" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Required By</label>
                  <input className="input" type="date" value={form.required_by}
                    onChange={e => setForm(p => ({ ...p, required_by: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Quality Preference</label>
                  <select className="input" value={form.quality_pref}
                    onChange={e => setForm(p => ({ ...p, quality_pref: e.target.value }))}>
                    <option value="">Any grade</option>
                    {['A','B','C'].map(g => <option key={g} value={g}>Grade {g}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea className="input" rows={2} value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Any additional requirements…" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1" disabled={saving}>
                  {saving ? 'Posting…' : 'Post Demand'}
                </button>
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}