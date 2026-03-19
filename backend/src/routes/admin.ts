import { FastifyInstance } from 'fastify';
import { query } from '../db';
import { requireAdmin } from '../middleware/auth';
import { aggregateSupply, findMatches } from '../services/matching';

export async function adminRoutes(app: FastifyInstance) {
  // GET /api/admin/dashboard
  app.get('/dashboard', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const [users, farms, plans, supply, demand, matches, leads] = await Promise.all([
      query(`SELECT role, COUNT(*) FROM users WHERE is_active=true GROUP BY role`),
      query(`SELECT COUNT(*) FROM farms`),
      query(`SELECT status, COUNT(*) FROM crop_plans GROUP BY status`),
      query(`SELECT status, COUNT(*), COALESCE(SUM(total_qty_kg),0) AS total_qty FROM supply_lots GROUP BY status`),
      query(`SELECT COUNT(*) FROM demand_posts WHERE is_active=true`),
      query(`SELECT status, COUNT(*) FROM matches GROUP BY status`),
      query(`SELECT COUNT(*) FROM leads WHERE is_read=false`),
    ]);
    return {
      users: users.rows,
      farmCount: parseInt(farms.rows[0].count),
      cropPlans: plans.rows,
      supply: supply.rows,
      activeDemands: parseInt(demand.rows[0].count),
      matches: matches.rows,
      unreadLeads: parseInt(leads.rows[0].count),
    };
  });

  // GET /api/admin/users
  app.get('/users', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const q = req.query as any;
    const { rows } = await query(
      `SELECT * FROM users WHERE ($1::text IS NULL OR role=$1::user_role) ORDER BY created_at DESC LIMIT 100`,
      [q.role || null]
    );
    return rows;
  });

  // PATCH /api/admin/users/:id
  app.patch('/users/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const b = req.body as any;
    const { rows } = await query(
      `UPDATE users SET is_active=$2, role=COALESCE($3,role) WHERE id=$1 RETURNING *`,
      [(req.params as any).id, b.is_active, b.role]
    );
    return rows[0];
  });

  // GET /api/admin/supply-items — all pending verifications
  app.get('/supply-items', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { rows } = await query(
      `SELECT si.*, u.full_name AS farmer_name, u.phone,
              f.location AS farm_location, f.state, f.district
       FROM supply_items si
       JOIN users u ON u.id = si.farmer_id
       LEFT JOIN farms f ON f.farmer_id = si.farmer_id
       ORDER BY si.created_at ASC`
    );
    return rows;
  });

  // PATCH /api/admin/supply-items/:id/verify
  app.patch('/supply-items/:id/verify', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const b = req.body as any;
    const { rows } = await query(
      `UPDATE supply_items
       SET status='verified', quality_grade=COALESCE($2,quality_grade),
           verified_at=NOW(), verified_by=$3
       WHERE id=$1 RETURNING *`,
      [(req.params as any).id, b.quality_grade, req.auth!.userId]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Not found' });

    // Create notification for farmer
    await query(
      `INSERT INTO notifications (user_id, title, body, type, meta)
       VALUES ($1, 'Supply Verified ✅', $2, 'supply_verified', $3)`,
      [rows[0].farmer_id,
       `Your supply of ${rows[0].qty_kg}kg ${rows[0].crop_name} has been verified (Grade: ${rows[0].quality_grade})`,
       JSON.stringify({ supply_item_id: rows[0].id })]
    );

    return rows[0];
  });

  // POST /api/admin/aggregate
  app.post('/aggregate', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const result = await aggregateSupply();
    return result;
  });

  // GET /api/admin/matches/suggest?demandId=
  app.get('/matches/suggest', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { demandId } = req.query as any;
    if (!demandId) return reply.code(400).send({ error: 'demandId required' });
    const results = await findMatches(demandId);
    return results;
  });

  // POST /api/admin/matches
  app.post('/matches', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const b = req.body as any;
    const { rows } = await query(
      `INSERT INTO matches (demand_id, lot_id, admin_id, matched_qty_kg, agreed_price, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [b.demand_id, b.lot_id, req.auth!.userId, b.matched_qty_kg, b.agreed_price, b.notes]
    );

    // Update lot available qty
    await query(
      `UPDATE supply_lots SET available_qty = available_qty - $1 WHERE id = $2`,
      [b.matched_qty_kg, b.lot_id]
    );

    // Notify buyer
    const { rows: demand } = await query(`SELECT buyer_id, crop_name FROM demand_posts WHERE id=$1`, [b.demand_id]);
    if (demand[0]) {
      await query(
        `INSERT INTO notifications (user_id, title, body, type, meta)
         VALUES ($1, 'Match Found! 🎉', $2, 'match_proposed', $3)`,
        [demand[0].buyer_id,
         `A supply match has been found for your ${demand[0].crop_name} demand`,
         JSON.stringify({ match_id: rows[0].id })]
      );
    }

    return reply.code(201).send(rows[0]);
  });

  // PATCH /api/admin/matches/:id
  app.patch('/matches/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const b = req.body as any;
    const { rows } = await query(
      `UPDATE matches SET status=$2, agreed_price=$3, notes=$4 WHERE id=$1 RETURNING *`,
      [(req.params as any).id, b.status, b.agreed_price, b.notes]
    );
    return rows[0];
  });

  // GET /api/admin/lots
  app.get('/lots', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { rows } = await query(
      `SELECT sl.*,
        (SELECT COUNT(*) FROM supply_items si WHERE si.lot_id = sl.id) AS item_count
       FROM supply_lots sl ORDER BY sl.created_at DESC`
    );
    return rows;
  });

  // GET /api/admin/demands
  app.get('/demands', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { rows } = await query(
      `SELECT dp.*, u.full_name AS buyer_name, u.email AS buyer_email,
        (SELECT COUNT(*) FROM matches m WHERE m.demand_id = dp.id) AS match_count
       FROM demand_posts dp JOIN users u ON u.id = dp.buyer_id
       WHERE dp.is_active = true ORDER BY dp.created_at DESC`
    );
    return rows;
  });
}
