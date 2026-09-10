import type { SectionMarker } from '../types';
import type { ChordedWord } from './chordedWord';
import { tokenizeChordedLine } from './chordedWord';
import { isJunkLine } from './junkLineFilter';
import { mergeChordOnlyLines } from './mergeChordOnlyLines';
import { normalizeLanguageName } from './languageDirective';
import { detectSongLanguage } from '../speech/languageDetection';
import type { SongLanguageCode } from '../speech/languageDetection';

export type ParsedChordProSong = {
  title: string | null;
  key: string | null;
  lines: string[];
  chordedLines: ChordedWord[][];
  sections: SectionMarker[];
  language: SongLanguageCode | null;
};

type ContentDropPair = { start: string[]; end: string[] };

// Content between these pairs isn't lyrics at all (tab/rhythm notation,
// embedded sheet music/Lilypond/SVG/arbitrary text) and must be dropped
// entirely, not filtered line by line.
const CONTENT_DROP_PAIRS: ContentDropPair[] = [
  { start: ['start_of_tab', 'sot'], end: ['end_of_tab', 'eot'] },
  { start: ['start_of_grid', 'sog'], end: ['end_of_grid', 'eog'] },
  { start: ['start_of_abc'], end: ['end_of_abc'] },
  { start: ['start_of_ly'], end: ['end_of_ly'] },
  { start: ['start_of_svg'], end: ['end_of_svg'] },
  { start: ['start_of_textblock'], end: ['end_of_textblock'] },
];

// Maps onto LyriCue's existing Song.sections concept — only the start matters,
// since a section's end is just "wherever the next marker (or the song) ends".
const SECTION_STARTS: { names: string[]; label: string }[] = [
  { names: ['start_of_chorus', 'soc'], label: 'Chorus' },
  { names: ['start_of_verse', 'sov'], label: 'Verse' },
  { names: ['start_of_bridge', 'sob'], label: 'Bridge' },
];

const TITLE_NAMES = ['title', 't'];
const KEY_NAMES = ['key'];
const LANGUAGE_NAMES = ['lang', 'language'];

// Captures the directive name (up to the first ':' or '}') and an optional
// argument (everything between the first ':' and the final '}', so an
// argument containing its own colon still comes through whole).
const DIRECTIVE_RE = /^\{([^:}]+?)(?::(.*))?\}\s*$/;
const CHORD_RE = /\[[^\]]*\]/g;

/** Strips an optional `-selector` suffix (e.g. `start_of_verse-soprano`) for matching. */
function baseDirectiveName(rawName: string): string {
  const dashIndex = rawName.indexOf('-');
  return (dashIndex === -1 ? rawName : rawName.slice(0, dashIndex)).trim().toLowerCase();
}

/**
 * Parses a ChordPro file into the same shape LyriCue's plain-text parser
 * produces (spoken lines + section markers), plus title/key pulled from
 * directives. Chords sitting inline in [brackets] are stripped, not spoken —
 * a line that's only bracketed chords self-resolves to a skipped blank line
 * once they're stripped, same as the existing blank-line handling.
 */
export function parseChordPro(rawText: string): ParsedChordProSong {
  const lines: string[] = [];
  const chordedLines: ChordedWord[][] = [];
  const sections: SectionMarker[] = [];
  let title: string | null = null;
  let key: string | null = null;
  let language: SongLanguageCode | null = null;
  // Which end-directive names would close the content-drop block currently
  // in progress, or null when not inside one. Only one can be active at a
  // time — ChordPro's drop environments don't nest.
  let droppingEndNames: string[] | null = null;

  // A one-time preprocessing pass: many raw chord sheets put each chord on
  // its own line above the lyric it changes on, rather than inline — that
  // convention strips down to nothing below and silently loses the chord
  // entirely. This merges those chords into the following line first, so
  // everything below sees proper inline [Chord]word syntax regardless of
  // which convention the source actually used.
  const mergedText = mergeChordOnlyLines(rawText);

  for (const rawLine of mergedText.split(/\r\n|\r|\n/)) {
    const trimmed = rawLine.trim();
    const directiveMatch = trimmed.match(DIRECTIVE_RE);

    if (droppingEndNames) {
      if (directiveMatch && droppingEndNames.includes(baseDirectiveName(directiveMatch[1]))) {
        droppingEndNames = null;
      }
      continue;
    }

    if (trimmed.length === 0 || trimmed.startsWith('#') || isJunkLine(trimmed)) {
      continue;
    }

    if (directiveMatch) {
      const name = baseDirectiveName(directiveMatch[1]);
      const arg = directiveMatch[2]?.trim() ?? '';

      if (TITLE_NAMES.includes(name)) {
        title = arg || title;
        continue;
      }
      if (KEY_NAMES.includes(name)) {
        key = arg || key;
        continue;
      }
      if (LANGUAGE_NAMES.includes(name)) {
        const normalized = normalizeLanguageName(arg);
        if (normalized) language = normalized;
        continue;
      }
      if (name === 'meta') {
        // {meta: key C} is the spec's alternative form of {key: C}.
        const metaKeyMatch = arg.match(/^key\s+(.+)$/i);
        if (metaKeyMatch) {
          key = metaKeyMatch[1].trim();
        }
        continue;
      }

      const sectionStart = SECTION_STARTS.find((s) => s.names.includes(name));
      if (sectionStart) {
        sections.push({ lineIndex: lines.length, label: sectionStart.label });
        continue;
      }

      const dropPair = CONTENT_DROP_PAIRS.find((p) => p.start.includes(name));
      if (dropPair) {
        droppingEndNames = dropPair.end;
        continue;
      }

      // Any other directive (end_of_*, the bare {chorus} repeat-shorthand,
      // font/color/layout directives, unrecognized extensions, etc.) is
      // silently ignored, matching the spec's own stated behavior for
      // directives a reader doesn't specifically handle.
      continue;
    }

    const stripped = trimmed.replace(CHORD_RE, '').trim();
    if (stripped.length > 0) {
      lines.push(stripped);
      chordedLines.push(tokenizeChordedLine(trimmed));
    }
  }

  return { title, key, lines, chordedLines, sections, language: language ?? detectSongLanguage(lines) };
}
