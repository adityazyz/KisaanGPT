import axios from 'axios';
const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
export const api = axios.create({ baseURL: BASE });
export function setAuthToken(token: string | null) {
  if (token) api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  else delete api.defaults.headers.common['Authorization'];
}
export const supplierApi = {
  getDashboard: () => api.get('/api/suppliers/dashboard'),
  getProducts: () => api.get('/api/suppliers/products'),
  createProduct: (d: any) => api.post('/api/suppliers/products', d),
  updateProduct: (id: string, d: any) => api.put(`/api/suppliers/products/${id}`, d),
  deleteProduct: (id: string) => api.delete(`/api/suppliers/products/${id}`),
  getLeads: () => api.get('/api/suppliers/leads'),
  markLeadRead: (id: string) => api.patch(`/api/suppliers/leads/${id}/read`),
};
