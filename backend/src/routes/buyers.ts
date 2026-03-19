import { FastifyInstance } from 'fastify';
import { query } from '../db';
import { requireBuyer, requireAuth } from '../middleware/auth';

export async function buyerRoutes(app: FastifyInstance) {
  // GET /api/buyers/demands — my demand posts
  app.get('/demands', async (req, reply) => {
    if (!requireBuyer(req, reply)) return;
    const { rows } = await query(
      `SELECT dp.*,
        (SELECT COUNT(*) FROM matches m WHERE m.demand_id = dp.id) AS match_count
       FROM demand_posts dp
       WHERE dp.buyer_id = $1 ORDER BY dp.created_at DESC`,
      [req.auth!.userId]
    );
    return rows;
  });

  // POST /api/buyers/demands
  app.post('/demands', async (req, reply) => {
    if (!requireBuyer(req, reply)) return;
    const b = req.body as any;
    const { rows } = await query(
      `INSERT INTO demand_posts
         (buyer_id, crop_name, quantity_kg, price_per_kg, delivery_state,
          delivery_district, required_by, quality_pref, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.auth!.userId, b.crop_name, b.quantity_kg, b.price_per_kg,
       b.delivery_state, b.delivery_district, b.required_by, b.quality_pref, b.notes]
    );
    return reply.code(201).send(rows[0]);
  });

  // PUT /api/buyers/demands/:id
  app.put('/demands/:id', async (req, reply) => {
    if (!requireBuyer(req, reply)) return;
    const b = req.body as any;
    const { rows } = await query(
      `UPDATE demand_posts
       SET crop_name=$2, quantity_kg=$3, price_per_kg=$4, delivery_state=$5,
           delivery_district=$6, required_by=$7, quality_pref=$8, notes=$9
       WHERE id=$1 AND buyer_id=$10 RETURNING *`,
      [(req.params as any).id, b.crop_name, b.quantity_kg, b.price_per_kg,
       b.delivery_state, b.delivery_district, b.required_by, b.quality_pref,
       b.notes, req.auth!.userId]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Not found' });
    return rows[0];
  });

  // DELETE /api/buyers/demands/:id
  app.delete('/demands/:id', async (req, reply) => {
    if (!requireBuyer(req, reply)) return;
    await query(`UPDATE demand_posts SET is_active=false WHERE id=$1 AND buyer_id=$2`, [
      (req.params as any).id, req.auth!.userId
    ]);
    return { ok: true };
  });

  // GET /api/buyers/matches — my matched lots
  app.get('/matches', async (req, reply) => {
    if (!requireBuyer(req, reply)) return;
    const { rows } = await query(
      `SELECT m.*, dp.crop_name, dp.quantity_kg AS demanded_qty,
              sl.location AS lot_location, sl.total_qty_kg,
              sl.quality_grade, sl.price_per_kg AS lot_price
       FROM matches m
       JOIN demand_posts dp ON dp.id = m.demand_id
       JOIN supply_lots sl ON sl.id = m.lot_id
       WHERE dp.buyer_id = $1
       ORDER BY m.created_at DESC`,
      [req.auth!.userId]
    );
    return rows;
  });

  // PATCH /api/buyers/matches/:id/accept
  app.patch('/matches/:id/accept', async (req, reply) => {
    if (!requireBuyer(req, reply)) return;
    const { rows } = await query(
      `UPDATE matches m SET status='accepted'
       FROM demand_posts dp
       WHERE m.id=$1 AND m.demand_id=dp.id AND dp.buyer_id=$2
       RETURNING m.*`,
      [(req.params as any).id, req.auth!.userId]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Not found' });
    return rows[0];
  });

  // GET /api/buyers/supply — browse available supply
  app.get('/supply', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const q = req.query as any;
    const { rows } = await query(
      `SELECT * FROM supply_lots
       WHERE ($1::text IS NULL OR crop_name ILIKE $1)
         AND ($2::text IS NULL OR state = $2)
         AND status = 'open' AND available_qty > 0
       ORDER BY available_qty DESC LIMIT 50`,
      [q.crop ? `%${q.crop}%` : null, q.state || null]
    );
    return rows;
  });

  // GET /api/buyers/dashboard
  app.get('/dashboard', async (req, reply) => {
    if (!requireBuyer(req, reply)) return;
    const uid = req.auth!.userId;
    const [demands, matches, supply] = await Promise.all([
      query(`SELECT COUNT(*) FROM demand_posts WHERE buyer_id=$1 AND is_active=true`, [uid]),
      query(`SELECT COUNT(*) FROM matches m JOIN demand_posts dp ON dp.id=m.demand_id WHERE dp.buyer_id=$1 AND m.status='proposed'`, [uid]),
      query(`SELECT COUNT(*) FROM supply_lots WHERE status='open' AND available_qty>0`),
    ]);
    return {
      activeDemands: parseInt(demands.rows[0].count),
      pendingMatches: parseInt(matches.rows[0].count),
      availableLots: parseInt(supply.rows[0].count),
    };
  });
}
