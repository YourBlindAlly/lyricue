import AsyncStorage from '@react-native-async-storage/async-storage';

const BREAK_AT_CHORDS_KEY = 'cueme.breakAtChords';

/** Off by default — lines wrap by word/syllable count as usual until turned on. */
export async function loadBreakAtChords(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(BREAK_AT_CHORDS_KEY);
  return raw === 'true';
}

export async function saveBreakAtChords(value: boolean): Promise<void> {
  await AsyncStorage.setItem(BREAK_AT_CHORDS_KEY, String(value));
}
