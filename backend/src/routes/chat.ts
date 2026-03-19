import { FastifyInstance } from 'fastify';
import Groq from 'groq-sdk';
import { query } from '../db';
import { requireAuth } from '../middleware/auth';
import { generateAICropPlan } from '../services/groqPlanning';
import { scheduleCallsForPlan } from '../services/callScheduler';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── Tool definitions ──────────────────────────────────────────────────────────
const TOOLS: Groq.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_farmer_context',
      description: 'Get the farmer\'s full profile: name, farms, active crop plans, production records, supply status. Call this FIRST at the start of every conversation.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_farm',
      description: 'Add a new farm for the farmer.',
      parameters: {
        type: 'object',
        properties: {
          name:       { type: 'string',  description: 'Farm name' },
          location:   { type: 'string',  description: 'Village/town name' },
          state:      { type: 'string',  description: 'Indian state name' },
          district:   { type: 'string',  description: 'District name' },
          area_acres: { type: 'number',  description: 'Farm area in acres' },
          soil_type:  { type: 'string',  description: 'Soil type: Loamy, Clay, Sandy-Loam, Clay-Loam, Black-Cotton, Red, Sandy' },
          irrigation: { type: 'string',  description: 'Irrigation type: Rainfed, Canal, Borewell, Drip, Sprinkler' },
          phone:      { type: 'string',  description: '10-digit mobile number (optional)' },
        },
        required: ['name', 'location', 'state', 'district', 'area_acres'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_crop_plan',
      description: 'Generate an AI crop plan for a farm. Uses weather, soil, and market data automatically.',
      parameters: {
        type: 'object',
        properties: {
          farm_id: { type: 'string', description: 'The farm ID to create a plan for' },
        },
        required: ['farm_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'log_production',
      description: 'Log a harvest/production record for a farm.',
      parameters: {
        type: 'object',
        properties: {
          farm_id:         { type: 'string', description: 'Farm ID' },
          crop_name:       { type: 'string', description: 'Crop name' },
          actual_yield_kg: { type: 'number', description: 'Actual yield in kg' },
          harvest_date:    { type: 'string', description: 'Harvest date YYYY-MM-DD' },
          quality_grade:   { type: 'string', description: 'A, B, C, or ungraded' },
          notes:           { type: 'string', description: 'Optional notes' },
        },
        required: ['farm_id', 'crop_name', 'actual_yield_kg'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'submit_to_supply',
      description: 'Submit a production record to supply aggregation for selling.',
      parameters: {
        type: 'object',
        properties: {
          production_id: { type: 'string', description: 'Production record ID to submit' },
        },
        required: ['production_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_market_supply',
      description: 'Check available supply lots in the market for a crop.',
      parameters: {
        type: 'object',
        properties: {
          crop:  { type: 'string', description: 'Crop name to search (optional)' },
          state: { type: 'string', description: 'State to filter by (optional)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get current weather and forecast for a farm location.',
      parameters: {
        type: 'object',
        properties: {
          farm_id: { type: 'string', description: 'Farm ID to get weather for' },
        },
        required: ['farm_id'],
      },
    },
  },
];

// ── Tool executor ─────────────────────────────────────────────────────────────
async function executeTool(
  name:     string,
  args:     any,
  farmerId: string,
  userId:   string
): Promise<any> {

  switch (name) {

    case 'get_farmer_context': {
      const [userRes, farmsRes, plansRes, productionRes, supplyRes] = await Promise.all([
        query(`SELECT full_name, email, phone, created_at FROM users WHERE id=$1`, [userId]),
        query(`SELECT f.*, (SELECT COUNT(*) FROM crop_plans cp WHERE cp.farm_id=f.id) AS plan_count FROM farms f WHERE f.farmer_id=$1 ORDER BY f.created_at DESC`, [userId]),
        query(`SELECT cp.*, f.name AS farm_name FROM crop_plans cp JOIN farms f ON f.id=cp.farm_id WHERE cp.farmer_id=$1 AND cp.status='active' ORDER BY cp.created_at DESC LIMIT 5`, [userId]),
        query(`SELECT pr.*, f.name AS farm_name FROM production_records pr JOIN farms f ON f.id=pr.farm_id WHERE pr.farmer_id=$1 ORDER BY pr.created_at DESC LIMIT 5`, [userId]),
        query(`SELECT COUNT(*) AS count FROM supply_items WHERE farmer_id=$1 AND status='pending'`, [userId]),
      ]);
      return {
        farmer:          userRes.rows[0],
        farms:           farmsRes.rows,
        active_plans:    plansRes.rows,
        recent_production: productionRes.rows,
        pending_supply:  parseInt(supplyRes.rows[0]?.count || '0'),
      };
    }

    case 'add_farm': {
      const { rows } = await query(
        `INSERT INTO farms (farmer_id,name,location,state,district,area_acres,soil_type,irrigation,phone)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [userId, args.name, args.location, args.state, args.district,
         args.area_acres, args.soil_type || null, args.irrigation || null, args.phone || null]
      );
      return { success: true, farm: rows[0] };
    }

    case 'create_crop_plan': {
      // Verify farm belongs to farmer
      const { rows: farmCheck } = await query(
        `SELECT f.id, f.phone, u.phone AS user_phone FROM farms f JOIN users u ON u.id=f.farmer_id WHERE f.id=$1 AND f.farmer_id=$2`,
        [args.farm_id, userId]
      );
      if (!farmCheck[0]) return { success: false, error: 'Farm not found' };

      const phone = farmCheck[0].phone || farmCheck[0].user_phone || null;
      const plan  = await generateAICropPlan(args.farm_id);

      const { rows } = await query(
        `INSERT INTO crop_plans (farm_id,farmer_id,crop_name,variety,season,year,status,
          sowing_date,harvest_date,area_acres,expected_yield_kg,notes,timeline,ai_suggestions,weather_alerts)
         VALUES ($1,$2,$3,$4,$5,$6,'active',$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [args.farm_id, userId, plan.crop_name, plan.variety, plan.season, plan.year,
         plan.sowing_date, plan.harvest_date, plan.area_acres, plan.expected_yield_kg,
         plan.rationale, JSON.stringify(plan.timeline),
         JSON.stringify({ rationale: plan.rationale, market_demand: plan.market_demand, risks: plan.risks, input_recommendations: plan.input_recommendations }),
         JSON.stringify(plan.weather_alerts || [])]
      );

      scheduleCallsForPlan(rows[0].id, userId, plan.crop_name, phone, plan.timeline).catch(console.error);

      return { success: true, plan: rows[0], ai_summary: { crop: plan.crop_name, sowing: plan.sowing_date, harvest: plan.harvest_date, expected_yield_kg: plan.expected_yield_kg, rationale: plan.rationale } };
    }

    case 'log_production': {
      const { rows } = await query(
        `INSERT INTO production_records (farm_id,farmer_id,crop_name,actual_yield_kg,harvest_date,quality_grade,notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [args.farm_id, userId, args.crop_name, args.actual_yield_kg,
         args.harvest_date || null, args.quality_grade || 'ungraded', args.notes || null]
      );
      return { success: true, record: rows[0] };
    }

    case 'submit_to_supply': {
      const { rows: prod } = await query(
        `SELECT * FROM production_records WHERE id=$1 AND farmer_id=$2`,
        [args.production_id, userId]
      );
      if (!prod[0]) return { success: false, error: 'Production record not found' };
      const { rows } = await query(
        `INSERT INTO supply_items (production_id,farmer_id,crop_name,qty_kg,quality_grade)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [prod[0].id, userId, prod[0].crop_name, prod[0].actual_yield_kg, prod[0].quality_grade]
      );
      return { success: true, supply_item: rows[0] };
    }

    case 'get_market_supply': {
      const { rows } = await query(
        `SELECT * FROM supply_lots WHERE ($1::text IS NULL OR crop_name ILIKE $1) AND ($2::text IS NULL OR state=$2) AND status='open' AND available_qty>0 ORDER BY available_qty DESC LIMIT 10`,
        [args.crop ? `%${args.crop}%` : null, args.state || null]
      );
      return { lots: rows };
    }

    case 'get_weather': {
      const { rows } = await query(
        `SELECT latitude, longitude, name, state FROM farms WHERE id=$1 AND farmer_id=$2`,
        [args.farm_id, userId]
      );
      if (!rows[0] || !rows[0].latitude) return { error: 'No coordinates for this farm' };
      const { getWeatherByCoords } = await import('../services/weather');
      const weather = await getWeatherByCoords(rows[0].latitude, rows[0].longitude);
      return { farm: rows[0].name, state: rows[0].state, weather };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(lang: 'en' | 'hi'): string {
  if (lang === 'hi') {
    return `आप AgriConnect के AI सहायक हैं — एक भारतीय किसान सहायक।

CRITICAL LANGUAGE RULE: आपको हमेशा, बिना किसी अपवाद के, केवल हिंदी में जवाब देना है। चाहे किसान हिंदी में बोले, अंग्रेजी में बोले, या मिश्रित भाषा में — आपका जवाब हमेशा हिंदी में होगा। कभी भी English में जवाब न दें।

आप किसान के खेत, फसल योजनाएं, उत्पादन रिकॉर्ड देख सकते हैं और नए काम कर सकते हैं।
हर बातचीत की शुरुआत में get_farmer_context टूल को कॉल करें।
जब किसान कुछ करने के लिए कहे — खेत जोड़ना, फसल योजना बनाना, रिकॉर्ड लॉग करना — तो सीधे tool call करें।
छोटे, बोलचाल के जवाब दें। कोई markdown या bullet points नहीं। सीधे वाक्यों में बोलें।
Tool call के बाद हिंदी में बताएं कि क्या किया।`;
  }
  return `You are AgriConnect's AI assistant — a smart farming advisor for Indian farmers.

CRITICAL LANGUAGE RULE: Always respond in English only. No matter what language the user speaks in, always reply in English.

You have access to the farmer's account: farms, crop plans, production records, supply status.
ALWAYS call get_farmer_context first at the start of the conversation.
When the farmer asks you to DO something (add farm, create plan, log harvest) — call the appropriate tool directly.
Keep responses SHORT and conversational — this is a voice chat. No markdown, no bullet points. Just natural sentences.
After calling a tool, briefly summarise what you did in one sentence.`;
}

// ── Route ─────────────────────────────────────────────────────────────────────
export async function chatRoutes(app: FastifyInstance) {

  app.post('/message', async (req, reply) => {
    if (!requireAuth(req, reply)) return;

    const { messages, lang = 'en' } = req.body as {
      messages: Groq.Chat.ChatCompletionMessageParam[];
      lang:     'en' | 'hi';
    };

    const userId = req.auth!.userId;

    // Build conversation with system prompt + hard language enforcer
    const langEnforcer = lang === 'hi'
      ? 'REMINDER: तुम्हें केवल हिंदी में जवाब देना है। अंग्रेजी में एक भी शब्द नहीं।'
      : 'REMINDER: Respond only in English.';

    const conversation: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: buildSystemPrompt(lang) },
      ...messages,
      { role: 'system', content: langEnforcer },
    ];

    // Agentic loop — keep calling until no more tool calls
    let iterations = 0;
    const MAX_ITERATIONS = 6;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await groq.chat.completions.create({
        model:       'llama-3.3-70b-versatile',
        messages:    conversation,
        tools:       TOOLS,
        tool_choice: 'auto',
        temperature: 0.4,
        max_tokens:  1024,
      });

      const msg = response.choices[0].message;
      conversation.push(msg as any);

      // No tool calls — final text response
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        return { reply: msg.content, conversation: conversation.slice(1) }; // strip system
      }

      // Execute all tool calls in parallel
      const toolResults = await Promise.all(
        msg.tool_calls.map(async (tc) => {
          const args   = JSON.parse(tc.function.arguments);
          const result = await executeTool(tc.function.name, args, userId, userId);
          return {
            role:         'tool' as const,
            tool_call_id: tc.id,
            content:      JSON.stringify(result),
          };
        })
      );

      conversation.push(...toolResults);
      // Re-inject language reminder after each tool result so final answer stays in correct language
      conversation.push({
        role: 'system',
        content: lang === 'hi'
          ? 'अब हिंदी में जवाब दो। अंग्रेजी बिल्कुल नहीं।'
          : 'Now respond in English only.',
      });
    }

    return { reply: lang === 'hi' ? 'माफ़ करें, कुछ तकनीकी समस्या हुई। फिर से कोशिश करें।' : 'Sorry, something went wrong. Please try again.', conversation: conversation.slice(1) };
  });

  // ── POST /api/chat/voice ─────────────────────────────────────────────────
  // Full pipeline: audio → Whisper (language-locked) → LLM → reply
  // Returns: { transcript, reply, conversation }
  app.post('/voice', async (req, reply) => {
    if (!requireAuth(req, reply)) return;

    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No audio file' });

    const lang        = ((data.fields as any)?.lang?.value || 'en') as 'en' | 'hi';
    const convRaw     = (data.fields as any)?.conversation?.value || '[]';
    const userId      = req.auth!.userId;

    // Parse existing conversation
    let prevConv: Groq.Chat.ChatCompletionMessageParam[] = [];
    try { prevConv = JSON.parse(convRaw); } catch {}

    // Read audio bytes
    const chunks: Buffer[] = [];
    for await (const chunk of data.file) chunks.push(chunk);
    const audioBuffer = Buffer.concat(chunks);

    if (audioBuffer.length < 500) {
      return reply.code(400).send({ error: 'Audio too short' });
    }

    // ── Step 1: Whisper transcription with language locked ──────────────────
    let transcript = '';
    try {
      const whisperForm = new FormData();
      const audioBlob   = new Blob([audioBuffer], { type: data.mimetype || 'audio/webm' });
      whisperForm.append('file', audioBlob, 'audio.webm');
      whisperForm.append('model', 'whisper-large-v3-turbo');
      whisperForm.append('response_format', 'json');
      // Lock language — this is the key fix. Without this Whisper guesses wrong.
      whisperForm.append('language', lang === 'hi' ? 'hi' : 'en');

      const whisperRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method:  'POST',
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body:    whisperForm,
      });

      if (!whisperRes.ok) {
        const e = await whisperRes.json() as { error?: { message?: string } };
        throw new Error(e.error?.message || 'Whisper failed');
      }

      const whisperResult = await whisperRes.json() as { text?: string };
      transcript = (whisperResult.text || '').trim();
    } catch (err: any) {
      console.error('[voice/whisper]', err.message);
      return reply.code(502).send({ error: 'Could not transcribe audio: ' + err.message });
    }

    if (!transcript) {
      return reply.code(400).send({ error: 'No speech detected' });
    }

    // ── Step 2: Run through LLM with language locked ────────────────────────
    const langEnforcer = lang === 'hi'
      ? 'REMINDER: तुम्हें केवल हिंदी में जवाब देना है। अंग्रेजी में एक भी शब्द नहीं।'
      : 'REMINDER: Respond only in English.';

    const conversation: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: buildSystemPrompt(lang) },
      ...prevConv,
      { role: 'user', content: transcript },
      { role: 'system', content: langEnforcer },
    ];

    let llmReply = '';
    let iterations = 0;
    const MAX_ITERATIONS = 6;

    while (iterations < MAX_ITERATIONS) {
      iterations++;
      const response = await groq.chat.completions.create({
        model:       'llama-3.3-70b-versatile',
        messages:    conversation,
        tools:       TOOLS,
        tool_choice: 'auto',
        temperature: 0.4,
        max_tokens:  512,
      });

      const msg = response.choices[0].message;
      conversation.push(msg as any);

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        llmReply = msg.content || '';
        break;
      }

      const toolResults = await Promise.all(
        msg.tool_calls.map(async (tc) => {
          const args   = JSON.parse(tc.function.arguments);
          const result = await executeTool(tc.function.name, args, userId, userId);
          return {
            role:         'tool' as const,
            tool_call_id: tc.id,
            content:      JSON.stringify(result),
          };
        })
      );
      conversation.push(...toolResults);
      conversation.push({
        role: 'system',
        content: lang === 'hi'
          ? 'अब हिंदी में जवाब दो। अंग्रेजी बिल्कुल नहीं।'
          : 'Now respond in English only.',
      });
    }

    // Return transcript so frontend can show what was heard, plus the reply
    return {
      transcript,
      reply:        llmReply,
      conversation: conversation.slice(1), // strip system prompt
    };
  });

  // ── POST /api/chat/transcribe (kept for compatibility) ────────────────────
  app.post('/transcribe', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No audio file' });
    const lang = ((data.fields as any)?.lang?.value || 'en') as 'en' | 'hi';
    const chunks: Buffer[] = [];
    for await (const chunk of data.file) chunks.push(chunk);
    const audioBuffer = Buffer.concat(chunks);
    if (audioBuffer.length < 500) return reply.code(400).send({ error: 'Too short' });
    try {
      const form = new FormData();
      form.append('file', new Blob([audioBuffer], { type: data.mimetype || 'audio/webm' }), 'audio.webm');
      form.append('model', 'whisper-large-v3-turbo');
      form.append('response_format', 'json');
      form.append('language', lang === 'hi' ? 'hi' : 'en');
      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, body: form,
      });
      if (!res.ok) { const e = await res.json() as { error?: { message?: string } }; throw new Error(e.error?.message); }
      const r = await res.json() as { text?: string };
      return { text: r.text || '' };
    } catch (err: any) {
      return reply.code(502).send({ error: err.message || 'Transcription failed' });
    }
  });

}