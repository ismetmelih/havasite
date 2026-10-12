// Veri: sitenin API'leri (önbellekli) + seçili şehrin tahmini için Open-Meteo
export const SITE = 'https://turkiyecanli.com';

export type Quake = {
  id: string; title: string; mag: number; depth: number; date: string; lat: number; lon: number; closestCity?: string;
  // AFAD resmi API alanlari (yedek kaynaklarda bos olabilir)
  magType?: string | null; province?: string | null; district?: string | null; neighborhood?: string | null; updated?: boolean;
};

export const AFAD_SOURCE = 'T.C. İçişleri Bakanlığı Afet ve Acil Durum Yönetimi Başkanlığı (AFAD) Deprem Dairesi Başkanlığı';
export type Fire = { lat: number; lon: number; frp: number; confidence: string; date: string; time: string; daynight: string };
export type CityWx = { name: string; lat: number; lon: number; temp: number; code: number; humidity: number; wind: number; cloud: number; isDay: boolean };

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function getQuakes(limit = 300) {
  const d = await getJson<{ ok: boolean; source: string; updated: string; data: Quake[] }>(`${SITE}/api/quakes?limit=${limit}`);
  if (!d.ok) throw new Error('Deprem verisi alınamadı');
  return d;
}
export async function getFires(days = 1) {
  const d = await getJson<{ ok: boolean; count: number; updated: string; data: Fire[] }>(`${SITE}/api/fires?days=${days}`);
  if (!d.ok) throw new Error('Yangın verisi alınamadı');
  return d;
}
export async function getCityWeather() {
  const d = await getJson<{ ok: boolean; updated: string; data: CityWx[] }>(`${SITE}/api/weather/cities`);
  if (!d.ok) throw new Error('Hava verisi alınamadı');
  return { ...d, byName: new Map(d.data.map((x) => [x.name, x])) };
}
export async function getModels() {
  return getJson<{ ok: boolean; daily: Record<string, (number | null)[]> & { time: string[] } }>(`${SITE}/api/weather/models`);
}

export type Forecast = {
  current: { time: string; temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; is_day: number; weather_code: number; wind_speed_10m: number; wind_direction_10m: number; pressure_msl: number };
  hourly: { time: string[]; temperature_2m: number[]; weather_code: number[]; precipitation_probability: number[]; is_day: number[] };
  daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[]; precipitation_sum: number[]; uv_index_max: number[]; wind_speed_10m_max: number[]; sunrise: string[]; sunset: string[] };
};
export function getForecast(lat: number, lon: number) {
  const p = new URLSearchParams({
    latitude: String(lat), longitude: String(lon),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl',
    hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max,wind_speed_10m_max,sunrise,sunset',
    timezone: 'Europe/Istanbul', forecast_days: '10',
  });
  return getJson<Forecast>(`https://api.open-meteo.com/v1/forecast?${p}`);
}

// AFAD tarihi Türkiye saatiyle "YYYY-MM-DD HH:MM:SS"
export const quakeTime = (q: Quake) => Date.parse(q.date.replace(' ', 'T') + '+03:00');
export const fireTime = (f: Fire) => {
  const hh = String(f.time || '0000').padStart(4, '0');
  return Date.parse(`${f.date}T${hh.slice(0, 2)}:${hh.slice(2)}:00Z`);
};
export function ago(t: number) {
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return 'az önce';
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} sa önce` : `${Math.round(h / 24)} gün önce`;
}
const HM = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
const DM = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short' });
export const hhmm = (t: number) => HM.format(t);
export const dayMonth = (t: number) => DM.format(t);
export const provinceOf = (q: Quake) =>
  (q.closestCity || '').replace(/\s*yakını$/, '').trim() || (q.title.match(/\(([^)]+)\)\s*$/) || [])[1] || q.title;

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
