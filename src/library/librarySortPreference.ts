import AsyncStorage from '@react-native-async-storage/async-storage';

export type LibrarySortMode = 'newest' | 'titleAZ' | 'artistAZ';

const SORT_MODE_KEY = 'cueme.librarySortMode';
const VALID_MODES: LibrarySortMode[] = ['newest', 'titleAZ', 'artistAZ'];

export const DEFAULT_SORT_MODE: LibrarySortMode = 'newest';

export async function loadLibrarySortMode(): Promise<LibrarySortMode> {
  const stored = await AsyncStorage.getItem(SORT_MODE_KEY);
  if (stored && (VALID_MODES as string[]).includes(stored)) {
    return stored as LibrarySortMode;
  }
  return DEFAULT_SORT_MODE;
}

export async function saveLibrarySortMode(mode: LibrarySortMode): Promise<void> {
  await AsyncStorage.setItem(SORT_MODE_KEY, mode);
}

export function nextSortMode(current: LibrarySortMode): LibrarySortMode {
  const index = VALID_MODES.indexOf(current);
  return VALID_MODES[(index + 1) % VALID_MODES.length];
}

/** The reverse of nextSortMode, for swipe-down (decrement) — shared by both Library's and Dropbox browse's sort controls. */
export function previousSortMode(current: LibrarySortMode): LibrarySortMode {
  const index = VALID_MODES.indexOf(current);
  return VALID_MODES[(index - 1 + VALID_MODES.length) % VALID_MODES.length];
}

export const SORT_MODE_LABEL: Record<LibrarySortMode, string> = {
  newest: 'Newest first',
  titleAZ: 'Title, A to Z',
  artistAZ: 'Artist, A to Z',
};
