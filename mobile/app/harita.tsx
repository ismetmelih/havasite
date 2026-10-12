// Tam ekran harita: iki parmakla yakınlaştır, sürükle, çift dokun; ile dokununca bilgi
import { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import * as ScreenOrientation from 'expo-screen-orientation';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { getCityWeather, getFires, getQuakes } from '@/src/api';
import { useData } from '@/src/hooks';
import { buildLayer, Layer, LAYERS } from '@/src/layers';
import { C, F } from '@/src/theme';
import { TurkeyMap } from '@/src/TurkeyMap';
import { Segmented, T } from '@/src/ui';

const ASPECT = 2.33; // harita genişlik / yükseklik
const MAX_SCALE = 8;
const TONE: Record<Layer, string> = { temp: C.weather, quake: C.quake, fire: C.fire };

export default function Harita() {
  const params = useLocalSearchParams<{ layer?: Layer }>();
  const [layer, setLayer] = useState<Layer>(params.layer && ['temp', 'quake', 'fire'].includes(params.layer) ? params.layer : 'temp');
  const wx = useData(getCityWeather, 10 * 60_000);
  const q = useData(() => getQuakes(300), 60_000);
  const f = useData(() => getFires(1), 5 * 60_000);
  const [picked, setPicked] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [box, setBox] = useState({ w: 0, h: 0 });
  // tam ekran pencerede SafeAreaView iOS'ta boşluğu sıfır ölçebiliyor; telefonun gerçek değerleri kullanılır
  const insets = useSafeAreaInsets();

  // bu ekranda telefon yan çevrilebilsin; çıkınca dikeye dön
  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => {});
    return () => { ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {}); };
  }, []);

  const L = useMemo(() => buildLayer(layer, { wx: wx.data?.byName, quakes: q.data?.data, fires: f.data?.data, now: q.at }), [layer, wx.data, q.data, q.at, f.data]);

  // haritanın ekrandaki taban boyutu: kutuya sığdır
  const mapW = box.w && box.h ? Math.min(box.w, box.h * ASPECT) : 0;
  const mapH = mapW / ASPECT;

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

  const pinch = Gesture.Pinch()
    .onStart(() => { s0.value = scale.value; x0.value = tx.value; y0.value = ty.value; })
    .onUpdate((e) => {
      const s = Math.min(MAX_SCALE, Math.max(1, s0.value * e.scale));
      // parmakların ortası sabit kalsın
      const fx = e.focalX - bw.value / 2, fy = e.focalY - bh.value / 2;
      const [x, y] = clampXY(s, fx - (fx - x0.value) * (s / s0.value), fy - (fy - y0.value) * (s / s0.value));
      scale.value = s; tx.value = x; ty.value = y;
    })
    .onEnd(() => { scheduleOnRN(setZoom, scale.value); });

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
        scheduleOnRN(setZoom, 1);
      } else {
        const s = 3;
        const fx = e.x - bw.value / 2, fy = e.y - bh.value / 2;
        const [x, y] = clampXY(s, -fx * (s - 1), -fy * (s - 1));
        scale.value = withTiming(s); tx.value = withTiming(x); ty.value = withTiming(y);
        scheduleOnRN(setZoom, s);
      }
    });

  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }] }));

  const reset = () => {
    scale.set(withTiming(1)); tx.set(withTiming(0)); ty.set(withTiming(0));
    setZoom(1);
  };
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox({ w: width, h: height });
    scale.set(1); tx.set(0); ty.set(0); setZoom(1);
  };
  const pick = (n: string) => { Haptics.selectionAsync(); setPicked((p) => (p === n ? null : n)); };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 8), paddingLeft: insets.left, paddingRight: insets.right }}>
      <StatusBar hidden />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Segmented tone={TONE[layer]} items={LAYERS} value={layer} onChange={(k) => { setLayer(k); setPicked(null); }} />
        </View>
        {zoom > 1.05 ? (
          <Pressable onPress={reset} hitSlop={8} accessibilityLabel="Sığdır" style={{ padding: 6 }}>
            <SymbolView name={{ ios: 'arrow.down.right.and.arrow.up.left', android: 'zoom_out_map', web: 'zoom_out_map' }} size={22} tintColor={C.text2} />
          </Pressable>
        ) : null}
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Kapat" style={{ padding: 4 }}>
          <SymbolView name={{ ios: 'xmark.circle.fill', android: 'close', web: 'close' }} size={28} tintColor={C.muted} />
        </Pressable>
      </View>

      <GestureDetector gesture={gesture}>
        <View style={{ flex: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }} onLayout={onLayout}>
          {mapW > 0 ? (
            <Animated.View style={[{ width: mapW, height: mapH }, style]}>
              <TurkeyMap fillFor={L.fillFor} points={L.points} ping={L.ping} glow={layer === 'fire'} active={picked} onPressProvince={pick} pointScale={Math.sqrt(zoom)} />
            </Animated.View>
          ) : null}
        </View>
      </GestureDetector>

      <View style={{ paddingHorizontal: 14, paddingBottom: 8, minHeight: 64, justifyContent: 'center' }}>
        {picked ? (
          <View style={{ padding: 12, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: TONE[layer] + '55' }}>
            <T style={{ fontFamily: F.bold, fontSize: 16 }}>{picked}</T>
            <T style={{ color: C.text2, fontSize: 13, marginTop: 3 }}>{L.info(picked)}</T>
          </View>
        ) : (
          <T style={{ color: C.muted, fontSize: 12.5, textAlign: 'center' }}>
            İki parmakla yakınlaştır · sürükle · çift dokun · ile dokun{box.w < box.h ? ' · daha büyük görmek için telefonu yan çevir' : ''}
          </T>
        )}
      </View>
    </View>
  );
}
