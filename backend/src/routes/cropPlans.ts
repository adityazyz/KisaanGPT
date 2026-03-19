import { FastifyInstance } from 'fastify';
import { query } from '../db';
import { requireFarmer } from '../middleware/auth';
import { generateAICropPlan } from '../services/groqPlanning';
import { refreshWeatherAlerts } from '../services/cropPlanning';
import { scheduleCallsForPlan } from '../services/callScheduler';

export async function cropPlanRoutes(app: FastifyInstance) {

  // ── GET /api/crop-plans ──────────────────────────────────────────────────
  app.get('/', async (req, reply) => {
    if (!requireFarmer(req, reply)) return;
    const { rows } = await query(
      `SELECT cp.*, f.name AS farm_name, f.location
       FROM crop_plans cp JOIN farms f ON f.id = cp.farm_id
       WHERE cp.farmer_id = $1 ORDER BY cp.created_at DESC`,
      [req.auth!.userId]
    );
    return rows;
  });

  // ── GET /api/crop-plans/:id ──────────────────────────────────────────────
  app.get('/:id', async (req, reply) => {
    if (!requireFarmer(req, reply)) return;
    const { rows } = await query(
      `SELECT cp.*, f.name AS farm_name, f.location, f.soil_type, f.latitude, f.longitude
       FROM crop_plans cp JOIN farms f ON f.id = cp.farm_id
       WHERE cp.id = $1 AND cp.farmer_id = $2`,
      [(req.params as any).id, req.auth!.userId]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Plan not found' });
    return rows[0];
  });

  // ── POST /api/crop-plans/generate  (AI autonomous plan) ─────────────────
  app.post('/generate', async (req, reply) => {
    if (!requireFarmer(req, reply)) return;

    const { farm_id } = req.body as { farm_id: string };
    if (!farm_id) return reply.code(400).send({ error: 'farm_id required' });

    // Verify farm belongs to this farmer and fetch phone
    const { rows: farmRows } = await query(
      `SELECT f.id, f.phone, u.phone AS user_phone, u.full_name
       FROM farms f
       JOIN users u ON u.id = f.farmer_id
       WHERE f.id = $1 AND f.farmer_id = $2`,
      [farm_id, req.auth!.userId]
    );
    if (!farmRows[0]) return reply.code(403).send({ error: 'Farm not found or not yours' });

    // Phone priority: farm-level phone → user profile phone
    const phone: string | null = farmRows[0].phone || farmRows[0].user_phone || null;

    // Call Groq for the AI plan
    const plan = await generateAICropPlan(farm_id);

    // Persist crop plan to DB
    const { rows } = await query(
      `INSERT INTO crop_plans
         (farm_id, farmer_id, crop_name, variety, season, year, status,
          sowing_date, harvest_date, area_acres, expected_yield_kg,
          notes, timeline, ai_suggestions, weather_alerts)
       VALUES ($1,$2,$3,$4,$5,$6,'active',$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        farm_id,
        req.auth!.userId,
        plan.crop_name,
        plan.variety,
        plan.season,
        plan.year,
        plan.sowing_date,
        plan.harvest_date,
        plan.area_acres,
        plan.expected_yield_kg,
        plan.rationale,
        JSON.stringify(plan.timeline),
        JSON.stringify({
          rationale:             plan.rationale,
          market_demand:         plan.market_demand,
          risks:                 plan.risks,
          input_recommendations: plan.input_recommendations,
        }),
        JSON.stringify(plan.weather_alerts || []),
      ]
    );

    const savedPlan = rows[0];

    // Schedule one reminder call per timeline step (async, non-blocking)
    scheduleCallsForPlan(
      savedPlan.id,
      req.auth!.userId,
      plan.crop_name,
      phone,
      plan.timeline
    ).catch(err => console.error('[callScheduler] Failed to schedule calls:', err));

    // Refresh weather alerts in background
    refreshWeatherAlerts(savedPlan.id).catch(console.error);

    return reply.code(201).send({
      ...savedPlan,
      calls_scheduled: !!phone,
      phone_on_file:   !!phone,
    });
  });

  // ── POST /api/crop-plans  (manual fallback) ──────────────────────────────
  app.post('/', async (req, reply) => {
    if (!requireFarmer(req, reply)) return;
    const b = req.body as any;
    const { rows } = await query(
      `INSERT INTO crop_plans
         (farm_id, farmer_id, crop_name, variety, season, year, status,
          sowing_date, harvest_date, area_acres, expected_yield_kg, notes, timeline)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        b.farm_id, req.auth!.userId, b.crop_name, b.variety,
        b.season, b.year || new Date().getFullYear(),
        b.status || 'active', b.sowing_date, b.harvest_date,
        b.area_acres, b.expected_yield_kg, b.notes,
        JSON.stringify(b.timeline || []),
      ]
    );
    const plan = rows[0];
    refreshWeatherAlerts(plan.id).catch(console.error);
    return reply.code(201).send(plan);
  });

  // ── PUT /api/crop-plans/:id ──────────────────────────────────────────────
  app.put('/:id', async (req, reply) => {
    if (!requireFarmer(req, reply)) return;
    const b = req.body as any;
    const { rows } = await query(
      `UPDATE crop_plans
       SET crop_name=$2, variety=$3, season=$4, status=$5, sowing_date=$6,
           harvest_date=$7, area_acres=$8, expected_yield_kg=$9, notes=$10
       WHERE id=$1 AND farmer_id=$11 RETURNING *`,
      [
        (req.params as any).id, b.crop_name, b.variety, b.season, b.status,
        b.sowing_date, b.harvest_date, b.area_acres, b.expected_yield_kg,
        b.notes, req.auth!.userId,
      ]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Plan not found' });
    return rows[0];
  });

  // ── POST /api/crop-plans/:id/refresh-weather ─────────────────────────────
  app.post('/:id/refresh-weather', async (req, reply) => {
    if (!requireFarmer(req, reply)) return;
    await refreshWeatherAlerts((req.params as any).id);
    const { rows } = await query(
      'SELECT weather_alerts FROM crop_plans WHERE id=$1',
      [(req.params as any).id]
    );
    return { alerts: rows[0]?.weather_alerts || [] };
  });

  // ── DELETE /api/crop-plans/:id ────────────────────────────────────────────
  app.delete('/:id', async (req, reply) => {
    if (!requireFarmer(req, reply)) return;
    await query(
      `UPDATE crop_plans SET status='cancelled' WHERE id=$1 AND farmer_id=$2`,
      [(req.params as any).id, req.auth!.userId]
    );
    return { ok: true };
  });
}