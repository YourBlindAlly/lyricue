import AsyncStorage from '@react-native-async-storage/async-storage';

const TICK_SOUND_KEY = 'cueme.tickSoundEnabled';

/** On by default — matches the app's existing behavior before this setting existed. */
export async function loadTickSoundEnabled(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(TICK_SOUND_KEY);
  if (raw === null) return true;
  return raw === 'true';
}

export async function saveTickSoundEnabled(value: boolean): Promise<void> {
  await AsyncStorage.setItem(TICK_SOUND_KEY, String(value));
}
