// Harita katmanları (site ile aynı): hava (sıcaklık, nem, rüzgâr, bulut), deprem, yangın —
// il renkleri, noktalar, il etiketleri, özet ve renk ölçeği
import { CityWx, Fire, Quake, provinceOf, quakeTime } from './api';
import { TR_CITIES } from './data/cities';
import { C, fireHeat, magTone, quakeHeat, scale, Stop } from './theme';
import { wmoLabel } from './wmo';
import type { MapLabel, MapPoint } from './TurkeyMap';

export type WxVar = 'temp' | 'humidity' | 'wind' | 'cloud';
export type Layer = WxVar | 'quake' | 'fire';
export const PANELS: { key: 'wx' | 'quake' | 'fire'; label: string }[] = [
  { key: 'wx', label: 'Hava' },
  { key: 'quake', label: 'Depremler' },
  { key: 'fire', label: 'Yangınlar' },
];
export const WX_VARS: { key: WxVar; label: string }[] = [
  { key: 'temp', label: 'Sıcaklık' },
  { key: 'humidity', label: 'Nem' },
  { key: 'wind', label: 'Rüzgâr' },
  { key: 'cloud', label: 'Bulut' },
];
export const isWx = (l: Layer): l is WxVar => l === 'temp' || l === 'humidity' || l === 'wind' || l === 'cloud';

// sitedeki hava haritasıyla aynı ölçekler
const WX: Record<WxVar, { title: string; unit: string; key: keyof CityWx; fmt: (v: number) => string; hi: string; lo: string; stops: Stop[] }> = {
  temp: { title: 'Sıcaklık', unit: '°C', key: 'temp', fmt: (v) => `${Math.round(v)}°`, hi: 'En sıcak', lo: 'En soğuk',
    stops: [[-10, [124, 92, 214]], [0, [64, 132, 232]], [8, [45, 182, 214]], [15, [72, 196, 140]], [21, [226, 206, 80]], [27, [242, 146, 52]], [34, [226, 64, 64]], [40, [168, 34, 74]]] },
  humidity: { title: 'Nem', unit: '%', key: 'humidity', fmt: (v) => `%${Math.round(v)}`, hi: 'En nemli', lo: 'En kuru',
    stops: [[10, [214, 150, 80]], [35, [222, 200, 110]], [55, [92, 196, 160]], [75, [52, 160, 220]], [100, [72, 92, 214]]] },
  wind: { title: 'Rüzgâr', unit: 'km/s', key: 'wind', fmt: (v) => `${Math.round(v)}`, hi: 'En rüzgârlı', lo: 'En sakin',
    stops: [[0, [72, 170, 200]], [10, [92, 196, 140]], [20, [226, 206, 80]], [35, [242, 128, 52]], [55, [214, 52, 80]], [75, [150, 60, 190]]] },
  cloud: { title: 'Bulut', unit: '%', key: 'cloud', fmt: (v) => `%${Math.round(v)}`, hi: 'En bulutlu', lo: 'En açık',
    stops: [[0, [64, 150, 232]], [40, [120, 160, 200]], [80, [150, 160, 176]], [100, [196, 200, 210]]] },
};
// etiket önceliği: büyük şehirler önce yerleşir
const PRIORITY = ['İstanbul', 'Ankara', 'İzmir', 'Antalya', 'Bursa', 'Adana', 'Konya', 'Gaziantep', 'Diyarbakır', 'Samsun', 'Trabzon', 'Erzurum', 'Van', 'Kayseri', 'Eskişehir', 'Mersin', 'Şanlıurfa', 'Malatya', 'Sivas', 'Edirne', 'Muğla', 'Kastamonu', 'Hatay'];
const rankOf = (n: string) => { const i = PRIORITY.indexOf(n); return i === -1 ? 100 : i; };
const center = (n: string) => TR_CITIES.find((c) => c.name === n);

// yangın noktasını en yakın il merkezine bağla
export function nearestCity(lat: number, lon: number) {
  let best = TR_CITIES[0], bd = Infinity;
  for (const c of TR_CITIES) {
    const d = (c.lat - lat) ** 2 + ((c.lon - lon) * 0.78) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  return best.name;
}

export type Stat = { label: string; value: string; color?: string; city?: string };
export type Legend = { title: string; unit: string; colors: string[]; ticks: string[] };
export type LayerData = { wx?: Map<string, CityWx> | null; quakes?: Quake[] | null; fires?: Fire[] | null; now: number; active?: string | null };
export type BuiltLayer = {
  fillFor?: (n: string) => string | null;
  points: MapPoint[];
  labels: MapLabel[];
  info: (n: string) => string;
  ping: { lat: number; lon: number; color: string } | null;
  stats: Stat[];
  legend: Legend | null;
};

const legendOf = (title: string, unit: string, stops: Stop[]): Legend => ({
  title, unit,
  colors: stops.map(([v]) => scale(stops, v)),
  ticks: [String(stops[0][0]), String(stops[Math.floor(stops.length / 2)][0]), String(stops[stops.length - 1][0])],
});

export function buildLayer(layer: Layer, d: LayerData): BuiltLayer {
  if (isWx(layer)) {
    const m = WX[layer];
    const rows = d.wx ? [...d.wx.values()].filter((c) => Number.isFinite(c[m.key] as number)) : [];
    const val = (c: CityWx) => c[m.key] as number;
    const hi = rows.length ? rows.reduce((a, b) => (val(b) > val(a) ? b : a)) : null;
    const lo = rows.length ? rows.reduce((a, b) => (val(b) < val(a) ? b : a)) : null;
    const avg = rows.length ? rows.reduce((s, c) => s + val(c), 0) / rows.length : null;
    return {
      fillFor: d.wx ? (n) => { const c = d.wx!.get(n); return c ? scale(m.stops, val(c)) : null; } : undefined,
      points: [],
      labels: rows.map((c) => ({ lat: c.lat, lon: c.lon, text: m.fmt(val(c)), rank: rankOf(c.name), active: c.name === d.active })),
      info: (n) => { const c = d.wx?.get(n); return c ? `${Math.round(c.temp)}° · ${wmoLabel(c.code)} · nem %${Math.round(c.humidity)} · rüzgâr ${Math.round(c.wind)} km/s · bulut %${Math.round(c.cloud)}` : 'Veri yok'; },
      ping: null,
      stats: [
        { label: m.hi, value: hi ? `${hi.name} ${m.fmt(val(hi))}` : '—', color: hi ? scale(m.stops, val(hi)) : undefined, city: hi?.name },
        { label: m.lo, value: lo ? `${lo.name} ${m.fmt(val(lo))}` : '—', color: lo ? scale(m.stops, val(lo)) : undefined, city: lo?.name },
        { label: 'Türkiye ortalaması', value: avg != null ? `${m.fmt(avg)}${layer === 'wind' ? ' km/s' : ''}` : '—' },
      ],
      legend: legendOf(m.title, m.unit, m.stops),
    };
  }

  if (layer === 'quake') {
    const day = (d.quakes || []).filter((q) => d.now - quakeTime(q) < 864e5 && q.lat != null);
    const counts = new Map<string, Quake[]>();
    day.forEach((q) => { const p = provinceOf(q); counts.set(p, [...(counts.get(p) || []), q]); });
    const peak = Math.max(1, ...[...counts.values()].map((v) => v.length));
    const top = [...counts.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    const mx = day.length ? day.reduce((a, b) => (b.mag > a.mag ? b : a)) : null;
    return {
      fillFor: (n) => { const c = counts.get(n); return c ? quakeHeat(Math.sqrt(c.length / peak)) : null; },
      points: [...day].sort((a, b) => a.mag - b.mag).map((q) => ({ lat: q.lat, lon: q.lon, r: 5 + q.mag * 3.4, color: magTone(q.mag), opacity: 0.6, stroke: magTone(q.mag) })),
      labels: [...counts.entries()].map(([n, c]) => { const cc = center(n); return cc ? { lat: cc.lat, lon: cc.lon, text: String(c.length), rank: 100 - c.length, color: C.quake, active: n === d.active } : null; }).filter(Boolean) as MapLabel[],
      info: (n) => {
        const c = counts.get(n);
        if (!c) return 'Son 24 saatte deprem yok';
        const m = c.reduce((a, b) => (b.mag > a.mag ? b : a));
        return `Son 24 saatte ${c.length} deprem · en büyüğü ${m.magType || 'M'} ${m.mag.toFixed(1)} (${m.title})`;
      },
      ping: day[0] ? { lat: day[0].lat, lon: day[0].lon, color: '#ffffff' } : null,
      stats: [
        { label: 'Son 24 saat', value: `${day.length} deprem` },
        { label: 'En büyük', value: mx ? `${mx.magType || 'M'} ${mx.mag.toFixed(1)} ${provinceOf(mx)}` : '—', color: mx ? magTone(mx.mag) : undefined, city: mx ? provinceOf(mx) : undefined },
        { label: 'En hareketli il', value: top ? `${top[0]} · ${top[1].length}` : '—', color: C.quake, city: top?.[0] },
      ],
      legend: { title: 'Deprem sayısı', unit: 'il başına', colors: [quakeHeat(0), quakeHeat(0.5), quakeHeat(1)], ticks: ['1', String(Math.max(1, Math.round(peak / 4))), String(peak)] },
    };
  }

  const fires = d.fires || [];
  const counts = new Map<string, number>();
  fires.forEach((f) => { const n = nearestCity(f.lat, f.lon); counts.set(n, (counts.get(n) || 0) + 1); });
  const peak = Math.max(1, ...counts.values());
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const strong = fires.length ? fires.reduce((a, b) => (b.frp > a.frp ? b : a)) : null;
  return {
    fillFor: (n) => { const c = counts.get(n); return c ? fireHeat(Math.sqrt(c / peak)) : null; },
    points: [...fires].sort((a, b) => a.frp - b.frp).slice(-1200).map((f) => ({ lat: f.lat, lon: f.lon, r: f.frp >= 45 ? 16 : f.frp >= 15 ? 12 : 9, color: f.frp >= 15 ? '#fff1b8' : '#ffc061', opacity: 1 })),
    labels: [],
    info: (n) => { const c = counts.get(n); return c ? `Son 24 saatte ${c} ısı noktası (uydu)` : 'Son 24 saatte tespit yok'; },
    ping: null,
    stats: [
      { label: 'Son 24 saat', value: `${fires.length} ısı noktası` },
      { label: 'En çok tespit', value: top ? `${top[0]} · ${top[1]}` : '—', color: C.fire, city: top?.[0] },
      { label: 'En güçlü', value: strong ? `${Math.round(strong.frp)} MW · ${nearestCity(strong.lat, strong.lon)}` : '—', color: '#fbbf24' },
    ],
    legend: { title: 'Isı noktası', unit: 'il başına', colors: [fireHeat(0), fireHeat(0.5), fireHeat(1)], ticks: ['1', String(Math.max(1, Math.round(peak / 4))), String(peak)] },
  };
}
