'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { adminApi, setAuthToken } from '@/lib/api';
import { clsx } from 'clsx';

interface User { id: string; clerk_id: string; email: string; full_name: string; phone: string; role: string; is_active: boolean; created_at: string; }

const ROLES = ['All','farmer','buyer','supplier','admin'];
const ROLE_COLORS: Record<string,string> = {
  farmer:   'bg-green-900/30 text-green-400 border-green-800',
  buyer:    'bg-blue-900/30 text-blue-400 border-blue-800',
  supplier: 'bg-amber-900/30 text-amber-400 border-amber-800',
  admin:    'bg-indigo-900/30 text-indigo-400 border-indigo-800',
};

export default function UsersPage() {
  const { getToken } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('All');
  const [updating, setUpdating] = useState<string | null>(null);

  const load = async (role?: string) => {
    const token = await getToken(); setAuthToken(token);
    const { data } = await adminApi.getUsers(role !== 'All' ? role : undefined);
    setUsers(data); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleRoleFilter = (r: string) => { setRoleFilter(r); load(r); };

  const toggleActive = async (user: User) => {
    setUpdating(user.id);
    try { await adminApi.updateUser(user.id, { is_active: !user.is_active }); load(roleFilter !== 'All' ? roleFilter : undefined); }
    finally { setUpdating(null); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">User Management</h1>
        <p className="text-zinc-400 text-sm mt-0.5">All registered platform users</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {ROLES.map(r => (
          <button key={r} onClick={() => handleRoleFilter(r)}
            className={clsx('px-4 py-1.5 rounded-full text-sm font-medium transition-colors capitalize',
              roleFilter === r ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700')}>
            {r}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="card h-14 bg-zinc-800 animate-pulse" />)}</div>
      ) : (
        <div className="card border border-zinc-800 overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                {['Name','Email','Phone','Role','Status','Joined','Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-zinc-500 font-semibold uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="table-row">
                  <td className="px-4 py-3 text-white font-medium">{u.full_name}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{u.email}</td>
                  <td className="px-4 py-3 text-zinc-400">{u.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={clsx('badge border capitalize', ROLE_COLORS[u.role] || 'bg-zinc-800 text-zinc-400 border-zinc-700')}>{u.role}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('badge border', u.is_active ? 'bg-green-900/30 text-green-400 border-green-800' : 'bg-zinc-800 text-zinc-500 border-zinc-700')}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{new Date(u.created_at).toLocaleDateString('en-IN')}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive(u)} disabled={updating === u.id}
                      className={clsx('text-xs px-3 py-1 rounded-lg font-medium transition-colors',
                        u.is_active ? 'bg-red-900/40 text-red-400 hover:bg-red-900/60' : 'bg-green-900/40 text-green-400 hover:bg-green-900/60')}>
                      {updating === u.id ? '…' : u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
