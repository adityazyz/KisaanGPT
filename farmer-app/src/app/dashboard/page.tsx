'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { farmerApi, setAuthToken } from '@/lib/api';
import { useLanguage } from '@/context/LanguageContext';

interface Stats { farmCount: number; activePlans: number; totalYieldKg: number; pendingSupply: number }

export default function DashboardPage() {
  const { getToken } = useAuth();
  const { t } = useLanguage();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      setAuthToken(token);
      await fetch('/api/set-role', { method: 'POST' });
      try { const { data } = await farmerApi.getDashboard(); setStats(data); }
      catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [getToken]);

  const cards = [
    { label: t('dashboard_my_farms'),      value: stats?.farmCount ?? '—',                        icon: '🌾', color: 'bg-leaf-50 border-leaf-200'   },
    { label: t('dashboard_active_plans'),  value: stats?.activePlans ?? '—',                      icon: '📋', color: 'bg-earth-50 border-earth-200' },
    { label: t('dashboard_total_yield'),   value: stats?.totalYieldKg?.toLocaleString() ?? '—',   icon: '📦', color: 'bg-soil-50 border-soil-200'   },
    { label: t('dashboard_pending_supply'),value: stats?.pendingSupply ?? '—',                    icon: '🚜', color: 'bg-blue-50 border-blue-200'   },
  ];

  const quickActions = [
    { label: t('action_add_farm'),       href: '/dashboard/farms'      },
    { label: t('action_create_plan'),    href: '/dashboard/crop-plans' },
    { label: t('action_log_harvest'),    href: '/dashboard/production' },
    { label: t('action_submit_supply'),  href: '/dashboard/supply'     },
    { label: t('action_browse_inputs'),  href: '/dashboard/inputs'     },
  ];

  const seasons = [
    { name: t('season_kharif'), months: t('season_kharif_months'), crops: t('season_kharif_crops'), active: true  },
    { name: t('season_rabi'),   months: t('season_rabi_months'),   crops: t('season_rabi_crops'),   active: false },
    { name: t('season_zaid'),   months: t('season_zaid_months'),   crops: t('season_zaid_crops'),   active: false },
  ];

  return (
    <div>
      <h1 className="text-2xl font-display font-bold text-[#1d3a1f] mb-1">{t('dashboard_welcome')}</h1>
      <p className="text-[#7a6652] mb-8">{t('dashboard_subtitle')}</p>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="card animate-pulse h-28 bg-gray-100" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {cards.map(c => (
            <div key={c.label} className={`card border ${c.color}`}>
              <div className="text-3xl mb-2">{c.icon}</div>
              <div className="text-2xl font-bold text-[#1d3a1f]">{c.value}</div>
              <div className="text-sm text-[#7a6652]">{c.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="font-display font-semibold text-lg text-[#1d3a1f] mb-4">{t('dashboard_quick_actions')}</h2>
          <div className="space-y-2">
            {quickActions.map(a => (
              <a key={a.href} href={a.href}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl hover:bg-leaf-50 text-[#2d1f0e] text-sm font-medium transition-colors">
                {a.label}
              </a>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="font-display font-semibold text-lg text-[#1d3a1f] mb-4">{t('dashboard_season_calendar')}</h2>
          <div className="space-y-3">
            {seasons.map(s => (
              <div key={s.name} className={`p-3 rounded-xl border ${s.active ? 'border-leaf-300 bg-leaf-50' : 'border-[#e8ddd0]'}`}>
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-sm text-[#1d3a1f]">{s.name}</span>
                  {s.active && <span className="badge bg-leaf-100 text-leaf-700">{t('dashboard_current')}</span>}
                  <span className="text-xs text-[#7a6652]">{s.months}</span>
                </div>
                <p className="text-xs text-[#7a6652]">{s.crops}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
