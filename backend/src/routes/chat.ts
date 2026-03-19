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
          name:       { type: 'string', description: 'Farm name' },
          location:   { type: 'string', description: 'Village/town name' },
          state:      { type: 'string', description: 'Indian state name' },
          district:   { type: 'string', description: 'District name' },
          area_acres: { type: 'number', description: 'Farm area in acres' },
          soil_type:  { type: 'string', description: 'Soil type: Loamy, Clay, Sandy-Loam, Clay-Loam, Black-Cotton, Red, Sandy' },
          irrigation: { type: 'string', description: 'Irrigation type: Rainfed, Canal, Borewell, Drip, Sprinkler' },
          phone:      { type: 'string', description: '10-digit mobile number (optional)' },
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
          farm_id: { type: 'string', description: 'The farm UUID from get_farmer_context farms list. NEVER pass a farm name — always use the id field from the farms array.' },
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
          farm_id:         { type: 'string', description: 'Farm UUID from get_farmer_context. Never pass farm name — use the id field.' },
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
          farm_id: { type: 'string', description: 'Farm UUID from get_farmer_context. Never pass farm name.' },
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
        query(`SELECT f.id, f.name, f.location, f.state, f.district, f.area_acres, f.soil_type, f.irrigation,
               (SELECT COUNT(*) FROM crop_plans cp WHERE cp.farm_id=f.id) AS plan_count
               FROM farms f WHERE f.farmer_id=$1 ORDER BY f.created_at DESC`, [userId]),
        query(`SELECT cp.id, cp.crop_name, cp.season, cp.year, cp.status, cp.sowing_date, cp.harvest_date,
               cp.expected_yield_kg, cp.farm_id, f.name AS farm_name
               FROM crop_plans cp JOIN farms f ON f.id=cp.farm_id
               WHERE cp.farmer_id=$1 AND cp.status='active' ORDER BY cp.created_at DESC LIMIT 5`, [userId]),
        query(`SELECT pr.id, pr.crop_name, pr.actual_yield_kg, pr.harvest_date, pr.quality_grade,
               pr.farm_id, f.name AS farm_name
               FROM production_records pr JOIN farms f ON f.id=pr.farm_id
               WHERE pr.farmer_id=$1 ORDER BY pr.created_at DESC LIMIT 5`, [userId]),
        query(`SELECT COUNT(*) AS count FROM supply_items WHERE farmer_id=$1 AND status='pending'`, [userId]),
      ]);

      const farms = farmsRes.rows.map((f: any) => ({
        farm_id:    f.id,
        name:       f.name,
        location:   `${f.district}, ${f.state}`,
        area_acres: f.area_acres,
        soil_type:  f.soil_type,
        irrigation: f.irrigation,
        plan_count: f.plan_count,
      }));

      return {
        farmer:             userRes.rows[0],
        farms,
        active_plans:       plansRes.rows,
        recent_production:  productionRes.rows,
        pending_supply:     parseInt(supplyRes.rows[0]?.count || '0'),
        instruction:        'To create a crop plan or log production, use farm_id from the farms array above.',
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
      let resolvedFarmId: string = args.farm_id;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args.farm_id);
      if (!isUuid) {
        const { rows: nameMatch } = await query(
          `SELECT id FROM farms WHERE farmer_id=$1 AND name ILIKE $2 LIMIT 1`,
          [userId, `%${args.farm_id}%`]
        );
        if (!nameMatch[0]) return { success: false, error: `Farm "${args.farm_id}" not found. Please call get_farmer_context to get the correct farm ID.` };
        resolvedFarmId = nameMatch[0].id;
      }

      const { rows: farmCheck } = await query(
        `SELECT f.id, f.phone, u.phone AS user_phone FROM farms f JOIN users u ON u.id=f.farmer_id WHERE f.id=$1 AND f.farmer_id=$2`,
        [resolvedFarmId, userId]
      );
      if (!farmCheck[0]) return { success: false, error: 'Farm not found' };
      args.farm_id = resolvedFarmId;

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
      let farmId: string = args.farm_id;
      const isUuid2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args.farm_id);
      if (!isUuid2) {
        const { rows: nm } = await query(
          `SELECT id FROM farms WHERE farmer_id=$1 AND name ILIKE $2 LIMIT 1`,
          [userId, `%${args.farm_id}%`]
        );
        if (!nm[0]) return { success: false, error: `Farm "${args.farm_id}" not found. Use farm UUID from get_farmer_context.` };
        farmId = nm[0].id;
      }
      const { rows } = await query(
        `INSERT INTO production_records (farm_id,farmer_id,crop_name,actual_yield_kg,harvest_date,quality_grade,notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [farmId, userId, args.crop_name, args.actual_yield_kg,
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
  const langRule = lang === 'hi'
    ? `LANGUAGE: You must ALWAYS reply in Hindi (Devanagari script हिंदी) — every single message, no exceptions. Not Gujarati, not English. ONLY Hindi. Example: "आपके दो खेत हैं — Jack1 और Farm2।"`
    : `LANGUAGE: Always reply in English only.`;

  return `You are AgriConnect's AI assistant for Indian farmers.

${langRule}

TOOL WORKFLOW:
1. Always call get_farmer_context at the start of the conversation.
2. get_farmer_context returns: farms: [{ farm_id: "uuid", name: "Jack1", ... }]
3. When farmer asks to create a crop plan or log harvest for a farm:
   - Find the farm by name in the farms list you already loaded
   - Use its farm_id (UUID) when calling the tool
   - NEVER ask the farmer for an ID — you already have it
   - NEVER pass a farm name as farm_id

EXAMPLE:
Farmer: "Jack1 ke liye crop plan banao"
→ You see farms: [{ farm_id: "abc-123", name: "Jack1" }]
→ You call: create_crop_plan({ farm_id: "abc-123" })
→ You do NOT ask for ID. You do NOT say you need more info.`;
}

// Final answer prompt — same language rules, no tools
function buildFinalAnswerPrompt(lang: 'en' | 'hi'): string {
  if (lang === 'hi') {
    return `तुम AgriConnect के हिंदी सहायक हो।
नीचे दिए tool results के आधार पर किसान को 2-3 वाक्यों में बताओ।
सख्त नियम: केवल हिंदी (देवनागरी लिपि में) में लिखो। गुजराती, अंग्रेजी या कोई अन्य भाषा नहीं।
उदाहरण सही जवाब: "आपके Jack1 खेत के लिए गेहूं की फसल योजना बन गई है। बुवाई 25 मार्च को करें।"
कोई markdown, bullets या headings नहीं।`;
  }
  return `You are AgriConnect's English assistant.
Based on the tool results below, tell the farmer what happened in 2-3 short sentences.
English only. No markdown. No bullets.`;
}

// ── Force-translate reply to Hindi if lang=hi and reply is not Devanagari ────
async function ensureHindi(text: string, groqClient: Groq): Promise<string> {
  if (!text.trim()) return text;
  const hasDevanagari = /[ऀ-ॿ]/.test(text);
  if (hasDevanagari) return text;
  try {
    const res = await groqClient.chat.completions.create({
      model:       'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens:  600,
      messages: [
        {
          role:    'system',
          content: 'Translate the following text to Hindi (Devanagari script). Output ONLY the Hindi translation. No explanation. No English words.',
        },
        { role: 'user', content: text },
      ],
    });
    const translated = res.choices[0].message.content?.trim() || '';
    return /[ऀ-ॿ]/.test(translated) ? translated : text;
  } catch {
    return text;
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────────
export async function chatRoutes(app: FastifyInstance) {

  app.post('/message', async (req, reply) => {
    if (!requireAuth(req, reply)) return;

    const { messages, lang = 'en' } = req.body as {
      messages: Groq.Chat.ChatCompletionMessageParam[];
      lang:     'en' | 'hi';
    };

    const userId = req.auth!.userId;

    const conversation: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: buildSystemPrompt(lang) },
      ...messages,
    ];

    let toolsWereUsed = false;
    let iterations    = 0;
    const MAX_ITER    = 6;

    while (iterations < MAX_ITER) {
      iterations++;

      const response = await groq.chat.completions.create({
        model:       'llama-3.3-70b-versatile',
        messages:    conversation,
        tools:       TOOLS,
        tool_choice: 'auto',
        temperature: 0.3,
        max_tokens:  512,
      });

      const msg = response.choices[0].message;
      conversation.push(msg as any);

      if (!msg.tool_calls || msg.tool_calls.length === 0) break;

      toolsWereUsed = true;

      const toolResults = await Promise.all(
        msg.tool_calls.map(async (tc) => {
          let result: any;
          try {
            const args = JSON.parse(tc.function.arguments);
            result = await executeTool(tc.function.name, args, userId, userId);
          } catch (toolErr: any) {
            result = { success: false, error: toolErr.message || 'Tool failed' };
          }
          return { role: 'tool' as const, tool_call_id: tc.id, content: JSON.stringify(result) };
        })
      );
      conversation.push(...toolResults);
    }

    const effectiveLang = lang;
    const triggerMsg = effectiveLang === 'hi'
      ? 'ऊपर के results के बारे में हिंदी में बताओ।'
      : 'Summarise what was done.';

    const finalConversation: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: buildFinalAnswerPrompt(effectiveLang) },
      ...conversation.filter(m => m.role !== 'system'),
      { role: 'user', content: triggerMsg },
    ];

    const finalResponse = await groq.chat.completions.create({
      model:       'llama-3.3-70b-versatile',
      messages:    finalConversation,
      temperature: 0.3,
      max_tokens:  512,
    });

    let assistantReply = finalResponse.choices[0].message.content || '';

    const hasDevanagari = (t: string) => /[ऀ-ॿ]/.test(t);
    let resolvedReply = assistantReply;

    if (!resolvedReply.trim() || (effectiveLang === 'hi' && !hasDevanagari(resolvedReply))) {
      const fallback = await groq.chat.completions.create({
        model:    'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: buildFinalAnswerPrompt(effectiveLang) },
          ...conversation.filter(m => m.role !== 'system'),
          { role: 'user', content: effectiveLang === 'hi'
            ? 'इन tool results को देखकर केवल हिंदी में (देवनागरी लिपि में) 2-3 वाक्य बोलो।'
            : 'Summarise what happened in 2-3 English sentences.' },
        ],
        temperature: 0.3,
        max_tokens:  400,
      });
      resolvedReply = fallback.choices[0].message.content || (effectiveLang === 'hi' ? 'काम हो गया।' : 'Done.');
    }

    if (effectiveLang === 'hi') {
      resolvedReply = await ensureHindi(resolvedReply, groq);
    }

    return {
      reply: resolvedReply,
      conversation: conversation.filter(m => m.role !== 'system'),
    };
  });

  // ── POST /api/chat/voice ─────────────────────────────────────────────────
  app.post('/voice', async (req, reply) => {
    if (!requireAuth(req, reply)) return;

    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No audio file' });

    const getField = (name: string): string => {
      const f = (data.fields as any)?.[name];
      if (!f) return '';
      if (typeof f === 'string') return f;
      if (Array.isArray(f)) return (f[0]?.value ?? f[0]) || '';
      return f.value ?? '';
    };

    const frontendLang = (getField('lang') || 'en') as 'en' | 'hi';
    const convRaw = getField('conversation') || '[]';
    const userId  = req.auth!.userId;

    req.log.info({ frontendLang, convRawLen: convRaw.length }, '[voice] received – frontend requested this lang');

    let prevConv: Groq.Chat.ChatCompletionMessageParam[] = [];
    try { prevConv = JSON.parse(convRaw); } catch {}

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) chunks.push(chunk);
    const audioBuffer = Buffer.concat(chunks);

    if (audioBuffer.length < 500) {
      return reply.code(400).send({ error: 'Audio too short' });
    }

    // ── Step 1: Whisper transcription ────────────────────────────────────────
    let rawTranscript = '';
    try {
      const mime     = data.mimetype || 'audio/webm';
      const ext      = mime.includes('mp4') ? 'mp4'
                     : mime.includes('ogg') ? 'ogg'
                     : mime.includes('wav') ? 'wav'
                     : 'webm';
      const filename = `audio.${ext}`;

      const whisperForm = new FormData();
      const audioBlob   = new Blob([audioBuffer], { type: mime });
      whisperForm.append('file', audioBlob, filename);
      whisperForm.append('model', 'whisper-large-v3-turbo');
      whisperForm.append('response_format', 'verbose_json');

      whisperForm.append('language', frontendLang === 'hi' ? 'hi' : 'en');

      whisperForm.append(
        'prompt',
        frontendLang === 'hi'
          ? `यह पूरी तरह से हिंदी में है। केवल हिंदी शब्द लिखें। कोई अंग्रेजी शब्द नहीं। भारतीय किसान की फसल, खेती, मिट्टी, सिंचाई, फार्म की बातचीत।`
          : `This is completely in English only. Use only English words. No Hindi. Indian farmer talking about crops, farming, soil, irrigation.`
      );

      const whisperRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method:  'POST',
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body:    whisperForm,
      });

      if (!whisperRes.ok) {
        const e = await whisperRes.json() as { error?: { message?: string } };
        throw new Error(e.error?.message || 'Whisper failed');
      }

      const whisperResult = await whisperRes.json() as { text?: string; language?: string };
      rawTranscript = (whisperResult.text || '').trim();

      req.log.info({
        frontendLang,
        detectedByWhisper: whisperResult.language,
        rawTranscript: rawTranscript.slice(0, 120)
      }, '[voice] whisper raw result');
    } catch (err: any) {
      console.error('[voice/whisper]', err.message);
      return reply.code(502).send({ error: 'Could not transcribe audio: ' + err.message });
    }

    if (!rawTranscript) {
      return reply.code(400).send({ error: 'No speech detected' });
    }

    // ── Step 1b: Force correct language based on frontend request ─────────────
    const hasDevanagari = (t: string) => /[ऀ-ॿ]/.test(t);
    let finalTranscript = rawTranscript;

    if (frontendLang === 'hi' && !hasDevanagari(rawTranscript)) {
      try {
        const forceHindi = await groq.chat.completions.create({
          model:       'llama-3.3-70b-versatile',
          temperature: 0.0,
          max_tokens:  500,
          messages: [
            {
              role: 'system',
              content: 'यह टेक्स्ट हिंदी में बोला गया था लेकिन अंग्रेजी में लिखा आया है। इसे सही देवनागरी हिंदी में बदल दो। केवल हिंदी आउटपुट। कोई अंग्रेजी शब्द नहीं।'
            },
            { role: 'user', content: rawTranscript }
          ]
        });
        const translated = forceHindi.choices[0].message.content?.trim() || '';
        if (hasDevanagari(translated)) {
          finalTranscript = translated;
          req.log.info({
            raw: rawTranscript,
            forcedTo: 'Hindi',
            result: translated.slice(0, 100)
          }, '[voice] HACK: forced to Hindi');
        }
      } catch (e) {
        req.log.warn({ error: (e as Error).message }, 'Force Hindi translation failed');
      }
    }
    else if (frontendLang === 'en' && hasDevanagari(rawTranscript)) {
      try {
        const forceEnglish = await groq.chat.completions.create({
          model:       'llama-3.3-70b-versatile',
          temperature: 0.0,
          messages: [
            {
              role: 'system',
              content: 'यह टेक्स्ट हिंदी में है लेकिन यूजर ने English चुना है। इसे सही अंग्रेजी में अनुवाद करो। केवल अंग्रेजी आउटपुट। कोई व्याख्या नहीं।'
            },
            { role: 'user', content: rawTranscript }
          ]
        });
        finalTranscript = forceEnglish.choices[0].message.content?.trim() || rawTranscript;
        req.log.info({ raw: rawTranscript, forcedTo: 'English' }, '[voice] HACK: forced to English');
      } catch (e) {
        req.log.warn({ error: (e as Error).message }, 'Force English translation failed');
      }
    }

    const activeLang = frontendLang;

    // ── Step 2: LLM tool-calling phase ───────────────────────────────────────
    const conversation: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: buildSystemPrompt(activeLang) },
      ...prevConv,
      { role: 'user', content: finalTranscript },
    ];

    let iterations = 0;
    const MAX_ITER = 6;

    while (iterations < MAX_ITER) {
      iterations++;
      const response = await groq.chat.completions.create({
        model:       'llama-3.3-70b-versatile',
        messages:    conversation,
        tools:       TOOLS,
        tool_choice: 'auto',
        temperature: 0.3,
        max_tokens:  512,
      });

      const msg = response.choices[0].message;
      conversation.push(msg as any);

      if (!msg.tool_calls || msg.tool_calls.length === 0) break;

      const toolResults = await Promise.all(
        msg.tool_calls.map(async (tc) => {
          let result: any;
          try {
            const args = JSON.parse(tc.function.arguments);
            result = await executeTool(tc.function.name, args, userId, userId);
          } catch (toolErr: any) {
            result = { success: false, error: toolErr.message || 'Tool failed' };
          }
          return { role: 'tool' as const, tool_call_id: tc.id, content: JSON.stringify(result) };
        })
      );
      conversation.push(...toolResults);
    }

    // ── Step 3: Final answer phase ───────────────────────────────────────────
    const triggerMsg = activeLang === 'hi'
      ? 'ऊपर के results के बारे में हिंदी में बताओ।'
      : 'Summarise what was done.';

    const finalConversation: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: buildFinalAnswerPrompt(activeLang) },
      ...conversation.filter(m => m.role !== 'system'),
      { role: 'user', content: triggerMsg },
    ];

    const finalResponse = await groq.chat.completions.create({
      model:       'llama-3.3-70b-versatile',
      messages:    finalConversation,
      temperature: 0.3,
      max_tokens:  512,
    });

    let llmReply = finalResponse.choices[0].message.content || '';

    const hasDevanagariV = (t: string) => /[ऀ-ॿ]/.test(t);
    let resolvedVoiceReply = llmReply;

    if (!resolvedVoiceReply.trim() || (activeLang === 'hi' && !hasDevanagariV(resolvedVoiceReply))) {
      const fallback = await groq.chat.completions.create({
        model:    'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: buildFinalAnswerPrompt(activeLang) },
          ...conversation.filter(m => m.role !== 'system'),
          { role: 'user', content: activeLang === 'hi'
            ? 'इन tool results को देखकर केवल हिंदी में (देवनागरी लिपि में) 2-3 वाक्य बोलो।'
            : 'Summarise what happened in 2-3 English sentences.' },
        ],
        temperature: 0.3,
        max_tokens:  400,
      });
      resolvedVoiceReply = fallback.choices[0].message.content || (activeLang === 'hi' ? 'काम हो गया।' : 'Done.');
    }

    if (activeLang === 'hi') {
      resolvedVoiceReply = await ensureHindi(resolvedVoiceReply, groq);
    }

    return {
      transcript:   finalTranscript,
      reply:        resolvedVoiceReply,
      conversation: conversation.filter(m => m.role !== 'system'),
    };
  });

  // ── POST /api/chat/transcribe (compatibility) ─────────────────────────────
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