'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { farmerApi, setAuthToken } from '@/lib/api';
import { useLanguage } from '@/context/LanguageContext';
import { clsx } from 'clsx';

interface Notification { id: string; title: string; body: string; type: string; is_read: boolean; created_at: string; }

export default function NotificationsPage() {
  const { getToken } = useAuth();
  const { t } = useLanguage();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const tok = await getToken(); setAuthToken(tok);
    const { data } = await farmerApi.getNotifications();
    setNotifications(data); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const markRead = async (id: string) => {
    await farmerApi.markNotificationRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  return (
    <div>
      <h1 className="text-2xl font-display font-bold text-[#1d3a1f] mb-6">{t('notif_title')}</h1>
      {loading ? <div className="space-y-3">{[...Array(4)].map((_,i) => <div key={i} className="card animate-pulse h-16 bg-gray-100" />)}</div>
        : notifications.length === 0 ? (
          <div className="card text-center py-12"><div className="text-4xl mb-3">🔔</div><p className="text-[#7a6652]">{t('notif_empty')}</p></div>
        ) : (
          <div className="space-y-2">
            {notifications.map(n => (
              <div key={n.id} onClick={() => !n.is_read && markRead(n.id)}
                className={clsx('card cursor-pointer transition-all', !n.is_read ? 'border-l-4 border-leaf-500' : 'opacity-70')}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className={clsx('font-semibold text-sm', n.is_read ? 'text-[#7a6652]' : 'text-[#1d3a1f]')}>{n.title}</p>
                    <p className="text-sm text-[#7a6652] mt-0.5">{n.body}</p>
                  </div>
                  <span className="text-xs text-[#7a6652] shrink-0 ml-4">{new Date(n.created_at).toLocaleDateString('en-IN')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
