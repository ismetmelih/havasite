import { useFonts } from 'expo-font';
import * as ScreenOrientation from 'expo-screen-orientation';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { C } from '@/src/theme';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = { initialRouteName: '(tabs)' };

SplashScreen.preventAutoHideAsync();
// uygulama dikey; yalnızca tam ekran harita yan çevrilebilir
ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: C.bg, card: C.bg, text: C.text, border: C.border, primary: C.accent },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    'Satoshi-400': require('../assets/fonts/satoshi-400.ttf'),
    'Satoshi-500': require('../assets/fonts/satoshi-500.ttf'),
    'Satoshi-700': require('../assets/fonts/satoshi-700.ttf'),
    'Cabinet-700': require('../assets/fonts/cabinet-grotesk-700.ttf'),
    'Cabinet-800': require('../assets/fonts/cabinet-grotesk-800.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);
  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);
  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ThemeProvider value={theme}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="acil" options={{ presentation: 'modal' }} />
        <Stack.Screen name="sehir" options={{ presentation: 'modal' }} />
        <Stack.Screen name="deprem-detay" options={{ presentation: 'modal' }} />
        <Stack.Screen name="harita" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      </Stack>
    </ThemeProvider>
    </GestureHandlerRootView>
  );
}
