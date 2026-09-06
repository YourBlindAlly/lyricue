import * as Localization from 'expo-localization';
import { en, type Strings } from './en';
import { uk } from './uk';

export type { Strings } from './en';

const translations: Record<string, Strings> = { uk };

// Picked from the device's primary language (iOS Settings > General >
// Language & Region). Falls back to English for any language without a
// translation file yet.
function pickStrings(): Strings {
  const languageCode = Localization.getLocales()[0]?.languageCode?.trim().toLowerCase();
  return (languageCode && translations[languageCode]) || en;
}

// Cached lazily on first use rather than computed at module-load time —
// avoids calling into the native Localization module while the JS bundle
// is still being evaluated, before a component has actually mounted.
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
