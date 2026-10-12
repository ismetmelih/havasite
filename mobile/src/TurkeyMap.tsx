// İl sınırlı Türkiye haritası (SVG): iller renklendirilir, üstüne olay noktaları çizilir
import { memo, useEffect, useState } from 'react';
import { Animated, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { C } from './theme';

const GEO = require('./data/tr-iller-svg.json') as { lon0: number; lat0: number; k: number; c: number; w: number; h: number; p: { n: string; d: string }[] };

export const projTR = (lat: number, lon: number): [number, number] => [(lon - GEO.lon0) * GEO.k * GEO.c, (GEO.lat0 - lat) * GEO.k];

export type MapPoint = { lat: number; lon: number; r: number; color: string; opacity?: number; stroke?: string };

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function Ping({ x, y, color }: { x: number; y: number; color: string }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 2000, useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <AnimatedCircle
      cx={x} cy={y} fill="none" stroke={color} strokeWidth={3}
      r={v.interpolate({ inputRange: [0, 1], outputRange: [8, 40] })}
      strokeOpacity={v.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })}
    />
  );
}

function TurkeyMapBase({ fillFor, points = [], ping, glow, onPressProvince, active }: { fillFor?: (name: string) => string | null; points?: MapPoint[]; ping?: { lat: number; lon: number; color: string } | null; glow?: boolean; onPressProvince?: (name: string) => void; active?: string | null }) {
  const pp = ping ? projTR(ping.lat, ping.lon) : null;
  return (
    <View style={{ width: '100%', aspectRatio: (GEO.w + 12) / (GEO.h + 12) }}>
      <Svg width="100%" height="100%" viewBox={`-6 -6 ${GEO.w + 12} ${GEO.h + 12}`}>
        <G stroke={C.bg} strokeWidth={1.4} strokeLinejoin="round">
          {GEO.p.map((p) => (
            <Path key={p.n} d={p.d} fill={(fillFor && fillFor(p.n)) || '#262b33'} onPress={onPressProvince ? () => onPressProvince(p.n) : undefined} />
          ))}
        </G>
        {active ? (() => { const a = GEO.p.find((p) => p.n === active); return a ? <Path d={a.d} fill="none" stroke="#ffffff" strokeWidth={3} /> : null; })() : null}
        {glow && (
          <G>
            {points.map((pt, i) => {
              const [x, y] = projTR(pt.lat, pt.lon);
              return <Circle key={`g${i}`} cx={x} cy={y} r={pt.r * 2.6} fill={pt.color} fillOpacity={0.16} />;
            })}
          </G>
        )}
        <G>
          {points.map((pt, i) => {
            const [x, y] = projTR(pt.lat, pt.lon);
            return <Circle key={i} cx={x} cy={y} r={pt.r} fill={pt.color} fillOpacity={pt.opacity ?? 0.85} stroke={pt.stroke} strokeWidth={pt.stroke ? 1.5 : 0} />;
          })}
        </G>
        {pp && <Ping x={pp[0]} y={pp[1]} color={ping!.color} />}
      </Svg>
    </View>
  );
}
export const TurkeyMap = memo(TurkeyMapBase);
