import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { SymbolView, SymbolViewProps } from 'expo-symbols';
import { ColorValue, Platform, StyleSheet, View } from 'react-native';
import { C, F } from '@/src/theme';

type Sym = SymbolViewProps['name'];
function icon(name: Sym) {
  return function TabIcon({ color }: { color: ColorValue }) {
    return <SymbolView name={name} tintColor={color} size={23} />;
  };
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.muted,
        tabBarLabelStyle: { fontFamily: F.medium, fontSize: 11 },
        tabBarStyle: { position: 'absolute', borderTopColor: C.border, backgroundColor: Platform.OS === 'ios' ? 'transparent' : C.bg },
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
            <BlurView tint="dark" intensity={70} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: C.bg }]} />
          ),
      }}>
      <Tabs.Screen name="index" options={{ title: 'Ana Sayfa', tabBarIcon: icon({ ios: 'house.fill', android: 'home', web: 'home' }) }} />
      <Tabs.Screen name="hava" options={{ title: 'Hava', tabBarActiveTintColor: C.weather, tabBarIcon: icon({ ios: 'cloud.sun.fill', android: 'partly_cloudy_day', web: 'partly_cloudy_day' }) }} />
      <Tabs.Screen name="deprem" options={{ title: 'Deprem', tabBarActiveTintColor: C.quake, tabBarIcon: icon({ ios: 'waveform.path.ecg', android: 'earthquake', web: 'earthquake' }) }} />
      <Tabs.Screen name="yangin" options={{ title: 'Yangın', tabBarActiveTintColor: C.fire, tabBarIcon: icon({ ios: 'flame.fill', android: 'local_fire_department', web: 'local_fire_department' }) }} />
      <Tabs.Screen name="ayarlar" options={{ title: 'Ayarlar', tabBarIcon: icon({ ios: 'gearshape.fill', android: 'settings', web: 'settings' }) }} />
    </Tabs>
  );
}
