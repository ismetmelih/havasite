// Tam ekran harita: telefonun harita motoru (iPhone'da Apple Haritalar, Android'de Google Haritalar).
// Sokak seviyesine kadar yakınlaşma; hava (il renkleri + değerler), deprem (noktalar + aktif faylar),
// yangın (uydu ısı noktaları). Noktaya, fay hattına veya ile dokununca bilgi kartı.
import { useEffect, useMemo, useState } from 'react';
import { Animated, Pressable, ScrollView, View } from 'react-native';
import MapView, { Circle, Marker, Polygon, Polyline, Region } from 'react-native-maps';
import * as ScreenOrientation from 'expo-screen-orientation';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ago, getCityWeather, getFires, getQuakes, quakeTime } from '@/src/api';
import { useData } from '@/src/hooks';
import { buildLayer, isWx, Layer, PANELS, WX_VARS, WxVar } from '@/src/layers';
import { MapLegend, MapStats } from '@/src/MapParts';
import { C, F, magTone } from '@/src/theme';
import { Chip, MagSquare, Segmented, T } from '@/src/ui';
import { colorOf, FAULT_GROUPS, FAULT_NAMES, FAULTS, faultCoords, groupOf, rateLabel, typeLabel } from '@/src/faults';

type LL = { latitude: number; longitude: number };
const LAYER_KEYS: Layer[] = ['temp', 'humidity', 'wind', 'cloud', 'quake', 'fire'];
const TURKEY: Region = { latitude: 39.0, longitude: 35.3, latitudeDelta: 9.5, longitudeDelta: 20 };

// il sınırları (ayrıntılı, enlem-boylam); bir kez hazırlanır
const PROVS = (require('@/src/data/tr-ll.json') as { n: string; p: number[][][] }[]).map((pr) => ({
  n: pr.n,
  polys: pr.p.map((rings) => rings.map((flat) => {
    const out: LL[] = [];
    for (let i = 0; i < flat.length; i += 2) out.push({ latitude: flat[i], longitude: flat[i + 1] });
    return out;
  })),
}));
const FAULT_LINES = FAULTS.map((f, i) => ({ i, coords: faultCoords(f), color: colorOf(f.t) }));

// "rgb(r,g,b)" -> yarı saydam
const alpha = (rgb: string, a: number) => rgb.replace('rgb(', 'rgba(').replace(')', `,${a})`);

export default function Harita() {
  const params = useLocalSearchParams<{ layer?: string }>();
  const [layer, setLayer] = useState<Layer>(LAYER_KEYS.includes(params.layer as Layer) ? (params.layer as Layer) : 'temp');
  const [lastWx, setLastWx] = useState<WxVar>(isWx(layer) ? layer : 'temp');
  const wx = useData(getCityWeather, 10 * 60_000);
  const q = useData(() => getQuakes(300), 60_000);
  const f = useData(() => getFires(1), 5 * 60_000);
  const [picked, setPicked] = useState<string | null>(null);
  const [selQuake, setSelQuake] = useState<string | null>(null);
  const [selFault, setSelFault] = useState<number | null>(null);
  const [showFaults, setShowFaults] = useState(true);
  const [faultHelp, setFaultHelp] = useState(false);
  const [delta, setDelta] = useState(TURKEY.latitudeDelta);
  // özel işaretçiler önce çizilsin, sonra sabitlensin (performans)
  const [track, setTrack] = useState(true);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => {});
    return () => { ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {}); };
  }, []);

  const L = useMemo(() => buildLayer(layer, { wx: wx.data?.byName, quakes: q.data?.data, fires: f.data?.data, now: q.at, active: picked }), [layer, wx.data, q.data, q.at, f.data, picked]);
  const panel = isWx(layer) ? 'wx' : layer;
  const tone = panel === 'wx' ? C.weather : panel === 'quake' ? C.quake : C.fire;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTrack(true);
    const t = setTimeout(() => setTrack(false), 800);
    return () => clearTimeout(t);
  }, [L, selQuake]);

  // yakınlaştıkça daha çok il etiketi göster
  const maxRank = delta > 8 ? 12 : delta > 4.5 ? 30 : delta > 2.5 ? 60 : 1000;
  const labels = useMemo(() => L.labels.filter((l) => l.active || l.rank < maxRank), [L.labels, maxRank]);
  const fireR = Math.max(250, delta * 1400); // metre: uzaktan görünür, yakında küçülür
  const quakes = useMemo(() => (q.data?.data || []).filter((x) => q.at - quakeTime(x) < 864e5), [q.data, q.at]);

  const clearSel = () => { setPicked(null); setSelQuake(null); setSelFault(null); };
  const pick = (n: string) => { Haptics.selectionAsync(); setSelQuake(null); setSelFault(null); setPicked((p) => (p === n ? null : n)); };
  const pickQuake = (id: string) => { Haptics.selectionAsync(); setPicked(null); setSelFault(null); setSelQuake((p) => (p === id ? null : id)); };
  const pickFault = (i: number) => { Haptics.selectionAsync(); setPicked(null); setSelQuake(null); setSelFault((p) => (p === i ? null : i)); };
  const choosePanel = (k: 'wx' | 'quake' | 'fire') => { clearSel(); setLayer(k === 'wx' ? lastWx : k); };
  const sq = selQuake && L.quakeById ? L.quakeById(selQuake) : undefined;
  const sf = selFault != null ? FAULTS[selFault] : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 8), paddingLeft: insets.left, paddingRight: insets.right }}>
      <StatusBar hidden />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Segmented tone={tone} items={PANELS} value={panel} onChange={choosePanel} />
        </View>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Kapat" style={{ padding: 4 }}>
          <SymbolView name={{ ios: 'xmark.circle.fill', android: 'close', web: 'close' }} size={28} tintColor={C.muted} />
        </Pressable>
      </View>
      {panel === 'wx' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 14, paddingBottom: 8 }}>
          {WX_VARS.map((v) => <Chip key={v.key} tone={C.weather} label={v.label} on={layer === v.key} onPress={() => { setLayer(v.key); setLastWx(v.key); }} />)}
        </ScrollView>
      ) : null}
      {panel === 'quake' ? (
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 8 }}>
          <Chip tone="#ff5a4e" label={showFaults ? 'Fay hatları açık' : 'Fay hatları'} on={showFaults} onPress={() => setShowFaults((v) => !v)} />
          <Chip tone={C.text} label="Fay nedir?" on={faultHelp} onPress={() => setFaultHelp((v) => !v)} />
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        <MapView
          style={{ flex: 1 }}
          initialRegion={TURKEY}
          userInterfaceStyle="dark"
          mapType="mutedStandard"
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          showsCompass={false}
          onRegionChangeComplete={(r) => setDelta(r.latitudeDelta)}
        >
          {/* iller: hava katmanında renkli, diğerlerinde ince sınır */}
          {PROVS.map((pr) => pr.polys.map((rings, j) => (
            <Polygon key={`${pr.n}-${j}`} coordinates={rings[0]} holes={rings.slice(1)} tappable onPress={() => pick(pr.n)}
              fillColor={L.fillFor ? alpha(L.fillFor(pr.n) || 'rgb(60,66,76)', picked === pr.n ? 0.85 : 0.55) : 'rgba(0,0,0,0)'}
              strokeColor={picked === pr.n ? '#ffffff' : isWx(layer) ? 'rgba(13,15,19,0.6)' : 'rgba(255,255,255,0.18)'}
              strokeWidth={picked === pr.n ? 2.5 : 0.8} />
          )))}

          {panel === 'quake' && showFaults ? FAULT_LINES.map((fl) => (
            <Polyline key={`f${fl.i}`} coordinates={fl.coords} strokeColor={selFault === fl.i ? '#ffffff' : fl.color} strokeWidth={selFault === fl.i ? 4.5 : 2.2} tappable onPress={() => pickFault(fl.i)} />
          )) : null}
          {panel === 'quake' && showFaults ? FAULT_NAMES.map((n, i) => (
            <Marker key={`fn${i}`} coordinate={{ latitude: n.lat, longitude: n.lon }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={track} tappable={false}>
              <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(13,15,19,0.7)' }}>
                <T style={{ fontSize: 10.5, fontFamily: F.bold, color: '#ff8a80' }}>{n.name}</T>
              </View>
            </Marker>
          )) : null}

          {panel === 'quake' ? quakes.map((x) => {
            const s = 10 + x.mag * 5, c = magTone(x.mag), on = selQuake === x.id;
            return (
              <Marker key={x.id} coordinate={{ latitude: x.lat, longitude: x.lon }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={track} onPress={() => pickQuake(x.id)} zIndex={Math.round(x.mag * 10)}>
                <View style={{ width: s + 8, height: s + 8, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: s, height: s, borderRadius: s, backgroundColor: c + 'aa', borderWidth: on ? 3 : 1.5, borderColor: on ? '#ffffff' : c }} />
                </View>
              </Marker>
            );
          }) : null}

          {panel === 'quake' && quakes[0] ? (
            <Marker key={`latest-${quakes[0].id}`} coordinate={{ latitude: quakes[0].lat, longitude: quakes[0].lon }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges zIndex={2000} onPress={() => pickQuake(quakes[0].id)}>
              <LatestPin when={ago(quakeTime(quakes[0]))} />
            </Marker>
          ) : null}
          {panel === 'fire' ? L.points.map((p, i) => (
            <Circle key={`fi${i}`} center={{ latitude: p.lat, longitude: p.lon }} radius={fireR * (p.r / 9)} fillColor={p.color} strokeColor="rgba(255,90,40,0.6)" strokeWidth={1} />
          )) : null}

          {labels.map((l) => (
            <Marker key={`l${l.lat},${l.lon}`} coordinate={{ latitude: l.lat, longitude: l.lon }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={track} tappable={false}>
              <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, backgroundColor: l.active ? '#ffffff' : 'rgba(13,15,19,0.8)', borderWidth: 1, borderColor: l.active ? '#fff' : 'rgba(255,255,255,0.18)' }}>
                <T style={{ fontSize: 11.5, fontFamily: F.bold, color: l.active ? '#0d0f13' : '#fff' }}>{l.text}</T>
              </View>
            </Marker>
          ))}
        </MapView>
      </View>

      <View style={{ paddingHorizontal: 14, paddingTop: 10, gap: 10 }}>
        {faultHelp && panel === 'quake' && !sf ? (
          <View style={{ padding: 12, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, gap: 8 }}>
            <T style={{ fontFamily: F.bold, fontSize: 15 }}>Fay nedir?</T>
            <T style={{ color: C.text2, fontSize: 12.5, lineHeight: 18 }}>Fay, yer kabuğundaki kırık hattıdır; iki taraf bu hat boyunca kaydığında deprem olur. Renkler fayın nasıl hareket ettiğini gösterir:</T>
            {FAULT_GROUPS.map((g) => (
              <View key={g.key} style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ width: 18, height: 4, borderRadius: 2, backgroundColor: g.color, marginTop: 8 }} />
                <T style={{ flex: 1, color: C.text2, fontSize: 12.5, lineHeight: 18 }}><T style={{ fontFamily: F.bold, color: C.text, fontSize: 12.5 }}>{g.label}: </T>{g.text}</T>
              </View>
            ))}
          </View>
        ) : sf ? (
          <View style={{ padding: 12, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: colorOf(sf.t) + '88', gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 18, height: 4, borderRadius: 2, backgroundColor: colorOf(sf.t) }} />
              <T style={{ fontFamily: F.bold, fontSize: 15 }}>{typeLabel(sf.t)}</T>
            </View>
            <T style={{ color: C.text2, fontSize: 12.5, lineHeight: 18 }}>
              {rateLabel(sf.r) ? `Bu fay parçası ${rateLabel(sf.r)} kayıyor. ` : ''}{FAULT_GROUPS.find((g) => g.key === groupOf(sf.t))!.text}
            </T>
            <T style={{ color: C.muted, fontSize: 11 }}>{"Kaynak: GEM Küresel Aktif Faylar Veritabanı (EMME/SHARE). Resmî fay haritası için MTA'yı esas al."}</T>
          </View>
        ) : sq ? (
          <Pressable onPress={() => router.push({ pathname: '/deprem-detay', params: { id: sq.id } })}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: magTone(sq.mag) + '77', opacity: pressed ? 0.8 : 1 })}>
            <MagSquare mag={sq.mag} size={46} unit={sq.magType || 'MAG'} />
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: F.bold, fontSize: 15 }} numberOfLines={1}>{sq.title}</T>
              <T style={{ color: C.text2, fontSize: 12.5, marginTop: 3 }} numberOfLines={1}>
                {sq.neighborhood ? `${sq.neighborhood} Mah. · ` : ''}{sq.depth} km derinlik · {ago(quakeTime(sq))} · saat {sq.date.slice(11, 16)}
              </T>
            </View>
            <T style={{ color: C.accent, fontFamily: F.bold, fontSize: 13 }}>Ayrıntı ›</T>
          </Pressable>
        ) : picked ? (
          <View style={{ padding: 12, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: tone + '55' }}>
            <T style={{ fontFamily: F.bold, fontSize: 16 }}>{picked}</T>
            <T style={{ color: C.text2, fontSize: 13, marginTop: 3 }}>{L.info(picked)}</T>
          </View>
        ) : (
          <MapStats stats={L.stats} onCity={pick} />
        )}
        {L.legend && !sf && !faultHelp ? <MapLegend legend={L.legend} /> : null}
      </View>
    </View>
  );
}

// en son deprem: genişleyen halkalar + "SON DEPREM" etiketi
function LatestPin({ when }: { when: string }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1800, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  const ring = (d: number) => ({
    position: 'absolute' as const, width: 22, height: 22, borderRadius: 11, borderWidth: 2.5, borderColor: '#fff', top: 49, left: 64,
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [d ? 0.6 : 1, 0] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6 + d, 3 + d] }) }],
  });
  return (
    <View style={{ width: 150, height: 120, alignItems: 'center' }} pointerEvents="none">
      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: '#fff', marginTop: 12 }}>
        <T style={{ fontSize: 10, fontFamily: F.bold, color: '#0d0f13', letterSpacing: 0.6 }}>SON DEPREM · {when}</T>
      </View>
      <Animated.View style={ring(0)} />
      <Animated.View style={ring(0.5)} />
    </View>
  );
}
