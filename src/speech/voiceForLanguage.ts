import type { Voice } from 'expo-speech';

/**
 * Finds an installed voice matching a language code (e.g. "es" matches
 * "es-ES", "es-MX", any installed Spanish voice), preferring a
 * higher-quality (Enhanced/Premium) voice over a Default-quality one when
 * more than one is installed for that language. Returns null when nothing
 * installed matches — the caller falls back to the user's own globally
 * selected voice in that case, same as if this feature didn't exist, since
 * LyriCue can't download a voice on the user's behalf (see the "Sounds and
 * hints" tip on the LyriCue docs site for the parallel VoiceOver Hints
 * case — same shape of "we can't reach into your Settings for you").
 */
export function pickVoiceForLanguage(voices: Voice[], languageCode: string): Voice | null {
  const prefix = languageCode.trim().toLowerCase();
  if (prefix.length === 0) return null;

  const matches = voices.filter((voice) => voice.language.toLowerCase().startsWith(prefix));
  if (matches.length === 0) return null;

  const nonDefault = matches.filter((voice) => voice.quality && voice.quality !== 'Default');
  const pool = nonDefault.length > 0 ? nonDefault : matches;
  return [...pool].sort((a, b) => a.name.localeCompare(b.name))[0];
}
