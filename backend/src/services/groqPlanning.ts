import Groq from 'groq-sdk';
import { getWeatherByCoords, WeatherData } from './weather';
import { query } from '../db';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export interface AICropPlan {
  crop_name:         string;
  variety:           string;
  season:            string;
  year:              number;
  sowing_date:       string;
  harvest_date:      string;
  duration_days:     number;
  area_acres:        number;
  expected_yield_kg: number;
  market_demand:     string;
  rationale:         string;
  risks:             string[];
  timeline: Array<{ label: string; date: string; description: string }>;
  input_recommendations: Array<{ item: string; quantity: string; timing: string }>;
  weather_alerts: string[];
}

interface FarmContext {
  id: string; name: string; state: string; district: string;
  area_acres: number; soil_type: string; irrigation: string;
  latitude: number | null; longitude: number | null;
}

function getCurrentSeason(): string {
  const m = new Date().getMonth() + 1;
  if (m >= 6 && m <= 9)  return 'kharif';
  if (m >= 10 || m <= 2) return 'rabi';
  return 'zaid';
}

const SEASON_CROPS: Record<string, string[]> = {
  kharif: ['Rice','Maize','Cotton','Soybean','Groundnut','Sugarcane','Bajra','Jowar','Moong','Urad','Arhar','Sesame','Jute','Turmeric','Ginger','Chilli'],
  rabi:   ['Wheat','Mustard','Chickpea','Lentil','Pea','Barley','Coriander','Cumin','Fenugreek','Potato','Onion','Garlic','Sunflower','Linseed'],
  zaid:   ['Watermelon','Muskmelon','Cucumber','Bottle Gourd','Ridge Gourd','Cowpea','Moong','Sunflower','Maize'],
};

const STATE_CONTEXT: Record<string, string> = {
  'Punjab':          'Major wheat/rice belt. High margins on maize, mustard, vegetables. Good mandi connectivity.',
  'Haryana':         'Wheat/rice surplus. Better margins on oilseeds, pulses, and seasonal vegetables.',
  'Uttar Pradesh':   'Diverse market. Sugarcane, wheat, potato, vegetables have strong local demand.',
  'Maharashtra':     'Cotton/soybean in Vidarbha. Onion in Nashik. Strong horticulture market.',
  'Madhya Pradesh':  'Soybean heartland. Wheat, gram, maize also strong. Central market hub.',
  'Rajasthan':       'Arid climate — bajra, jowar, cumin, mustard ideal. Drip opens horticulture.',
  'Gujarat':         'Cotton, groundnut, cumin export market. Bt cotton premium in Saurashtra.',
  'Karnataka':       'Ragi, maize, sunflower strong. Premium vegetable market near Bengaluru.',
  'Andhra Pradesh':  'Rice, chilli export crop. Banana near deltas. Papaya also strong.',
  'Tamil Nadu':      'Rice, banana, tapioca. Very high vegetable demand near Chennai.',
  'Bihar':           'Wheat, maize, vegetables. Potato, onion demand high. Storage infrastructure poor.',
  'West Bengal':     'Rice, jute, potato. High vegetable demand near Kolkata.',
  'Telangana':       'Cotton, soybean, maize. Red chilli significant export. Turmeric near Nizamabad.',
  'Odisha':          'Rice, maize. Vegetable growing near Bhubaneswar. Turmeric in tribal belt.',
  'Jharkhand':       'Maize, vegetables. Tomato, cauliflower near urban centres.',
};

function buildPrompt(
  farm: FarmContext,
  weather: WeatherData | null,
  previousCrops: string[],
  existingPlanCrops: string[]
): string {
  const today   = new Date().toISOString().split('T')[0];
  const season  = getCurrentSeason();
  const eligible = SEASON_CROPS[season].join(', ');

  const weatherSummary = weather
    ? `Temp: ${weather.temp}°C, Humidity: ${weather.humidity}%, Wind: ${weather.windSpeed}m/s, ${weather.description}.
7-day forecast: ${weather.forecast.slice(0,5).map(d => `${d.date}: ${d.temp}°C rain ${d.rain}mm`).join(' | ')}`
    : `No live data — use historical averages for ${farm.state} in ${season} season.`;

  const avoidCrops = [...new Set([...previousCrops.slice(0,3), ...existingPlanCrops])].filter(Boolean);
  const avoidLine  = avoidCrops.length > 0
    ? `CROP ROTATION — DO NOT RECOMMEND THESE (already on this farm): ${avoidCrops.join(', ')}. Choose something different.`
    : `No crop history — choose freely from the eligible list for ${season}.`;

  const marketNote = STATE_CONTEXT[farm.state] || `Check ${farm.state} mandi prices for best crop choice.`;

  return `You are a senior Indian agronomist with 20 years field experience in ${farm.state}.

FARM:
- Name: ${farm.name}
- Location: ${farm.district}, ${farm.state}
- Area: ${farm.area_acres} acres
- Soil: ${farm.soil_type || 'Loamy'}
- Irrigation: ${farm.irrigation || 'Rainfed'}
- Date: ${today}
- Season: ${season.toUpperCase()}

WEATHER (${farm.district}):
${weatherSummary}

MARKET (${farm.state}):
${marketNote}

ELIGIBLE CROPS FOR ${season.toUpperCase()}:
${eligible}

${avoidLine}

DECISION CRITERIA — think through all four before choosing:
1. SOIL FIT: Which crop suits ${farm.soil_type || 'loamy'} soil best in ${season}?
2. WATER FIT: Which crop suits ${farm.irrigation || 'rainfed'} irrigation?
3. MARKET: Which crop has best price realisation in ${farm.district}, ${farm.state} right now?
4. WEATHER: Current temp ${weather ? weather.temp + '°C' : 'seasonal'} — which crop thrives in this?

Pick the ONE crop that scores best across all four. Be specific — name the exact variety recommended for ${farm.district}.
Do NOT default to Bitter Gourd. Reason through the above criteria and pick the genuinely best crop.

Return ONLY this JSON (no markdown, no backticks, no text outside the JSON):
{
  "crop_name": "crop name",
  "variety": "specific variety for ${farm.district}, ${farm.state}",
  "season": "${season}",
  "year": ${new Date().getFullYear()},
  "sowing_date": "YYYY-MM-DD",
  "harvest_date": "YYYY-MM-DD",
  "duration_days": number,
  "area_acres": ${farm.area_acres},
  "expected_yield_kg": number,
  "market_demand": "high|medium|low",
  "rationale": "3-4 sentences explaining why THIS crop and variety for THIS farm. Reference the soil, irrigation, market, and weather in your reasoning.",
  "risks": ["risk specific to ${farm.state}", "risk 2", "risk 3"],
  "timeline": [
    { "label": "Land Preparation", "date": "YYYY-MM-DD", "description": "tillage details" },
    { "label": "Sowing", "date": "YYYY-MM-DD", "description": "seed rate, spacing, depth" },
    { "label": "First Irrigation", "date": "YYYY-MM-DD", "description": "amount and method" },
    { "label": "Basal Fertilizer", "date": "YYYY-MM-DD", "description": "NPK dose, application method" },
    { "label": "Pest Monitoring", "date": "YYYY-MM-DD", "description": "specific pests for this crop in ${farm.state}" },
    { "label": "Top Dressing", "date": "YYYY-MM-DD", "description": "urea/potash dose" },
    { "label": "Pre-Harvest Check", "date": "YYYY-MM-DD", "description": "maturity indicators" },
    { "label": "Harvest", "date": "YYYY-MM-DD", "description": "method, expected yield, storage" }
  ],
  "input_recommendations": [
    { "item": "seed", "quantity": "kg/acre", "timing": "sowing" },
    { "item": "fertilizer", "quantity": "kg/acre", "timing": "basal" },
    { "item": "pesticide/herbicide", "quantity": "ml/acre", "timing": "as needed" }
  ],
  "weather_alerts": []
}`;
}

export async function generateAICropPlan(farmId: string): Promise<AICropPlan> {
  // Fetch farm
  const { rows } = await query(
    `SELECT id, name, state, district, area_acres, soil_type, irrigation, latitude, longitude
     FROM farms WHERE id = $1`,
    [farmId]
  );
  if (!rows[0]) throw new Error('Farm not found');
  const farm: FarmContext = rows[0];

  // Previous crops for rotation
  const [{ rows: planRows }, { rows: prodRows }] = await Promise.all([
    query(`SELECT crop_name FROM crop_plans WHERE farm_id=$1 GROUP BY crop_name ORDER BY MAX(created_at) DESC LIMIT 4`, [farmId]),
    query(`SELECT crop_name FROM production_records WHERE farm_id=$1 GROUP BY crop_name ORDER BY MAX(created_at) DESC LIMIT 3`, [farmId]),
  ]);
  const previousCrops = [...new Set([
    ...planRows.map((r: any) => r.crop_name),
    ...prodRows.map((r: any) => r.crop_name),
  ])];

  // Active plans on this farm
  const { rows: activeRows } = await query(
    `SELECT crop_name FROM crop_plans WHERE farm_id=$1 AND status='active'`, [farmId]
  );
  const existingPlanCrops = activeRows.map((r: any) => r.crop_name);

  // Weather
  let weather: WeatherData | null = null;
  if (farm.latitude && farm.longitude) {
    try { weather = await getWeatherByCoords(farm.latitude, farm.longitude); } catch {}
  }

  const prompt = buildPrompt(farm, weather, previousCrops, existingPlanCrops);

  const completion = await groq.chat.completions.create({
    model:       'llama-3.3-70b-versatile',
    temperature: 0.8,   // high enough for variety, low enough for coherence
    max_tokens:  2048,
    messages: [
      {
        role:    'system',
        content: 'You are an expert Indian agricultural advisor. Output valid JSON only. No markdown. No backticks. No text outside the JSON.',
      },
      { role: 'user', content: prompt },
    ],
  });

  const raw     = completion.choices[0]?.message?.content || '';
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const match   = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Groq returned no valid JSON');

  const plan: AICropPlan = JSON.parse(match[0]);
  if (!plan.crop_name || !plan.sowing_date || !plan.harvest_date) {
    throw new Error('Groq returned incomplete plan');
  }

  return plan;
}