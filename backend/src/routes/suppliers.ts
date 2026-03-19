import { FastifyInstance } from 'fastify';
import { query } from '../db';
import { requireSupplier, requireAuth } from '../middleware/auth';

export async function supplierRoutes(app: FastifyInstance) {
  // GET /api/suppliers/products
  app.get('/products', async (req, reply) => {
    if (!requireSupplier(req, reply)) return;
    const { rows } = await query(
      `SELECT ip.*,
        (SELECT COUNT(*) FROM leads l WHERE l.product_id = ip.id) AS lead_count
       FROM input_products ip
       WHERE ip.supplier_id = $1 ORDER BY ip.created_at DESC`,
      [req.auth!.userId]
    );
    return rows;
  });

  // GET /api/suppliers/products/browse (any authenticated user)
  app.get('/products/browse', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const q = req.query as any;
    const { rows } = await query(
      `SELECT ip.*, u.full_name AS supplier_name, u.phone AS supplier_phone
       FROM input_products ip
       JOIN users u ON u.id = ip.supplier_id
       WHERE ip.is_active = true
         AND ($1::text IS NULL OR ip.category ILIKE $1)
         AND ($2::text IS NULL OR $2 = ANY(ip.suitable_crops))
       ORDER BY ip.created_at DESC LIMIT 100`,
      [q.category ? `%${q.category}%` : null, q.crop || null]
    );
    return rows;
  });

  // POST /api/suppliers/products
  app.post('/products', async (req, reply) => {
    if (!requireSupplier(req, reply)) return;
    const b = req.body as any;
    const { rows } = await query(
      `INSERT INTO input_products
         (supplier_id, name, category, description, price, unit, stock_qty, suitable_crops)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.auth!.userId, b.name, b.category, b.description, b.price, b.unit || 'kg', b.stock_qty, b.suitable_crops || []]
    );
    return reply.code(201).send(rows[0]);
  });

  // PUT /api/suppliers/products/:id
  app.put('/products/:id', async (req, reply) => {
    if (!requireSupplier(req, reply)) return;
    const b = req.body as any;
    const { rows } = await query(
      `UPDATE input_products
       SET name=$2, category=$3, description=$4, price=$5, unit=$6, stock_qty=$7, suitable_crops=$8, is_active=$9
       WHERE id=$1 AND supplier_id=$10 RETURNING *`,
      [(req.params as any).id, b.name, b.category, b.description, b.price,
       b.unit, b.stock_qty, b.suitable_crops, b.is_active ?? true, req.auth!.userId]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Not found' });
    return rows[0];
  });

  // DELETE /api/suppliers/products/:id
  app.delete('/products/:id', async (req, reply) => {
    if (!requireSupplier(req, reply)) return;
    await query(`UPDATE input_products SET is_active=false WHERE id=$1 AND supplier_id=$2`, [
      (req.params as any).id, req.auth!.userId
    ]);
    return { ok: true };
  });

  // GET /api/suppliers/leads
  app.get('/leads', async (req, reply) => {
    if (!requireSupplier(req, reply)) return;
    const { rows } = await query(
      `SELECT l.*, ip.name AS product_name, ip.category,
              u.full_name AS farmer_name, u.phone AS farmer_phone, u.email AS farmer_email
       FROM leads l
       JOIN input_products ip ON ip.id = l.product_id
       JOIN users u ON u.id = l.farmer_id
       WHERE l.supplier_id = $1 ORDER BY l.created_at DESC`,
      [req.auth!.userId]
    );
    return rows;
  });

  // PATCH /api/suppliers/leads/:id/read
  app.patch('/leads/:id/read', async (req, reply) => {
    if (!requireSupplier(req, reply)) return;
    await query(`UPDATE leads SET is_read=true WHERE id=$1 AND supplier_id=$2`, [
      (req.params as any).id, req.auth!.userId
    ]);
    return { ok: true };
  });

  // POST /api/suppliers/leads (farmer submits interest)
  app.post('/leads', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const b = req.body as any;
    const { rows: prod } = await query(
      `SELECT supplier_id FROM input_products WHERE id=$1 AND is_active=true`, [b.product_id]
    );
    if (!prod[0]) return reply.code(404).send({ error: 'Product not found' });

    const { rows } = await query(
      `INSERT INTO leads (product_id, supplier_id, farmer_id, message, qty_needed)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [b.product_id, prod[0].supplier_id, req.auth!.userId, b.message, b.qty_needed]
    );
    return reply.code(201).send(rows[0]);
  });

  // GET /api/suppliers/dashboard
  app.get('/dashboard', async (req, reply) => {
    if (!requireSupplier(req, reply)) return;
    const uid = req.auth!.userId;
    const [products, leads, unread] = await Promise.all([
      query(`SELECT COUNT(*) FROM input_products WHERE supplier_id=$1 AND is_active=true`, [uid]),
      query(`SELECT COUNT(*) FROM leads l JOIN input_products ip ON ip.id=l.product_id WHERE ip.supplier_id=$1`, [uid]),
      query(`SELECT COUNT(*) FROM leads l JOIN input_products ip ON ip.id=l.product_id WHERE ip.supplier_id=$1 AND l.is_read=false`, [uid]),
    ]);
    return {
      activeProducts: parseInt(products.rows[0].count),
      totalLeads: parseInt(leads.rows[0].count),
      unreadLeads: parseInt(unread.rows[0].count),
    };
  });
}
