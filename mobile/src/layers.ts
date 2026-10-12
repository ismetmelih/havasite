// Harita katmanları: sıcaklık, deprem, yangın — renkler, noktalar ve il bilgisi
import { CityWx, Fire, Quake, provinceOf, quakeTime } from './api';
import { TR_CITIES } from './data/cities';
import { fireHeat, magTone, quakeHeat, tempColor } from './theme';
import { wmoLabel } from './wmo';
import type { MapPoint } from './TurkeyMap';

export type Layer = 'temp' | 'quake' | 'fire';
export const LAYERS: { key: Layer; label: string }[] = [
  { key: 'temp', label: 'Sıcaklık' },
  { key: 'quake', label: 'Depremler' },
  { key: 'fire', label: 'Yangınlar' },
];

// yangın noktasını en yakın il merkezine bağla
export function nearestCity(lat: number, lon: number) {
  let best = TR_CITIES[0], bd = Infinity;
  for (const c of TR_CITIES) {
    const d = (c.lat - lat) ** 2 + ((c.lon - lon) * 0.78) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  return best.name;
}

export type LayerData = { wx?: Map<string, CityWx> | null; quakes?: Quake[] | null; fires?: Fire[] | null; now: number };

export function buildLayer(layer: Layer, d: LayerData) {
  if (layer === 'temp') {
    const wx = d.wx;
    return {
      fillFor: wx ? (n: string) => { const c = wx.get(n); return c ? tempColor(c.temp) : null; } : undefined,
      points: [] as MapPoint[],
      info: (n: string) => { const c = wx?.get(n); return c ? `${Math.round(c.temp)}° · ${wmoLabel(c.code)} · nem %${Math.round(c.humidity)} · rüzgâr ${Math.round(c.wind)} km/s` : 'Veri yok'; },
      ping: null as { lat: number; lon: number; color: string } | null,
    };
  }
  if (layer === 'quake') {
    const day = (d.quakes || []).filter((q) => d.now - quakeTime(q) < 864e5 && q.lat != null);
    const counts = new Map<string, Quake[]>();
    day.forEach((q) => { const p = provinceOf(q); counts.set(p, [...(counts.get(p) || []), q]); });
    const peak = Math.max(1, ...[...counts.values()].map((v) => v.length));
    return {
      fillFor: (n: string) => { const c = counts.get(n); return c ? quakeHeat(Math.sqrt(c.length / peak)) : null; },
      points: [...day].sort((a, b) => a.mag - b.mag).map((q) => ({ lat: q.lat, lon: q.lon, r: 5 + q.mag * 3.4, color: magTone(q.mag), opacity: 0.55, stroke: magTone(q.mag) })),
      info: (n: string) => {
        const c = counts.get(n);
        if (!c) return 'Son 24 saatte deprem yok';
        const mx = c.reduce((a, b) => (b.mag > a.mag ? b : a));
        return `Son 24 saatte ${c.length} deprem · en büyüğü ${mx.magType || 'M'} ${mx.mag.toFixed(1)}`;
      },
      ping: day[0] ? { lat: day[0].lat, lon: day[0].lon, color: '#ffffff' } : null,
    };
  }
  const fires = d.fires || [];
  const counts = new Map<string, number>();
  fires.forEach((f) => { const n = nearestCity(f.lat, f.lon); counts.set(n, (counts.get(n) || 0) + 1); });
  const peak = Math.max(1, ...counts.values());
  return {
    fillFor: (n: string) => { const c = counts.get(n); return c ? fireHeat(Math.sqrt(c / peak)) : null; },
    points: [...fires].sort((a, b) => a.frp - b.frp).slice(-1200).map((f) => ({ lat: f.lat, lon: f.lon, r: f.frp >= 45 ? 16 : f.frp >= 15 ? 12 : 9, color: f.frp >= 15 ? '#fff1b8' : '#ffc061', opacity: 1 })),
    info: (n: string) => { const c = counts.get(n); return c ? `Son 24 saatte ${c} ısı noktası (uydu)` : 'Son 24 saatte tespit yok'; },
    ping: null as { lat: number; lon: number; color: string } | null,
  };
}
