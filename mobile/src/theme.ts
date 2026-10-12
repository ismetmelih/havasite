// TürkiyeCanlı mobil — renkler, yazı tipleri ve ortak renk ölçekleri (site ile aynı dil)
export const C = {
  bg: '#0d0f13',
  bgAlt: '#0a0c0f',
  surface: '#15181d',
  surface2: '#1b1f25',
  hover: '#232830',
  border: 'rgba(255,255,255,0.075)',
  borderStrong: 'rgba(255,255,255,0.15)',
  text: '#f2f4f7',
  text2: '#a9b0bb',
  muted: '#828a96',
  accent: '#22d3ee',
  accentText: '#03222a',
  weather: '#38bdf8',
  quake: '#f5a524',
  fire: '#f87171',
  good: '#34d399',
  warn: '#fbbf24',
  critical: '#ef4444',
  violet: '#a78bfa',
};

export const F = {
  display: 'Cabinet-800',
  displayBold: 'Cabinet-700',
  body: 'Satoshi-400',
  medium: 'Satoshi-500',
  bold: 'Satoshi-700',
};

// deprem büyüklüğü rengi (site ile aynı ölçek)
export function magTone(m: number) {
  if (m >= 5) return '#ef4444';
  if (m >= 4) return '#f97316';
  if (m >= 3) return '#f5a524';
  if (m >= 2) return '#22c55e';
  return '#34d399';
}

export type Stop = [number, [number, number, number]];
export function scale(stops: Stop[], v: number) {
  if (v <= stops[0][0]) return `rgb(${stops[0][1].join(',')})`;
  for (let i = 0; i < stops.length - 1; i++) {
    const [x0, c0] = stops[i];
    const [x1, c1] = stops[i + 1];
    if (v <= x1) {
      const t = (v - x0) / (x1 - x0);
      return `rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * t)).join(',')})`;
    }
  }
  return `rgb(${stops[stops.length - 1][1].join(',')})`;
}
const TEMP_STOPS: Stop[] = [[-10, [124, 92, 214]], [0, [64, 132, 232]], [8, [45, 182, 214]], [15, [72, 196, 140]], [21, [226, 206, 80]], [27, [242, 146, 52]], [34, [226, 64, 64]], [40, [168, 34, 74]]];
export const tempColor = (t: number) => scale(TEMP_STOPS, t);
// il başına olay yoğunluğu (0..1)
export const quakeHeat = (t: number) => scale([[0, [92, 64, 26]], [0.5, [245, 165, 36]], [1, [239, 68, 68]]], t);
export const fireHeat = (t: number) => scale([[0, [110, 40, 20]], [0.5, [234, 88, 12]], [1, [251, 191, 36]]], t);
