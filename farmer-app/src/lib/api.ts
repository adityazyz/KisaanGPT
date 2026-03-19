import axios from 'axios';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const api = axios.create({ baseURL: BASE, withCredentials: false });

export function setAuthToken(token: string | null) {
  if (token) api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  else delete api.defaults.headers.common['Authorization'];
}

// Farmer-specific API calls
export const farmerApi = {
  getMe: () => api.get('/api/farmers/me'),
  getDashboard: () => api.get('/api/farmers/dashboard'),
  getFarms: () => api.get('/api/farmers/farms'),
  createFarm: (data: any) => api.post('/api/farmers/farms', data),
  updateFarm: (id: string, data: any) => api.put(`/api/farmers/farms/${id}`, data),
  getSuggestions: (farmId: string) => api.get(`/api/farmers/suggestions?farmId=${farmId}`),
  getNotifications: () => api.get('/api/farmers/notifications'),
  markNotificationRead: (id: string) => api.patch(`/api/farmers/notifications/${id}/read`),

  getCropPlans: () => api.get('/api/crop-plans'),
  createCropPlan: (data: any) => api.post('/api/crop-plans', data),
  updateCropPlan: (id: string, data: any) => api.put(`/api/crop-plans/${id}`, data),
  deleteCropPlan: (id: string) => api.delete(`/api/crop-plans/${id}`),
  refreshWeather: (id: string) => api.post(`/api/crop-plans/${id}/refresh-weather`),

  getProduction: () => api.get('/api/production'),
  createProduction: (data: any) => api.post('/api/production', data),
  updateProduction: (id: string, data: any) => api.put(`/api/production/${id}`, data),
  submitSupply: (id: string) => api.post(`/api/production/${id}/submit-supply`),

  getMySupply: () => api.get('/api/supply/my-items'),
  browseInputs: (params?: any) => api.get('/api/suppliers/products/browse', { params }),
  submitLead: (data: any) => api.post('/api/suppliers/leads', data),
};
