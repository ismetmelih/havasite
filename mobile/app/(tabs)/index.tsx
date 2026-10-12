import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ago, getCityWeather, getFires, getQuakes, provinceOf, quakeTime } from '@/src/api';
import { useData } from '@/src/hooks';
import { C, F, magTone, tempColor } from '@/src/theme';
import { TurkeyMap, MapPoint } from '@/src/TurkeyMap';
import { buildLayer } from '@/src/layers';
import { Card, ExpandMap, H1, H2, Label, LiveDot, Muted, QuakeRow, Screen, Segmented, T } from '@/src/ui';
import { TR_CITIES } from '@/src/data/cities';
import { ICONS, wmoLabel } from '@/src/wmo';

type Layer = 'temp' | 'quake' | 'fire';
const LAYERS: { key: Layer; label: string }[] = [
  { key: 'temp', label: 'Sıcaklık' },
  { key: 'quake', label: 'Depremler' },
  { key: 'fire', label: 'Yangınlar' },
];

// yangin noktasini en yakin il merkezine bagla
function nearestCity(lat: number, lon: number) {
  let best = TR_CITIES[0], bd = Infinity;
  for (const c of TR_CITIES) {
    const d = (c.lat - lat) ** 2 + ((c.lon - lon) * 0.78) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  return best.name;
}

export default function Home() {
  const quakes = useData(() => getQuakes(200), 60_000);
  const fires = useData(() => getFires(1), 5 * 60_000);
  const wx = useData(getCityWeather, 10 * 60_000);
  const [layer, setLayer] = useState<Layer>('temp');
  const auto = useRef(true);

  // harita katmanı kendiliğinden döner; kullanıcı seçince durur
  useEffect(() => {
    const t = setInterval(() => {
      if (!auto.current) return;
      setLayer((l) => (l === 'temp' ? 'quake' : l === 'quake' ? 'fire' : 'temp'));
    }, 6500);
    return () => clearInterval(t);
  }, []);

  const day = useMemo(() => (quakes.data?.data || []).filter((q) => quakes.at - quakeTime(q) < 864e5 && q.lat != null), [quakes.data, quakes.at]);
  const maxQ = useMemo(() => (day.length ? day.reduce((a, b) => (b.mag > a.mag ? b : a)) : null), [day]);
  const fireTop = useMemo(() => {
    const cc = new Map<string, number>();
    (fires.data?.data || []).forEach((f) => { const n = nearestCity(f.lat, f.lon); cc.set(n, (cc.get(n) || 0) + 1); });
    return [...cc.entries()].sort((a, b) => b[1] - a[1]);
  }, [fires.data]);
  const temps = wx.data?.data || [];
  const hot = temps.length ? temps.reduce((a, b) => (b.temp > a.temp ? b : a)) : null;
  const cold = temps.length ? temps.reduce((a, b) => (b.temp < a.temp ? b : a)) : null;

  const fillFor = useMemo(() => {
    if (layer !== 'temp' || !wx.data) return undefined;
    return (n: string) => { const c = wx.data!.byName.get(n); return c ? tempColor(c.temp) : null; };
  }, [layer, wx.data]);
  // sıcaklık katmanında il etiketleri (sığmayanlar gizlenir)
  const labels = useMemo(() => (layer === 'temp' && wx.data ? buildLayer('temp', { wx: wx.data.byName, now: 0 }).labels : []), [layer, wx.data]);
  const points: MapPoint[] = useMemo(() => {
    if (layer === 'quake') return [...day].sort((a, b) => a.mag - b.mag).map((q) => ({ lat: q.lat, lon: q.lon, r: 5 + q.mag * 3.4, color: magTone(q.mag), opacity: 0.55, stroke: magTone(q.mag) }));
    if (layer === 'fire') return (fires.data?.data || []).slice(0, 900).map((f) => ({ lat: f.lat, lon: f.lon, r: f.frp >= 15 ? 12 : 9, color: f.frp >= 15 ? '#ffd166' : '#ff6b3d', opacity: 0.95 }));
    return [];
  }, [layer, day, fires.data]);
  const latest = quakes.data?.data[0];

  const caption =
    layer === 'temp'
      ? hot && cold ? `81 ilin anlık sıcaklığı · en sıcak ${hot.name} ${Math.round(hot.temp)}°, en soğuk ${cold.name} ${Math.round(cold.temp)}°` : 'Sıcaklıklar yükleniyor…'
      : layer === 'quake'
        ? `Son 24 saatte ${day.length} deprem${maxQ ? ` · en büyüğü M${maxQ.mag.toFixed(1)} ${provinceOf(maxQ)}` : ''}`
        : fires.data ? `Son 24 saatte ${fires.data.count} ısı noktası${fireTop[0] ? ` · en çok ${fireTop[0][0]}` : ''}` : 'Uydu verisi yükleniyor…';

  const refreshing = quakes.refreshing || fires.refreshing || wx.refreshing;
  const refresh = () => { quakes.refresh(); fires.refresh(); wx.refresh(); };
  const ank = wx.data?.byName.get('Ankara');

  return (
    <Screen title="TürkiyeCanlı" subtitle={<><LiveDot size={7} /><Muted style={{ marginTop: 0 }}>canlı · AFAD · NASA · Open-Meteo</Muted></>} refreshing={refreshing} onRefresh={refresh}>
      <View style={{ gap: 12, marginTop: 4 }}>
        <Label>Hava · Deprem · Yangın</Label>
        <H1 accent="tek ekranda canlı.">{"Türkiye'nin nabzı,\n"}</H1>
      </View>

      <Card style={{ padding: 12, gap: 10, paddingTop: 12 }}>
        <Segmented items={LAYERS} value={layer} onChange={(k) => { auto.current = false; setLayer(k); }} />
        <View>
          <Pressable onPress={() => router.push({ pathname: '/harita', params: { layer } })} accessibilityLabel="Haritayı tam ekran aç">
            <TurkeyMap fillFor={fillFor} points={points} labels={labels} glow={layer === 'fire'} ping={layer === 'quake' && latest ? { lat: latest.lat, lon: latest.lon, color: '#ffffff' } : null} />
          </Pressable>
          <ExpandMap layer={layer} bottom />
        </View>
        <T style={{ fontSize: 13, color: C.text2 }}>{caption}</T>
      </Card>

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <LiveDot color={C.accent} size={7} />
          <H2>Şu an Türkiye</H2>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 16 }} style={{ marginHorizontal: -16, paddingLeft: 16 }}>
          <Pulse tone={C.critical} label="En sıcak il" value={hot ? `${hot.name} ${Math.round(hot.temp)}°` : '—'} />
          <Pulse tone={C.weather} label="En soğuk il" value={cold ? `${cold.name} ${Math.round(cold.temp)}°` : '—'} />
          <Pulse tone={C.quake} label="Son deprem" value={latest ? `M${latest.mag.toFixed(1)} ${provinceOf(latest)}` : '—'} sub={latest ? ago(quakeTime(latest)) : ''} />
          <Pulse tone={C.warn} label="24 saatin en büyüğü" value={maxQ ? `M${maxQ.mag.toFixed(1)} ${provinceOf(maxQ)}` : '—'} />
          <Pulse tone={C.fire} label="En çok yangın" value={fireTop[0] ? `${fireTop[0][0]} · ${fireTop[0][1]}` : '—'} />
        </ScrollView>
      </View>

      <View style={{ gap: 10 }}>
        <PanelLink img={ICONS.sunCloud} tone={C.weather} title="Hava Durumu" value={ank ? `Ankara ${Math.round(ank.temp)}° · ${wmoLabel(ank.code)}` : '81 il · 973 ilçe'} onPress={() => router.navigate('/hava')} />
        <PanelLink img={ICONS.globe} tone={C.quake} title="Depremler" value={`Son 24 saatte ${day.length} deprem`} onPress={() => router.navigate('/deprem')} />
        <PanelLink img={ICONS.fire} tone={C.fire} title="Yangınlar" value={fires.data ? `${fires.data.count} ısı noktası` : 'NASA uydu verisi'} onPress={() => router.navigate('/yangin')} />
      </View>

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <H2>Son depremler</H2>
          <Pressable onPress={() => router.navigate('/deprem')}><T style={{ color: C.accent, fontFamily: F.bold, fontSize: 14 }}>Tümü</T></Pressable>
        </View>
        {(quakes.data?.data || []).slice(0, 5).map((q) => (
          <QuakeRow key={q.id} q={q} onPress={() => router.push({ pathname: '/deprem-detay', params: { id: q.id } })} />
        ))}
        {quakes.error && !quakes.data ? <Muted>Deprem verisine şu an ulaşılamıyor; aşağı çekip yenile.</Muted> : null}
      </View>
    </Screen>
  );
}

function Pulse({ tone, label, value, sub }: { tone: string; label: string; value: string; sub?: string }) {
  return (
    <View style={{ width: 168, padding: 14, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, gap: 6 }}>
      <View style={{ width: 20, height: 3, borderRadius: 2, backgroundColor: tone }} />
      <T style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: C.muted, fontFamily: F.bold }}>{label}</T>
      <T style={{ fontFamily: F.bold, fontSize: 16 }} numberOfLines={1}>{value}</T>
      {sub ? <Muted style={{ marginTop: 0 }}>{sub}</Muted> : null}
    </View>
  );
}

function PanelLink({ img, tone, title, value, onPress }: { img: number; tone: string; title: string; value: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
      <Card tone={tone} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 }}>
        <View style={{ width: 52, height: 52, borderRadius: 15, backgroundColor: tone + '1f', alignItems: 'center', justifyContent: 'center' }}>
          <Image source={img} style={{ width: 36, height: 36 }} />
        </View>
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: F.bold, fontSize: 17 }}>{title}</T>
          <T style={{ color: tone, fontSize: 13.5, marginTop: 3, fontFamily: F.medium }} numberOfLines={1}>{value}</T>
        </View>
        <T style={{ color: C.muted, fontSize: 22 }}>›</T>
      </Card>
    </Pressable>
  );
}
