import { FastifyInstance } from 'fastify';
import { query } from '../db';
import { requireFarmer, requireAdmin, requireAuth } from '../middleware/auth';
import { triggerCall } from '../services/retellCalls';
import { getCallsForPlan, markCallDispatched } from '../services/callScheduler';

export async function callRoutes(app: FastifyInstance) {

  // ── GET /api/calls/plan/:planId ───────────────────────────────────────────
  // List all scheduled calls for a crop plan (farmer or admin)
  app.get('/plan/:planId', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { planId } = req.params as any;
    const calls = await getCallsForPlan(planId);
    return calls;
  });

  // ── POST /api/calls/trigger ───────────────────────────────────────────────
  // Trigger an on-demand call for a specific scheduled_call row
  app.post('/trigger', async (req, reply) => {
    if (!requireAuth(req, reply)) return;

    const { scheduled_call_id } = req.body as { scheduled_call_id: string };
    if (!scheduled_call_id) return reply.code(400).send({ error: 'scheduled_call_id required' });

    // Fetch the scheduled call
    const { rows } = await query(
      `SELECT sc.*, u.full_name AS farmer_name, f.phone AS farm_phone, u.phone AS user_phone
       FROM scheduled_calls sc
       JOIN users u ON u.id = sc.farmer_id
       LEFT JOIN farms f ON f.farmer_id = sc.farmer_id
       WHERE sc.id = $1
       LIMIT 1`,
      [scheduled_call_id]
    );

    if (!rows[0]) return reply.code(404).send({ error: 'Scheduled call not found' });
    const sc = rows[0];

    // Use the phone stored on the scheduled call
    const phone = sc.phone;
    if (!phone) return reply.code(400).send({ error: 'No phone number on file for this call' });

    try {
      const retellCallId = await triggerCall({
        farmerName:   sc.farmer_name,
        cropName:     sc.crop_name,
        stageLabel:   sc.stage_label,
        stagePurpose: sc.purpose,
        stageDate:    sc.stage_date,
        toPhone:      phone,
      });

      await markCallDispatched(sc.id, retellCallId);

      return {
        ok:            true,
        retell_call_id: retellCallId,
        message:       `Call initiated to ${phone}`,
      };
    } catch (err: any) {
      const msg = err?.response?.data?.message || err.message || 'Call failed';
      return reply.code(502).send({ error: `Retell API error: ${msg}` });
    }
  });

  // ── POST /api/calls/trigger-stage ────────────────────────────────────────
  // Trigger call directly by crop_plan_id + timeline_index (used by frontend dropdown)
  app.post('/trigger-stage', async (req, reply) => {
    if (!requireAuth(req, reply)) return;

    const { crop_plan_id, timeline_index } = req.body as {
      crop_plan_id:   string;
      timeline_index: number;
    };

    const { rows } = await query(
      `SELECT sc.*, u.full_name AS farmer_name
       FROM scheduled_calls sc
       JOIN users u ON u.id = sc.farmer_id
       WHERE sc.crop_plan_id = $1 AND sc.timeline_index = $2
       LIMIT 1`,
      [crop_plan_id, timeline_index]
    );

    if (!rows[0]) return reply.code(404).send({ error: 'No call scheduled for this stage' });
    const sc = rows[0];

    try {
      const retellCallId = await triggerCall({
        farmerName:   sc.farmer_name,
        cropName:     sc.crop_name,
        stageLabel:   sc.stage_label,
        stagePurpose: sc.purpose,
        stageDate:    sc.stage_date,
        toPhone:      sc.phone,
      });

      await markCallDispatched(sc.id, retellCallId);

      return { ok: true, retell_call_id: retellCallId, stage: sc.stage_label };
    } catch (err: any) {
      const msg = err?.response?.data?.message || err.message || 'Call failed';
      return reply.code(502).send({ error: `Retell API error: ${msg}` });
    }
  });

  // ── POST /api/calls/webhook/retell ───────────────────────────────────────
  // Retell calls this after each call ends with a transcript + outcome
  app.post('/webhook/retell', async (req, reply) => {
    const event = req.body as any;

    if (event.event === 'call_ended' && event.data?.call_id) {
      await query(
        `UPDATE scheduled_calls
         SET status = 'called', updated_at = NOW()
         WHERE retell_call_id = $1 AND status != 'called'`,
        [event.data.call_id]
      );
    }

    return { received: true };
  });

  // ── GET /api/calls/admin/upcoming ────────────────────────────────────────
  // Admin: list all upcoming calls across the platform
  app.get('/admin/upcoming', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { rows } = await query(
      `SELECT sc.*, u.full_name AS farmer_name, u.email AS farmer_email
       FROM scheduled_calls sc
       JOIN users u ON u.id = sc.farmer_id
       WHERE sc.status = 'scheduled'
         AND sc.stage_date >= CURRENT_DATE
       ORDER BY sc.stage_date ASC
       LIMIT 100`
    );
    return rows;
  });
}