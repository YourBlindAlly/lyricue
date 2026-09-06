import AsyncStorage from '@react-native-async-storage/async-storage';

const SHOW_LOW_QUALITY_KEY = 'cueme.showLowQualityVoices';

/** Off by default — Voice Settings shows only Enhanced/Premium quality voices. */
export async function loadShowLowQualityVoices(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(SHOW_LOW_QUALITY_KEY);
  return raw === 'true';
}

export async function saveShowLowQualityVoices(value: boolean): Promise<void> {
  await AsyncStorage.setItem(SHOW_LOW_QUALITY_KEY, String(value));
}
