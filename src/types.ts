import type { ChordedWord } from './parsing/chordedWord';
import type { SongLanguageCode } from './speech/languageDetection';

export type SectionMarker = {
  /** Index into Song.lines that this section starts at. */
  lineIndex: number;
  label: string;
};

export type SongSource =
  | { type: 'manual' }
  | { type: 'file' }
  | { type: 'dropbox'; path: string }
  | { type: 'demo' };

export type Song = {
  id: string;
  title: string;
  /** Musical key, when known (e.g. from a ChordPro file's {key: C} directive). */
  key?: string;
  /**
   * Language this song should be spoken in — either a manual {lang: ...}
   * directive or an auto-detected guess from the lyric text, re-derived
   * every time the song loads (see migrateSong.ts's reparse). Used to pick
   * a matching TTS voice automatically instead of always using the single
   * globally selected voice; null means "couldn't confidently tell,
   * fall back to the global voice preference."
   */
  language?: SongLanguageCode | null;
  /** Original pasted/imported text, kept so re-parsing or re-editing is lossless. */
  rawText: string;
  /** Spoken lines, with section-marker lines already stripped out. */
  lines: string[];
  /** Same lines as `lines`, one array per entry, but with chord data preserved for chord-aware line wrapping. */
  chordedLines: ChordedWord[][];
  /** Reserved for the future section-jump feature; populated now, not yet wired to any gesture. */
  sections: SectionMarker[];
  source: SongSource;
  addedAt: number;
};
