// Some raw tab/chord-site files (and occasionally a hand-pasted lyric) carry
// a stray non-lyric line — a source URL, a "Capo 2" note — that isn't marked
// with any directive or comment syntax, so the parser would otherwise speak
// it as if it were a real lyric line. General prose-aside filtering isn't
// reliably automatable (a file can contain arbitrary unmarked commentary
// with no distinguishing shape), but these two specific patterns are safe to
// drop unconditionally — neither has ever been a real sung lyric.

const URL_RE = /https?:\/\/\S+|www\.\S+/i;
// Broadened from a capo-only check (2026-09-04) after finding "Tuning:",
// "Strumming pattern:", and "Drop D" lines leaking through the same way as
// unmarked capo notes — all short freeform performance instructions, never a
// real sung lyric. Length-capped and requires a word boundary right after
// the keyword so a real lyric that happens to start with one of these words
// isn't caught — confirmed against Margaritaville's real opening line,
// "Strummin' my six-string", which does NOT match ("Strummin'" isn't
// "strum" or "strumming" followed by a boundary).
const PERFORMANCE_NOTE_RE = /^(capo|tuning|strum(ming)?( pattern)?|drop\s?d|open tuning)\b.{0,30}$/i;
// A performance-note convention used throughout one of the raw collections
// ("TIP: play the transposed root chord and add the 5th as necessary") —
// found in 1000+ files there, none of them a real sung lyric.
const TIP_RE = /^tip:/i;
// Guitar tab diagrams (six lines of dashes/frets, one per string) and tab
// notation tacked onto the end of an otherwise-normal chord line both share
// this distinctive shape: a note letter — optionally flat/sharp, for an
// alternate tuning like "Eb|" or an exotic one like "F#|" — followed by a
// pipe and fret/technique characters. Any of the 7 note letters is allowed
// deliberately, not just the 6 standard guitar string names, since a scordatura
// tuning could label a string with any of them. Confirmed live 2026-09-04
// across several real songs, including ones using flat-tuning string labels
// and inline chord+tab hybrid lines ("[D5] [A5] G|-6--7-|") that don't start
// with the tab pattern at all — searching anywhere in the line, rather than
// anchoring to the start, catches both shapes with one check. The
// pipe-plus-fret-number shape essentially never occurs in real sung lyrics.
const TAB_DIAGRAM_RE = /[a-gA-G][b#]?\|[-0-9hpsb/\\~x]{3,}/;
// A second, pipe-less tab style found live 2026-09-04 in "Higher" (Creed):
// the string letter sits at BOTH ends with dashes/frets in between and no
// pipe at all, e.g. "e--------------------------------e" or
// "g----7---------------------------g". Anchored to the start of the line
// and requires a decent run of tab characters before the closing letter, so
// a real lyric starting with a single letter isn't caught by accident.
const PIPELESS_TAB_DIAGRAM_RE = /^[a-gA-G][b#]?[-0-9hpsb/\\~x]{5,}[a-gA-G][b#]?\s*$/;
// A line that trims down to nothing but stray punctuation — found live
// 2026-09-12 in "Have You Ever Seen the Rain" (CCR): a line of trailing
// whitespace ending in a lone "." with no real content, almost certainly a
// leftover formatting artifact from wherever the file was originally
// sourced, never a real sung lyric. Deliberately excludes "-" — "--" is
// this app's own section-marker convention (see the original spec), so a
// bare dash or double-dash must never be swept up here.
const STRAY_PUNCTUATION_RE = /^[.,;:!?*~]+$/;

/**
 * True if `line` is junk (a stray URL, performance note, "TIP:" aside, or
 * tab/tuning diagram) rather than real lyric content. Shared by both parsers
 * (parseChordPro.ts and parseSong.ts) so plain-text pastes get the same
 * protection as ChordPro files, regardless of how the text was sourced.
 */
export function isJunkLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    URL_RE.test(trimmed) ||
    PERFORMANCE_NOTE_RE.test(trimmed) ||
    TIP_RE.test(trimmed) ||
    TAB_DIAGRAM_RE.test(trimmed) ||
    PIPELESS_TAB_DIAGRAM_RE.test(trimmed) ||
    STRAY_PUNCTUATION_RE.test(trimmed)
  );
}
