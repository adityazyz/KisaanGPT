import { query } from '../db';
import { getWeatherAlerts } from './weather';

export interface CropSuggestion {
  crop: string;
  variety: string;
  season: string;
  expectedYieldPerAcre: number;
  durationDays: number;
  soilSuitability: string;
  notes: string;
}

const CROP_DATABASE: Record<string, CropSuggestion[]> = {
  rabi: [
    { crop: 'Wheat', variety: 'HD-2967', season: 'rabi', expectedYieldPerAcre: 1800, durationDays: 120, soilSuitability: 'loamy,clay-loam', notes: 'Best for North India. Irrigate 4-5 times.' },
    { crop: 'Mustard', variety: 'Pusa Bold', season: 'rabi', expectedYieldPerAcre: 600, durationDays: 110, soilSuitability: 'sandy-loam,loamy', notes: 'Low water requirement. Good for Rajasthan.' },
    { crop: 'Chickpea', variety: 'JG-11', season: 'rabi', expectedYieldPerAcre: 700, durationDays: 100, soilSuitability: 'loamy,sandy-loam', notes: 'Drought tolerant. Minimal irrigation needed.' },
    { crop: 'Potato', variety: 'Kufri Jyoti', season: 'rabi', expectedYieldPerAcre: 8000, durationDays: 90, soilSuitability: 'sandy-loam,loamy', notes: 'High input, high output. Good market demand.' },
  ],
  kharif: [
    { crop: 'Rice', variety: 'IR-64', season: 'kharif', expectedYieldPerAcre: 1600, durationDays: 120, soilSuitability: 'clay,clay-loam', notes: 'Needs flooded fields. Plan water management.' },
    { crop: 'Maize', variety: 'Ganga-11', season: 'kharif', expectedYieldPerAcre: 2000, durationDays: 90, soilSuitability: 'loamy,sandy-loam', notes: 'High demand for animal feed. Good yield.' },
    { crop: 'Soybean', variety: 'JS-335', season: 'kharif', expectedYieldPerAcre: 900, durationDays: 95, soilSuitability: 'loamy,clay-loam', notes: 'Good for Madhya Pradesh. Nitrogen fixing.' },
    { crop: 'Cotton', variety: 'Bt Cotton', season: 'kharif', expectedYieldPerAcre: 1200, durationDays: 150, soilSuitability: 'black-cotton,clay', notes: 'High value crop. Needs intensive management.' },
  ],
  zaid: [
    { crop: 'Watermelon', variety: 'Sugar Baby', season: 'zaid', expectedYieldPerAcre: 12000, durationDays: 80, soilSuitability: 'sandy-loam', notes: 'High market demand in summer.' },
    { crop: 'Cucumber', variety: 'Pusa Uday', season: 'zaid', expectedYieldPerAcre: 6000, durationDays: 60, soilSuitability: 'loamy,sandy-loam', notes: 'Short duration. Good returns.' },
  ],
};

export function getCropSuggestions(
  soilType: string,
  state: string
): CropSuggestion[] {
  const now = new Date();
  const month = now.getMonth() + 1;
  let season = 'rabi';
  if (month >= 6 && month <= 9) season = 'kharif';
  else if (month >= 3 && month <= 5) season = 'zaid';

  const all = [...(CROP_DATABASE[season] || []), ...Object.values(CROP_DATABASE).flat()];
  const soil = soilType?.toLowerCase() || '';

  const scored = all.map((c) => ({
    ...c,
    score: c.soilSuitability.split(',').some((s) => soil.includes(s)) ? 2 : 0,
  }));

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ score: _s, ...c }) => c);
}

export function generateTimeline(
  crop: string,
  sowingDate: Date,
  durationDays: number
): Array<{ label: string; date: string; description: string }> {
  const add = (d: Date, days: number) => {
    const r = new Date(d);
    r.setDate(r.getDate() + days);
    return r.toISOString().split('T')[0];
  };

  return [
    { label: 'Sowing', date: add(sowingDate, 0), description: 'Prepare field and sow seeds' },
    { label: 'Germination Check', date: add(sowingDate, 7), description: 'Check germination; gap filling if needed' },
    { label: 'First Fertilizer', date: add(sowingDate, 21), description: 'Apply basal dose of NPK' },
    { label: 'First Irrigation', date: add(sowingDate, 15), description: 'First irrigation after sowing' },
    { label: 'Pest Monitoring', date: add(sowingDate, 30), description: 'Scout for early pest/disease signs' },
    { label: 'Second Fertilizer', date: add(sowingDate, 45), description: 'Top dressing — Urea/potash' },
    { label: 'Flower/Tassel Stage', date: add(sowingDate, Math.round(durationDays * 0.5)), description: 'Critical growth stage — ensure water availability' },
    { label: 'Pre-Harvest Check', date: add(sowingDate, durationDays - 14), description: 'Assess crop maturity; arrange storage/transport' },
    { label: 'Harvest', date: add(sowingDate, durationDays), description: `Expected harvest of ${crop}` },
  ];
}

export async function refreshWeatherAlerts(planId: string): Promise<void> {
  const { rows } = await query(
    `SELECT cp.id, f.latitude, f.longitude, cp.crop_name
     FROM crop_plans cp JOIN farms f ON f.id = cp.farm_id
     WHERE cp.id = $1`,
    [planId]
  );
  if (!rows[0] || !rows[0].latitude) return;

  const { latitude, longitude, crop_name } = rows[0];
  const alerts = await getWeatherAlerts(latitude, longitude, crop_name);

  await query(
    `UPDATE crop_plans SET weather_alerts = $1, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(alerts), planId]
  );
}
