// Ortak arayüz parçaları
import { ReactNode, useEffect, useState } from 'react';
import { Animated, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextProps, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, F, magTone } from './theme';
import { ago, dayMonth, hhmm, Quake, quakeTime } from './api';

/* ---------- yazı ---------- */
export function T({ style, ...p }: TextProps) {
  return <Text {...p} style={[{ color: C.text, fontFamily: F.body, fontSize: 15 }, style]} />;
}
export const H1 = ({ children, accent, tone = C.accent }: { children: ReactNode; accent?: string; tone?: string }) => (
  <T style={s.h1}>
    {children}
    {accent ? <T style={[s.h1, { color: tone }]}>{accent}</T> : null}
  </T>
);
export const H2 = ({ children }: { children: ReactNode }) => <T style={s.h2}>{children}</T>;

/* ---------- etiket: kısa renk çizgisi + büyük harf ---------- */
export function Label({ children, tone = C.accent }: { children: ReactNode; tone?: string }) {
  return (
    <View style={s.label}>
      <View style={[s.labelBar, { backgroundColor: tone, shadowColor: tone }]} />
      <T style={s.labelText}>{children}</T>
    </View>
  );
}

/* ---------- kart ---------- */
export function Card({ children, style, tone }: { children: ReactNode; style?: ViewStyle; tone?: string }) {
  return <View style={[s.card, tone ? { borderColor: tone + '40' } : null, style]}>{children}</View>;
}

/* ---------- yanıp sönen canlı nokta ---------- */
export function LiveDot({ color = C.good, size = 8 }: { color?: string; size?: number }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1800, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute', width: size, height: size, borderRadius: size, backgroundColor: color,
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.8] }) }],
        }}
      />
      <View style={{ width: size, height: size, borderRadius: size, backgroundColor: color }} />
    </View>
  );
}

/* ---------- büyüklük karesi ---------- */
export function MagSquare({ mag, size = 54, unit = 'MAG', color }: { mag: number | string; size?: number; unit?: string; color?: string }) {
  const m = typeof mag === 'number' ? mag : 0;
  const tone = color || magTone(m);
  const strong = typeof mag === 'number' && m >= 4;
  return (
    <View style={[s.mag, { width: size, height: size, borderRadius: size * 0.26, backgroundColor: strong ? tone : tone + '2e', borderColor: strong ? tone : tone + '73' }]}>
      <T style={{ fontFamily: F.display, fontSize: size * 0.34, color: strong ? '#fff' : tone, lineHeight: size * 0.38 }}>{typeof mag === 'number' ? mag.toFixed(1) : mag}</T>
      <T style={{ fontFamily: F.bold, fontSize: size * 0.14, letterSpacing: 1, color: strong ? '#fff' : tone, opacity: 0.8 }}>{unit}</T>
    </View>
  );
}

/* ---------- sekme seçici ---------- */
export function Segmented<K extends string>({ items, value, onChange, tone = C.accent }: { items: { key: K; label: string }[]; value: K; onChange: (k: K) => void; tone?: string }) {
  return (
    <View style={s.seg}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Pressable key={it.key} onPress={() => { Haptics.selectionAsync(); onChange(it.key); }} style={[s.segItem, on && { backgroundColor: C.surface2 }]}>
            <T style={{ fontFamily: on ? F.bold : F.medium, fontSize: 13, color: on ? tone : C.text2 }}>{it.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------- küçük seçim çipi ---------- */
export function Chip({ label, on, onPress, tone = C.accent }: { label: string; on: boolean; onPress: () => void; tone?: string }) {
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }} style={[s.chip, on && { backgroundColor: tone + '22', borderColor: tone + '88' }]}>
      <T style={{ fontSize: 13, fontFamily: on ? F.bold : F.medium, color: on ? tone : C.text2 }}>{label}</T>
    </Pressable>
  );
}

/* ---------- deprem satırı (site ile aynı kart) ---------- */
export function QuakeRow({ q, onPress, distKm }: { q: Quake; onPress?: () => void; distKm?: number | null }) {
  const t = quakeTime(q);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.qrow, pressed && { opacity: 0.7 }]}>
      <MagSquare mag={q.mag} size={50} unit={q.magType || 'MAG'} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T style={{ fontFamily: F.bold, fontSize: 15, flexShrink: 1 }} numberOfLines={1}>{q.title}</T>
          {q.updated ? <T style={s.upd}>güncellendi</T> : null}
        </View>
        <T style={s.meta} numberOfLines={1}>
          {q.neighborhood ? `${q.neighborhood} Mah. · ` : ''}{q.depth} km · {ago(t)}{distKm != null ? ` · ${Math.round(distKm)} km uzakta` : ''}
        </T>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <T style={{ fontFamily: F.bold, fontSize: 15 }}>{hhmm(t)}</T>
        <T style={[s.meta, { marginTop: 2 }]}>{dayMonth(t)}</T>
      </View>
    </Pressable>
  );
}

/* ---------- ekran iskeleti: başlık + ACİL + aşağı çekip yenileme ---------- */
export function Screen({ title, subtitle, children, refreshing, onRefresh, tone = C.accent }: { title: string; subtitle?: ReactNode; children: ReactNode; refreshing?: boolean; onRefresh?: () => void; tone?: string }) {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <T style={s.headTitle}>{title}</T>
          {subtitle ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>{subtitle}</View> : null}
        </View>
        <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/acil'); }} style={s.sos} accessibilityLabel="Acil durum">
          <SymbolView name={{ ios: 'light.beacon.max.fill', android: 'emergency', web: 'emergency' }} size={18} tintColor="#fff" />
          <T style={{ fontFamily: F.bold, color: '#fff', fontSize: 13 }}>ACİL</T>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 16 }}
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={tone} /> : undefined}
        showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------- düğme ---------- */
export function Btn({ label, onPress, ghost, tone = C.accent }: { label: string; onPress: () => void; ghost?: boolean; tone?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14, backgroundColor: ghost ? 'transparent' : tone, borderWidth: 1, borderColor: ghost ? C.borderStrong : tone, opacity: pressed ? 0.8 : 1 })}>
      <T style={{ fontFamily: F.bold, color: ghost ? C.text : '#0d0f13' }}>{label}</T>
    </Pressable>
  );
}

export const Muted = ({ children, style }: { children: ReactNode; style?: object }) => <T style={[s.meta, style]}>{children}</T>;

export const s = StyleSheet.create({
  h1: { fontFamily: F.display, fontSize: 34, lineHeight: 36, letterSpacing: -0.8 },
  h2: { fontFamily: F.display, fontSize: 22, letterSpacing: -0.4 },
  label: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: C.borderStrong, backgroundColor: C.surface },
  labelBar: { width: 12, height: 3, borderRadius: 2, shadowOpacity: 0.9, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } },
  labelText: { fontFamily: F.bold, fontSize: 10.5, letterSpacing: 1.4, textTransform: 'uppercase', color: C.text2 },
  card: { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 16 },
  mag: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  seg: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: C.border },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9 },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  qrow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 11, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  meta: { color: C.muted, fontSize: 12.5, marginTop: 4 },
  upd: { fontSize: 10, fontFamily: F.bold, color: C.warn, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, borderWidth: 1, borderColor: C.warn + '66', backgroundColor: C.warn + '22', overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10, gap: 12 },
  headTitle: { fontFamily: F.display, fontSize: 26, letterSpacing: -0.5, color: C.text },
  sos: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.critical, paddingVertical: 9, paddingHorizontal: 13, borderRadius: 999, shadowColor: C.critical, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
});
