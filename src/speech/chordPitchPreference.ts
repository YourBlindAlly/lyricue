import AsyncStorage from '@react-native-async-storage/async-storage';

const CHORD_PITCH_KEY = 'cueme.higherPitchForChords';

/** Off by default. Only meaningful when Chords is also on. */
export async function loadHigherPitchForChords(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(CHORD_PITCH_KEY);
  return raw === 'true';
}

export async function saveHigherPitchForChords(value: boolean): Promise<void> {
  await AsyncStorage.setItem(CHORD_PITCH_KEY, String(value));
}
