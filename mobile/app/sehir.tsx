import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TR_CITIES } from '@/src/data/cities';
import { Prefs } from '@/src/hooks';
import { C, F } from '@/src/theme';
import { Muted, T } from '@/src/ui';

// Türkçe karakterleri sadeleştirerek arama (İstanbul = istanbul = Istanbul)
const fold = (s: string) => s.toLocaleLowerCase('tr').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');

export default function Sehir() {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const list = useMemo(() => (q ? TR_CITIES.filter((c) => fold(c.name).includes(fold(q))) : TR_CITIES), [q]);

  async function choose(name: string, lat: number, lon: number) {
    await Prefs.setPlace({ name, lat, lon });
    router.back();
  }
  async function useGps() {
    setErr('');
    setBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setErr('Konum izni verilmedi. Listeden bir il seçebilirsin.'); return; }
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      let name = 'Konumum';
      try {
        const [r] = await Location.reverseGeocodeAsync(p.coords);
        name = r?.subregion || r?.district || r?.city || r?.region || name;
      } catch {}
      await choose(name, p.coords.latitude, p.coords.longitude);
    } catch {
      setErr('Konum alınamadı.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ padding: 18, gap: 12 }}>
        <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: C.borderStrong }} />
        <T style={{ fontFamily: F.display, fontSize: 26 }}>Şehir seç</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}>
          <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={16} tintColor={C.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="İl ara (ör. Muğla)" placeholderTextColor={C.muted} autoFocus autoCorrect={false}
            style={{ flex: 1, color: C.text, fontFamily: F.medium, fontSize: 16, paddingVertical: 13 }} />
        </View>
        <Pressable onPress={useGps} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, backgroundColor: C.weather + '1f', borderWidth: 1, borderColor: C.weather + '55', opacity: pressed ? 0.8 : 1 })}>
          {busy ? <ActivityIndicator color={C.weather} /> : <SymbolView name={{ ios: 'location.fill', android: 'my_location', web: 'my_location' }} size={18} tintColor={C.weather} />}
          <T style={{ fontFamily: F.bold, color: C.weather }}>Konumumu kullan</T>
        </Pressable>
        {err ? <Muted style={{ color: C.warn }}>{err}</Muted> : null}
      </View>
      <FlatList
        data={list}
        keyExtractor={(c) => c.name}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 30 }}
        renderItem={({ item }) => (
          <Pressable onPress={() => choose(item.name, item.lat, item.lon)} style={({ pressed }) => ({ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, opacity: pressed ? 0.6 : 1 })}>
            <T style={{ fontSize: 16 }}>{item.name}</T>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
