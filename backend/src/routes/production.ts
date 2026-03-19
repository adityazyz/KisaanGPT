import { FastifyInstance } from 'fastify';
import { query } from '../db';
import { requireFarmer } from '../middleware/auth';

export async function productionRoutes(app: FastifyInstance) {

  app.get('/', async (req, reply) => {
    if (!requireFarmer(req, reply)) return;
    const { rows } = await query(
      `SELECT pr.*, f.name AS farm_name FROM production_records pr
       JOIN farms f ON f.id = pr.farm_id
       WHERE pr.farmer_id = $1 ORDER BY pr.harvest_date DESC`,
      [req.auth!.userId]
    );
    return rows;
  });

  app.get('/:id', async (req, reply) => {
    if (!requireFarmer(req, reply)) return;
    const { rows } = await query(
      `SELECT pr.*, f.name AS farm_name FROM production_records pr
       JOIN farms f ON f.id = pr.farm_id
       WHERE pr.id = $1 AND pr.farmer_id = $2`,
      [(req.params as any).id, req.auth!.userId]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Not found' });
    return rows[0];
  });

  app.post('/', async (req, reply) => {
    if (!requireFarmer(req, reply)) return;
    const b = req.body as any;

    // Coerce empty strings to null for UUID and numeric fields
    const cropPlanId     = b.crop_plan_id     || null;
    const farmId         = b.farm_id          || null;
    const systemEstimate = b.system_estimate  ? parseFloat(b.system_estimate) : null;
    const harvestDate    = b.harvest_date     || null;

    if (!farmId) return reply.code(400).send({ error: 'farm_id is required' });

    const { rows } = await query(
      `INSERT INTO production_records
         (crop_plan_id, farm_id, farmer_id, crop_name, actual_yield_kg,
          system_estimate, harvest_date, quality_grade, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        cropPlanId,
        farmId,
        req.auth!.userId,
        b.crop_name,
        parseFloat(b.actual_yield_kg),
        systemEstimate,
        harvestDate,
        b.quality_grade || 'ungraded',
        b.notes || null,
      ]
    );
    return reply.code(201).send(rows[0]);
  });

  app.put('/:id', async (req, reply) => {
    if (!requireFarmer(req, reply)) return;
    const b = req.body as any;
    const { rows } = await query(
      `UPDATE production_records
       SET actual_yield_kg = $2,
           harvest_date    = $3,
           quality_grade   = $4,
           notes           = $5
       WHERE id = $1 AND farmer_id = $6
       RETURNING *`,
      [
        (req.params as any).id,
        parseFloat(b.actual_yield_kg),
        b.harvest_date || null,
        b.quality_grade || 'ungraded',
        b.notes || null,
        req.auth!.userId,
      ]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Not found' });
    return rows[0];
  });

  // POST /api/production/:id/submit-supply
  app.post('/:id/submit-supply', async (req, reply) => {
    if (!requireFarmer(req, reply)) return;
    const { rows: prod } = await query(
      `SELECT * FROM production_records WHERE id = $1 AND farmer_id = $2`,
      [(req.params as any).id, req.auth!.userId]
    );
    if (!prod[0]) return reply.code(404).send({ error: 'Not found' });
    const p = prod[0];

    const { rows } = await query(
      `INSERT INTO supply_items (production_id, farmer_id, crop_name, qty_kg, quality_grade)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [p.id, p.farmer_id, p.crop_name, p.actual_yield_kg, p.quality_grade]
    );
    return reply.code(201).send(rows[0]);
  });
}