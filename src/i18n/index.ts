import * as Localization from 'expo-localization';
import { en, type Strings } from './en';
import { uk } from './uk';

export type { Strings } from './en';

const translations: Record<string, Strings> = { uk };

// Picked from the device's primary language (iOS Settings > General >
// Language & Region), same source used elsewhere in the app
// (preferredLanguages.ts) for voice filtering. Falls back to English for any
// language without a translation file yet.
function pickStrings(): Strings {
  const languageCode = Localization.getLocales()[0]?.languageCode?.trim().toLowerCase();
  return (languageCode && translations[languageCode]) || en;
}

// Cached lazily on first use rather than computed at module-load time —
// every other Localization.getLocales() call in this app happens inside a
// useEffect, after mount, not while the JS bundle is still being evaluated,
// so this follows the same safer timing rather than assuming the native
// module is ready that early.
let cachedStrings: Strings | null = null;

// Every screen reads its strings through this hook rather than importing a
// locale file directly, so adding a new language only means adding it to
// `translations` above — no screen needs to change.
export function useStrings(): Strings {
  if (!cachedStrings) {
    cachedStrings = pickStrings();
  }
  return cachedStrings;
}
