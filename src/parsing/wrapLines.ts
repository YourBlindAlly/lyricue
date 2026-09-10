import type { SectionMarker } from '../types';
import type { ChordedWord } from './chordedWord';
import { tokenizePlainLine } from './chordedWord';
import { chordToSpeech } from './chordPronunciation';

export type LineWrapResult = {
  lines: string[];
  segments: SpeechSegment[][];
  sections: SectionMarker[];
};

/** One piece of a spoken line — a run of text at a given pitch (1.0 = normal). */
export type SpeechSegment = { text: string; pitch?: number };

/** How much higher a chord name is spoken when the pitch-shift preference is on. */
export const CHORD_PITCH = 1.3;

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

  // A lone leading or trailing word (whatever split it off -- a forced
  // chord break, or just a preferred-break/length-cap cut landing on the
  // last chorded word in a stretch, which can happen even with chords off
  // entirely, since chord position is still a preferred break point
  // regardless of whether chords get spoken) reads as an orphan no matter
  // what caused it, so this rescue applies unconditionally rather than
  // only under breakAtEveryChord. Confirmed 2026-09-10 with a real song
  // (America's "Horse With No Name", chords off, Medium length) where the
  // word cap landed right as a chord fell on the line's last word, leaving
  // it stranded alone. Deliberately narrow to just the first and last
  // chunk, per Rusty's own "let's start small" scoping 2026-09-09 -- a
  // middle single-word chunk (bounded by two other chunks on both sides)
  // is still left alone. Overflowing maxWords/maxSyllables slightly on the
  // merged result is accepted -- avoiding a stranded single word matters
  // more here than the length target.
  if (chunks.length > 1 && chunks[0].length === 1) {
    chunks[1] = [...chunks[0], ...chunks[1]];
    chunks.shift();
  }
  if (chunks.length > 1 && chunks[chunks.length - 1].length === 1) {
    const last = chunks.pop()!;
    chunks[chunks.length - 1] = [...chunks[chunks.length - 1], ...last];
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

/**
 * Same content as renderChunk, but as a sequence of speech segments instead
 * of one flat string — used when the "speak chords at a higher pitch"
 * preference is on, since expo-speech applies one pitch per speak() call, so
 * making the chord name sound different means giving it its own utterance.
 * Groups consecutive chordless words together into one normal-pitch segment
 * rather than splitting every single word, so a long chord-sparse run still
 * plays as one smooth utterance instead of a choppy word-by-word sequence —
 * only an actual chord change introduces a new segment.
 *
 * When higherPitchForChords is off, this degenerates to exactly one segment
 * with the same text renderChunk would produce, so nothing about existing
 * playback changes unless the preference is explicitly turned on.
 */
export function renderChunkSegments(
  chunk: ChordedWord[],
  includeChords: boolean,
  higherPitchForChords: boolean
): SpeechSegment[] {
  if (!includeChords || !higherPitchForChords) {
    return [{ text: renderChunk(chunk, includeChords) }];
  }

  const segments: SpeechSegment[] = [];
  let currentWords: string[] = [];
  const flushWords = () => {
    if (currentWords.length > 0) {
      segments.push({ text: currentWords.join(' ') });
      currentWords = [];
    }
  };

  for (const word of chunk) {
    if (word.chord) {
      flushWords();
      // A trailing "!" rather than speaking the bare chord name alone --
      // confirmed on-device 2026-09-10 that a fully isolated single letter
      // (a plain root chord like "G" or "C" has nothing else in its
      // utterance) gets read by iOS's speech engine as "capital G" rather
      // than just the letter, since a standalone single character triggers
      // its own letter-disambiguation reading. Appending a word ("G chord")
      // would dodge this reliably but costs real time on every chord change
      // during a live performance, so trying silent punctuation first --
      // still needs on-device confirmation that it actually avoids the
      // letter-disambiguation reading, not just a syntactic tweak.
      segments.push({ text: `${chordToSpeech(word.chord)}!`, pitch: CHORD_PITCH });
    }
    currentWords.push(word.text);
  }
  flushWords();

  return segments;
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
  includeChords: boolean,
  higherPitchForChords: boolean = false
): LineWrapResult {
  const outLines: string[] = [];
  const outSegments: SpeechSegment[][] = [];
  const oldToNewIndex: number[] = [];

  for (const words of input.chordedLines) {
    oldToNewIndex.push(outLines.length);
    const chunks = chunkChordedLine(words, options);
    if (chunks.length === 0) {
      // Shouldn't normally happen (empty lines are filtered out upstream),
      // but keep the line rather than silently dropping it if it does.
      outLines.push('');
      outSegments.push([{ text: '' }]);
      continue;
    }
    for (const chunk of chunks) {
      outLines.push(renderChunk(chunk, includeChords));
      outSegments.push(renderChunkSegments(chunk, includeChords, higherPitchForChords));
    }
  }

  const outSections = input.sections.map((section) => ({
    ...section,
    lineIndex: oldToNewIndex[section.lineIndex] ?? section.lineIndex,
  }));

  return { lines: outLines, segments: outSegments, sections: outSections };
}
