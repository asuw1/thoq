import { IBMPlexMono_400Regular, IBMPlexMono_500Medium, useFonts as useMono } from '@expo-google-fonts/ibm-plex-mono';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  useFonts as useSans,
} from '@expo-google-fonts/ibm-plex-sans';
import { Newsreader_400Regular_Italic, Newsreader_500Medium, useFonts as useSerif } from '@expo-google-fonts/newsreader';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { StoreProvider } from '@/store/provider';
import { usePalette } from '@/theme/use-palette';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [serif] = useSerif({ Newsreader_500Medium, Newsreader_400Regular_Italic });
  const [sans] = useSans({ IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold });
  const [mono] = useMono({ IBMPlexMono_400Regular, IBMPlexMono_500Medium });
  const loaded = serif && sans && mono;
  const c = usePalette();

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  if (!loaded) return null;

  return (
    <SafeAreaProvider>
      <StoreProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.paper } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
          <Stack.Screen name="compare" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        </Stack>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
