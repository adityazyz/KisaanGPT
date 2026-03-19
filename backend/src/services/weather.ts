import axios from 'axios';

const BASE = process.env.WEATHER_API_URL || 'https://api.openweathermap.org/data/2.5';
const KEY = process.env.WEATHER_API_KEY;

export interface WeatherData {
  temp: number;
  humidity: number;
  description: string;
  windSpeed: number;
  forecast: Array<{ date: string; temp: number; rain: number; description: string }>;
}

export async function getWeatherByCoords(
  lat: number,
  lon: number
): Promise<WeatherData> {
  const [current, forecast] = await Promise.all([
    axios.get(`${BASE}/weather`, { params: { lat, lon, appid: KEY, units: 'metric' } }),
    axios.get(`${BASE}/forecast`, { params: { lat, lon, appid: KEY, units: 'metric', cnt: 40 } }),
  ]);

  const dailyMap = new Map<string, any>();
  for (const item of forecast.data.list) {
    const date = item.dt_txt.split(' ')[0];
    if (!dailyMap.has(date)) {
      dailyMap.set(date, {
        date,
        temp: item.main.temp,
        rain: item.rain?.['3h'] ?? 0,
        description: item.weather[0].description,
      });
    }
  }

  return {
    temp: current.data.main.temp,
    humidity: current.data.main.humidity,
    description: current.data.weather[0].description,
    windSpeed: current.data.wind.speed,
    forecast: Array.from(dailyMap.values()).slice(0, 7),
  };
}

export async function getWeatherAlerts(
  lat: number,
  lon: number,
  cropName: string
): Promise<string[]> {
  const weather = await getWeatherByCoords(lat, lon);
  const alerts: string[] = [];

  if (weather.humidity > 85) alerts.push(`High humidity (${weather.humidity}%) — risk of fungal disease for ${cropName}`);
  if (weather.temp > 40) alerts.push(`Extreme heat (${weather.temp}°C) — consider additional irrigation`);
  if (weather.temp < 5) alerts.push(`Low temperature (${weather.temp}°C) — frost risk for ${cropName}`);
  if (weather.windSpeed > 15) alerts.push(`Strong winds (${weather.windSpeed} m/s) — secure young plants`);

  const highRainDays = weather.forecast.filter((d) => d.rain > 20);
  if (highRainDays.length > 0) {
    alerts.push(`Heavy rain forecast on ${highRainDays.map((d) => d.date).join(', ')} — check drainage`);
  }

  return alerts;
}
