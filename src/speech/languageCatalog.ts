import { languageDisplayName } from './groupVoicesByLanguage';

/**
 * A curated list of common languages for the "Language Voices" picker
 * (Voice Settings) — not exhaustive (Apple's detector can recognize many
 * more than this), just the realistic common cases, kept as a fixed list
 * rather than free text entry to avoid typos/garbage codes with nothing
 * to match against. English included even though most people would never
 * need to override it, since some might want a different English voice
 * specifically for auto-detected English songs.
 */
export const LANGUAGE_CATALOG_CODES = [
  'en', 'es', 'pt', 'fr', 'it', 'de', 'uk', 'ru', 'ja', 'ko', 'zh',
  'ar', 'hi', 'nl', 'pl', 'sv', 'tr', 'vi', 'el', 'he', 'ro', 'cs',
  'da', 'fi', 'no', 'hu', 'th', 'id',
];

export type LanguageCatalogEntry = { code: string; name: string };

export function languageCatalog(): LanguageCatalogEntry[] {
  return LANGUAGE_CATALOG_CODES.map((code) => ({ code, name: languageDisplayName(code) })).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}
