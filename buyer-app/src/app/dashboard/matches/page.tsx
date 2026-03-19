'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { buyerApi, setAuthToken } from '@/lib/api';
import { clsx } from 'clsx';

interface Match {
  id: string; crop_name: string; demanded_qty: number; lot_location: string;
  total_qty_kg: number; quality_grade: string; lot_price: number;
  matched_qty_kg: number; agreed_price: number; status: string;
  notes: string; created_at: string;
}

const STATUS_COLORS: Record<string,string> = {
  proposed: 'bg-amber-100 text-amber-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  completed: 'bg-blue-100 text-blue-700',
};

export default function MatchesPage() {
  const { getToken } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);

  const load = async () => {
    const token = await getToken(); setAuthToken(token);
    const { data } = await buyerApi.getMatches();
    setMatches(data); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleAccept = async (id: string) => {
    setAccepting(id);
    try { await buyerApi.acceptMatch(id); load(); }
    finally { setAccepting(null); }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-slate-900">My Matches</h1>
        <p className="text-slate-500 text-sm mt-0.5">Supply lots matched to your demands by our team</p>
      </div>

      {loading ? (
        <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="card animate-pulse h-36 bg-slate-100" />)}</div>
      ) : matches.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-5xl mb-4">🤝</div>
          <h2 className="font-display text-xl text-slate-700 mb-2">No matches yet</h2>
          <p className="text-slate-500 mb-6">Post a demand and our team will find matching supply for you.</p>
          <a href="/dashboard/demands" className="btn-primary">Post a Demand</a>
        </div>
      ) : (
        <div className="space-y-4">
          {matches.map(m => (
            <div key={m.id} className="card">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">{m.crop_name}</h3>
                  <p className="text-slate-500 text-sm">📍 {m.lot_location}</p>
                </div>
                <span className={clsx('badge', STATUS_COLORS[m.status] || 'bg-gray-100 text-gray-600')}>{m.status}</span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[
                  { label: 'Matched Qty', value: `${m.matched_qty_kg?.toLocaleString()} kg` },
                  { label: 'Your Demand', value: `${m.demanded_qty?.toLocaleString()} kg` },
                  { label: 'Agreed Price', value: m.agreed_price ? `₹${m.agreed_price}/kg` : '—' },
                  { label: 'Quality Grade', value: `Grade ${m.quality_grade}` },
                ].map(s => (
                  <div key={s.label} className="bg-slate-50 rounded-xl p-3 text-center">
                    <div className="font-bold text-slate-800">{s.value}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>

              {m.notes && <p className="text-sm text-slate-500 mb-3 bg-slate-50 rounded-xl px-3 py-2">{m.notes}</p>}

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="text-xs text-slate-400">Matched {new Date(m.created_at).toLocaleDateString('en-IN')}</span>
                {m.status === 'proposed' && (
                  <button onClick={() => handleAccept(m.id)} disabled={accepting === m.id}
                    className="btn-primary text-sm py-2">
                    {accepting === m.id ? 'Accepting…' : '✅ Accept Match'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
