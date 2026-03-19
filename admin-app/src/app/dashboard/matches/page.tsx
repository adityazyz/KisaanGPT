'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { adminApi, setAuthToken } from '@/lib/api';
import { clsx } from 'clsx';

interface Demand { id: string; crop_name: string; quantity_kg: number; price_per_kg: number; delivery_state: string; delivery_district: string; required_by: string; quality_pref: string; buyer_name: string; buyer_email: string; match_count: number; }
interface MatchSuggestion { demandId: string; lotId: string; matchedQty: number; score: number; }
interface Lot { id: string; crop_name: string; location: string; available_qty: number; quality_grade: string; price_per_kg: number; }
interface Match { id: string; crop_name: string; quantity_kg: number; lot_location: string; matched_qty_kg: number; agreed_price: number; status: string; created_at: string; }

const STATUS_COLORS: Record<string,string> = {
  proposed:  'bg-amber-900/30 text-amber-400 border-amber-800',
  accepted:  'bg-green-900/30 text-green-400 border-green-800',
  completed: 'bg-blue-900/30 text-blue-400 border-blue-800',
  rejected:  'bg-red-900/30 text-red-400 border-red-800',
};

export default function MatchingPage() {
  const { getToken } = useAuth();
  const [demands, setDemands] = useState<Demand[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDemand, setSelectedDemand] = useState<Demand | null>(null);
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [matchForm, setMatchForm] = useState({ lot_id: '', matched_qty_kg: '', agreed_price: '', notes: '' });

  const load = async () => {
    const token = await getToken(); setAuthToken(token);
    const [{ data: d }, { data: m }, { data: l }] = await Promise.all([
      adminApi.getDemands(), adminApi.getAllMatches(), adminApi.getLots()
    ]);
    setDemands(d); setMatches(m); setLots(l); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleSelectDemand = async (demand: Demand) => {
    setSelectedDemand(demand);
    setSuggestions([]);
    setSuggesting(true);
    setMatchForm({ lot_id: '', matched_qty_kg: '', agreed_price: '', notes: '' });
    try {
      const { data } = await adminApi.suggestMatches(demand.id);
      setSuggestions(data);
    } finally { setSuggesting(false); }
  };

  const handlePickSuggestion = (s: MatchSuggestion) => {
    const lot = lots.find(l => l.id === s.lotId);
    setMatchForm(f => ({
      ...f,
      lot_id: s.lotId,
      matched_qty_kg: String(s.matchedQty),
      agreed_price: lot?.price_per_kg ? String(lot.price_per_kg) : f.agreed_price,
    }));
  };

  const handleCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDemand) return;
    setCreating(true);
    try {
      await adminApi.createMatch({
        demand_id: selectedDemand.id,
        lot_id: matchForm.lot_id,
        matched_qty_kg: parseFloat(matchForm.matched_qty_kg),
        agreed_price: matchForm.agreed_price ? parseFloat(matchForm.agreed_price) : null,
        notes: matchForm.notes,
      });
      setSelectedDemand(null);
      setSuggestions([]);
      load();
    } finally { setCreating(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Matching Engine</h1>
        <p className="text-zinc-400 text-sm mt-0.5">Match buyer demands to verified supply lots</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Buyer Demands */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Active Buyer Demands</h2>
          {loading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="card h-20 bg-zinc-800 animate-pulse" />)}</div>
          ) : demands.length === 0 ? (
            <div className="card border border-zinc-800 text-center py-8 text-zinc-500">No active demands</div>
          ) : (
            <div className="space-y-2">
              {demands.map(d => (
                <div key={d.id} onClick={() => handleSelectDemand(d)}
                  className={clsx('card cursor-pointer transition-all border', selectedDemand?.id === d.id ? 'border-indigo-500 bg-indigo-900/20' : 'border-zinc-800 hover:border-zinc-600')}>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-white">{d.crop_name}</h3>
                        {d.match_count > 0 && <span className="badge bg-green-900/30 text-green-400 border border-green-800">{d.match_count} matched</span>}
                      </div>
                      <p className="text-xs text-zinc-400">{d.buyer_name} · {d.delivery_district}, {d.delivery_state}</p>
                    </div>
                    <div className="text-right text-xs text-zinc-400">
                      <div className="font-semibold text-white text-sm">{d.quantity_kg?.toLocaleString()} kg</div>
                      {d.price_per_kg && <div>₹{d.price_per_kg}/kg max</div>}
                      {d.quality_pref && <div>Grade {d.quality_pref}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Match Panel */}
        <div>
          {!selectedDemand ? (
            <div className="card border border-zinc-800 text-center py-16">
              <div className="text-4xl mb-3">👈</div>
              <p className="text-zinc-500 text-sm">Select a demand to create a match</p>
            </div>
          ) : (
            <div className="card border border-indigo-800/50 bg-indigo-900/10 space-y-4">
              <div>
                <h2 className="font-semibold text-white mb-1">Matching: {selectedDemand.crop_name}</h2>
                <p className="text-xs text-zinc-400">{selectedDemand.quantity_kg?.toLocaleString()} kg · {selectedDemand.buyer_name}</p>
              </div>

              {/* AI Suggestions */}
              {suggesting && <p className="text-xs text-indigo-400 animate-pulse">🔍 Finding best matches…</p>}
              {suggestions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Suggested Matches</p>
                  <div className="space-y-2">
                    {suggestions.map((s, i) => {
                      const lot = lots.find(l => l.id === s.lotId);
                      return (
                        <button key={s.lotId} onClick={() => handlePickSuggestion(s)}
                          className={clsx('w-full text-left px-3 py-2.5 rounded-xl border transition-colors text-sm',
                            matchForm.lot_id === s.lotId ? 'border-indigo-500 bg-indigo-900/30' : 'border-zinc-700 hover:border-zinc-500')}>
                          <div className="flex justify-between items-center">
                            <span className="text-white font-medium">{lot?.location || s.lotId.slice(0,8)}</span>
                            <span className="badge bg-indigo-900/40 text-indigo-300 border border-indigo-700">Score {s.score}%</span>
                          </div>
                          <div className="text-zinc-400 text-xs mt-0.5">{s.matchedQty?.toLocaleString()} kg · Grade {lot?.quality_grade} {lot?.price_per_kg ? `· ₹${lot.price_per_kg}/kg` : ''}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Manual match form */}
              <form onSubmit={handleCreateMatch} className="space-y-3">
                <div>
                  <label className="label">Supply Lot</label>
                  <select className="input" required value={matchForm.lot_id} onChange={e => setMatchForm(f => ({ ...f, lot_id: e.target.value }))}>
                    <option value="">Select lot…</option>
                    {lots.filter(l => l.status !== 'closed' && l.crop_name.toLowerCase().includes(selectedDemand.crop_name.toLowerCase())).map(l => (
                      <option key={l.id} value={l.id}>{l.location} — {l.available_qty?.toLocaleString()} kg (Grade {l.quality_grade})</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Matched Qty (kg)</label>
                    <input className="input" type="number" required value={matchForm.matched_qty_kg} onChange={e => setMatchForm(f => ({ ...f, matched_qty_kg: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Agreed Price (₹/kg)</label>
                    <input className="input" type="number" step="0.01" value={matchForm.agreed_price} onChange={e => setMatchForm(f => ({ ...f, agreed_price: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="label">Notes for Buyer</label>
                  <textarea className="input" rows={2} value={matchForm.notes} onChange={e => setMatchForm(f => ({ ...f, notes: e.target.value }))} placeholder="Pickup location, logistics details…" />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary flex-1" disabled={creating}>{creating ? 'Creating…' : '🤝 Create Match'}</button>
                  <button type="button" className="btn-secondary" onClick={() => setSelectedDemand(null)}>Cancel</button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Existing matches */}
      {matches.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">All Matches ({matches.length})</h2>
          <div className="card border border-zinc-800 overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  {['Crop','Lot Location','Matched Qty','Agreed Price','Status','Date'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs text-zinc-500 font-semibold uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matches.map((m: any) => (
                  <tr key={m.id} className="table-row">
                    <td className="px-4 py-3 text-white font-medium">{m.crop_name}</td>
                    <td className="px-4 py-3 text-zinc-300">{m.lot_location || '—'}</td>
                    <td className="px-4 py-3 text-zinc-300">{m.matched_qty_kg?.toLocaleString()} kg</td>
                    <td className="px-4 py-3 text-zinc-300">{m.agreed_price ? `₹${m.agreed_price}/kg` : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={clsx('badge border', STATUS_COLORS[m.status] || 'bg-zinc-800 text-zinc-400 border-zinc-700')}>{m.status}</span>
                    </td>
                    <td className="px-4 py-3 text-zinc-500">{new Date(m.created_at).toLocaleDateString('en-IN')}</td>
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
