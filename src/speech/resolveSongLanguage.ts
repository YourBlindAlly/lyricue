import { detectSongLanguage } from './languageDetection';
import type { LanguageDetectionEngine } from './languageDetectionEnginePreference';

export type ResolvableSong = {
  /** A manual {lang: ...} override from the song's own text, if present. */
  language?: string | null;
  lines: string[];
};

/**
 * Resolves the language a song should be spoken in: a manual {lang:}
 * override always wins regardless of engine (that's the whole point of
 * giving the user an escape hatch); otherwise runs whichever detection
 * engine is currently selected. `detectApple` is injectable so this stays
 * testable without touching the real native module — production code
 * always passes the real one (see PromptScreen.tsx).
 */
export async function resolveSongLanguage(
  song: ResolvableSong,
  engine: LanguageDetectionEngine,
  detectApple: (text: string) => Promise<string | null>
): Promise<string | null> {
  if (song.language) return song.language;
  if (engine === 'apple') {
    return detectApple(song.lines.join(' '));
  }
  return detectSongLanguage(song.lines);
}
