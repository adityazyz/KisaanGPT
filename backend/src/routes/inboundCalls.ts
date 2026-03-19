import { FastifyInstance } from 'fastify';
import { query } from '../db';

export async function inboundCallRoutes(app: FastifyInstance) {

  /**
   * POST /api/inbound/retell-context
   *
   * Retell calls this endpoint at the START of every inbound call.
   * We receive the caller's phone number, look up the farmer,
   * fetch their active crop plans, and return dynamic variables
   * that the agent uses to personalise the conversation.
   *
   * Configure this URL in Retell Dashboard:
   *   Agent → Custom LLM → Dynamic Variables → Webhook URL
   *   → https://your-backend.com/api/inbound/retell-context
   */
  app.post('/retell-context', async (req, reply) => {
    const body = req.body as any;

    // Retell sends the caller's number in `from_number` (E.164 format, e.g. +919876543210)
    const fromNumber: string = body?.call?.from_number || body?.from_number || '';

    // Normalise to 10-digit Indian number for DB lookup
    const digits = fromNumber.replace(/\D/g, '');
    const phone10 = digits.length === 12 && digits.startsWith('91')
      ? digits.slice(2)
      : digits.length === 10 ? digits : null;

    if (!phone10) {
      // Unknown caller — agent gets generic context
      return buildContext({
        farmerName:   'किसान भाई',
        cropPlans:    [],
        hasPhone:     false,
        callerPhone:  fromNumber,
      });
    }

    // ── Look up farmer by phone ────────────────────────────────────────────
    const { rows: users } = await query(
      `SELECT u.id, u.full_name, u.phone AS user_phone
       FROM users u
       WHERE (u.phone = $1 OR u.phone = $2)
         AND u.role = 'farmer'
         AND u.is_active = true
       LIMIT 1`,
      [phone10, `+91${phone10}`]
    );

    // Also check farms table phone
    let farmerId: string | null = users[0]?.id || null;
    let farmerName: string      = users[0]?.full_name || 'किसान भाई';

    if (!farmerId) {
      const { rows: farmRows } = await query(
        `SELECT f.farmer_id, u.full_name
         FROM farms f
         JOIN users u ON u.id = f.farmer_id
         WHERE (f.phone = $1 OR f.phone = $2)
           AND u.is_active = true
         LIMIT 1`,
        [phone10, `+91${phone10}`]
      );
      if (farmRows[0]) {
        farmerId  = farmRows[0].farmer_id;
        farmerName = farmRows[0].full_name;
      }
    }

    if (!farmerId) {
      return buildContext({
        farmerName:  'किसान भाई',
        cropPlans:   [],
        hasPhone:    true,
        callerPhone: fromNumber,
        notRegistered: true,
      });
    }

    // ── Fetch active crop plans ────────────────────────────────────────────
    const { rows: plans } = await query(
      `SELECT
         cp.id, cp.crop_name, cp.variety, cp.season, cp.year,
         cp.sowing_date, cp.harvest_date, cp.area_acres,
         cp.expected_yield_kg, cp.notes, cp.weather_alerts,
         cp.timeline, cp.ai_suggestions,
         f.name AS farm_name, f.location, f.state, f.district,
         f.soil_type, f.irrigation, f.area_acres AS farm_area
       FROM crop_plans cp
       JOIN farms f ON f.id = cp.farm_id
       WHERE cp.farmer_id = $1
         AND cp.status = 'active'
       ORDER BY cp.created_at DESC
       LIMIT 3`,
      [farmerId]
    );

    return buildContext({
      farmerName,
      cropPlans: plans,
      hasPhone:  true,
      callerPhone: fromNumber,
    });
  });

  /**
   * POST /api/inbound/save-phone
   * Farmer saves their phone number for inbound agent recognition.
   * Called from the sidebar settings widget.
   */
  app.post('/save-phone', async (req, reply) => {
    // No auth middleware here — use Clerk token verification inline
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return reply.code(401).send({ error: 'Unauthorized' });

    const { phone } = req.body as { phone: string };
    if (!phone) return reply.code(400).send({ error: 'phone required' });

    // Normalise
    const digits = phone.replace(/\D/g, '');
    const phone10 = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
    if (phone10.length !== 10) return reply.code(400).send({ error: 'Invalid Indian phone number (10 digits)' });

    // We need auth — reuse the auth middleware result
    if (!req.auth) return reply.code(401).send({ error: 'Unauthorized' });

    // Save to users table
    await query(
      `UPDATE users SET phone = $1, updated_at = NOW() WHERE id = $2`,
      [phone10, req.auth.userId]
    );

    // Also update all farms belonging to this farmer that don't have a phone
    await query(
      `UPDATE farms SET phone = $1 WHERE farmer_id = $2 AND (phone IS NULL OR phone = '')`,
      [phone10, req.auth.userId]
    );

    return { ok: true, phone: phone10 };
  });

  /**
   * GET /api/inbound/my-phone
   * Returns the currently saved phone for the logged-in farmer.
   */
  app.get('/my-phone', async (req, reply) => {
    if (!req.auth) return reply.code(401).send({ error: 'Unauthorized' });

    const { rows } = await query(
      `SELECT phone FROM users WHERE id = $1`,
      [req.auth.userId]
    );
    return { phone: rows[0]?.phone || null };
  });
}

// ── Context builder ───────────────────────────────────────────────────────────

function buildContext(opts: {
  farmerName:    string;
  cropPlans:     any[];
  hasPhone:      boolean;
  callerPhone:   string;
  notRegistered?: boolean;
}) {
  const { farmerName, cropPlans, hasPhone, callerPhone, notRegistered } = opts;

  // Build a concise text summary of each active plan for the agent
  const planSummaries = cropPlans.map((p, i) => {
    const alerts  = Array.isArray(p.weather_alerts) ? p.weather_alerts : [];
    const ai      = typeof p.ai_suggestions === 'string' ? JSON.parse(p.ai_suggestions) : p.ai_suggestions;
    const timeline = typeof p.timeline === 'string' ? JSON.parse(p.timeline) : p.timeline;

    // Find the next upcoming timeline step
    const today = new Date();
    const upcoming = (timeline || []).find((t: any) => new Date(t.date) >= today);

    return `
फसल ${i + 1}: ${p.crop_name}${p.variety ? ` (${p.variety})` : ''}
खेत: ${p.farm_name}, ${p.location}, ${p.state}
क्षेत्र: ${p.area_acres} एकड़ | मौसम: ${p.season} ${p.year}
बुवाई: ${p.sowing_date || 'अज्ञात'} | कटाई: ${p.harvest_date || 'अज्ञात'}
अगला काम: ${upcoming ? `${upcoming.label} (${upcoming.date}) — ${upcoming.description}` : 'कटाई का समय नजदीक'}
${alerts.length ? `मौसम चेतावनी: ${alerts.join('; ')}` : ''}
${ai?.rationale ? `AI सुझाव: ${ai.rationale}` : ''}
    `.trim();
  }).join('\n\n---\n\n');

  const cropSummary = cropPlans.length > 0
    ? planSummaries
    : notRegistered
      ? 'यह किसान AgriConnect पर पंजीकृत नहीं है।'
      : 'इस किसान की अभी कोई सक्रिय फसल योजना नहीं है।';

  return {
    // Retell injects these as {{variable}} in the agent system prompt
    farmer_name:    farmerName,
    crop_summary:   cropSummary,
    plan_count:     String(cropPlans.length),
    is_registered:  String(hasPhone && !notRegistered),
    caller_phone:   callerPhone,
  };
}