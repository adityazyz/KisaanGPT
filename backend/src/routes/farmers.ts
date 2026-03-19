import { FastifyInstance } from 'fastify';
import { query } from '../db';
import { requireFarmer, requireAuth } from '../middleware/auth';
import { getCropSuggestions } from '../services/cropPlanning';

export async function farmerRoutes(app: FastifyInstance) {

  app.get('/me', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { rows } = await query(
      `SELECT u.*,
        (SELECT COUNT(*) FROM farms WHERE farmer_id = u.id) AS farm_count,
        (SELECT COUNT(*) FROM crop_plans WHERE farmer_id = u.id AND status = 'active') AS active_plans
       FROM users u WHERE u.id = $1`,
      [req.auth!.userId]
    );
    return rows[0] || reply.code(404).send({ error: 'Not found' });
  });

  app.get('/farms', async (req, reply) => {
    if (!requireFarmer(req, reply)) return;
    const { rows } = await query(
      `SELECT f.*,
        (SELECT COUNT(*) FROM crop_plans cp WHERE cp.farm_id = f.id) AS plan_count
       FROM farms f WHERE f.farmer_id = $1 ORDER BY f.created_at DESC`,
      [req.auth!.userId]
    );
    return rows;
  });

  // POST — now includes phone
  app.post('/farms', async (req, reply) => {
    if (!requireFarmer(req, reply)) return;
    const b = req.body as any;
    const { rows } = await query(
      `INSERT INTO farms
         (farmer_id, name, location, state, district, area_acres,
          soil_type, irrigation, latitude, longitude, phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        req.auth!.userId, b.name, b.location, b.state, b.district,
        b.area_acres, b.soil_type, b.irrigation,
        b.latitude, b.longitude,
        b.phone || null,
      ]
    );
    return reply.code(201).send(rows[0]);
  });

  // PUT — includes phone
  app.put('/farms/:id', async (req, reply) => {
    if (!requireFarmer(req, reply)) return;
    const b = req.body as any;
    const { id } = req.params as any;
    const { rows } = await query(
      `UPDATE farms
       SET name=$2, location=$3, state=$4, district=$5, area_acres=$6,
           soil_type=$7, irrigation=$8, phone=$9
       WHERE id=$1 AND farmer_id=$10
       RETURNING *`,
      [id, b.name, b.location, b.state, b.district, b.area_acres,
       b.soil_type, b.irrigation, b.phone || null, req.auth!.userId]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Farm not found' });
    return rows[0];
  });

  app.get('/suggestions', async (req, reply) => {
    if (!requireFarmer(req, reply)) return;
    const { farmId } = req.query as any;
    const { rows } = await query(
      `SELECT soil_type, state FROM farms WHERE id=$1 AND farmer_id=$2`,
      [farmId, req.auth!.userId]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Farm not found' });
    return getCropSuggestions(rows[0].soil_type, rows[0].state);
  });

  app.get('/dashboard', async (req, reply) => {
    if (!requireFarmer(req, reply)) return;
    const uid = req.auth!.userId;
    const [farms, plans, production, supply] = await Promise.all([
      query(`SELECT COUNT(*) AS count FROM farms WHERE farmer_id=$1`, [uid]),
      query(`SELECT COUNT(*) AS count FROM crop_plans WHERE farmer_id=$1 AND status='active'`, [uid]),
      query(`SELECT COALESCE(SUM(actual_yield_kg),0) AS total FROM production_records WHERE farmer_id=$1`, [uid]),
      query(`SELECT COUNT(*) AS count FROM supply_items WHERE farmer_id=$1 AND status='pending'`, [uid]),
    ]);
    return {
      farmCount:     parseInt(farms.rows[0].count),
      activePlans:   parseInt(plans.rows[0].count),
      totalYieldKg:  parseFloat(production.rows[0].total),
      pendingSupply: parseInt(supply.rows[0].count),
    };
  });

  app.get('/notifications', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { rows } = await query(
      `SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [req.auth!.userId]
    );
    return rows;
  });

  app.patch('/notifications/:id/read', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    await query(
      `UPDATE notifications SET is_read=true WHERE id=$1 AND user_id=$2`,
      [(req.params as any).id, req.auth!.userId]
    );
    return { ok: true };
  });
}