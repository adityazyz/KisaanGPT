'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { supplierApi, setAuthToken } from '@/lib/api';
import { clsx } from 'clsx';

interface Lead { id: string; product_name: string; category: string; farmer_name: string; farmer_phone: string; farmer_email: string; message: string; qty_needed: number; is_read: boolean; created_at: string; }

export default function LeadsPage() {
  const { getToken } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const token = await getToken(); setAuthToken(token);
    const { data } = await supplierApi.getLeads();
    setLeads(data); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const markRead = async (id: string) => {
    await supplierApi.markLeadRead(id);
    setLeads(prev => prev.map(l => l.id === id ? { ...l, is_read: true } : l));
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-stone-900">Leads</h1>
        <p className="text-stone-500 text-sm mt-0.5">Farmer enquiries for your products</p>
      </div>

      {loading ? <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="card animate-pulse h-28 bg-stone-100" />)}</div>
        : leads.length === 0 ? (
          <div className="card text-center py-16">
            <div className="text-5xl mb-4">💼</div>
            <h2 className="font-display text-xl text-stone-700 mb-2">No leads yet</h2>
            <p className="text-stone-500">Add products so farmers can find and contact you.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {leads.map(l => (
              <div key={l.id} onClick={() => !l.is_read && markRead(l.id)}
                className={clsx('card cursor-pointer transition-all hover:shadow-md', !l.is_read ? 'border-l-4 border-amber-500' : '')}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-stone-900">{l.product_name}</h3>
                      <span className="badge bg-amber-100 text-amber-700">{l.category}</span>
                      {!l.is_read && <span className="badge bg-red-100 text-red-600">New</span>}
                    </div>
                    <p className="text-sm text-stone-500 mt-0.5">From: {l.farmer_name}</p>
                  </div>
                  <span className="text-xs text-stone-400">{new Date(l.created_at).toLocaleDateString('en-IN')}</span>
                </div>

                {l.qty_needed && <p className="text-sm text-stone-600 mb-2">📦 Quantity needed: <span className="font-semibold">{l.qty_needed}</span></p>}
                {l.message && <p className="text-sm text-stone-600 bg-stone-50 rounded-xl px-3 py-2 mb-3">"{l.message}"</p>}

                <div className="flex gap-4 text-sm pt-3 border-t border-stone-100">
                  {l.farmer_phone && (
                    <a href={`tel:${l.farmer_phone}`} onClick={e => e.stopPropagation()}
                      className="flex items-center gap-1.5 text-amber-600 hover:text-amber-700 font-medium">
                      📞 {l.farmer_phone}
                    </a>
                  )}
                  {l.farmer_email && (
                    <a href={`mailto:${l.farmer_email}`} onClick={e => e.stopPropagation()}
                      className="flex items-center gap-1.5 text-amber-600 hover:text-amber-700 font-medium">
                      ✉️ {l.farmer_email}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
