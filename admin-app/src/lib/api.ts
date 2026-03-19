import axios from 'axios';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
export const api = axios.create({ baseURL: BASE });

export function setAuthToken(token: string | null) {
  if (token) api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  else delete api.defaults.headers.common['Authorization'];
}

export const adminApi = {
  getDashboard:         ()                    => api.get('/api/admin/dashboard'),
  getUsers:             (role?: string)        => api.get('/api/admin/users', { params: role ? { role } : {} }),
  updateUser:           (id: string, d: any)   => api.patch(`/api/admin/users/${id}`, d),
  getSupplyItems:       ()                    => api.get('/api/admin/supply-items'),
  verifySupplyItem:     (id: string, d: any)   => api.patch(`/api/admin/supply-items/${id}/verify`, d),
  runAggregate:         ()                    => api.post('/api/admin/aggregate'),
  getLots:              ()                    => api.get('/api/admin/lots'),
  getDemands:           ()                    => api.get('/api/admin/demands'),
  suggestMatches:       (demandId: string)     => api.get('/api/admin/matches/suggest', { params: { demandId } }),
  createMatch:          (d: any)               => api.post('/api/admin/matches', d),
  updateMatch:          (id: string, d: any)   => api.patch(`/api/admin/matches/${id}`, d),
  getAllMatches:         ()                    => api.get('/api/matching'),
};
