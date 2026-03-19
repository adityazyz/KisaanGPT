'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { buyerApi, setAuthToken } from '@/lib/api';
import { clsx } from 'clsx';

interface Notification { id: string; title: string; body: string; is_read: boolean; created_at: string; }

export default function NotificationsPage() {
  const { getToken } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const token = await getToken(); setAuthToken(token);
    const { data } = await buyerApi.getNotifications();
    setNotifications(data); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const markRead = async (id: string) => {
    await buyerApi.markNotificationRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  return (
    <div>
      <h1 className="text-2xl font-display font-bold text-slate-900 mb-6">Notifications</h1>
      {loading ? <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="card animate-pulse h-16 bg-slate-100" />)}</div>
        : notifications.length === 0 ? (
          <div className="card text-center py-12"><div className="text-4xl mb-3">🔔</div><p className="text-slate-500">No notifications yet.</p></div>
        ) : (
          <div className="space-y-2">
            {notifications.map(n => (
              <div key={n.id} onClick={() => !n.is_read && markRead(n.id)}
                className={clsx('card cursor-pointer transition-all', !n.is_read ? 'border-l-4 border-brand-500' : 'opacity-70')}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className={clsx('font-semibold text-sm', n.is_read ? 'text-slate-500' : 'text-slate-900')}>{n.title}</p>
                    <p className="text-sm text-slate-500 mt-0.5">{n.body}</p>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0 ml-4">{new Date(n.created_at).toLocaleDateString('en-IN')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
