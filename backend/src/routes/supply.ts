import { FastifyInstance } from 'fastify';
import { query } from '../db';
import { requireFarmer, requireAdmin, requireAuth } from '../middleware/auth';
import { aggregateSupply } from '../services/matching';

export async function supplyRoutes(app: FastifyInstance) {
  // Public: list available lots (for buyers)
  app.get('/lots', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const q = req.query as any;
    const { rows } = await query(
      `SELECT * FROM supply_lots
       WHERE ($1::text IS NULL OR crop_name ILIKE $1)
         AND ($2::text IS NULL OR state = $2)
         AND status = 'open'
         AND available_qty > 0
       ORDER BY available_qty DESC`,
      [q.crop || null, q.state || null]
    );
    return rows;
  });

  // Farmer: my supply items
  app.get('/my-items', async (req, reply) => {
    if (!requireFarmer(req, reply)) return;
    const { rows } = await query(
      `SELECT si.*, sl.location AS lot_location FROM supply_items si
       LEFT JOIN supply_lots sl ON sl.id = si.lot_id
       WHERE si.farmer_id = $1 ORDER BY si.created_at DESC`,
      [req.auth!.userId]
    );
    return rows;
  });

  // Admin: get all pending supply items
  app.get('/pending', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { rows } = await query(
      `SELECT si.*, u.full_name AS farmer_name, u.phone AS farmer_phone,
              f.location AS farm_location
       FROM supply_items si
       JOIN users u ON u.id = si.farmer_id
       JOIN farms f ON f.farmer_id = si.farmer_id
       WHERE si.status = 'pending'
       ORDER BY si.created_at ASC`
    );
    return rows;
  });

  // Admin: verify a supply item
  app.patch('/:id/verify', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const b = req.body as any;
    const { rows } = await query(
      `UPDATE supply_items
       SET status='verified', quality_grade=COALESCE($2, quality_grade),
           verified_at=NOW(), verified_by=$3
       WHERE id=$1 RETURNING *`,
      [(req.params as any).id, b.quality_grade, req.auth!.userId]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Not found' });
    return rows[0];
  });

  // Admin: run aggregation
  app.post('/aggregate', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const result = await aggregateSupply();
    return result;
  });
}
