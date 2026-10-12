// Türkiye haritası (SVG): ayrıntılı il sınırları, komşu ülkeler ve deniz; iller renklendirilir,
// üstüne olay noktaları ve il değer etiketleri (sığmayanlar gizlenir) çizilir.
// Sınırlar: geoBoundaries (© OpenStreetMap katkıcıları, CC BY-SA); komşu ülkeler: Natural Earth (kamu malı)
import { memo, useEffect, useMemo, useState } from 'react';
import { Animated, LayoutChangeEvent, View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { C, F } from './theme';

type MapData = {
  lon0: number; lat0: number; k: number; c: number;
  tr: { x0: number; y0: number; x1: number; y1: number };
  p: { n: string; d: string }[];
  nb: { n: string; d: string }[];
  labels: { t: string; x: number; y: number; sea: boolean }[];
};
const GEO = require('./data/tr-map.json') as MapData;

export const projTR = (lat: number, lon: number): [number, number] => [(lon - GEO.lon0) * GEO.k * GEO.c, (GEO.lat0 - lat) * GEO.k];

// görünür alan: Türkiye kutusu + kenar payı ("wide" tam ekranda komşuları da gösterir).
// fit verilirse alan o en-boy oranına genişletilir (ekranı deniz ve komşu ülkelerle doldurur).
export function viewBoxOf(wide?: boolean, fit?: number) {
  const m = wide ? 70 : 12;
  let x = GEO.tr.x0 - m, y = GEO.tr.y0 - m, w = GEO.tr.x1 - GEO.tr.x0 + 2 * m, h = GEO.tr.y1 - GEO.tr.y0 + 2 * m;
  if (fit && fit > 0) {
    if (fit > w / h) { const nw = h * fit; x -= (nw - w) / 2; w = nw; }
    else { const nh = w / fit; y -= (nh - h) / 2; h = nh; }
  }
  return { x, y, w, h, aspect: w / h };
}

export type MapPoint = { lat: number; lon: number; r: number; color: string; opacity?: number; stroke?: string };
// il üstü değer etiketi; rank küçük olan önce yerleşir (çakışanlar gizlenir)
export type MapLabel = { lat: number; lon: number; text: string; rank: number; active?: boolean; color?: string };

const SEA = '#0c1118';
const LAND_NB = '#1a1f26';
const LAND_TR = '#2a303a';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
function Ping({ x, y, color, k }: { x: number; y: number; color: string; k: number }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 2000, useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <AnimatedCircle cx={x} cy={y} fill="none" stroke={color} strokeWidth={3 * k}
      r={v.interpolate({ inputRange: [0, 1], outputRange: [8 * k, 40 * k] })}
      strokeOpacity={v.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })} />
  );
}

type Props = {
  fillFor?: (name: string) => string | null;
  points?: MapPoint[];
  labels?: MapLabel[];
  ping?: { lat: number; lon: number; color: string } | null;
  glow?: boolean;
  onPressProvince?: (name: string) => void;
  active?: string | null;
  // haritanın çizildiği ölçek (tam ekranda yakınlaştırma); yazılar ve noktalar ekranda sabit kalsın
  zoom?: number;
  wide?: boolean;
  fit?: number;
};

function TurkeyMapBase({ fillFor, points = [], labels = [], ping, glow, onPressProvince, active, zoom = 1, wide, fit }: Props) {
  const vb = viewBoxOf(wide, fit);
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  const px = w ? w / vb.w : 1; // 1 harita birimi kaç ekran noktası
  const pk = 1 / Math.sqrt(zoom); // noktalar hafifçe büyüsün ama şişmesin
  const tk = 1 / px; // yazılar ekranda sabit boyutta
  const pp = ping ? projTR(ping.lat, ping.lon) : null;

  // etiket yerleşimi: sığmayanlar gizlenir (ekran boyutuna göre)
  const placed = useMemo(() => {
    if (!w || !labels.length) return [];
    const boxes: number[][] = [];
    const out: { x: number; y: number; text: string; bw: number; active?: boolean; color?: string }[] = [];
    [...labels].sort((a, b) => (a.active ? -1 : b.active ? 1 : a.rank - b.rank)).forEach((l) => {
      const bw = (l.text.length * 7 + 14) * tk, bh = 20 * tk, g = 3 * tk;
      // kenardaki etiketler yarım kalmasın: görünür alanın içine al
      const [px0, py0] = projTR(l.lat, l.lon);
      const x = Math.min(vb.x + vb.w - bw / 2 - 2 * tk, Math.max(vb.x + bw / 2 + 2 * tk, px0));
      const y = Math.min(vb.y + vb.h - bh / 2 - 2 * tk, Math.max(vb.y + bh / 2 + 2 * tk, py0));
      const r = [x - bw / 2 - g, y - bh / 2 - g, x + bw / 2 + g, y + bh / 2 + g];
      if (!l.active && boxes.some((b) => r[0] < b[2] && r[2] > b[0] && r[1] < b[3] && r[3] > b[1])) return;
      boxes.push(r);
      out.push({ x, y, text: l.text, bw, active: l.active, color: l.color });
    });
    return out;
  }, [labels, w, tk, vb.x, vb.y, vb.w, vb.h]);

  return (
    <View style={{ width: '100%', aspectRatio: vb.aspect }} onLayout={onLayout}>
      <Svg width="100%" height="100%" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}>
        <Rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill={SEA} />
        <G fill={LAND_NB} stroke="#262c35" strokeWidth={0.8 * pk}>
          {GEO.nb.map((n) => <Path key={n.n} d={n.d} />)}
        </G>
        {GEO.labels.map((l) => (
          <SvgText key={l.t} x={l.x} y={l.y} fill={l.sea ? '#3a4a5c' : '#4a515c'} fontSize={(l.sea ? 11 : 10) * tk} fontFamily={F.medium} fontStyle={l.sea ? 'italic' : 'normal'} letterSpacing={(l.sea ? 1.5 : 0.4) * tk} textAnchor="middle">
            {l.sea ? l.t : l.t.toLocaleUpperCase('tr')}
          </SvgText>
        ))}
        <G stroke={C.bg} strokeWidth={1.1 * pk} strokeLinejoin="round">
          {GEO.p.map((p) => (
            <Path key={p.n} d={p.d} fill={(fillFor && fillFor(p.n)) || LAND_TR} onPress={onPressProvince ? () => onPressProvince(p.n) : undefined} />
          ))}
        </G>
        {active ? (() => { const a = GEO.p.find((p) => p.n === active); return a ? <Path d={a.d} fill="none" stroke="#ffffff" strokeWidth={2.5 * tk} /> : null; })() : null}
        {glow && (
          <G>
            {points.map((pt, i) => {
              const [x, y] = projTR(pt.lat, pt.lon);
              return <Circle key={`g${i}`} cx={x} cy={y} r={pt.r * 2.6 * pk} fill={pt.color} fillOpacity={0.16} />;
            })}
          </G>
        )}
        <G>
          {points.map((pt, i) => {
            const [x, y] = projTR(pt.lat, pt.lon);
            return <Circle key={i} cx={x} cy={y} r={pt.r * pk} fill={pt.color} fillOpacity={pt.opacity ?? 0.85} stroke={pt.stroke} strokeWidth={pt.stroke ? 1.5 * pk : 0} />;
          })}
        </G>
        {pp && <Ping x={pp[0]} y={pp[1]} color={ping!.color} k={pk} />}
        <G>
          {placed.map((l, i) => (
            <G key={i}>
              <Rect x={l.x - l.bw / 2} y={l.y - 10 * tk} width={l.bw} height={20 * tk} rx={10 * tk}
                fill={l.active ? '#ffffff' : 'rgba(13,15,19,0.78)'} stroke={l.active ? '#ffffff' : 'rgba(255,255,255,0.18)'} strokeWidth={1 * tk} />
              <SvgText x={l.x} y={l.y + 4 * tk} fill={l.active ? '#0d0f13' : l.color || '#ffffff'} fontSize={11.5 * tk} fontFamily={F.bold} fontWeight="700" textAnchor="middle">
                {l.text}
              </SvgText>
            </G>
          ))}
        </G>
      </Svg>
    </View>
  );
}
export const TurkeyMap = memo(TurkeyMapBase);
