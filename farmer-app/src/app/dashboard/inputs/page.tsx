'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { farmerApi, setAuthToken } from '@/lib/api';
import { useLanguage } from '@/context/LanguageContext';

interface Product { id: string; name: string; category: string; description: string; price: number; unit: string; stock_qty: number; suitable_crops: string[]; supplier_name: string; supplier_phone: string; }

const CATEGORIES = ['Fertilizer','Pesticide','Seeds','Equipment','Irrigation','Other'];

export default function InputsPage() {
  const { getToken } = useAuth();
  const { t } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading]   = useState(true);
  const [category, setCategory] = useState('All');
  const [selected, setSelected] = useState<Product | null>(null);
  const [leadForm, setLeadForm] = useState({ message:'', qty_needed:'' });
  const [sending, setSending]   = useState(false);
  const [sent, setSent]         = useState(false);

  const load = async (cat?: string) => {
    const tok = await getToken(); setAuthToken(tok);
    const { data } = await farmerApi.browseInputs({ category: cat && cat !== 'All' ? cat : undefined });
    setProducts(data); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleCatChange = (cat: string) => { setCategory(cat); load(cat); };

  const handleLead = async (e: React.FormEvent) => {
    e.preventDefault(); if (!selected) return;
    setSending(true);
    try {
      const tok = await getToken(); setAuthToken(tok);
      await farmerApi.submitLead({ product_id: selected.id, message: leadForm.message, qty_needed: leadForm.qty_needed ? parseFloat(leadForm.qty_needed) : null });
      setSent(true);
      setTimeout(() => { setSent(false); setSelected(null); setLeadForm({ message:'', qty_needed:'' }); }, 2000);
    } finally { setSending(false); }
  };

  const allCategories = [t('inputs_all'), ...CATEGORIES];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-[#1d3a1f]">{t('inputs_title')}</h1>
        <p className="text-[#7a6652] text-sm mt-0.5">{t('inputs_subtitle')}</p>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {allCategories.map((c, i) => {
          const val = i === 0 ? 'All' : c;
          return (
            <button key={c} onClick={() => handleCatChange(val)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${category === val ? 'bg-leaf-600 text-white' : 'bg-white border border-[#e8ddd0] text-[#7a6652] hover:border-leaf-400'}`}>
              {c}
            </button>
          );
        })}
      </div>

      {loading ? <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">{[...Array(6)].map((_,i) => <div key={i} className="card animate-pulse h-40 bg-gray-100" />)}</div>
        : products.length === 0 ? (
          <div className="card text-center py-12"><div className="text-4xl mb-3">🧪</div><p className="text-[#7a6652]">{t('inputs_empty')}</p></div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map(p => (
              <div key={p.id} className="card hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-2">
                  <span className="badge bg-earth-100 text-earth-700">{p.category}</span>
                  {p.price && <span className="font-bold text-leaf-700">₹{p.price}/{p.unit}</span>}
                </div>
                <h3 className="font-bold text-[#1d3a1f] mb-1">{p.name}</h3>
                {p.description && <p className="text-xs text-[#7a6652] mb-2 line-clamp-2">{p.description}</p>}
                {p.suitable_crops?.length > 0 && <p className="text-xs text-leaf-600 mb-3">{t('inputs_for')} {p.suitable_crops.join(', ')}</p>}
                <div className="flex justify-between items-center">
                  <div className="text-xs text-[#7a6652]">
                    <div>🏪 {p.supplier_name}</div>
                    {p.supplier_phone && <div>📞 {p.supplier_phone}</div>}
                  </div>
                  <button onClick={() => { setSelected(p); setSent(false); }} className="btn-primary text-xs py-1.5 px-3">{t('inputs_contact')}</button>
                </div>
              </div>
            ))}
          </div>
        )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            {sent ? (
              <div className="text-center py-8">
                <div className="text-5xl mb-3">✅</div>
                <h2 className="font-bold text-xl text-leaf-700">{t('inputs_sent_title')}</h2>
                <p className="text-[#7a6652] mt-1">{t('inputs_sent_desc')}</p>
              </div>
            ) : (
              <>
                <h2 className="font-display font-bold text-xl text-[#1d3a1f] mb-1">{t('inputs_contact_title')}</h2>
                <p className="text-sm text-[#7a6652] mb-4">{selected.name} · {selected.supplier_name}</p>
                <form onSubmit={handleLead} className="space-y-3">
                  <div><label className="label">{t('inputs_qty_needed')}</label><input className="input" type="number" value={leadForm.qty_needed} onChange={e => setLeadForm(p => ({ ...p, qty_needed: e.target.value }))} placeholder={`In ${selected.unit}`} /></div>
                  <div><label className="label">{t('inputs_message')}</label><textarea className="input" rows={3} value={leadForm.message} onChange={e => setLeadForm(p => ({ ...p, message: e.target.value }))} placeholder={t('inputs_message_placeholder')} /></div>
                  <div className="flex gap-3">
                    <button type="submit" className="btn-primary flex-1" disabled={sending}>{sending ? t('inputs_sending') : t('inputs_send')}</button>
                    <button type="button" className="btn-secondary flex-1" onClick={() => setSelected(null)}>{t('inputs_cancel')}</button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
