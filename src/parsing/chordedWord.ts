/** One lyric word, with the chord that sits immediately before it in the source, if any. */
export type ChordedWord = { chord: string | null; text: string };

// Matches either a bracketed chord token or a run of non-space, non-bracket
// characters (a word) — deliberately excludes '[' and ']' from the word
// alternative so a chord glued directly onto a word with no space (e.g.
// "cares[G]") still splits into two separate tokens instead of one blob.
const CHORD_OR_WORD_RE = /\[([^\]]*)\]|([^\s[\]]+)/g;

type RawToken = { kind: 'chord' | 'word'; text: string; start: number; end: number };

/**
 * Tokenizes a raw ChordPro lyric line (chords still in [brackets]) into
 * words, each carrying the chord that immediately preceded it, if any. A
 * chord with no following word on the line (a trailing "[G]" at line's end)
 * has nothing to attach to and is dropped — there's no word left to speak it
 * before.
 *
 * A chord glued with no space on BOTH sides (e.g. "won[C]derful", marking a
 * chord change partway through a single sung word) is a special case: the
 * fragments before and after it aren't separate words, they're one word
 * split by the chord marker, and need to be reassembled into one
 * ChordedWord ("wonderful") rather than left as two fragments — otherwise
 * chords-off playback speaks/displays them as two disconnected pieces with a
 * gap where the chord used to be.
 *
 * A DIFFERENT chord glued to the front and back of the same word (e.g.
 * "[G]Real[C] lyric" — G under "Real", changing to C right as "Real" ends)
 * is not the same case: the second chord doesn't belong to that word, it
 * belongs to whatever comes next, and must not be silently dropped just
 * because the word already has a chord from its front.
 *
 * A common chart convention marks exactly where mid-word a chord lands by
 * hyphenating the word at that syllable (e.g. "Navi-[F]dad") — real bug
 * found live 2026-09-11 (Rusty heard a strange pause on "Navidad" with
 * chords off): the hyphen isn't part of the word, just a visual chord-
 * placement aid, but the reassembly above was keeping it literally
 * ("Navi-dad"), and a mid-word hyphen makes some TTS engines pause as if
 * it were two words. Stripped from each fragment as it's reassembled.
 */
export function tokenizeChordedLine(rawLine: string): ChordedWord[] {
  const tokens: RawToken[] = [];
  CHORD_OR_WORD_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CHORD_OR_WORD_RE.exec(rawLine)) !== null) {
    const [full, chordGroup, wordGroup] = match;
    const start = match.index;
    const end = start + full.length;
    if (chordGroup !== undefined) {
      tokens.push({ kind: 'chord', text: chordGroup.trim(), start, end });
    } else if (wordGroup !== undefined) {
      tokens.push({ kind: 'word', text: wordGroup, start, end });
    }
  }

  const words: ChordedWord[] = [];
  let pendingChord: string | null = null;
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];

    if (token.kind === 'word') {
      words.push({ chord: pendingChord, text: token.text });
      pendingChord = null;
      i += 1;
      continue;
    }

    // token is a chord. Nothing glued after it (space or end of line) —
    // it attaches forward to whichever separate word comes next, same as
    // before.
    const nextGlued = tokens[i + 1];
    if (!nextGlued || nextGlued.start !== token.end) {
      if (token.text) {
        pendingChord = token.text;
      }
      i += 1;
      continue;
    }

    // Something is glued directly after this chord. If a word was also
    // glued directly before it (no space on either side), this chord sits
    // mid-word — pull that word back out and reassemble the whole glued
    // run (word-before + chord + everything glued after) into one word.
    const prevToken = tokens[i - 1];
    const gluedToPrevWord =
      prevToken !== undefined && prevToken.kind === 'word' && prevToken.end === token.start;

    const textParts: string[] = [];
    let chordForWord = token.text || pendingChord || null;
    pendingChord = null;

    if (gluedToPrevWord) {
      const prevWord = words.pop()!;
      textParts.push(prevWord.text.replace(/-$/, ''));
      chordForWord = prevWord.chord ?? chordForWord;
    }

    let j = i + 1;
    let cursor = token.end;
    while (j < tokens.length && tokens[j].start === cursor) {
      if (tokens[j].kind === 'word') {
        textParts.push(tokens[j].text.replace(/-$/, ''));
        cursor = tokens[j].end;
        j += 1;
      } else if (!chordForWord && tokens[j].text) {
        chordForWord = tokens[j].text;
        cursor = tokens[j].end;
        j += 1;
      } else {
        // A second, different chord glued directly onto this same run (e.g.
        // "[G]Real[C] lyric" — G under "Real", the chord changes to C right
        // as "Real" ends). It doesn't belong to the word being assembled;
        // stop here without consuming it, so the outer loop picks it up
        // fresh on the next iteration and it attaches forward to whichever
        // word comes next, instead of being silently discarded.
        break;
      }
    }

    words.push({ chord: chordForWord, text: textParts.join('') });
    i = j;
  }

  return words;
}

/** For plain (non-ChordPro) lyric lines, which never carry chord data. */
export function tokenizePlainLine(rawLine: string): ChordedWord[] {
  return rawLine
    .split(/\s+/)
    .filter(Boolean)
    .map((text) => ({ chord: null, text }));
}
