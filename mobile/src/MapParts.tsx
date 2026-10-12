// Harita altı parçaları: özet (en yüksek / en düşük / ortalama) ve renk ölçeği
import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { Legend, Stat } from './layers';
import { C, F } from './theme';
import { T } from './ui';

export function MapStats({ stats, onCity }: { stats: Stat[]; onCity?: (name: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {stats.map((s) => (
        <Pressable key={s.label} disabled={!s.city || !onCity} onPress={() => s.city && onCity && onCity(s.city)}
          style={({ pressed }) => ({ flex: 1, padding: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: C.border, opacity: pressed ? 0.7 : 1 })}>
          <T style={{ fontSize: 9.5, letterSpacing: 0.9, textTransform: 'uppercase', color: C.muted, fontFamily: F.bold }} numberOfLines={1}>{s.label}</T>
          <T style={{ fontFamily: F.bold, fontSize: 13.5, marginTop: 3, color: s.color || C.text }} numberOfLines={1}>{s.value}</T>
        </Pressable>
      ))}
    </View>
  );
}

export function MapLegend({ legend }: { legend: Legend }) {
  return (
    <View style={{ gap: 5 }}>
      <T style={{ fontSize: 12, fontFamily: F.bold }}>
        {legend.title} <T style={{ fontSize: 11, color: C.muted, fontFamily: F.medium }}>{legend.unit}</T>
      </T>
      <LinearGradient colors={legend.colors as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 8, borderRadius: 4 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {legend.ticks.map((t, i) => <T key={i} style={{ fontSize: 10.5, color: C.muted }}>{t}</T>)}
      </View>
    </View>
  );
}
