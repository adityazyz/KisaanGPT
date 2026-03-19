import { FastifyInstance } from 'fastify';
import { query } from '../db';
import { requireAuth } from '../middleware/auth';

export async function matchingRoutes(app: FastifyInstance) {
  app.get('/', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { rows } = await query(
      `SELECT m.*, dp.crop_name, dp.quantity_kg, sl.location, sl.total_qty_kg
       FROM matches m
       JOIN demand_posts dp ON dp.id = m.demand_id
       JOIN supply_lots sl ON sl.id = m.lot_id
       ORDER BY m.created_at DESC LIMIT 50`
    );
    return rows;
  });
}
