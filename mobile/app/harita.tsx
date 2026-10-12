// Tam ekran harita: iki parmakla yakınlaştır, sürükle, çift dokun; ile dokununca bilgi.
// Yakınlaşma bitince harita o ölçekte yeniden çizilir (bulanıklaşmaz).
import { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import * as ScreenOrientation from 'expo-screen-orientation';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { getCityWeather, getFires, getQuakes } from '@/src/api';
import { useData } from '@/src/hooks';
import { buildLayer, isWx, Layer, PANELS, WX_VARS, WxVar } from '@/src/layers';
import { MapLegend, MapStats } from '@/src/MapParts';
import { C, F } from '@/src/theme';
import { TurkeyMap } from '@/src/TurkeyMap';
import { Chip, Segmented, T } from '@/src/ui';

const MAX_SCALE = 8;
const MAX_RENDER = 4; // en fazla bu ölçekte yeniden çizilir (bellek)
const LAYER_KEYS: Layer[] = ['temp', 'humidity', 'wind', 'cloud', 'quake', 'fire'];

export default function Harita() {
  const params = useLocalSearchParams<{ layer?: string }>();
  const [layer, setLayer] = useState<Layer>(LAYER_KEYS.includes(params.layer as Layer) ? (params.layer as Layer) : 'temp');
  const [lastWx, setLastWx] = useState<WxVar>(isWx(layer) ? layer : 'temp');
  const wx = useData(getCityWeather, 10 * 60_000);
  const q = useData(() => getQuakes(300), 60_000);
  const f = useData(() => getFires(1), 5 * 60_000);
  const [picked, setPicked] = useState<string | null>(null);
  const [render, setRender] = useState(1); // haritanın çizildiği ölçek
  const [box, setBox] = useState({ w: 0, h: 0 });
  // tam ekran pencerede SafeAreaView iOS'ta boşluğu sıfır ölçebiliyor; telefonun gerçek değerleri kullanılır
  const insets = useSafeAreaInsets();

  // bu ekranda telefon yan çevrilebilsin; çıkınca dikeye dön
  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => {});
    return () => { ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {}); };
  }, []);

  const L = useMemo(() => buildLayer(layer, { wx: wx.data?.byName, quakes: q.data?.data, fires: f.data?.data, now: q.at, active: picked }), [layer, wx.data, q.data, q.at, f.data, picked]);
  const panel = isWx(layer) ? 'wx' : layer;
  const tone = panel === 'wx' ? C.weather : panel === 'quake' ? C.quake : C.fire;

  // harita ekranın tamamını kaplar; görünür alan ekran oranına genişletilir (deniz + komşu ülkeler)
  const mapW = box.w, mapH = box.h;
  const fit = box.w && box.h ? box.w / box.h : undefined;

  /* ---------- hareketler ---------- */
  const scale = useSharedValue(1), tx = useSharedValue(0), ty = useSharedValue(0);
  const s0 = useSharedValue(1), x0 = useSharedValue(0), y0 = useSharedValue(0);
  const bw = useSharedValue(0), bh = useSharedValue(0), mw = useSharedValue(0), mh = useSharedValue(0);
  useEffect(() => { bw.set(box.w); bh.set(box.h); mw.set(mapW); mh.set(mapH); }, [box, mapW, mapH, bw, bh, mw, mh]);

  const clampXY = (s: number, x: number, y: number) => {
    'worklet';
    const maxX = Math.max(0, (mw.value * s - bw.value) / 2);
    const maxY = Math.max(0, (mh.value * s - bh.value) / 2);
    return [Math.min(maxX, Math.max(-maxX, x)), Math.min(maxY, Math.max(-maxY, y))];
  };
  const settle = (s: number) => {
    'worklet';
    scheduleOnRN(setRender, Math.min(MAX_RENDER, Math.max(1, Math.round(s * 2) / 2)));
  };

  const pinch = Gesture.Pinch()
    .onStart(() => { s0.value = scale.value; x0.value = tx.value; y0.value = ty.value; })
    .onUpdate((e) => {
      const s = Math.min(MAX_SCALE, Math.max(1, s0.value * e.scale));
      // parmakların ortası sabit kalsın
      const fx = e.focalX - bw.value / 2, fy = e.focalY - bh.value / 2;
      const [x, y] = clampXY(s, fx - (fx - x0.value) * (s / s0.value), fy - (fy - y0.value) * (s / s0.value));
      scale.value = s; tx.value = x; ty.value = y;
    })
    .onEnd(() => { settle(scale.value); });

  const pan = Gesture.Pan()
    .minDistance(8)
    .onStart(() => { x0.value = tx.value; y0.value = ty.value; })
    .onUpdate((e) => {
      const [x, y] = clampXY(scale.value, x0.value + e.translationX, y0.value + e.translationY);
      tx.value = x; ty.value = y;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (scale.value > 1.5) {
        scale.value = withTiming(1); tx.value = withTiming(0); ty.value = withTiming(0);
        settle(1);
      } else {
        const s = 3;
        const fx = e.x - bw.value / 2, fy = e.y - bh.value / 2;
        const [x, y] = clampXY(s, -fx * (s - 1), -fy * (s - 1));
        scale.value = withTiming(s); tx.value = withTiming(x); ty.value = withTiming(y);
        settle(s);
      }
    });

  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);
  // harita "render" ölçeğinde çizilir; görsel ölçek = scale / render
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value / render }] }));

  const reset = () => {
    scale.set(withTiming(1)); tx.set(withTiming(0)); ty.set(withTiming(0));
    setRender(1);
  };
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox({ w: width, h: height });
    scale.set(1); tx.set(0); ty.set(0); setRender(1);
  };
  const pick = (n: string) => { Haptics.selectionAsync(); setPicked((p) => (p === n ? null : n)); };
  const choosePanel = (k: 'wx' | 'quake' | 'fire') => { setPicked(null); setLayer(k === 'wx' ? lastWx : k); };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 8), paddingLeft: insets.left, paddingRight: insets.right }}>
      <StatusBar hidden />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Segmented tone={tone} items={PANELS} value={panel} onChange={choosePanel} />
        </View>
        {render > 1 ? (
          <Pressable onPress={reset} hitSlop={8} accessibilityLabel="Sığdır" style={{ padding: 6 }}>
            <SymbolView name={{ ios: 'arrow.down.right.and.arrow.up.left', android: 'zoom_out_map', web: 'zoom_out_map' }} size={22} tintColor={C.text2} />
          </Pressable>
        ) : null}
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Kapat" style={{ padding: 4 }}>
          <SymbolView name={{ ios: 'xmark.circle.fill', android: 'close', web: 'close' }} size={28} tintColor={C.muted} />
        </Pressable>
      </View>
      {panel === 'wx' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 14, paddingBottom: 8 }}>
          {WX_VARS.map((v) => <Chip key={v.key} tone={C.weather} label={v.label} on={layer === v.key} onPress={() => { setLayer(v.key); setLastWx(v.key); }} />)}
        </ScrollView>
      ) : null}

      <GestureDetector gesture={gesture}>
        <View style={{ flex: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0c1118' }} onLayout={onLayout}>
          {mapW > 0 ? (
            <Animated.View style={[{ width: mapW * render, height: mapH * render }, style]}>
              <TurkeyMap wide fit={fit} zoom={render} fillFor={L.fillFor} points={L.points} labels={L.labels} ping={L.ping} glow={layer === 'fire'} active={picked} onPressProvince={pick} />
            </Animated.View>
          ) : null}
        </View>
      </GestureDetector>

      <View style={{ paddingHorizontal: 14, paddingTop: 10, gap: 10 }}>
        {picked ? (
          <View style={{ padding: 12, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: tone + '55' }}>
            <T style={{ fontFamily: F.bold, fontSize: 16 }}>{picked}</T>
            <T style={{ color: C.text2, fontSize: 13, marginTop: 3 }}>{L.info(picked)}</T>
          </View>
        ) : (
          <MapStats stats={L.stats} onCity={pick} />
        )}
        {L.legend && box.h > 260 ? <MapLegend legend={L.legend} /> : null}
      </View>
    </View>
  );
}
