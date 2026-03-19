import Groq from 'groq-sdk';
import { getWeatherByCoords, WeatherData } from './weather';
import { query } from '../db';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export interface AICropPlan {
  crop_name:         string;
  variety:           string;
  season:            string;
  year:              number;
  sowing_date:       string;        // ISO date
  harvest_date:      string;        // ISO date
  duration_days:     number;
  area_acres:        number;        // same as farm area
  expected_yield_kg: number;
  market_demand:     string;        // 'high' | 'medium' | 'low'
  rationale:         string;        // why this crop was chosen
  risks:             string[];
  timeline: Array<{
    label:       string;
    date:        string;
    description: string;
  }>;
  input_recommendations: Array<{
    item:      string;
    quantity:  string;
    timing:    string;
  }>;
  weather_alerts: string[];
}

interface FarmContext {
  name:        string;
  state:       string;
  district:    string;
  area_acres:  number;
  soil_type:   string;
  irrigation:  string;
  latitude:    number | null;
  longitude:   number | null;
}

function getCurrentSeason(): { name: string; sowingMonth: number } {
  const month = new Date().getMonth() + 1;
  if (month >= 6  && month <= 9)  return { name: 'kharif', sowingMonth: month };
  if (month >= 10 || month <= 2)  return { name: 'rabi',   sowingMonth: month <= 2 ? month : 10 };
  return { name: 'zaid', sowingMonth: 3 };
}

function buildPrompt(farm: FarmContext, weather: WeatherData | null): string {
  const today      = new Date().toISOString().split('T')[0];
  const season     = getCurrentSeason();
  const weatherSummary = weather
    ? `Current: ${weather.temp}°C, humidity ${weather.humidity}%, wind ${weather.windSpeed}m/s, ${weather.description}.
       7-day forecast: ${weather.forecast.map(d => `${d.date}: ${d.temp}°C, rain ${d.rain}mm`).join(' | ')}`
    : 'Weather data unavailable';

  return `You are an expert agricultural advisor for Indian farmers. 
Analyze the following farm data and generate a complete, autonomous crop plan.
Do NOT ask for more input — make the best decision based on what is provided.

FARM DATA:
- Name: ${farm.name}
- Location: ${farm.district}, ${farm.state}, India
- Area: ${farm.area_acres} acres
- Soil Type: ${farm.soil_type || 'Unknown (assume loamy)'}
- Irrigation: ${farm.irrigation || 'Unknown (assume rainfed)'}
- Today's Date: ${today}
- Current Season: ${season.name}

WEATHER CONDITIONS:
${weatherSummary}

TASK:
1. Choose the SINGLE BEST crop for this farm right now based on soil, irrigation, season, weather, and market demand in ${farm.state}
2. Generate a complete planting timeline from today to harvest
3. Provide input recommendations (fertilizers, pesticides, irrigation schedule)
4. Assess risks and market demand

Respond ONLY with a valid JSON object matching this exact structure (no markdown, no explanation):
{
  "crop_name": "string",
  "variety": "string (best variety for ${farm.state})",
  "season": "${season.name}",
  "year": ${new Date().getFullYear()},
  "sowing_date": "YYYY-MM-DD",
  "harvest_date": "YYYY-MM-DD",
  "duration_days": number,
  "area_acres": ${farm.area_acres},
  "expected_yield_kg": number,
  "market_demand": "high|medium|low",
  "rationale": "2-3 sentence explanation of why this crop was chosen",
  "risks": ["risk1", "risk2", "risk3"],
  "timeline": [
    { "label": "string", "date": "YYYY-MM-DD", "description": "string" }
  ],
  "input_recommendations": [
    { "item": "string", "quantity": "string", "timing": "string" }
  ],
  "weather_alerts": ["alert1 if any"]
}`;
}

export async function generateAICropPlan(farmId: string): Promise<AICropPlan> {
  // 1. Fetch farm data
  const { rows } = await query(
    `SELECT name, state, district, area_acres, soil_type, irrigation, latitude, longitude
     FROM farms WHERE id = $1`,
    [farmId]
  );
  if (!rows[0]) throw new Error('Farm not found');
  const farm: FarmContext = rows[0];

  // 2. Fetch weather if coordinates available
  let weather: WeatherData | null = null;
  if (farm.latitude && farm.longitude) {
    try { weather = await getWeatherByCoords(farm.latitude, farm.longitude); }
    catch { /* non-fatal */ }
  }

  // 3. Build prompt and call Groq
  const prompt = buildPrompt(farm, weather);

  const completion = await groq.chat.completions.create({
    model:       'llama-3.3-70b-versatile',
    temperature: 0.3,   // low temp for consistent structured output
    max_tokens:  2048,
    messages: [
      {
        role:    'system',
        content: 'You are an expert Indian agricultural advisor. Always respond with valid JSON only. No markdown, no backticks, no explanation outside the JSON.',
      },
      {
        role:    'user',
        content: prompt,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content || '';

  // 4. Parse — strip any accidental markdown fences
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const plan: AICropPlan = JSON.parse(cleaned);

  // 5. Validate required fields
  if (!plan.crop_name || !plan.sowing_date || !plan.harvest_date) {
    throw new Error('Groq returned incomplete plan');
  }

  return plan;
}
