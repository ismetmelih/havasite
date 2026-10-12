import { Link, Stack } from 'expo-router';
import { View } from 'react-native';
import { C, F } from '@/src/theme';
import { T } from '@/src/ui';

export default function NotFound() {
  return (
    <>
      <Stack.Screen options={{ title: 'Bulunamadı' }} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: C.bg, gap: 14 }}>
        <T style={{ fontFamily: F.display, fontSize: 22 }}>Bu sayfa yok.</T>
        <Link href="/"><T style={{ color: C.accent, fontFamily: F.bold }}>Ana sayfaya dön</T></Link>
      </View>
    </>
  );
}
