import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ago, getQuakes, haversineKm, provinceOf, quakeTime } from '@/src/api';
import { useData } from '@/src/hooks';
import { C, F, magTone, quakeHeat } from '@/src/theme';
import { TurkeyMap } from '@/src/TurkeyMap';
import { Card, Chip, H2, LiveDot, Muted, QuakeRow, Screen, Segmented, T } from '@/src/ui';

type View_ = 'liste' | 'harita';
const MAGS = [{ v: 0, l: 'Tümü' }, { v: 2, l: 'M2+' }, { v: 3, l: 'M3+' }, { v: 4, l: 'M4+' }];
const HOURS = [{ v: 1, l: '1 saat' }, { v: 24, l: '24 saat' }, { v: 72, l: '3 gün' }];

export default function Deprem() {
  const q = useData(() => getQuakes(300), 25_000);
  const [view, setView] = useState<View_>('liste');
  const [minMag, setMinMag] = useState(0);
  const [hours, setHours] = useState(24);
  const [me, setMe] = useState<{ lat: number; lon: number } | null>(null);

  const list = useMemo(() => {
    const cut = q.at - hours * 3600e3;
    return (q.data?.data || []).filter((x) => x.mag >= minMag && quakeTime(x) >= cut).sort((a, b) => quakeTime(b) - quakeTime(a));
  }, [q.data, q.at, minMag, hours]);
  const max = list.length ? list.reduce((a, b) => (b.mag > a.mag ? b : a)) : null;
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    list.forEach((x) => { const p = provinceOf(x); m.set(p, (m.get(p) || 0) + 1); });
    return m;
  }, [list]);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const peak = Math.max(1, ...counts.values());

  async function locate() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setMe({ lat: pos.coords.latitude, lon: pos.coords.longitude });
  }

  return (
    <Screen title="Deprem" tone={C.quake} refreshing={q.refreshing} onRefresh={q.refresh}
      subtitle={<><LiveDot size={7} color={C.quake} /><Muted style={{ marginTop: 0 }}>{`${q.data?.source === 'emsc' ? 'EMSC' : 'AFAD'} · 25 sn'de bir yenilenir`}</Muted></>}>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stat label="Deprem" value={String(list.length)} />
        <Stat label="En büyük" value={max ? `M${max.mag.toFixed(1)}` : '—'} color={max ? magTone(max.mag) : undefined} sub={max ? provinceOf(max) : ''} />
        <Stat label="Son" value={list[0] ? ago(quakeTime(list[0])).replace(' önce', '') : '—'} sub={list[0] ? provinceOf(list[0]) : ''} />
      </View>

      <Segmented tone={C.quake} items={[{ key: 'liste', label: 'Liste' }, { key: 'harita', label: 'Harita' }]} value={view} onChange={setView} />

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {MAGS.map((m) => <Chip key={m.v} tone={C.quake} label={m.l} on={minMag === m.v} onPress={() => setMinMag(m.v)} />)}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {HOURS.map((h) => <Chip key={h.v} tone={C.quake} label={h.l} on={hours === h.v} onPress={() => setHours(h.v)} />)}
          <Pressable onPress={locate} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
            <SymbolView name={{ ios: 'location.fill', android: 'my_location', web: 'my_location' }} size={13} tintColor={me ? C.good : C.text2} />
            <T style={{ fontSize: 13, color: me ? C.good : C.text2, fontFamily: F.medium }}>{me ? 'Uzaklık açık' : 'Uzaklığımı göster'}</T>
          </Pressable>
        </View>
      </View>

      {view === 'harita' ? (
        <>
          <Card style={{ padding: 12, gap: 8 }}>
            <TurkeyMap
              fillFor={(n) => { const c = counts.get(n); return c ? quakeHeat(Math.sqrt(c / peak)) : null; }}
              points={[...list].sort((a, b) => a.mag - b.mag).map((x) => ({ lat: x.lat, lon: x.lon, r: 5 + x.mag * 3.4, color: magTone(x.mag), opacity: 0.55, stroke: magTone(x.mag) }))}
              ping={list[0] ? { lat: list[0].lat, lon: list[0].lon, color: '#fff' } : null}
            />
            <Muted style={{ marginTop: 0 }}>İller deprem sayısına göre renklenir; beyaz halka en son deprem. Kaynak: AFAD Deprem Dairesi Başkanlığı.</Muted>
          </Card>
          <Card style={{ gap: 10 }}>
            <H2>En hareketli iller</H2>
            {top.map(([name, n]) => (
              <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <T style={{ width: 96 }} numberOfLines={1}>{name}</T>
                <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.06)' }}>
                  <View style={{ width: `${(n / peak) * 100}%`, height: 8, borderRadius: 4, backgroundColor: C.quake }} />
                </View>
                <T style={{ width: 28, textAlign: 'right', fontFamily: F.bold }}>{n}</T>
              </View>
            ))}
            {!top.length ? <Muted>Bu aralıkta deprem yok.</Muted> : null}
          </Card>
        </>
      ) : (
        <View style={{ gap: 8 }}>
          {list.slice(0, 150).map((x) => (
            <QuakeRow key={x.id} q={x} distKm={me ? haversineKm(me, x) : null} onPress={() => router.push({ pathname: '/deprem-detay', params: { id: x.id } })} />
          ))}
          {!list.length && !q.loading ? <Muted style={{ textAlign: 'center', marginTop: 20 }}>Filtreye uyan deprem yok.</Muted> : null}
          {q.error && !q.data ? <Muted style={{ textAlign: 'center' }}>Deprem verisine ulaşılamadı; aşağı çekip yenile.</Muted> : null}
        </View>
      )}
    </Screen>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Card style={{ flex: 1, padding: 12, gap: 2 }}>
      <T style={{ fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', color: C.muted, fontFamily: F.bold }}>{label}</T>
      <T style={{ fontFamily: F.display, fontSize: 24, color: color || C.text }}>{value}</T>
      {sub ? <Muted style={{ marginTop: 0, fontSize: 11.5 }} >{sub}</Muted> : null}
    </Card>
  );
}
