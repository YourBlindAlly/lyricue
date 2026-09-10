import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { InputScreen } from './src/screens/InputScreen';
import { PromptScreen } from './src/screens/PromptScreen';
import { PedalSettingsScreen } from './src/screens/PedalSettingsScreen';
import { VoiceSettingsScreen } from './src/screens/VoiceSettingsScreen';
import { LanguageVoicesScreen } from './src/screens/LanguageVoicesScreen';
import { DropboxBrowseScreen } from './src/screens/DropboxBrowseScreen';
import { SetlistsScreen } from './src/screens/SetlistsScreen';
import { SetlistCreatorScreen } from './src/screens/SetlistCreatorScreen';
import { FindSongScreen } from './src/screens/FindSongScreen';
import { AboutScreen } from './src/screens/AboutScreen';
import { AppStateProvider } from './src/state/AppStateContext';
import { CuemePedalCaptureView } from './modules/cueme-pedal-input/src/CuemePedalCaptureView';
import { configureAudioSession } from './src/feedback/feedback';
import { loadActiveSong } from './src/storage/activeSong';
import { hasLaunchedBefore, markLaunched } from './src/library/firstLaunchPreference';
import { seedDemoSongs } from './src/library/seedDemoSongs';
import type { RootStackParamList } from './src/navigation/types';
import type { Song } from './src/types';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Keeps the native splash screen (icon + wordmark) up through the async
// startup work below, instead of the OS's default near-instant auto-hide —
// without this, the splash was dismissing itself before there was anything
// to show, which read as the app skipping straight to the Library.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Startup itself (audio session + loading the last active song) usually
// finishes in well under a second, which made the splash barely visible
// even once it was correctly held open above. This guarantees it stays up
// at least this long regardless, so the icon/wordmark actually register.
const MINIMUM_SPLASH_MS = 1500;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const darkTheme = {
  dark: true,
  colors: {
    primary: '#4f8cff',
    background: '#000000',
    card: '#000000',
    text: '#ffffff',
    border: '#222222',
    notification: '#ff6b6b',
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' as const },
    medium: { fontFamily: 'System', fontWeight: '500' as const },
    bold: { fontFamily: 'System', fontWeight: '700' as const },
    heavy: { fontFamily: 'System', fontWeight: '800' as const },
  },
};

export default function App() {
  const [initialSong, setInitialSong] = useState<Song | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList>('Library');

  useEffect(() => {
    (async () => {
      const startedAt = Date.now();
      await configureAudioSession();
      const stored = await loadActiveSong();
      const isFirstLaunch = !(await hasLaunchedBefore());
      if (isFirstLaunch) {
        await seedDemoSongs();
        await markLaunched();
      }
      const elapsed = Date.now() - startedAt;
      if (elapsed < MINIMUM_SPLASH_MS) {
        await delay(MINIMUM_SPLASH_MS - elapsed);
      }
      setInitialSong(stored);
      // On first launch, open on About instead of the empty Library so a new
      // user sees what CueMe is and how to get started before anything
      // else — every launch after that goes straight to Library as usual.
      setInitialRoute(isFirstLaunch ? 'About' : 'Library');
      setIsReady(true);
      await SplashScreen.hideAsync();
    })();
  }, []);

  if (!isReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#fff" />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AppStateProvider initialActiveSong={initialSong}>
          <NavigationContainer theme={darkTheme}>
            <Stack.Navigator
              // Always open on the library/song-picker, even if a song was
              // active last time — dropping straight into a song on load is
              // for right after picking or pasting one, not for a cold app
              // launch (Rusty's own distinction, clarified 2026-08-27).
              // Exception: a genuine first launch opens on About instead,
              // set above alongside the demo-song seeding.
              initialRouteName={initialRoute}
              screenOptions={{ headerShown: false }}
            >
              <Stack.Screen name="Library" component={LibraryScreen} />
              <Stack.Screen name="NewSong" component={InputScreen} />
              <Stack.Screen name="Prompt" component={PromptScreen} />
              <Stack.Screen name="PedalSettings" component={PedalSettingsScreen} />
              <Stack.Screen name="VoiceSettings" component={VoiceSettingsScreen} />
              <Stack.Screen name="LanguageVoices" component={LanguageVoicesScreen} />
              <Stack.Screen name="DropboxBrowse" component={DropboxBrowseScreen} />
              <Stack.Screen name="Setlists" component={SetlistsScreen} />
              <Stack.Screen name="SetlistCreator" component={SetlistCreatorScreen} />
              <Stack.Screen name="FindSong" component={FindSongScreen} />
              <Stack.Screen name="About" component={AboutScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </AppStateProvider>
        <CuemePedalCaptureView />
        <StatusBar style="light" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  loading: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
