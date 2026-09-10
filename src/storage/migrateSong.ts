import { tokenizePlainLine } from '../parsing/chordedWord';
import { parseSong } from '../parsing/parseSong';
import { parseChordPro } from '../parsing/parseChordPro';
import { CHORDPRO_EXTENSIONS } from '../parsing/buildSong';
import type { Song } from '../types';

/**
 * Whether `song` was originally parsed as ChordPro (vs. plain text), needed
 * to re-parse it with the matching parser. Dropbox imports keep their real
 * filename in `source.path`, so the extension is authoritative. Manual
 * pastes always go through the plain-text parser (InputScreen never routes
 * pasted text through ChordPro parsing, regardless of its content), so
 * that's unambiguous too. A local file import (`source.type === 'file'`)
 * doesn't retain its original filename at all, so there's nothing
 * authoritative to check — fall back to whether the song's own
 * already-parsed chordedLines ever contained a real chord, which only a
 * ChordPro parse would have produced.
 */
function wasChordPro(song: Song): boolean {
  if (song.source.type === 'dropbox') {
    const ext = (song.source.path.match(/\.[^./]+$/)?.[0] ?? '').toLowerCase();
    return CHORDPRO_EXTENSIONS.includes(ext);
  }
  if (song.source.type === 'manual') {
    return false;
  }
  return song.chordedLines.some((line) => line.some((word) => word.chord !== null));
}

/**
 * Re-derives `lines`/`chordedLines`/`sections` from the song's stored
 * `rawText` using the CURRENT parser, every time a song loads — not just
 * once at import. Parsing logic keeps improving (junk-line filtering being
 * the concrete example: the TIP:/URL fixes only ever applied to freshly
 * imported songs before this, since the parsed-and-filtered result, not the
 * raw text, is what actually got persisted). `rawText` is kept in storage
 * specifically to make this possible — see its own doc comment in types.ts.
 * If re-parsing somehow produces nothing (an edge case, not expected in
 * practice), the existing already-parsed data is kept rather than losing
 * the song entirely.
 */
function reparse(song: Song): Song {
  if (wasChordPro(song)) {
    const parsed = parseChordPro(song.rawText);
    if (parsed.lines.length === 0) return song;
    return {
      ...song,
      lines: parsed.lines,
      chordedLines: parsed.chordedLines,
      sections: parsed.sections,
      key: song.key ?? parsed.key ?? undefined,
      language: parsed.language ?? song.language ?? null,
    };
  }
  const parsed = parseSong(song.rawText);
  if (parsed.lines.length === 0) return song;
  return {
    ...song,
    lines: parsed.lines,
    chordedLines: parsed.chordedLines,
    sections: parsed.sections,
    language: parsed.language ?? song.language ?? null,
  };
}

/**
 * Fills in fields that didn't exist yet when a Song was persisted to
 * AsyncStorage, so old data doesn't crash the app the first time it's loaded
 * after an update. `chordedLines` was added after `lines` already existed in
 * storage — any song saved before that update comes back from
 * JSON.parse with `chordedLines: undefined`, and code that assumes it's
 * always present (e.g. the line-length wrapper) throws on it. Since a
 * production build shows no error overlay for an uncaught exception, this
 * previously surfaced as the app silently quitting on load with nothing in
 * the logs, rather than a visible crash — exactly what happened to Rusty's
 * oldest song (dictated in before this field existed).
 */
export function migrateSong(song: Song): Song {
  const withChordedLines = Array.isArray(song.chordedLines)
    ? song
    : { ...song, chordedLines: song.lines.map((line) => tokenizePlainLine(line)) };
  return reparse(withChordedLines);
}
