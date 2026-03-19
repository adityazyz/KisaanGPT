'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { supplierApi, setAuthToken } from '@/lib/api';

interface Product { id: string; name: string; category: string; description: string; price: number; unit: string; stock_qty: number; suitable_crops: string[]; is_active: boolean; lead_count: number; }

const CATEGORIES = ['Fertilizer','Pesticide','Seeds','Equipment','Irrigation','Other'];
const CROPS = ['Wheat','Rice','Maize','Cotton','Soybean','Mustard','Chickpea','Potato','Sugarcane','Tomato'];

export default function ProductsPage() {
  const { getToken } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const emptyForm = { name: '', category: '', description: '', price: '', unit: 'kg', stock_qty: '', suitable_crops: [] as string[] };
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    const token = await getToken(); setAuthToken(token);
    const { data } = await supplierApi.getProducts();
    setProducts(data); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditProduct(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (p: Product) => { setEditProduct(p); setForm({ name: p.name, category: p.category, description: p.description || '', price: String(p.price || ''), unit: p.unit, stock_qty: String(p.stock_qty || ''), suitable_crops: p.suitable_crops || [] }); setShowForm(true); };

  const toggleCrop = (crop: string) => setForm(f => ({ ...f, suitable_crops: f.suitable_crops.includes(crop) ? f.suitable_crops.filter(c => c !== crop) : [...f.suitable_crops, crop] }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const body = { ...form, price: form.price ? parseFloat(form.price) : null, stock_qty: form.stock_qty ? parseFloat(form.stock_qty) : null };
    try {
      if (editProduct) await supplierApi.updateProduct(editProduct.id, body);
      else await supplierApi.createProduct(body);
      setShowForm(false); load();
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this product?')) return;
    await supplierApi.deleteProduct(id); load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-stone-900">My Products</h1>
          <p className="text-stone-500 text-sm mt-0.5">List and manage your agricultural inputs</p>
        </div>
        <button className="btn-primary" onClick={openAdd}>+ Add Product</button>
      </div>

      {loading ? <div className="grid md:grid-cols-2 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="card animate-pulse h-40 bg-stone-100" />)}</div>
        : products.length === 0 ? (
          <div className="card text-center py-16">
            <div className="text-5xl mb-4">📦</div>
            <h2 className="font-display text-xl text-stone-700 mb-2">No products listed</h2>
            <p className="text-stone-500 mb-6">Add your first product to start receiving farmer leads.</p>
            <button className="btn-primary" onClick={openAdd}>Add First Product</button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {products.map(p => (
              <div key={p.id} className={`card ${!p.is_active ? 'opacity-50' : ''}`}>
                <div className="flex justify-between items-start mb-2">
                  <span className="badge bg-amber-100 text-amber-700">{p.category}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-stone-400">{p.lead_count} leads</span>
                    {!p.is_active && <span className="badge bg-stone-100 text-stone-500">Inactive</span>}
                  </div>
                </div>
                <h3 className="font-bold text-stone-900 mb-1">{p.name}</h3>
                {p.description && <p className="text-sm text-stone-500 mb-2 line-clamp-2">{p.description}</p>}
                <div className="flex gap-3 text-sm text-stone-600 mb-3">
                  {p.price && <span>₹{p.price}/{p.unit}</span>}
                  {p.stock_qty && <span>Stock: {p.stock_qty} {p.unit}</span>}
                </div>
                {p.suitable_crops?.length > 0 && <p className="text-xs text-amber-600 mb-3">✅ {p.suitable_crops.join(', ')}</p>}
                <div className="flex gap-2 pt-3 border-t border-stone-100">
                  <button onClick={() => openEdit(p)} className="btn-secondary flex-1 text-sm py-1.5">Edit</button>
                  <button onClick={() => handleDelete(p.id)} className="px-4 py-1.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 text-sm font-medium transition-colors">Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="font-display font-bold text-xl text-stone-900 mb-4">{editProduct ? 'Edit Product' : 'Add Product'}</h2>
            <form onSubmit={submit} className="space-y-3">
              <div><label className="label">Product Name</label><input className="input" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
              <div>
                <label className="label">Category</label>
                <select className="input" required value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                  <option value="">Select category</option>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div><label className="label">Description</label><textarea className="input" rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="label">Price</label><input className="input" type="number" step="0.01" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} /></div>
                <div>
                  <label className="label">Unit</label>
                  <select className="input" value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}>
                    {['kg','litre','bag','bottle','piece','quintal'].map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div><label className="label">Stock Qty</label><input className="input" type="number" value={form.stock_qty} onChange={e => setForm(p => ({ ...p, stock_qty: e.target.value }))} /></div>
              </div>
              <div>
                <label className="label">Suitable Crops</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {CROPS.map(c => (
                    <button type="button" key={c} onClick={() => toggleCrop(c)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${form.suitable_crops.includes(c) ? 'bg-amber-100 border-amber-400 text-amber-700' : 'border-stone-200 text-stone-500'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1" disabled={saving}>{saving ? 'Saving…' : editProduct ? 'Update' : 'Add Product'}</button>
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
