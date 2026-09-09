import AsyncStorage from '@react-native-async-storage/async-storage';

const REPEAT_FEATURE_KEY = 'cueme.repeatFeatureEnabled';

/** On by default -- confirmed working well by Rusty, 2026-09-10. */
export async function loadRepeatFeatureEnabled(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(REPEAT_FEATURE_KEY);
  if (raw === null) return true;
  return raw === 'true';
}

export async function saveRepeatFeatureEnabled(value: boolean): Promise<void> {
  await AsyncStorage.setItem(REPEAT_FEATURE_KEY, String(value));
}
