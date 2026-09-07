import type { SectionMarker } from '../types';
import type { ChordedWord } from './chordedWord';
import { tokenizePlainLine } from './chordedWord';
import { chordToSpeech } from './chordPronunciation';

export type LineWrapResult = {
  lines: string[];
  sections: SectionMarker[];
};

export type LineWrapOptions = {
  maxWords: number;
  maxSyllables: number;
  /**
   * When true, every chord change forces a new chunk to start, regardless of
   * maxWords/maxSyllables — for a mode aimed at people learning a song, where
   * seeing/hearing exactly which words a chord change lands on matters more
   * than keeping lines a natural phrase length. maxWords/maxSyllables still
   * apply as a fallback cap between chords, so a long chord-sparse stretch
   * still gets split reasonably.
   */
  breakAtEveryChord?: boolean;
};

const BREAK_BEFORE_WORD_RE = /^(and|but|or|so|yet|nor)$/i;
const BREAK_AFTER_WORD_RE = /[,;:—–-]$/;

/** Rough vowel-group syllable estimate — good enough to cap chunk length, not for scansion. */
function estimateSyllables(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!cleaned) {
    return 0;
  }
  const groups = cleaned.match(/[aeiouy]+/g);
  let count = groups ? groups.length : 1;
  if (cleaned.length > 2 && cleaned.endsWith('e') && !cleaned.endsWith('le')) {
    count -= 1;
  }
  return Math.max(1, count);
}

/**
 * Splits one lyric line (as chord-annotated words) into shorter spoken
 * chunks, targeting maxWords words and maxSyllables estimated syllables per
 * chunk (whichever is hit first). Prefers cutting at a natural pause — a
 * trailing comma/semicolon/dash, right before a coordinating conjunction, or
 * right before a word that starts a new chord — over a hard word-count cut,
 * so chunks read as phrases instead of an arbitrary word count. A chord
 * boundary is a preferred break point regardless of whether chords end up
 * spoken; that's decided separately when rendering a chunk to text. Falls
 * back to a hard cut when a chunk runs long with no such pause in it, and
 * never splits a single word.
 */
export function chunkChordedLine(words: ChordedWord[], options: LineWrapOptions): ChordedWord[][] {
  const { maxWords, maxSyllables, breakAtEveryChord } = options;
  if (words.length === 0) {
    return [];
  }

  const chunks: ChordedWord[][] = [];
  let chunkWords: ChordedWord[] = [];
  let chunkSyllables = 0;
  let lastBreakIndex = -1;

  const flush = (upTo: number) => {
    chunks.push(chunkWords.slice(0, upTo));
    chunkWords = chunkWords.slice(upTo);
    chunkSyllables = chunkWords.reduce((sum, w) => sum + estimateSyllables(w.text), 0);
    lastBreakIndex = -1;
  };

  for (const word of words) {
    const isPreferredBreakBefore = word.chord !== null || BREAK_BEFORE_WORD_RE.test(word.text);

    if (breakAtEveryChord && word.chord !== null && chunkWords.length > 0) {
      flush(chunkWords.length);
    } else if (chunkWords.length > 0 && isPreferredBreakBefore) {
      lastBreakIndex = chunkWords.length;
    }

    const wordSyllables = estimateSyllables(word.text);
    const wouldExceed =
      chunkWords.length > 0 &&
      (chunkWords.length + 1 > maxWords || chunkSyllables + wordSyllables > maxSyllables);

    if (wouldExceed) {
      flush(lastBreakIndex > 0 ? lastBreakIndex : chunkWords.length);
    }

    chunkWords.push(word);
    chunkSyllables += wordSyllables;

    if (BREAK_AFTER_WORD_RE.test(word.text)) {
      lastBreakIndex = chunkWords.length;
    }
  }

  if (chunkWords.length > 0) {
    chunks.push(chunkWords);
  }

  return chunks;
}

/**
 * Renders one chunk of chord-annotated words to the text that actually gets
 * spoken. With includeChords on, a word carrying a chord gets that chord's
 * spoken form announced right before it (e.g. "G, in the sunshine"); with it
 * off, chords are silently dropped — they still influenced where the chunk
 * boundaries fell, just not what gets said.
 */
export function renderChunk(chunk: ChordedWord[], includeChords: boolean): string {
  return chunk
    .map((word) => {
      if (includeChords && word.chord) {
        return `${chordToSpeech(word.chord)}, ${word.text}`;
      }
      return word.text;
    })
    .join(' ');
}

/** Convenience wrapper for a plain lyric line with no chord data. */
export function wrapLine(line: string, options: LineWrapOptions): string[] {
  const chunks = chunkChordedLine(tokenizePlainLine(line), options);
  return chunks.map((chunk) => renderChunk(chunk, false));
}

export type ChordedSongInput = {
  chordedLines: ChordedWord[][];
  sections: SectionMarker[];
};

/**
 * Re-wraps every line of a parsed song, remapping section markers so they
 * still point at the right (now possibly-shifted) line index. Sections only
 * ever start at the boundary of an original line, so the remap is exact.
 */
export function wrapChordedSongLines(
  input: ChordedSongInput,
  options: LineWrapOptions,
  includeChords: boolean
): LineWrapResult {
  const outLines: string[] = [];
  const oldToNewIndex: number[] = [];

  for (const words of input.chordedLines) {
    oldToNewIndex.push(outLines.length);
    const chunks = chunkChordedLine(words, options);
    if (chunks.length === 0) {
      // Shouldn't normally happen (empty lines are filtered out upstream),
      // but keep the line rather than silently dropping it if it does.
      outLines.push('');
      continue;
    }
    outLines.push(...chunks.map((chunk) => renderChunk(chunk, includeChords)));
  }

  const outSections = input.sections.map((section) => ({
    ...section,
    lineIndex: oldToNewIndex[section.lineIndex] ?? section.lineIndex,
  }));

  return { lines: outLines, sections: outSections };
}
