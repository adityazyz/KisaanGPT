'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { farmerApi, setAuthToken } from '@/lib/api';
import { useLanguage } from '@/context/LanguageContext';

interface SupplyItem { id: string; crop_name: string; qty_kg: number; quality_grade: string; status: string; lot_location: string; created_at: string; }

export default function SupplyPage() {
  const { getToken } = useAuth();
  const { t } = useLanguage();
  const [items, setItems]   = useState<SupplyItem[]>([]);
  const [loading, setLoading] = useState(true);

  const statusColors: Record<string,string> = { pending:'bg-yellow-100 text-yellow-700', verified:'bg-blue-100 text-blue-700', aggregated:'bg-purple-100 text-purple-700', matched:'bg-green-100 text-green-700', sold:'bg-gray-100 text-gray-600' };
  const statusLabels: Record<string,string> = { pending: t('status_pending'), verified: t('status_verified'), aggregated: t('status_aggregated'), matched: t('status_matched'), sold: t('status_sold') };

  useEffect(() => {
    (async () => {
      const tok = await getToken(); setAuthToken(tok);
      const { data } = await farmerApi.getMySupply();
      setItems(data); setLoading(false);
    })();
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-[#1d3a1f]">{t('supply_title')}</h1>
        <p className="text-[#7a6652] text-sm mt-0.5">{t('supply_subtitle')}</p>
      </div>

      <div className="card mb-6 bg-leaf-50 border-leaf-200">
        <h3 className="font-semibold text-leaf-800 mb-2">{t('supply_how_title')}</h3>
        <ol className="text-sm text-leaf-700 space-y-1 list-decimal list-inside">
          {[t('supply_step1'), t('supply_step2'), t('supply_step3'), t('supply_step4'), t('supply_step5')].map((s,i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </div>

      {loading ? <div className="space-y-3">{[...Array(3)].map((_,i) => <div key={i} className="card animate-pulse h-20 bg-gray-100" />)}</div>
        : items.length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-4xl mb-3">🚜</div>
            <p className="font-semibold text-[#1d3a1f]">{t('supply_empty_title')}</p>
            <p className="text-sm text-[#7a6652] mt-1">{t('supply_empty_desc')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(item => (
              <div key={item.id} className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-[#1d3a1f]">{item.crop_name}</h3>
                    <p className="text-sm text-[#7a6652]">{item.qty_kg?.toLocaleString()} {t('supply_kg')} {item.quality_grade}</p>
                    {item.lot_location && <p className="text-xs text-[#7a6652] mt-0.5">{t('supply_lot')} {item.lot_location}</p>}
                  </div>
                  <div className="text-right">
                    <span className={`badge ${statusColors[item.status] || 'bg-gray-100 text-gray-600'}`}>{statusLabels[item.status] || item.status}</span>
                    <p className="text-xs text-[#7a6652] mt-1">{new Date(item.created_at).toLocaleDateString('en-IN')}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
