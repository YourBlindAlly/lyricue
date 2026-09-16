import { parseSong } from './parseSong';
import { parseChordPro } from './parseChordPro';
import { hasChordBrackets, mergeChordOnlyLines } from './mergeChordOnlyLines';
import type { Song, SongSource, SectionMarker } from '../types';
import type { ChordedWord } from './chordedWord';
import type { SongLanguageCode } from '../speech/languageDetection';

export const CHORDPRO_EXTENSIONS = ['.cho', '.crd', '.chopro', '.chord', '.pro'];

function makeId(): string {
  return `song_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

function assemble(
  rawText: string,
  lines: string[],
  chordedLines: ChordedWord[][],
  sections: SectionMarker[],
  title: string,
  key: string | undefined,
  capo: string | undefined,
  language: SongLanguageCode | null,
  source: SongSource
): Song | null {
  if (lines.length === 0) {
    return null;
  }
  return {
    id: makeId(),
    title,
    key,
    capo,
    language,
    rawText,
    lines,
    chordedLines,
    sections,
    source,
    addedAt: Date.now(),
  };
}

/**
 * Builds a Song from text with no reliable ChordPro-extension signal (a
 * manual paste, a plain .txt, a Word/PDF import — anything not already
 * named .cho/.crd/.chopro/.chord/.pro). Since there's no filename to trust,
 * this decides ChordPro-vs-plain from the CONTENT itself: run the same
 * chord-only-line merge ChordPro files get, then check whether real
 * [Chord] brackets are actually present. A source with genuine chords
 * (bracketed OR bare/chord-above-lyric, either convention) gets parsed with
 * full ChordPro awareness; a source with none becomes plain lyrics, same as
 * before.
 */
export function buildSong(rawText: string, title: string | undefined, source: SongSource): Song | null {
  if (hasChordBrackets(mergeChordOnlyLines(rawText))) {
    return buildChordProSong(rawText, title?.trim() || '', source);
  }
  const { lines, chordedLines, sections, language } = parseSong(rawText);
  const resolvedTitle = title?.trim() || lines[0] || '';
  return assemble(rawText, lines, chordedLines, sections, resolvedTitle, undefined, undefined, language, source);
}

export function buildChordProSong(
  rawText: string,
  fallbackTitle: string,
  source: SongSource
): Song | null {
  const { title, key, capo, lines, chordedLines, sections, language } = parseChordPro(rawText);
  const resolvedTitle = title?.trim() || fallbackTitle.trim() || lines[0] || '';
  return assemble(
    rawText,
    lines,
    chordedLines,
    sections,
    resolvedTitle,
    key ?? undefined,
    capo ?? undefined,
    language,
    source
  );
}

function extensionOf(fileName: string): string {
  return (fileName.match(/\.[^./]+$/)?.[0] ?? '').toLowerCase();
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^./]+$/, '');
}

/** Builds a Song from an imported file's text, choosing plain-text or ChordPro parsing by extension. */
export function buildSongFromFile(text: string, fileName: string, source: SongSource): Song | null {
  const fallbackTitle = stripExtension(fileName);
  if (CHORDPRO_EXTENSIONS.includes(extensionOf(fileName))) {
    return buildChordProSong(text, fallbackTitle, source);
  }
  return buildSong(text, fallbackTitle, source);
}
