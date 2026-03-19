'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { farmerApi, setAuthToken } from '@/lib/api';
import { useLanguage } from '@/context/LanguageContext';

interface Farm { id: string; name: string; location: string; state: string; district: string; area_acres: number; soil_type: string; irrigation: string; plan_count: number; }

const SOIL_TYPES  = ['Loamy','Clay','Sandy-Loam','Clay-Loam','Black-Cotton','Red','Sandy'];
const IRRIGATION  = ['Rainfed','Canal','Borewell','Drip','Sprinkler'];
const INDIAN_STATES = ['Andhra Pradesh','Bihar','Gujarat','Haryana','Karnataka','Madhya Pradesh','Maharashtra','Punjab','Rajasthan','Tamil Nadu','Telangana','Uttar Pradesh','West Bengal'];
const emptyForm = { name:'', location:'', state:'', district:'', area_acres:'', soil_type:'', irrigation:'', latitude:'', longitude:'' };

export default function FarmsPage() {
  const { getToken } = useAuth();
  const { t } = useLanguage();
  const [farms, setFarms]     = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]       = useState(emptyForm);
  const [saving, setSaving]   = useState(false);

  const withToken = async () => { const token = await getToken(); setAuthToken(token); };
  const load = async () => { await withToken(); const { data } = await farmerApi.getFarms(); setFarms(data); setLoading(false); };
  useEffect(() => { load(); }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(p => ({ ...p, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      await withToken();
      await farmerApi.createFarm({ ...form, area_acres: parseFloat(form.area_acres), latitude: form.latitude ? parseFloat(form.latitude) : null, longitude: form.longitude ? parseFloat(form.longitude) : null });
      setShowForm(false); setForm(emptyForm); load();
    } finally { setSaving(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-[#1d3a1f]">{t('farms_title')}</h1>
          <p className="text-[#7a6652] text-sm mt-0.5">{t('farms_subtitle')}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>{t('farms_add')}</button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="font-display font-bold text-xl text-[#1d3a1f] mb-4">{t('farms_form_title')}</h2>
            <form onSubmit={submit} className="space-y-3">
              <div><label className="label">{t('farms_name')}</label><input className="input" required value={form.name} onChange={set('name')} placeholder={t('farms_name_placeholder')} /></div>
              <div><label className="label">{t('farms_location')}</label><input className="input" required value={form.location} onChange={set('location')} placeholder={t('farms_location_placeholder')} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">{t('farms_state')}</label>
                  <select className="input" required value={form.state} onChange={set('state')}>
                    <option value="">{t('farms_select_state')}</option>
                    {INDIAN_STATES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div><label className="label">{t('farms_district')}</label><input className="input" required value={form.district} onChange={set('district')} /></div>
              </div>
              <div><label className="label">{t('farms_area')}</label><input className="input" type="number" step="0.1" min="0.1" required value={form.area_acres} onChange={set('area_acres')} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">{t('farms_soil')}</label>
                  <select className="input" value={form.soil_type} onChange={set('soil_type')}>
                    <option value="">{t('farms_select_soil')}</option>
                    {SOIL_TYPES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">{t('farms_irrigation')}</label>
                  <select className="input" value={form.irrigation} onChange={set('irrigation')}>
                    <option value="">{t('farms_select_irrigation')}</option>
                    {IRRIGATION.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">{t('farms_latitude')}</label><input className="input" type="number" step="any" value={form.latitude} onChange={set('latitude')} /></div>
                <div><label className="label">{t('farms_longitude')}</label><input className="input" type="number" step="any" value={form.longitude} onChange={set('longitude')} /></div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1" disabled={saving}>{saving ? t('saving') : t('farms_add')}</button>
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowForm(false)}>{t('cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid md:grid-cols-2 gap-4">{[...Array(3)].map((_, i) => <div key={i} className="card animate-pulse h-40 bg-gray-100" />)}</div>
      ) : farms.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-5xl mb-4">🌾</div>
          <h2 className="font-display font-semibold text-xl text-[#1d3a1f] mb-2">{t('farms_empty_title')}</h2>
          <p className="text-[#7a6652] mb-6">{t('farms_empty_desc')}</p>
          <button className="btn-primary" onClick={() => setShowForm(true)}>{t('farms_add_first')}</button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {farms.map(farm => (
            <div key={farm.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-display font-bold text-[#1d3a1f] text-lg">{farm.name}</h3>
                  <p className="text-sm text-[#7a6652]">📍 {farm.location}, {farm.district}, {farm.state}</p>
                </div>
                <span className="badge bg-leaf-100 text-leaf-700">{farm.area_acres} {t('farms_plans').includes('योजना') ? 'एकड़' : 'acres'}</span>
              </div>
              <div className="flex gap-4 text-sm text-[#7a6652]">
                {farm.soil_type  && <span>🪨 {farm.soil_type}</span>}
                {farm.irrigation && <span>💧 {farm.irrigation}</span>}
                <span>📋 {farm.plan_count} {t('farms_plans')}</span>
              </div>
              <div className="mt-4 pt-3 border-t border-[#e8ddd0] flex gap-2">
                <a href={`/dashboard/crop-plans?farmId=${farm.id}`} className="btn-primary text-sm py-1.5 px-4">{t('farms_view_plans')}</a>
                <a href={`/dashboard/farms/${farm.id}/suggestions`} className="btn-secondary text-sm py-1.5 px-4">{t('farms_crop_suggestions')}</a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
