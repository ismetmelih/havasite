import { useEffect, useState } from 'react';
import { Linking, Platform, ScrollView, Share, View } from 'react-native';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AFAD_SOURCE, ago, dayMonth, getQuakes, haversineKm, hhmm, provinceOf, quakeTime } from '@/src/api';
import { useData } from '@/src/hooks';
import { C, F, magTone } from '@/src/theme';
import { TurkeyMap } from '@/src/TurkeyMap';
import { Btn, Card, MagSquare, Muted, OfficialNote, T } from '@/src/ui';

function feltText(m: number) {
  if (m >= 6) return 'Çok büyük bir deprem. Geniş bir alanda şiddetle hissedilmiş olabilir; resmî açıklamaları takip et.';
  if (m >= 5) return 'Büyük bir deprem; çevre illerde de hissedilmiş olabilir.';
  if (m >= 4) return 'Orta büyüklükte; yakın çevrede belirgin şekilde hissedilmiş olabilir.';
  if (m >= 3) return 'Hafif; merkezine yakın yerlerde hissedilmiş olabilir.';
  return 'Çok hafif; genellikle yalnızca cihazlarla kaydedilir.';
}

export default function DepremDetay() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useData(() => getQuakes(300));
  const quake = q.data?.data.find((x) => x.id === id);
  const [dist, setDist] = useState<number | null>(null);

  useEffect(() => {
    if (!quake) return;
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getLastKnownPositionAsync();
      if (pos) setDist(haversineKm({ lat: pos.coords.latitude, lon: pos.coords.longitude }, quake));
    })();
  }, [quake]);

  if (!quake) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Muted>{q.loading ? 'Yükleniyor…' : 'Deprem bulunamadı.'}</Muted>
      </SafeAreaView>
    );
  }
  const t = quakeTime(quake);
  const tone = magTone(quake.mag);
  const openMaps = () => {
    const url = Platform.OS === 'ios' ? `http://maps.apple.com/?ll=${quake.lat},${quake.lon}&q=${encodeURIComponent(quake.title)}` : `geo:${quake.lat},${quake.lon}?q=${quake.lat},${quake.lon}(${encodeURIComponent(quake.title)})`;
    Linking.openURL(url);
  };
  const share = () => Share.share({ message: `${quake.magType || 'M'} ${quake.mag.toFixed(1)} deprem — ${quake.title}, ${dayMonth(t)} ${hhmm(t)} (derinlik ${quake.depth} km). Kaynak: AFAD · turkiyecanli.com` });

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 16 }}>
        <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: C.borderStrong }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <MagSquare mag={quake.mag} size={78} unit={quake.magType || 'MAG'} />
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: F.display, fontSize: 24, lineHeight: 28 }}>{quake.title}</T>
            <Muted>{dayMonth(t)} · saat {hhmm(t)} · {ago(t)}</Muted>
          </View>
        </View>
        <Card style={{ padding: 10 }}>
          <TurkeyMap fillFor={(n) => (n === provinceOf(quake) ? tone + '66' : null)} points={[{ lat: quake.lat, lon: quake.lon, r: 9, color: tone, stroke: '#fff' }]} ping={{ lat: quake.lat, lon: quake.lon, color: tone }} />
        </Card>
        {quake.province || quake.neighborhood ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Info label="İl / İlçe" value={[quake.province, quake.district].filter(Boolean).join(' / ') || '—'} />
            <Info label="Mahalle" value={quake.neighborhood || '—'} />
            <Info label="Büyüklük türü" value={quake.magType || '—'} />
          </View>
        ) : null}
        {quake.updated ? <Card tone={C.warn}><T style={{ color: C.warn, fontFamily: F.bold }}>AFAD bu depremin bilgilerini sonradan güncelledi.</T></Card> : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Info label="Derinlik" value={`${quake.depth} km`} />
          <Info label="Konum" value={`${quake.lat.toFixed(2)}, ${quake.lon.toFixed(2)}`} />
          <Info label="Sana uzaklık" value={dist != null ? `${Math.round(dist)} km` : '—'} />
        </View>
        <Card tone={tone}><T style={{ color: C.text2, lineHeight: 22 }}>{feltText(quake.mag)}</T></Card>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Btn label="Haritada aç" onPress={openMaps} />
          <Btn label="Paylaş" onPress={share} />
        </View>
        <Btn label="Kapat" ghost onPress={() => router.back()} />
        <OfficialNote compact />
        <Muted style={{ textAlign: 'center' }}>{`Kaynak: ${AFAD_SOURCE}. Resmî bilgi için AFAD'ı esas al.`}</Muted>
      </ScrollView>
    </SafeAreaView>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ flex: 1, padding: 12, gap: 4 }}>
      <T style={{ fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', color: C.muted, fontFamily: F.bold }}>{label}</T>
      <T style={{ fontFamily: F.bold, fontSize: 15 }}>{value}</T>
    </Card>
  );
}
