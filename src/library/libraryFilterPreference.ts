import AsyncStorage from '@react-native-async-storage/async-storage';

export type LibraryFilterMode = 'library' | 'activeSetlist' | 'notebook';

const FILTER_MODE_KEY = 'cueme.libraryFilterMode';
const VALID_MODES: LibraryFilterMode[] = ['library', 'activeSetlist', 'notebook'];

export const DEFAULT_FILTER_MODE: LibraryFilterMode = 'library';

export async function loadLibraryFilterMode(): Promise<LibraryFilterMode> {
  const stored = await AsyncStorage.getItem(FILTER_MODE_KEY);
  if (stored && (VALID_MODES as string[]).includes(stored)) {
    return stored as LibraryFilterMode;
  }
  return DEFAULT_FILTER_MODE;
}

export async function saveLibraryFilterMode(mode: LibraryFilterMode): Promise<void> {
  await AsyncStorage.setItem(FILTER_MODE_KEY, mode);
}

export function nextFilterMode(current: LibraryFilterMode): LibraryFilterMode {
  const index = VALID_MODES.indexOf(current);
  return VALID_MODES[(index + 1) % VALID_MODES.length];
}

/** The reverse of nextFilterMode, for swipe-down (decrement). */
export function previousFilterMode(current: LibraryFilterMode): LibraryFilterMode {
  const index = VALID_MODES.indexOf(current);
  return VALID_MODES[(index - 1 + VALID_MODES.length) % VALID_MODES.length];
}
