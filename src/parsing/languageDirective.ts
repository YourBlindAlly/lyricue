import type { SongLanguageCode } from '../speech/languageDetection';

// Names/aliases a user might type after {lang: ...} or {language: ...},
// mapped to the same short codes detectSongLanguage produces, so a manual
// override and an auto-detected result are interchangeable everywhere else
// (matching an installed voice, etc). Accepts both the language's own name
// in itself (e.g. "Español") and its English name, since either is a
// reasonable thing to type.
const NAME_TO_CODE: Record<string, SongLanguageCode> = {
  en: 'en',
  english: 'en',
  es: 'es',
  spanish: 'es',
  español: 'es',
  espanol: 'es',
  pt: 'pt',
  portuguese: 'pt',
  português: 'pt',
  portugues: 'pt',
  fr: 'fr',
  french: 'fr',
  français: 'fr',
  francais: 'fr',
  it: 'it',
  italian: 'it',
  italiano: 'it',
  de: 'de',
  german: 'de',
  deutsch: 'de',
  uk: 'uk',
  ukrainian: 'uk',
  українська: 'uk',
};

export function normalizeLanguageName(raw: string): SongLanguageCode | null {
  return NAME_TO_CODE[raw.trim().toLowerCase()] ?? null;
}

// A standalone {lang: Spanish} / {language: es} directive line. ChordPro
// syntax, reused in plain-text songs too since curly braces have no other
// meaning there (unlike square brackets, which plain-text songs already use
// for section labels like "[Chorus]" — reusing those for a language tag
// would collide with that).
const LANGUAGE_DIRECTIVE_RE = /^\{\s*(?:lang|language)\s*:\s*(.+?)\s*\}$/i;

/**
 * Matches a language-directive line and returns its normalized code, or
 * null if the line isn't a recognized language directive (either the wrong
 * shape, or a language name this app doesn't know). Callers should skip a
 * matched line entirely — it's metadata, never a lyric to speak.
 */
export function matchLanguageDirective(trimmedLine: string): SongLanguageCode | null {
  const match = trimmedLine.match(LANGUAGE_DIRECTIVE_RE);
  if (!match) return null;
  return normalizeLanguageName(match[1]);
}
