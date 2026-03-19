import axios from 'axios';
const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
export const api = axios.create({ baseURL: BASE });
export function setAuthToken(token: string | null) {
  if (token) api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  else delete api.defaults.headers.common['Authorization'];
}
export const buyerApi = {
  getDashboard: () => api.get('/api/buyers/dashboard'),
  getDemands: () => api.get('/api/buyers/demands'),
  createDemand: (d: any) => api.post('/api/buyers/demands', d),
  updateDemand: (id: string, d: any) => api.put(`/api/buyers/demands/${id}`, d),
  deleteDemand: (id: string) => api.delete(`/api/buyers/demands/${id}`),
  getMatches: () => api.get('/api/buyers/matches'),
  acceptMatch: (id: string) => api.patch(`/api/buyers/matches/${id}/accept`),
  getSupply: (params?: any) => api.get('/api/buyers/supply', { params }),
  getNotifications: () => api.get('/api/farmers/notifications'),
  markNotificationRead: (id: string) => api.patch(`/api/farmers/notifications/${id}/read`),
};
