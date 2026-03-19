'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { farmerApi, setAuthToken } from '@/lib/api';
import { useLanguage } from '@/context/LanguageContext';

interface Production { id: string; farm_name: string; crop_name: string; actual_yield_kg: number; system_estimate: number; harvest_date: string; quality_grade: string; notes: string; }
interface Farm { id: string; name: string; }
interface Plan { id: string; crop_name: string; farm_id: string; }

export default function ProductionPage() {
  const { getToken } = useAuth();
  const { t } = useLanguage();
  const [records, setRecords]   = useState<Production[]>([]);
  const [farms, setFarms]       = useState<Farm[]>([]);
  const [plans, setPlans]       = useState<Plan[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [form, setForm]         = useState({ farm_id:'', crop_plan_id:'', crop_name:'', actual_yield_kg:'', system_estimate:'', harvest_date:'', quality_grade:'ungraded', notes:'' });

  const withToken = async () => { const tok = await getToken(); setAuthToken(tok); };
  const load = async () => {
    await withToken();
    const [{ data: r }, { data: f }, { data: p }] = await Promise.all([farmerApi.getProduction(), farmerApi.getFarms(), farmerApi.getCropPlans()]);
    setRecords(r); setFarms(f); setPlans(p); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      await withToken();
      await farmerApi.createProduction({ ...form, farm_id: form.farm_id || null, crop_plan_id: form.crop_plan_id || null, actual_yield_kg: parseFloat(form.actual_yield_kg), system_estimate: form.system_estimate ? parseFloat(form.system_estimate) : null, harvest_date: form.harvest_date || null, notes: form.notes || null });
      setShowForm(false);
      setForm({ farm_id:'', crop_plan_id:'', crop_name:'', actual_yield_kg:'', system_estimate:'', harvest_date:'', quality_grade:'ungraded', notes:'' });
      load();
    } finally { setSaving(false); }
  };

  const handleSubmitSupply = async (id: string) => {
    if (!confirm(t('prod_submit_confirm'))) return;
    setSubmitting(id);
    try { await withToken(); await farmerApi.submitSupply(id); alert(t('prod_submit_success')); load(); }
    finally { setSubmitting(null); }
  };

  const gradeColors: Record<string,string> = { A:'bg-green-100 text-green-700', B:'bg-blue-100 text-blue-700', C:'bg-yellow-100 text-yellow-700', ungraded:'bg-gray-100 text-gray-600' };
  const gradeLabels: Record<string,string> = { A: t('grade_A'), B: t('grade_B'), C: t('grade_C'), ungraded: t('grade_ungraded') };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-[#1d3a1f]">{t('prod_title')}</h1>
          <p className="text-[#7a6652] text-sm mt-0.5">{t('prod_subtitle')}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>{t('prod_log')}</button>
      </div>

      {loading ? <div className="space-y-3">{[...Array(3)].map((_,i) => <div key={i} className="card animate-pulse h-24 bg-gray-100" />)}</div>
        : records.length === 0 ? (
          <div className="card text-center py-16">
            <div className="text-5xl mb-4">📦</div>
            <h2 className="font-display font-semibold text-xl text-[#1d3a1f] mb-2">{t('prod_empty_title')}</h2>
            <p className="text-[#7a6652] mb-6">{t('prod_empty_desc')}</p>
            <button className="btn-primary" onClick={() => setShowForm(true)}>{t('prod_log_first')}</button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {records.map(r => (
              <div key={r.id} className="card">
                <div className="flex justify-between items-start mb-3">
                  <div><h3 className="font-bold text-[#1d3a1f]">{r.crop_name}</h3><p className="text-sm text-[#7a6652]">🌾 {r.farm_name}</p></div>
                  <span className={`badge ${gradeColors[r.quality_grade] || gradeColors.ungraded}`}>{gradeLabels[r.quality_grade] || r.quality_grade}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div className="bg-leaf-50 rounded-xl p-2 text-center"><div className="font-bold text-leaf-700 text-lg">{r.actual_yield_kg?.toLocaleString()}</div><div className="text-xs text-[#7a6652]">{t('prod_actual')}</div></div>
                  <div className="bg-earth-50 rounded-xl p-2 text-center"><div className="font-bold text-earth-700 text-lg">{r.system_estimate?.toLocaleString() ?? '—'}</div><div className="text-xs text-[#7a6652]">{t('prod_estimated')}</div></div>
                </div>
                {r.harvest_date && <p className="text-xs text-[#7a6652] mb-3">{t('prod_harvested')} {new Date(r.harvest_date).toLocaleDateString('en-IN')}</p>}
                <button onClick={() => handleSubmitSupply(r.id)} disabled={submitting === r.id} className="btn-primary w-full text-sm py-2">
                  {submitting === r.id ? t('prod_submitting') : t('prod_submit_supply')}
                </button>
              </div>
            ))}
          </div>
        )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="font-display font-bold text-xl text-[#1d3a1f] mb-4">{t('prod_form_title')}</h2>
            <form onSubmit={submit} className="space-y-3">
              <div><label className="label">{t('prod_farm')} *</label>
                <select className="input" required value={form.farm_id} onChange={e => setForm(p => ({ ...p, farm_id: e.target.value }))}>
                  <option value="">{t('prod_select_farm')}</option>
                  {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div><label className="label">{t('prod_linked_plan')}</label>
                <select className="input" value={form.crop_plan_id} onChange={e => { const plan = plans.find(p => p.id === e.target.value); setForm(p => ({ ...p, crop_plan_id: e.target.value, crop_name: plan?.crop_name || p.crop_name })); }}>
                  <option value="">{t('prod_none')}</option>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.crop_name}</option>)}
                </select>
              </div>
              <div><label className="label">{t('prod_crop_name')} *</label><input className="input" required value={form.crop_name} onChange={e => setForm(p => ({ ...p, crop_name: e.target.value }))} placeholder={t('prod_crop_placeholder')} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">{t('prod_actual_yield')} *</label><input className="input" type="number" required value={form.actual_yield_kg} onChange={e => setForm(p => ({ ...p, actual_yield_kg: e.target.value }))} /></div>
                <div><label className="label">{t('prod_system_estimate')}</label><input className="input" type="number" value={form.system_estimate} onChange={e => setForm(p => ({ ...p, system_estimate: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">{t('prod_harvest_date')}</label><input className="input" type="date" value={form.harvest_date} onChange={e => setForm(p => ({ ...p, harvest_date: e.target.value }))} /></div>
                <div><label className="label">{t('prod_quality')}</label>
                  <select className="input" value={form.quality_grade} onChange={e => setForm(p => ({ ...p, quality_grade: e.target.value }))}>
                    {['A','B','C','ungraded'].map(g => <option key={g} value={g}>{gradeLabels[g] || g}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="label">{t('prod_notes')}</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1" disabled={saving}>{saving ? t('prod_saving') : t('prod_save')}</button>
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowForm(false)}>{t('cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
