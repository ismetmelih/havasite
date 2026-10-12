import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { getCityWeather, getForecast } from '@/src/api';
import { Place, Prefs, useData } from '@/src/hooks';
import { C, F, tempColor } from '@/src/theme';
import { TurkeyMap } from '@/src/TurkeyMap';
import { Card, H2, Muted, Screen, T } from '@/src/ui';
import { TR_CITIES } from '@/src/data/cities';
import { ICONS, wmoIcon, wmoLabel } from '@/src/wmo';

const DEFAULT: Place = { name: 'Ankara', lat: 39.9208, lon: 32.8541 };
const GUN = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const YON = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'];
const hm = (iso: string) => iso.slice(11, 16);

export default function Hava() {
  const [place, setPlace] = useState<Place>(DEFAULT);
  // şehir seçicisinden dönünce seçili şehri yeniden oku
  useFocusEffect(useCallback(() => { Prefs.getPlace().then((p) => p && setPlace((old) => (old.name === p.name && old.lat === p.lat ? old : p))); }, []));
  const fc = useData(() => getForecast(place.lat, place.lon), 10 * 60_000, [place.lat, place.lon]);
  const wx = useData(getCityWeather, 10 * 60_000);

  const f = fc.data;
  const cur = f?.current;
  const hours = (() => {
    if (!f) return [];
    const now = new Date(f.current.time).getTime();
    const i0 = f.hourly.time.findIndex((t) => new Date(t).getTime() > now);
    return f.hourly.time.slice(i0, i0 + 23).map((t, k) => ({ t, temp: f.hourly.temperature_2m[i0 + k], code: f.hourly.weather_code[i0 + k], pop: f.hourly.precipitation_probability[i0 + k], day: f.hourly.is_day[i0 + k] === 1 }));
  })();
  const days = f ? f.daily.time.map((t, i) => ({ t, code: f.daily.weather_code[i], hi: f.daily.temperature_2m_max[i], lo: f.daily.temperature_2m_min[i], pop: f.daily.precipitation_probability_max[i] })) : [];
  const allLo = days.length ? Math.min(...days.map((d) => d.lo)) : 0;
  const allHi = days.length ? Math.max(...days.map((d) => d.hi)) : 1;
  const tone = cur ? tempColor(cur.temperature_2m) : C.weather;

  const pickProvince = async (name: string) => {
    const c = TR_CITIES.find((x) => x.name === name);
    if (!c) return;
    const p = { name: c.name, lat: c.lat, lon: c.lon };
    await Prefs.setPlace(p);
    setPlace(p);
  };

  return (
    <Screen title="Hava" tone={C.weather} refreshing={fc.refreshing} onRefresh={() => { fc.refresh(); wx.refresh(); }}
      subtitle={<Pressable onPress={() => router.push('/sehir')} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <SymbolView name={{ ios: 'location.fill', android: 'location_on', web: 'location_on' }} size={12} tintColor={C.weather} />
        <T style={{ color: C.weather, fontFamily: F.bold, fontSize: 14 }}>{place.name}</T>
        <T style={{ color: C.muted, fontSize: 13 }}>· değiştir</T>
      </Pressable>}>

      {/* anlık durum */}
      <View style={{ borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: C.border }}>
        <LinearGradient colors={[tone.replace('rgb(', 'rgba(').replace(')', ',0.28)'), C.surface, C.surface]} locations={[0, 0.55, 1]} style={{ padding: 20 }}>
          {cur ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <T style={{ fontFamily: F.bold, fontSize: 18 }}>{place.name}</T>
                <T style={{ color: C.text2, marginTop: 2 }}>{wmoLabel(cur.weather_code)}</T>
                <T style={{ fontFamily: F.display, fontSize: 86, lineHeight: 92, letterSpacing: -3, marginTop: 6 }}>{Math.round(cur.temperature_2m)}°</T>
                <T style={{ color: C.text2 }}>
                  <T style={{ fontFamily: F.bold }}>{Math.round(days[0]?.hi ?? 0)}°</T> / {Math.round(days[0]?.lo ?? 0)}° · Hissedilen <T style={{ fontFamily: F.bold }}>{Math.round(cur.apparent_temperature)}°</T>
                </T>
              </View>
              <Image source={wmoIcon(cur.weather_code, cur.is_day === 1)} style={{ width: 130, height: 130 }} />
            </View>
          ) : (
            <T style={{ color: C.muted, paddingVertical: 60, textAlign: 'center' }}>{fc.error ? 'Hava verisine ulaşılamadı; aşağı çekip yenile.' : 'Yükleniyor…'}</T>
          )}
        </LinearGradient>
      </View>

      {/* saatlik */}
      {hours.length ? (
        <Card style={{ paddingHorizontal: 0, paddingVertical: 14 }}>
          <T style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: C.muted, fontFamily: F.bold, marginLeft: 16, marginBottom: 10 }}>Önümüzdeki saatler</T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}>
            {cur && <Hour label="Şimdi" temp={cur.temperature_2m} code={cur.weather_code} day={cur.is_day === 1} now />}
            {hours.map((h) => <Hour key={h.t} label={hm(h.t)} temp={h.temp} code={h.code} day={h.day} pop={h.pop} />)}
          </ScrollView>
        </Card>
      ) : null}

      {/* 10 günlük */}
      {days.length ? (
        <Card style={{ gap: 4 }}>
          <T style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: C.muted, fontFamily: F.bold, marginBottom: 6 }}>10 günlük tahmin</T>
          {days.map((d, i) => {
            const dt = new Date(d.t + 'T12:00:00');
            const a = ((d.lo - allLo) / (allHi - allLo || 1)) * 100, b = ((d.hi - allLo) / (allHi - allLo || 1)) * 100;
            return (
              <View key={d.t} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderTopWidth: i ? 1 : 0, borderTopColor: C.border }}>
                <T style={{ width: 46, fontFamily: F.bold }}>{i === 0 ? 'Bugün' : GUN[dt.getDay()]}</T>
                <Image source={wmoIcon(d.code)} style={{ width: 28, height: 28 }} />
                <T style={{ width: 38, fontSize: 12, color: C.weather }}>{d.pop >= 20 ? `%${d.pop}` : ''}</T>
                <T style={{ width: 30, textAlign: 'right', color: C.muted }}>{Math.round(d.lo)}°</T>
                <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.06)' }}>
                  <LinearGradient start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} colors={[tempColor(d.lo), tempColor(d.hi)]} style={{ position: 'absolute', left: `${a}%`, width: `${Math.max(4, b - a)}%`, height: 6, borderRadius: 3 }} />
                </View>
                <T style={{ width: 30, fontFamily: F.bold }}>{Math.round(d.hi)}°</T>
              </View>
            );
          })}
        </Card>
      ) : null}

      {/* ayrıntılar */}
      {f && cur ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Detail img={ICONS.wind} label="Rüzgâr" value={`${Math.round(cur.wind_speed_10m)} km/s`} sub={`${YON[Math.round(cur.wind_direction_10m / 45) % 8]} yönünden`} />
          <Detail img={ICONS.droplet} label="Nem" value={`%${cur.relative_humidity_2m}`} sub={`Yağış ${f.daily.precipitation_sum[0]} mm`} />
          <Detail img={ICONS.sun} label="UV indeksi" value={`${Math.round(f.daily.uv_index_max[0])}`} sub={f.daily.uv_index_max[0] < 3 ? 'Düşük' : f.daily.uv_index_max[0] < 6 ? 'Orta' : 'Yüksek'} />
          <Detail img={ICONS.sunrise} label="Gün doğumu" value={hm(f.daily.sunrise[0])} sub={`Batım ${hm(f.daily.sunset[0])}`} />
        </View>
      ) : null}

      {/* 81 il haritası */}
      <Card style={{ padding: 12, gap: 8 }}>
        <H2>Türkiye geneli</H2>
        <Muted style={{ marginTop: 0 }}>Bir ile dokun, o ilin havası açılsın.</Muted>
        <TurkeyMap active={place.name} onPressProvince={pickProvince} fillFor={wx.data ? (n) => { const c = wx.data!.byName.get(n); return c ? tempColor(c.temp) : null; } : undefined} />
      </Card>
      <Muted style={{ textAlign: 'center' }}>Kaynak: Open-Meteo · resmî uyarılar için MGM</Muted>
    </Screen>
  );
}

function Hour({ label, temp, code, day, pop, now }: { label: string; temp: number; code: number; day: boolean; pop?: number; now?: boolean }) {
  return (
    <View style={{ width: 62, alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: 14, backgroundColor: now ? C.weather + '22' : 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: now ? C.weather + '66' : 'transparent' }}>
      <T style={{ fontSize: 12, color: now ? C.text : C.muted, fontFamily: now ? F.bold : F.medium }}>{label}</T>
      <Image source={wmoIcon(code, day)} style={{ width: 30, height: 30 }} />
      <T style={{ fontFamily: F.bold, fontSize: 16 }}>{Math.round(temp)}°</T>
      <T style={{ fontSize: 11, color: C.weather, minHeight: 14 }}>{pop != null && pop >= 20 ? `%${pop}` : ''}</T>
    </View>
  );
}

function Detail({ img, label, value, sub }: { img: number; label: string; value: string; sub: string }) {
  return (
    <Card style={{ width: '48.5%', gap: 6, padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Image source={img} style={{ width: 22, height: 22 }} />
        <T style={{ fontSize: 12, color: C.muted, fontFamily: F.bold, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</T>
      </View>
      <T style={{ fontFamily: F.display, fontSize: 26 }}>{value}</T>
      <Muted style={{ marginTop: 0 }}>{sub}</Muted>
    </Card>
  );
}
