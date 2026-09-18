import type { SectionMarker } from '../types';
import type { ChordedWord } from './chordedWord';
import { tokenizeChordedLine } from './chordedWord';
import { isJunkLine } from './junkLineFilter';
import { mergeChordOnlyLines } from './mergeChordOnlyLines';
import { normalizeLanguageName } from './languageDirective';
import type { SongLanguageCode } from '../speech/languageDetection';

export type ParsedChordProSong = {
  title: string | null;
  key: string | null;
  capo: string | null;
  lines: string[];
  chordedLines: ChordedWord[][];
  sections: SectionMarker[];
  /** A manual {lang:}/{language:} directive, or null — see ParsedSong's language field in parseSong.ts for why auto-detection isn't done here anymore. */
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

const CHORUS_START_NAMES = ['start_of_chorus', 'soc'];
const END_OF_CHORUS_NAMES = ['end_of_chorus', 'eoc'];

// "{chorus}", "{c:chorus}", "{comment: Repeat Chorus}" — all mean "play the
// chorus again here" when nothing else is written out.
function isChorusRepeat(name: string, arg: string): boolean {
  if (name === 'chorus') return true;
  if (name === 'c' || name === 'comment' || name === 'ci' || name === 'comment_italic') {
    return /^(repeat\s+)?chorus\s*[.:!]?$/i.test(arg.trim());
  }
  return false;
}

const TITLE_NAMES = ['title', 't'];
const KEY_NAMES = ['key'];
const CAPO_NAMES = ['capo'];
const LANGUAGE_NAMES = ['lang', 'language'];

// Captures the directive name (up to the first ':' or '}') and an optional
// argument (everything between the first ':' and the final '}', so an
// argument containing its own colon still comes through whole).
// Trailing stray ")" / "]" after the closing brace is tolerated — real files
// have "{soc})" typos, which otherwise fell through and got spoken as a
// lyric line ("soc").
const DIRECTIVE_RE = /^\{([^:}]+?)(?::(.*))?\}[\s)\]]*$/;
// What's left of a chord-only line once its chords are stripped, when the
// author just noted a repeat ("x2", "(2x)", "2x") — not a lyric.
const REPEAT_MARKER_RE = /^\(?\s*(x\s*\d+|\d+\s*x)\s*\)?$/i;
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
  let capo: string | null = null;
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

  const sourceLines = mergedText.split(/\r\n|\r|\n/);
  // The most recent marked chorus block ({soc}..{eoc}), remembered so a
  // later repeat marker ({chorus}, {c:chorus}) can replay it instead of
  // being silently skipped — the spec's own meaning for that directive.
  let currentChorus: { lines: string[]; chorded: ChordedWord[][] } | null = null;
  let recordingChorus: { lines: string[]; chorded: ChordedWord[][] } | null = null;

  for (let lineNo = 0; lineNo < sourceLines.length; lineNo++) {
    const rawLine = sourceLines[lineNo];
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
        // Only the FIRST {t:}/{title:} line wins, deliberately — some real
        // files in the wild (e.g. "Space Oddity - David Bowie.pro") carry a
        // SECOND {t:} line holding the artist name instead of using
        // {artist:}/{subtitle:} for it, a convention the Python curation
        // scripts already know to handle (build_song_index.py takes
        // titles[0] as title, titles[1] as artist) but this parser didn't
        // — it kept overwriting, so the song's real title got silently
        // replaced by the artist name and vanished from the library list
        // (reported by Rusty 2026-09-15). Taking only the first line fixes
        // this without needing to parse a second value out of it, since the
        // app already gets the artist from the Dropbox filename instead.
        if (title === null) {
          title = arg || null;
        }
        continue;
      }
      if (KEY_NAMES.includes(name)) {
        key = arg || key;
        continue;
      }
      if (CAPO_NAMES.includes(name)) {
        capo = arg || capo;
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

      if (END_OF_CHORUS_NAMES.includes(name)) {
        if (recordingChorus && recordingChorus.lines.length > 0) {
          currentChorus = recordingChorus;
        }
        recordingChorus = null;
        continue;
      }

      if (isChorusRepeat(name, arg) && currentChorus) {
        // A "{c:Chorus}" label sitting right before an actual chorus block
        // is a heading for that block, not a repeat request — replaying
        // the old chorus there would double it.
        const nextDirective = sourceLines
          .slice(lineNo + 1)
          .map((l) => l.trim())
          .find((l) => l.length > 0 && !l.startsWith('#'))
          ?.match(DIRECTIVE_RE);
        const nextIsChorusBlock =
          !!nextDirective && CHORUS_START_NAMES.includes(baseDirectiveName(nextDirective[1]));
        if (!nextIsChorusBlock) {
          sections.push({ lineIndex: lines.length, label: 'Chorus' });
          lines.push(...currentChorus.lines);
          chordedLines.push(...currentChorus.chorded);
        }
        continue;
      }

      const sectionStart = SECTION_STARTS.find((s) => s.names.includes(name));
      if (sectionStart) {
        sections.push({ lineIndex: lines.length, label: sectionStart.label });
        if (recordingChorus && recordingChorus.lines.length > 0) {
          currentChorus = recordingChorus;
        }
        recordingChorus = CHORUS_START_NAMES.includes(name) ? { lines: [], chorded: [] } : null;
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

    // "imag- [F] -inary" — a word hyphen-split around a chord with spaces
    // on both sides — rejoins into one word.
    const stripped = trimmed
      .replace(CHORD_RE, '')
      .replace(/(\p{L})-\s+-(\p{L})/gu, '$1$2')
      .trim();
    if (stripped.length > 0 && !(trimmed !== stripped && REPEAT_MARKER_RE.test(stripped))) {
      lines.push(stripped);
      const chorded = tokenizeChordedLine(trimmed);
      chordedLines.push(chorded);
      if (recordingChorus) {
        recordingChorus.lines.push(stripped);
        recordingChorus.chorded.push(chorded);
      }
    }
  }

  return { title, key, capo, lines, chordedLines, sections, language };
}
