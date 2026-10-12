import { useMemo } from 'react';
import { Linking, View } from 'react-native';
import { fireTime, ago, getCityWeather, getFires } from '@/src/api';
import { useData } from '@/src/hooks';
import { C, F, fireHeat } from '@/src/theme';
import { TurkeyMap } from '@/src/TurkeyMap';
import { Btn, Card, ExpandMap, H2, LiveDot, Muted, Screen, T } from '@/src/ui';
import { TR_CITIES } from '@/src/data/cities';

// Ege ve Akdeniz'de yangın riskinin hesaplandığı iller (site ile aynı)
const RISK_CITIES = ['Muğla', 'Antalya', 'İzmir', 'Aydın', 'Çanakkale', 'Balıkesir', 'Denizli', 'Manisa', 'Mersin', 'Adana'];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const score = (t: number, h: number, w: number) => clamp01((t - 15) / 25) * 0.4 + clamp01((60 - h) / 60) * 0.4 + clamp01(w / 40) * 0.2;
const riskLabel = (s: number) => (s < 0.35 ? { l: 'Düşük', c: C.good } : s < 0.55 ? { l: 'Orta', c: C.warn } : s < 0.75 ? { l: 'Yüksek', c: '#fb923c' } : { l: 'Çok yüksek', c: C.critical });

function nearestCity(lat: number, lon: number) {
  let best = TR_CITIES[0], bd = Infinity;
  for (const c of TR_CITIES) {
    const d = (c.lat - lat) ** 2 + ((c.lon - lon) * 0.78) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  return best.name;
}

export default function Yangin() {
  const f = useData(() => getFires(1), 5 * 60_000);
  const wx = useData(getCityWeather, 20 * 60_000);
  const fires = useMemo(() => f.data?.data || [], [f.data]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    fires.forEach((x) => { const n = nearestCity(x.lat, x.lon); m.set(n, (m.get(n) || 0) + 1); });
    return m;
  }, [fires]);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const peak = Math.max(1, ...counts.values());
  const strongest = fires.length ? fires.reduce((a, b) => (b.frp > a.frp ? b : a)) : null;
  const newest = fires.length ? Math.max(...fires.map(fireTime)) : null;

  const risk = useMemo(() => {
    if (!wx.data) return null;
    const rows = RISK_CITIES.map((n) => wx.data!.byName.get(n)).filter(Boolean).map((c) => ({ name: c!.name, s: score(c!.temp, c!.humidity, c!.wind), t: c!.temp, h: c!.humidity, w: c!.wind }));
    if (!rows.length) return null;
    return { avg: rows.reduce((a, r) => a + r.s, 0) / rows.length, rows: rows.sort((a, b) => b.s - a.s) };
  }, [wx.data]);
  const rl = risk ? riskLabel(risk.avg) : null;

  return (
    <Screen title="Yangın" tone={C.fire} refreshing={f.refreshing} onRefresh={() => { f.refresh(); wx.refresh(); }}
      subtitle={<><LiveDot size={7} color={C.fire} /><Muted style={{ marginTop: 0 }}>NASA FIRMS · {newest ? `son uydu geçişi ${ago(newest)}` : 'yükleniyor'}</Muted></>}>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Card style={{ flex: 1.2, padding: 14 }}>
          <T style={{ fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', color: C.muted, fontFamily: F.bold }}>Son 24 saat</T>
          <T style={{ fontFamily: F.display, fontSize: 40, color: C.fire, lineHeight: 44 }}>{f.data ? f.data.count : '—'}</T>
          <Muted style={{ marginTop: 0 }}>ısı noktası</Muted>
        </Card>
        <Card style={{ flex: 1, padding: 14, gap: 4 }}>
          <T style={{ fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', color: C.muted, fontFamily: F.bold }}>Yangın riski</T>
          <T style={{ fontFamily: F.display, fontSize: 24, color: rl?.c || C.text }}>{rl ? rl.l : '—'}</T>
          <Muted style={{ marginTop: 0 }}>Ege ve Akdeniz</Muted>
        </Card>
      </View>

      <Card style={{ padding: 12, gap: 8 }}>
        <ExpandMap layer="fire" />
        <TurkeyMap
          glow
          fillFor={(n) => { const c = counts.get(n); return c ? fireHeat(Math.sqrt(c / peak)) : null; }}
          points={[...fires].sort((a, b) => a.frp - b.frp).slice(-1200).map((x) => ({ lat: x.lat, lon: x.lon, r: x.frp >= 45 ? 16 : x.frp >= 15 ? 12 : 9, color: x.frp >= 15 ? '#fff1b8' : '#ffc061', opacity: 1 }))}
        />
        <Muted style={{ marginTop: 0 }}>İller tespit sayısına göre ısınır; büyük sarı noktalar daha güçlü ısı kaynakları.{strongest ? ` En güçlüsü ${Math.round(strongest.frp)} MW (${nearestCity(strongest.lat, strongest.lon)}).` : ''}</Muted>
      </Card>

      <Btn label="🔥  Yangın görürsen: 177'yi ara" tone={C.fire} onPress={() => Linking.openURL('tel:177')} />

      <Card style={{ gap: 10 }}>
        <H2>En çok tespit</H2>
        {top.map(([name, n]) => (
          <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <T style={{ width: 96 }} numberOfLines={1}>{name}</T>
            <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.06)' }}>
              <View style={{ width: `${(n / peak) * 100}%`, height: 8, borderRadius: 4, backgroundColor: C.fire }} />
            </View>
            <T style={{ width: 34, textAlign: 'right', fontFamily: F.bold }}>{n}</T>
          </View>
        ))}
        {!top.length ? <Muted>{f.error ? 'Uydu verisine ulaşılamadı.' : 'Tespit yok.'}</Muted> : null}
      </Card>

      {risk ? (
        <Card style={{ gap: 10 }}>
          <H2>İl il yangın riski</H2>
          <Muted style={{ marginTop: -4 }}>Sıcaklık, nem ve rüzgârdan hesaplanan tahmini gösterge; resmî değildir.</Muted>
          {risk.rows.map((r) => {
            const x = riskLabel(r.s);
            return (
              <View key={r.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: x.c }} />
                <T style={{ flex: 1 }}>{r.name}</T>
                <Muted style={{ marginTop: 0 }}>{Math.round(r.t)}° · %{Math.round(r.h)} · {Math.round(r.w)} km/s</Muted>
                <T style={{ width: 74, textAlign: 'right', fontFamily: F.bold, color: x.c }}>{x.l}</T>
              </View>
            );
          })}
        </Card>
      ) : null}
    </Screen>
  );
}
