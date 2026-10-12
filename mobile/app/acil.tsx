import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, Share, Vibration, View } from 'react-native';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import * as SMS from 'expo-sms';
import { SymbolView } from 'expo-symbols';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ago, getQuakes, provinceOf, quakeTime } from '@/src/api';
import { Prefs, useData } from '@/src/hooks';
import { C, F } from '@/src/theme';
import { Card, MagSquare, Muted, T } from '@/src/ui';

const call = (n: string) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); Linking.openURL(`tel:${n}`); };

export default function Acil() {
  const q = useData(() => getQuakes(5));
  const siren = useAudioPlayer(require('../assets/sounds/siren.wav'));
  const [sirenOn, setSirenOn] = useState(false);
  const [light, setLight] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    return () => Vibration.cancel();
  }, []);

  function toggleSiren() {
    if (sirenOn) {
      siren.pause();
      Vibration.cancel();
      setSirenOn(false);
      return;
    }
    // expo-audio oynatici ayarlari ozellik atamasiyla yapilir (resmi API)
    // eslint-disable-next-line react-hooks/immutability
    siren.loop = true;
    siren.volume = 1;
    siren.seekTo(0);
    siren.play();
    Vibration.vibrate([0, 500, 300], true);
    setSirenOn(true);
  }

  async function safe() {
    setSending(true);
    try {
      const contacts = await Prefs.getContacts();
      const msg = (await Prefs.getSafeMsg()) || 'Güvendeyim, iyiyim.';
      let loc = '';
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          loc = ` Konumum: https://maps.google.com/?q=${p.coords.latitude.toFixed(5)},${p.coords.longitude.toFixed(5)}`;
        }
      } catch {}
      const text = msg + loc;
      if (contacts.length && (await SMS.isAvailableAsync())) {
        await SMS.sendSMSAsync(contacts.map((c) => c.phone), text);
      } else if (!contacts.length) {
        Alert.alert('Acil durum kişisi yok', 'Mesajı doğrudan göndermek için Ayarlar → Acil durum kişileri bölümüne en fazla 3 kişi ekleyebilirsin. Şimdilik paylaşım menüsünü açıyorum.');
        await Share.share({ message: text });
      } else {
        await Share.share({ message: text });
      }
    } finally {
      setSending(false);
    }
  }

  const latest = q.data?.data[0];
  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: '#140b0d' }}>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 14 }}>
        <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: C.borderStrong }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T style={{ fontFamily: F.display, fontSize: 28 }}>Acil Durum</T>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Kapat">
            <SymbolView name={{ ios: 'xmark.circle.fill', android: 'close', web: 'close' }} size={28} tintColor={C.muted} />
          </Pressable>
        </View>

        <Pressable onPress={() => call('112')} style={({ pressed }) => ({ borderRadius: 26, padding: 22, backgroundColor: C.critical, alignItems: 'center', opacity: pressed ? 0.85 : 1, shadowColor: C.critical, shadowOpacity: 0.6, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } })}>
          <T style={{ fontFamily: F.display, fontSize: 64, color: '#fff', lineHeight: 70 }}>112</T>
          <T style={{ color: '#fff', fontFamily: F.bold }}>Acil Çağrı Merkezi · dokun ve ara</T>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Num n="122" label="AFAD İhbar" />
          <Num n="177" label="Orman Yangını" />
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Tool label="Siren" sub="Yüksek sesli düdük" on={sirenOn} onPress={toggleSiren} icon={{ ios: 'speaker.wave.3.fill', android: 'volume_up', web: 'volume_up' }} />
          <Tool label="Işık sinyali" sub="Ekran SOS yanar" on={light} onPress={() => setLight(true)} icon={{ ios: 'flashlight.on.fill', android: 'flashlight_on', web: 'flashlight_on' }} />
        </View>
        <Pressable disabled={sending} onPress={safe} style={({ pressed }) => ({ borderRadius: 18, padding: 18, backgroundColor: '#16a34a', flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed || sending ? 0.8 : 1 })}>
          <SymbolView name={{ ios: 'checkmark.shield.fill', android: 'verified_user', web: 'verified_user' }} size={28} tintColor="#fff" />
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: F.bold, fontSize: 17, color: '#fff' }}>{sending ? 'Hazırlanıyor…' : 'Güvendeyim'}</T>
            <T style={{ color: '#dcfce7', fontSize: 13 }}>Konumunla birlikte yakınlarına SMS</T>
          </View>
        </Pressable>

        {latest ? (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.05)' }}>
            <MagSquare mag={latest.mag} size={48} />
            <View style={{ flex: 1 }}>
              <T style={{ fontSize: 11, color: C.muted, fontFamily: F.bold, letterSpacing: 1 }}>SON DEPREM</T>
              <T style={{ fontFamily: F.bold }} numberOfLines={1}>{provinceOf(latest)} · {ago(quakeTime(latest))}</T>
            </View>
          </Card>
        ) : null}
        <Muted style={{ lineHeight: 19 }}>
          Deprem sırasında Çök-Kapan-Tutun. Bina hasarlıysa dışarı çık ve toplanma alanına git. {"Enkaz altındaysan sireni ve ışığı kullan, enerjini koru. Resmî yönlendirmeler için AFAD ve 112'yi esas al."}
        </Muted>
      </ScrollView>
      {light ? <SosLight onClose={() => setLight(false)} /> : null}
    </SafeAreaView>
  );
}

function Num({ n, label }: { n: string; label: string }) {
  return (
    <Pressable onPress={() => call(n)} style={({ pressed }) => ({ flex: 1, borderRadius: 20, padding: 16, alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.16)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.45)', opacity: pressed ? 0.8 : 1 })}>
      <T style={{ fontFamily: F.display, fontSize: 34, color: '#fff' }}>{n}</T>
      <T style={{ color: '#fecaca', fontSize: 13 }}>{label}</T>
    </Pressable>
  );
}

function Tool({ label, sub, on, onPress, icon }: { label: string; sub: string; on: boolean; onPress: () => void; icon: React.ComponentProps<typeof SymbolView>['name'] }) {
  return (
    <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onPress(); }} style={({ pressed }) => ({ flex: 1, borderRadius: 18, padding: 16, gap: 6, backgroundColor: on ? C.warn : 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: on ? C.warn : C.borderStrong, opacity: pressed ? 0.85 : 1 })}>
      <SymbolView name={icon} size={26} tintColor={on ? '#1b1203' : '#fff'} />
      <T style={{ fontFamily: F.bold, fontSize: 16, color: on ? '#1b1203' : '#fff' }}>{on ? `${label} açık` : label}</T>
      <T style={{ fontSize: 12.5, color: on ? '#3b2a05' : C.text2 }}>{on ? 'Kapatmak için dokun' : sub}</T>
    </Pressable>
  );
}

// tam ekran SOS: ... --- ... (kısa-uzun-kısa), ekran açık kalır
function SosLight({ onClose }: { onClose: () => void }) {
  useKeepAwake();
  const [lit, setLit] = useState(false);
  const stop = useRef(false);
  useEffect(() => {
    const U = 220;
    const seq: [boolean, number][] = [];
    [1, 1, 1, 3, 3, 3, 1, 1, 1].forEach((d, i) => { seq.push([true, d * U]); seq.push([false, i === 2 || i === 5 ? 3 * U : U]); });
    seq[seq.length - 1][1] = 7 * U;
    (async () => {
      while (!stop.current) {
        for (const [on, ms] of seq) {
          if (stop.current) break;
          setLit(on);
          await new Promise((r) => setTimeout(r, ms));
        }
      }
    })();
    return () => { stop.current = true; };
  }, []);
  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: lit ? '#fff' : '#000', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 60 }}>
        <View style={{ paddingVertical: 12, paddingHorizontal: 20, borderRadius: 16, backgroundColor: 'rgba(120,120,120,0.55)', alignItems: 'center' }}>
          <T style={{ fontFamily: F.bold, color: '#fff' }}>SOS ışık sinyali</T>
          <T style={{ color: '#eee', fontSize: 13 }}>Durdurmak için dokun</T>
        </View>
      </Pressable>
    </Modal>
  );
}
