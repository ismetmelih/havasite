import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView, SymbolViewProps } from 'expo-symbols';
import { SITE } from '@/src/api';
import { Contact, Place, Prefs } from '@/src/hooks';
import { C, F } from '@/src/theme';
import { Btn, Card, H2, Muted, Screen, T } from '@/src/ui';

export default function Ayarlar() {
  const [place, setPlace] = useState<Place | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([{ name: '', phone: '' }, { name: '', phone: '' }, { name: '', phone: '' }]);
  const [msg, setMsg] = useState('');

  useFocusEffect(useCallback(() => {
    Prefs.getPlace().then(setPlace);
    Prefs.getContacts().then((c) => setContacts([0, 1, 2].map((i) => c[i] || { name: '', phone: '' })));
    Prefs.getSafeMsg().then(setMsg);
  }, []));

  async function saveContacts() {
    const list = contacts.map((c) => ({ name: c.name.trim(), phone: c.phone.replace(/[^\d+]/g, '') })).filter((c) => c.phone);
    if (list.some((c) => c.phone.replace(/\D/g, '').length < 10)) {
      Alert.alert('Numara eksik', 'Telefon numaralarını 05xx xxx xx xx biçiminde, eksiksiz yaz.');
      return;
    }
    await Prefs.setContacts(list);
    await Prefs.setSafeMsg(msg.trim());
    Alert.alert('Kaydedildi', list.length ? `${list.length} acil durum kişisi kaydedildi.` : 'Acil durum kişileri temizlendi.');
  }

  return (
    <Screen title="Ayarlar">
      <Card style={{ gap: 4, paddingVertical: 6 }}>
        <Row icon={{ ios: 'location.fill', android: 'location_on', web: 'location_on' }} tone={C.weather} title="Hava durumu şehri" value={place?.name || 'Ankara'} onPress={() => router.push('/sehir')} />
        <Row icon={{ ios: 'bell.badge.fill', android: 'notifications', web: 'notifications' }} tone={C.critical} title="Bildirimler" value="Mağaza sürümünde" onPress={() => Alert.alert('Bildirimler', 'Deprem, sabah hava özeti, hava uyarıları ve yakındaki yangın bildirimleri uygulamanın App Store / Google Play sürümünde açılacak. Şimdilik turkiyecanli.com üzerinden açabilirsin.')} last />
      </Card>

      <Card style={{ gap: 12 }}>
        <H2>Acil durum kişileri</H2>
        <Muted style={{ marginTop: -6 }}>ACİL ekranındaki “Güvendeyim” düğmesi mesajı konumunla birlikte bu kişilere SMS olarak hazırlar. Numaralar yalnızca telefonunda saklanır.</Muted>
        {contacts.map((c, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
            <Input style={{ flex: 1 }} value={c.name} placeholder={`Kişi ${i + 1} (ör. Annem)`} onChangeText={(v) => setContacts((old) => old.map((x, j) => (j === i ? { ...x, name: v } : x)))} />
            <Input style={{ flex: 1.2 }} value={c.phone} placeholder="05xx xxx xx xx" keyboardType="phone-pad" onChangeText={(v) => setContacts((old) => old.map((x, j) => (j === i ? { ...x, phone: v } : x)))} />
          </View>
        ))}
        <Input value={msg} placeholder="Mesaj: Güvendeyim, iyiyim." onChangeText={setMsg} maxLength={160} />
        <Btn label="Kişileri kaydet" onPress={saveContacts} />
      </Card>

      <Card style={{ gap: 4, paddingVertical: 6 }}>
        <Row icon={{ ios: 'map.fill', android: 'map', web: 'map' }} tone={C.good} title="Toplanma alanımı öğren" value="e-Devlet" onPress={() => Linking.openURL('https://www.turkiye.gov.tr/afet-ve-acil-durum-yonetimi-acil-toplanma-alani-sorgulama')} />
        <Row icon={{ ios: 'globe', android: 'language', web: 'language' }} tone={C.accent} title="Web sitesi" value="turkiyecanli.com" onPress={() => Linking.openURL(SITE)} />
        <Row icon={{ ios: 'lock.fill', android: 'lock', web: 'lock' }} tone={C.violet} title="Gizlilik ve KVKK" value="" onPress={() => Linking.openURL(`${SITE}/gizlilik.html`)} last />
      </Card>

      <Card style={{ gap: 8 }}>
        <H2>Hakkında</H2>
        <Muted style={{ marginTop: 0, lineHeight: 19 }}>
          TürkiyeCanlı bağımsız bir projedir; AFAD, MGM veya NASA ile bağlantısı yoktur ve resmî uyarı sistemi değildir. Veriler: AFAD ve EMSC (deprem), NASA FIRMS (yangın), Open-Meteo (hava). Üyelik ve reklam yok.
        </Muted>
        <Muted style={{ marginTop: 4 }}>Sürüm {Constants.expoConfig?.version || '1.0.0'}</Muted>
      </Card>
    </Screen>
  );
}

function Row({ icon, tone, title, value, onPress, last }: { icon: SymbolViewProps['name']; tone: string; title: string; value: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.border, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: tone + '22', alignItems: 'center', justifyContent: 'center' }}>
        <SymbolView name={icon} size={17} tintColor={tone} />
      </View>
      <T style={{ flex: 1, fontFamily: F.medium, fontSize: 15.5 }}>{title}</T>
      <T style={{ color: C.muted, fontSize: 14 }}>{value}</T>
      <T style={{ color: C.muted, fontSize: 20 }}>›</T>
    </Pressable>
  );
}

function Input(p: React.ComponentProps<typeof TextInput>) {
  return <TextInput placeholderTextColor={C.muted} {...p} style={[{ minWidth: 0, color: C.text, fontFamily: F.medium, fontSize: 15, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border }, p.style]} />;
}
