'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { farmerApi, setAuthToken, api } from '@/lib/api';
import { useLanguage } from '@/context/LanguageContext';
import { clsx } from 'clsx';

interface CropPlan {
  id: string; farm_id: string; farm_name: string; crop_name: string; variety: string;
  season: string; year: number; status: string; sowing_date: string; harvest_date: string;
  area_acres: number; expected_yield_kg: number; notes: string;
  weather_alerts: string[];
  timeline: Array<{ label: string; date: string; description: string }>;
  ai_suggestions: {
    rationale: string; market_demand: string; risks: string[];
    input_recommendations: Array<{ item: string; quantity: string; timing: string }>;
  } | null;
}
interface Farm { id: string; name: string; area_acres: number; state: string; district: string; soil_type: string; irrigation: string; }

// Per-plan translated data shape (mirrors what the API returns)
interface TranslatedPlan {
  notes: string | null;
  weather_alerts: string[];
  ai_rationale: string | null;
  ai_risks: string[];
  ai_input_recommendations: Array<{ item: string; quantity: string; timing: string }>;
  timeline_descriptions: Array<{ label: string; description: string }>;
}

const STATUS_COLORS: Record<string, string> = {
  active:    'bg-leaf-100 text-leaf-700',
  draft:     'bg-yellow-100 text-yellow-700',
  completed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-700',
};
const DEMAND_COLORS: Record<string, string> = {
  high:   'text-green-600 bg-green-50',
  medium: 'text-amber-600 bg-amber-50',
  low:    'text-red-600 bg-red-50',
};

// ── Translate button ──────────────────────────────────────────────────────────
function TranslateButton({
  planLang, onToggle, translating,
}: { planLang: 'en' | 'hi'; onToggle: () => void; translating: boolean }) {
  return (
    <button
      onClick={onToggle}
      disabled={translating}
      className={clsx(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all',
        planLang === 'hi'
          ? 'bg-orange-50 border-orange-300 text-orange-700'
          : 'bg-white border-[#e8ddd0] text-[#7a6652] hover:border-leaf-400 hover:bg-leaf-50'
      )}>
      {translating ? (
        <>
          <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span>अनुवाद हो रहा है…</span>
        </>
      ) : planLang === 'hi' ? (
        <><span>🇬🇧</span><span>English</span></>
      ) : (
        <><span>🇮🇳</span><span>हिंदी में देखें</span></>
      )}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CropPlansPage() {
  const { getToken } = useAuth();
  const { t } = useLanguage();

  const [plans, setPlans]         = useState<CropPlan[]>([]);
  const [farms, setFarms]         = useState<Farm[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<CropPlan | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab]   = useState<'timeline' | 'inputs' | 'risks'>('timeline');

  // Translation state — keyed by plan ID so each plan can be translated independently
  const [planLang, setPlanLang]           = useState<'en' | 'hi'>('en');
  const [translating, setTranslating]     = useState(false);
  const [translated, setTranslated]       = useState<TranslatedPlan | null>(null);
  const [translateError, setTranslateError] = useState<string | null>(null);

  const withToken = async () => { const token = await getToken(); setAuthToken(token); };

  const load = async () => {
    await withToken();
    const [{ data: p }, { data: f }] = await Promise.all([
      farmerApi.getCropPlans(), farmerApi.getFarms(),
    ]);
    setPlans(p); setFarms(f); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // When a new plan is selected, reset translation state
  const selectPlan = (plan: CropPlan) => {
    setSelected(plan);
    setActiveTab('timeline');
    setPlanLang('en');
    setTranslated(null);
    setTranslateError(null);
  };

  const handleTranslateToggle = async () => {
    if (!selected) return;

    // Switch back to English
    if (planLang === 'hi') {
      setPlanLang('en');
      return;
    }

    // Already translated — just show Hindi
    if (translated) {
      setPlanLang('hi');
      return;
    }

    // Fetch translation
    setTranslating(true);
    setTranslateError(null);
    try {
      const res = await fetch('/api/translate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selected }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Translation failed');
      }
      const { translated: data } = await res.json();
      setTranslated(data);
      setPlanLang('hi');
    } catch (e: any) {
      setTranslateError(e.message || 'Could not translate. Please try again.');
    } finally {
      setTranslating(false);
    }
  };

  const handleGenerate = async (farmId: string) => {
    await withToken(); setGenerating(farmId);
    try { await api.post('/api/crop-plans/generate', { farm_id: farmId }); await load(); }
    catch (e: any) { alert(e?.response?.data?.error || t('plans_failed')); }
    finally { setGenerating(null); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('plans_cancel') + '?')) return;
    await withToken(); await farmerApi.deleteCropPlan(id); setSelected(null); load();
  };

  const handleRefreshWeather = async (id: string) => {
    await withToken(); setRefreshing(true);
    try { await farmerApi.refreshWeather(id); load(); } finally { setRefreshing(false); }
  };

  const farmsWithoutActivePlan = farms.filter(
    f => !plans.some(p => p.farm_id === f.id && p.status === 'active')
  );

  // Helpers to get the right text (translated or original)
  const getRationale   = () => planLang === 'hi' && translated ? (translated.ai_rationale || selected?.ai_suggestions?.rationale || '') : (selected?.ai_suggestions?.rationale || '');
  const getAlerts      = () => planLang === 'hi' && translated ? translated.weather_alerts : (selected?.weather_alerts || []);
  const getRisks       = () => planLang === 'hi' && translated ? translated.ai_risks : (selected?.ai_suggestions?.risks || []);
  const getInputs      = () => planLang === 'hi' && translated ? translated.ai_input_recommendations : (selected?.ai_suggestions?.input_recommendations || []);
  const getTimeline    = () => {
    if (!selected?.timeline) return [];
    if (planLang === 'hi' && translated) {
      return selected.timeline.map((ti, i) => ({
        ...ti,
        label:       translated.timeline_descriptions[i]?.label       || ti.label,
        description: translated.timeline_descriptions[i]?.description || ti.description,
      }));
    }
    return selected.timeline;
  };

  return (
    <div className="flex gap-6 h-full">
      {/* ── Left: list ───────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-[#1d3a1f]">{t('plans_title')}</h1>
          <p className="text-[#7a6652] text-sm mt-0.5">{t('plans_subtitle')}</p>
        </div>

        {/* Generate cards */}
        {farmsWithoutActivePlan.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[#7a6652] uppercase tracking-wide mb-3">
              {t('plans_without_active')}
            </p>
            <div className="grid md:grid-cols-2 gap-3">
              {farmsWithoutActivePlan.map(farm => (
                <div key={farm.id} className="card border-2 border-dashed border-leaf-200 hover:border-leaf-400 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-[#1d3a1f]">{farm.name}</h3>
                      <p className="text-xs text-[#7a6652] mt-0.5">
                        {farm.district}, {farm.state} · {farm.area_acres} {t('plans_acres')}
                      </p>
                    </div>
                    <button onClick={() => handleGenerate(farm.id)} disabled={generating === farm.id}
                      className="btn-primary text-sm py-2 shrink-0 flex items-center gap-2">
                      {generating === farm.id ? (
                        <>
                          <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          {t('plans_generating')}
                        </>
                      ) : t('plans_generate')}
                    </button>
                  </div>
                  {generating === farm.id && (
                    <div className="mt-3 text-xs text-leaf-600 bg-leaf-50 rounded-xl px-3 py-2 animate-pulse">
                      🤖 {t('plans_generating_msg')} {farm.district}, {farm.state}…
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Plans list */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="card animate-pulse h-24 bg-gray-100" />)}
          </div>
        ) : plans.length === 0 ? (
          <div className="card text-center py-16">
            <div className="text-5xl mb-4">🤖</div>
            <h2 className="font-display font-semibold text-xl text-[#1d3a1f] mb-2">{t('plans_empty_title')}</h2>
            <p className="text-[#7a6652] mb-2">{t('plans_empty_desc')}</p>
            <a href="/dashboard/farms" className="btn-primary inline-block mt-2">{t('plans_add_farm')}</a>
          </div>
        ) : (
          <div className="space-y-3">
            {plans.map(p => (
              <div key={p.id} onClick={() => selectPlan(p)}
                className={clsx(
                  'card cursor-pointer hover:shadow-md transition-all border-2',
                  selected?.id === p.id ? 'border-leaf-400' : 'border-transparent'
                )}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-bold text-[#1d3a1f]">{p.crop_name}{p.variety ? ` — ${p.variety}` : ''}</h3>
                      <span className={clsx('badge', STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-600')}>
                        {p.status}
                      </span>
                      {p.ai_suggestions?.market_demand && (
                        <span className={clsx('badge', DEMAND_COLORS[p.ai_suggestions.market_demand])}>
                          {t('plans_market_demand')} {p.ai_suggestions.market_demand}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[#7a6652]">
                      🌾 {p.farm_name} · {p.season} {p.year} · {p.area_acres} {t('plans_acres')}
                    </p>
                  </div>
                  <div className="text-right text-sm text-[#7a6652]">
                    {p.sowing_date  && <div>{t('plans_sow')} {new Date(p.sowing_date).toLocaleDateString('en-IN')}</div>}
                    {p.harvest_date && <div>{t('plans_harvest')} {new Date(p.harvest_date).toLocaleDateString('en-IN')}</div>}
                    {p.expected_yield_kg && <div className="font-semibold text-leaf-700">{p.expected_yield_kg.toLocaleString()} kg</div>}
                  </div>
                </div>

                {/* Rationale preview on list card — English always (translate is in detail card) */}
                {p.ai_suggestions?.rationale && (
                  <p className="mt-2 text-xs text-[#7a6652] bg-leaf-50 rounded-xl px-3 py-2 line-clamp-2">
                    🤖 {p.ai_suggestions.rationale}
                  </p>
                )}

                {p.weather_alerts?.length > 0 && (
                  <div className="mt-2 flex items-center gap-1 text-amber-700 text-xs bg-amber-50 px-3 py-1.5 rounded-lg">
                    {t('plans_weather_alerts')} · {p.weather_alerts.length}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Right: detail card ───────────────────────────────────────────── */}
      {selected && (
        <div className="w-[420px] shrink-0">
          <div className="card sticky top-0 space-y-4 max-h-[calc(100vh-6rem)] overflow-y-auto">

            {/* Header row */}
            <div className="flex justify-between items-start gap-2">
              <div>
                <h2 className="font-display font-bold text-xl text-[#1d3a1f]">{selected.crop_name}</h2>
                {selected.variety && <p className="text-sm text-[#7a6652]">{selected.variety}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Hindi translate button */}
                <TranslateButton
                  planLang={planLang}
                  onToggle={handleTranslateToggle}
                  translating={translating}
                />
                <button onClick={() => setSelected(null)} className="text-[#7a6652] hover:text-[#2d1f0e] text-xl leading-none">×</button>
              </div>
            </div>

            {/* Translation error */}
            {translateError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700 flex items-center gap-2">
                ⚠️ {translateError}
                <button onClick={() => setTranslateError(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
              </div>
            )}

            {/* Translation loading */}
            {translating && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
                <span>🇮🇳</span>
                <div className="flex-1">
                  <div className="text-xs font-semibold text-orange-700 mb-1">हिंदी अनुवाद हो रहा है…</div>
                  <div className="h-1 bg-orange-100 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-400 rounded-full animate-pulse w-3/5" />
                  </div>
                </div>
              </div>
            )}

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                [planLang === 'hi' ? 'खेत' : 'Farm',   selected.farm_name],
                [planLang === 'hi' ? 'मौसम' : 'Season', `${selected.season} ${selected.year}`],
                [planLang === 'hi' ? 'क्षेत्र' : 'Area',   `${selected.area_acres} ${t('plans_acres')}`],
                [planLang === 'hi' ? 'उपज अनुमान' : 'Yield Est.', selected.expected_yield_kg ? `${selected.expected_yield_kg.toLocaleString()} kg` : '—'],
                [t('plans_sow'),     selected.sowing_date  ? new Date(selected.sowing_date).toLocaleDateString('en-IN')  : '—'],
                [t('plans_harvest'), selected.harvest_date ? new Date(selected.harvest_date).toLocaleDateString('en-IN') : '—'],
              ].map(([k, v]) => (
                <div key={k} className="bg-[#fdf8f0] rounded-xl px-3 py-2">
                  <div className="text-xs text-[#7a6652]">{k}</div>
                  <div className="font-semibold text-[#1d3a1f] text-sm truncate">{v}</div>
                </div>
              ))}
            </div>

            {/* AI Rationale */}
            {(selected.ai_suggestions?.rationale || translated?.ai_rationale) && (
              <div className="bg-leaf-50 border border-leaf-200 rounded-xl p-3">
                <p className="text-xs font-semibold text-leaf-700 mb-1">{t('plans_why')}</p>
                <p className="text-xs text-[#2d1f0e] leading-relaxed">{getRationale()}</p>
              </div>
            )}

            {/* Weather alerts */}
            {getAlerts().length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
                <p className="text-xs font-semibold text-amber-700 mb-1">{t('plans_weather_alerts')}</p>
                {getAlerts().map((a, i) => <p key={i} className="text-xs text-amber-700">{a}</p>)}
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 bg-[#fdf8f0] rounded-xl p-1">
              {(['timeline', 'inputs', 'risks'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={clsx(
                    'flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors',
                    activeTab === tab ? 'bg-white text-[#1d3a1f] shadow-sm' : 'text-[#7a6652]'
                  )}>
                  {tab === 'timeline' ? t('plans_timeline') : tab === 'inputs' ? t('plans_inputs') : t('plans_risks')}
                </button>
              ))}
            </div>

            {/* Timeline tab */}
            {activeTab === 'timeline' && getTimeline().length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {getTimeline().map((ti, i) => (
                  <div key={i} className="flex gap-3 text-xs">
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-leaf-400 mt-0.5 shrink-0" />
                      {i < getTimeline().length - 1 && <div className="w-0.5 flex-1 bg-leaf-100 my-0.5" />}
                    </div>
                    <div className="pb-2">
                      <div className="font-semibold text-[#1d3a1f]">{ti.label}</div>
                      <div className="text-[#7a6652]">
                        {ti.date && new Date(ti.date).toLocaleDateString('en-IN')} · {ti.description}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Inputs tab */}
            {activeTab === 'inputs' && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {getInputs().length ? (
                  getInputs().map((r, i) => (
                    <div key={i} className="bg-[#fdf8f0] rounded-xl px-3 py-2 text-xs">
                      <div className="font-semibold text-[#1d3a1f]">{r.item}</div>
                      <div className="text-[#7a6652] mt-0.5">{r.quantity} · {r.timing}</div>
                    </div>
                  ))
                ) : <p className="text-xs text-[#7a6652]">{t('plans_no_inputs')}</p>}
              </div>
            )}

            {/* Risks tab */}
            {activeTab === 'risks' && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {getRisks().length ? (
                  getRisks().map((r, i) => (
                    <div key={i} className="flex gap-2 text-xs bg-red-50 rounded-xl px-3 py-2">
                      <span className="text-red-500 shrink-0">⚠</span>
                      <span className="text-[#2d1f0e]">{r}</span>
                    </div> 
                  ))
                ) : <p className="text-xs text-[#7a6652]">{t('plans_no_risks')}</p>}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t border-[#e8ddd0]">
              <button onClick={() => handleRefreshWeather(selected.id)} disabled={refreshing}
                className="btn-secondary flex-1 text-sm py-2">
                {refreshing ? '…' : t('plans_refresh_weather')}
              </button>
              <button onClick={() => handleDelete(selected.id)}
                className="px-4 py-2 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 text-sm font-medium transition-colors">
                {t('plans_cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}