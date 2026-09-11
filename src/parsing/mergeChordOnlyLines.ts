// Merges the "chord on its own line, above the lyric it changes on" style
// used by many tab sites (and a large slice of Rusty's curated raw
// collection) into proper ChordPro inline [Chord]word brackets. Without
// this, a line that's entirely chord brackets and whitespace strips down to
// nothing and silently vanishes — real content, permanently lost, and the
// lyric line beneath it never had any chord data at all.
//
// Full design writeup, measured scope (85 of 153 library songs affected,
// 678 total chord-only lines), and the reasoning behind snapping to word
// boundaries rather than the exact original column: see
// project_cueme_chord_line_merge.md in memory. Confirmed live 2026-09-04
// against "Higher" (Creed).

import { isJunkLine } from './junkLineFilter';

const BRACKET_TOKEN_RE = /\[([^\]]*)\]/g;

// Distinguishes a real chord ("D5", "Am7", "F#m", "D/F#", "Csus4") from a
// section label that happens to share the same [brackets] convention
// ("Intro", "Chorus", "Bridge", "Verse 2", "Pre Chorus"). A chord is a note
// letter A-G, optionally flat/sharp, optionally a quality word, optional
// digits, optional minor "m", optional more digits, optional slash-chord
// bass note — and nothing else. "Chorus" and "Bridge" both start with a
// valid chord letter but fail this because the remaining letters don't fit
// chord grammar; every other section word (Intro, Verse, Outro, Solo,
// Refrain, Interlude, Hook, Tag) starts with a letter outside A-G and is
// rejected immediately.
const CHORD_NAME_RE =
  /^[A-Ga-g][#b]?(maj|min|dim|aug|sus|add)?[0-9]*m?[0-9]*(\/[A-Ga-g][#b]?)?$/;

type ChordToken = { name: string; column: number };

function isChordName(token: string): boolean {
  return CHORD_NAME_RE.test(token.trim());
}

/** A line that, once every chord-shaped bracket token is removed, is nothing but whitespace. */
function isChordOnlyLine(line: string): boolean {
  let sawChord = false;
  const stripped = line.replace(BRACKET_TOKEN_RE, (whole, inner) => {
    if (isChordName(inner)) {
      sawChord = true;
      return '';
    }
    return whole; // leave non-chord brackets (section labels) untouched
  });
  return sawChord && stripped.trim().length === 0;
}

function extractChordTokens(line: string): ChordToken[] {
  const tokens: ChordToken[] = [];
  BRACKET_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BRACKET_TOKEN_RE.exec(line)) !== null) {
    if (isChordName(m[1])) {
      tokens.push({ name: m[1], column: m.index });
    }
  }
  return tokens;
}

/**
 * A bracket line that reads as a section label ("[Verse 2]", "[Bridge]")
 * rather than one of ChordPro's own {start_of_verse}-style directives —
 * LyriCue's web Lyric Editor tool writes section headers this way. A
 * chord-only line must never merge into one of these, or the label itself
 * gets corrupted with chord text spliced into its words (e.g. "[Verse 2]"
 * becoming "[Verse[A#] 2]").
 */
function isSectionLabelLine(line: string): boolean {
  const trimmed = line.trim();
  const m = trimmed.match(/^\[([^\]]+)\]$/);
  return !!m && !isChordName(m[1]);
}

function wordSpans(line: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    spans.push({ start: m.index, end: m.index + m[0].length });
  }
  return spans;
}

/**
 * Where a chord originally at `column` should land in `line` — the nearest
 * word boundary (a word's start or end index), never intra-word. Falls back
 * to the very start of the line if it has no words at all.
 */
function nearestInsertionPoint(column: number, spans: { start: number; end: number }[]): number {
  if (spans.length === 0) {
    return 0;
  }
  let best = spans[0].start;
  let bestDist = Math.abs(column - best);
  for (const span of spans) {
    for (const candidate of [span.start, span.end]) {
      const dist = Math.abs(column - candidate);
      if (dist < bestDist) {
        best = candidate;
        bestDist = dist;
      }
    }
  }
  return best;
}

function mergeChordsIntoLine(chords: ChordToken[], lyricLine: string): string {
  const spans = wordSpans(lyricLine);
  const insertions = chords
    .map((c) => ({ index: nearestInsertionPoint(c.column, spans), text: `[${c.name}]` }))
    // Rightmost index first so inserting doesn't shift the index of any
    // insertion still to be applied. For two chords landing at the exact
    // same index, each insertion at that shared point pushes in front of
    // whatever was already inserted there — so to end up with the chords'
    // original left-to-right order in the final string, they must be
    // *inserted* in the reverse of that order (last original one first).
    .map((ins, originalIndex) => ({ ...ins, originalIndex }))
    .sort((a, b) => b.index - a.index || b.originalIndex - a.originalIndex);
  let result = lyricLine;
  for (const { index, text } of insertions) {
    result = result.slice(0, index) + text + result.slice(index);
  }
  return result;
}

/**
 * Preprocessing pass over raw ChordPro text: finds each chord-only line,
 * merges its chords into the next real line as inline brackets snapped to
 * the nearest word boundary, and drops the original chord-only line. Lines
 * that already mix real words with inline chords are left completely
 * alone — only lines that are purely chord tokens (and, incidentally,
 * whitespace) are touched. Run once, before the main line-by-line parse.
 */
export function mergeChordOnlyLines(rawText: string): string {
  const lines = rawText.split(/\r\n|\r|\n/);
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (isChordOnlyLine(lines[i])) {
      const chords = extractChordTokens(lines[i]);
      let j = i + 1;
      while (j < lines.length && lines[j].trim().length === 0) {
        j++;
      }
      const nextLine = j < lines.length ? lines[j] : null;
      // Must be a genuine lyric line — not another chord-only line, a
      // directive, or something isJunkLine would drop anyway (a tab
      // diagram, a stray URL, a capo/tuning note). Without this check, a
      // chord header sitting just above an unmarked tab diagram (a real
      // shape found live 2026-09-04 in "Higher") gets merged into the tab
      // line itself instead of being dropped, corrupting it into something
      // isJunkLine no longer recognizes as junk.
      const nextIsUsable =
        nextLine !== null &&
        !isChordOnlyLine(nextLine) &&
        !isSectionLabelLine(nextLine) &&
        !/^\s*\{/.test(nextLine) &&
        !isJunkLine(nextLine.trim());
      if (nextIsUsable) {
        out.push(mergeChordsIntoLine(chords, nextLine as string));
        i = j + 1;
        continue;
      }
      // Nothing real to attach these chords to (end of a section, or the
      // next line is a directive) — drop them, same as today's behavior.
      i++;
      continue;
    }
    out.push(lines[i]);
    i++;
  }
  return out.join('\n');
}
