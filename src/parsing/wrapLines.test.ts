import {
  chunkChordedLine,
  renderChunk,
  renderChunkSegments,
  wrapLine,
  wrapChordedSongLines,
  CHORD_PITCH,
} from './wrapLines';
import { tokenizeChordedLine, tokenizePlainLine } from './chordedWord';

const MEDIUM = { maxWords: 6, maxSyllables: 8 };

describe('wrapLine', () => {
  it('leaves a short line untouched', () => {
    expect(wrapLine('Hey there Delilah', MEDIUM)).toEqual(['Hey there Delilah']);
  });

  it('splits a long line on a word-count cap with no punctuation', () => {
    const line = 'one two three four five six seven eight nine';
    expect(wrapLine(line, { maxWords: 4, maxSyllables: 99 })).toEqual([
      'one two three four',
      'five six seven eight',
      'nine',
    ]);
  });

  it('prefers cutting after a comma over a mid-phrase hard cut', () => {
    const line = "I've been waiting on the sunset, bills on my mindset";
    expect(wrapLine(line, { maxWords: 8, maxSyllables: 99 })).toEqual([
      "I've been waiting on the sunset,",
      'bills on my mindset',
    ]);
  });

  it('prefers cutting before a coordinating conjunction', () => {
    const line = 'I watched the sunset and I felt at home again tonight';
    // Breaks before "and" (natural pause) instead of mid-phrase at the word
    // cap; the second cut is a hard cut since no further pause exists before
    // hitting the cap again.
    expect(wrapLine(line, { maxWords: 6, maxSyllables: 99 })).toEqual([
      'I watched the sunset',
      'and I felt at home again',
      'tonight',
    ]);
  });

  it('caps on estimated syllables even when word count is fine', () => {
    const line = 'unbelievable extraordinary imagination';
    const result = wrapLine(line, { maxWords: 6, maxSyllables: 6 });
    expect(result.length).toBeGreaterThan(1);
  });

  it('never produces an empty chunk and never drops a word', () => {
    const line = 'a b c d e f g h i j k';
    const result = wrapLine(line, { maxWords: 3, maxSyllables: 99 });
    expect(result.join(' ').split(/\s+/)).toEqual(line.split(' '));
    expect(result.every((chunk) => chunk.length > 0)).toBe(true);
  });

  it('keeps a single long word intact rather than splitting a word', () => {
    expect(wrapLine('supercalifragilisticexpialidocious', { maxWords: 4, maxSyllables: 3 })).toEqual([
      'supercalifragilisticexpialidocious',
    ]);
  });

  it('handles an empty line', () => {
    expect(wrapLine('', MEDIUM)).toEqual([]);
    expect(wrapLine('   ', MEDIUM)).toEqual([]);
  });
});

describe('chunkChordedLine with chord boundaries', () => {
  it('treats a chord change as a preferred break point', () => {
    const words = tokenizeChordedLine('[G]In the sunshine [D]in the moonlight [C]almost any time');
    const chunks = chunkChordedLine(words, { maxWords: 5, maxSyllables: 99 });
    // Each chord starts its own chunk rather than a mid-phrase hard cut,
    // since every chunk here is well under the 5-word cap.
    expect(chunks.map((c) => c.map((w) => w.text).join(' '))).toEqual([
      'In the sunshine',
      'in the moonlight',
      'almost any time',
    ]);
  });

  it('still falls back to a hard cut when the span between two chords is too long', () => {
    const words = tokenizeChordedLine('[G]one two three four five six seven [D]eight');
    const chunks = chunkChordedLine(words, { maxWords: 4, maxSyllables: 99 });
    // The 7-word chordless run between G and D has no comma/conjunction to
    // break on, so it still gets a hard cut at the word cap; "eight" then
    // just joins whichever chunk still has room, no forced cut needed there.
    expect(chunks.map((c) => c.map((w) => w.text).join(' '))).toEqual([
      'one two three four',
      'five six seven eight',
    ]);
  });

  it('a plain (chordless) line behaves exactly like the word-based wrapper', () => {
    const words = tokenizePlainLine('one two three four five six seven eight nine');
    const chunks = chunkChordedLine(words, { maxWords: 4, maxSyllables: 99 });
    expect(chunks.map((c) => c.map((w) => w.text).join(' '))).toEqual([
      'one two three four',
      'five six seven eight',
      'nine',
    ]);
  });
});

describe('chunkChordedLine with breakAtEveryChord', () => {
  it('without breakAtEveryChord, does not split at a chord unless the length cap requires it', () => {
    const words = tokenizeChordedLine('[G]In the sunshine [D]in the moonlight');
    const chunks = chunkChordedLine(words, { maxWords: 99, maxSyllables: 99 });
    expect(chunks).toHaveLength(1);
  });

  it('forces a new chunk at every chord change, even well under the length cap', () => {
    const words = tokenizeChordedLine('[G]In the sunshine [D]in the moonlight');
    const chunks = chunkChordedLine(words, { maxWords: 99, maxSyllables: 99, breakAtEveryChord: true });
    expect(chunks.map((c) => c.map((w) => w.text).join(' '))).toEqual([
      'In the sunshine',
      'in the moonlight',
    ]);
  });

  it('still falls back to the length cap on a long chord-sparse stretch', () => {
    const words = tokenizeChordedLine('[G]one two three four five six seven eight nine ten [D]eleven');
    const chunks = chunkChordedLine(words, { maxWords: 4, maxSyllables: 99, breakAtEveryChord: true });
    // No chord between "one" and "eleven", so ordinary word-cap splitting
    // still applies within that stretch; "eleven" then still starts its own
    // chunk since it carries a chord.
    expect(chunks.map((c) => c.map((w) => w.text).join(' '))).toEqual([
      'one two three four',
      'five six seven eight',
      'nine ten',
      'eleven',
    ]);
  });

  it('a chordless line is unaffected by breakAtEveryChord', () => {
    const words = tokenizePlainLine('one two three four five six seven eight nine');
    const chunks = chunkChordedLine(words, { maxWords: 4, maxSyllables: 99, breakAtEveryChord: true });
    expect(chunks.map((c) => c.map((w) => w.text).join(' '))).toEqual([
      'one two three four',
      'five six seven eight',
      'nine',
    ]);
  });

  it('merges a lone leading word (before the first chord) into the next chunk', () => {
    // "'Twas grace that taught my heart to fear" -- 'Twas has no chord, so it
    // would otherwise be flushed alone the instant "grace" forces a break.
    const words = tokenizeChordedLine("'Twas [G]grace that taught my [G7]heart to [C]fear");
    const chunks = chunkChordedLine(words, { maxWords: 99, maxSyllables: 99, breakAtEveryChord: true });
    expect(chunks.map((c) => c.map((w) => w.text).join(' '))).toEqual([
      "'Twas grace that taught my",
      'heart to',
      'fear',
    ]);
  });

  it('does not merge a leading fragment of 2 or more words', () => {
    const words = tokenizeChordedLine('Oh what a [G]morning this is [D]turning out to be');
    const chunks = chunkChordedLine(words, { maxWords: 99, maxSyllables: 99, breakAtEveryChord: true });
    expect(chunks[0].map((w) => w.text).join(' ')).toBe('Oh what a');
  });

  it('leaves trailing and middle single-word chunks alone (out of scope for this pass)', () => {
    // "fear" ends the line alone (last word, carries the final chord) --
    // deliberately not rescued yet, per Rusty's own narrow scoping.
    const words = tokenizeChordedLine("'Twas [G]grace that taught my [G7]heart to [C]fear");
    const chunks = chunkChordedLine(words, { maxWords: 99, maxSyllables: 99, breakAtEveryChord: true });
    expect(chunks[chunks.length - 1].map((w) => w.text).join(' ')).toBe('fear');
  });
});

describe('chunkChordedLine leading-orphan rescue without breakAtEveryChord', () => {
  it('also merges a lone leading word produced by an ordinary length-cap cut, chords entirely off', () => {
    // No chord data at all here -- this exercises the plain word-cap path,
    // confirming the rescue isn't tied to breakAtEveryChord or chords being
    // on. A preferred break right after word 1 (before "and") plus a tight
    // cap is enough to strand "So" alone without the fix.
    const words = tokenizePlainLine('So and then we carried on for a while');
    const chunks = chunkChordedLine(words, { maxWords: 1, maxSyllables: 99 });
    expect(chunks[0].length).toBeGreaterThan(1);
  });
});

describe('renderChunk', () => {
  it('omits chords when includeChords is false', () => {
    const words = tokenizeChordedLine('[G]In the [D]sunshine');
    expect(renderChunk(words, false)).toBe('In the sunshine');
  });

  it('speaks the chord name before the word it attaches to when includeChords is true', () => {
    const words = tokenizeChordedLine('[G]In the [D]sunshine');
    expect(renderChunk(words, true)).toBe('G, In the D, sunshine');
  });

  it('converts chord symbols to speakable phrases when included', () => {
    const words = tokenizeChordedLine('[Gsus4]Wait [F#]here');
    expect(renderChunk(words, true)).toBe('G sus four, Wait F sharp, here');
  });
});

describe('renderChunkSegments', () => {
  it('degenerates to one plain segment when higherPitchForChords is off, even with chords included', () => {
    const words = tokenizeChordedLine('[G]In the [D]sunshine');
    expect(renderChunkSegments(words, true, false)).toEqual([{ text: 'G, In the D, sunshine' }]);
  });

  it('degenerates to one plain segment when includeChords is off, regardless of the pitch preference', () => {
    const words = tokenizeChordedLine('[G]In the [D]sunshine');
    expect(renderChunkSegments(words, false, true)).toEqual([{ text: 'In the sunshine' }]);
  });

  it('splits into a pitched segment per chord plus grouped word segments when both are on', () => {
    const words = tokenizeChordedLine('[G]In the sunshine [D]in the moonlight');
    expect(renderChunkSegments(words, true, true)).toEqual([
      { text: 'G!', pitch: CHORD_PITCH },
      { text: 'In the sunshine' },
      { text: 'D!', pitch: CHORD_PITCH },
      { text: 'in the moonlight' },
    ]);
  });

  it('appends "!" even to a bare single-letter root, not just chords with a suffix', () => {
    // A plain root chord like "G" has nothing else in its own isolated
    // utterance, which iOS reads as "capital G" rather than the letter
    // sound (confirmed on-device 2026-09-10) -- the exclamation mark is an
    // attempt to dodge that without adding a spoken word every chord
    // change; unclear yet whether it actually works on-device.
    const words = tokenizeChordedLine('[C]Home');
    expect(renderChunkSegments(words, true, true)).toEqual([
      { text: 'C!', pitch: CHORD_PITCH },
      { text: 'Home' },
    ]);
  });

  it('does not introduce a pitched segment for a chordless chunk', () => {
    const words = tokenizePlainLine('just plain words here');
    expect(renderChunkSegments(words, true, true)).toEqual([{ text: 'just plain words here' }]);
  });
});

describe('wrapChordedSongLines', () => {
  it('remaps section markers to the new, expanded line indices', () => {
    const input = {
      chordedLines: [
        tokenizePlainLine('short line'),
        tokenizePlainLine('one two three four five six seven eight nine ten eleven twelve'),
        tokenizePlainLine('another short line'),
      ],
      sections: [
        { lineIndex: 1, label: 'Chorus' },
        { lineIndex: 2, label: 'Verse' },
      ],
    };
    const result = wrapChordedSongLines(input, { maxWords: 4, maxSyllables: 99 }, false);

    // line 0 -> 1 chunk, line 1 -> 3 chunks (12 words / 4 per chunk), line 2 -> 1 chunk
    expect(result.lines).toHaveLength(5);
    expect(result.sections).toEqual([
      { lineIndex: 1, label: 'Chorus' },
      { lineIndex: 4, label: 'Verse' },
    ]);
  });

  it('with "off"-style infinite caps, produces one unsplit chunk per line and still honors includeChords', () => {
    const input = {
      chordedLines: [tokenizeChordedLine('[G]Amazing grace, how [C]sweet the sound')],
      sections: [],
    };
    const result = wrapChordedSongLines(
      input,
      { maxWords: Infinity, maxSyllables: Infinity },
      true
    );
    expect(result.lines).toEqual(['G, Amazing grace, how C, sweet the sound']);
  });

  it('produces matching pitched segments per line when higherPitchForChords is on', () => {
    const input = {
      chordedLines: [tokenizeChordedLine('[G]Amazing grace, how [C]sweet the sound')],
      sections: [],
    };
    const result = wrapChordedSongLines(input, { maxWords: Infinity, maxSyllables: Infinity }, true, true);
    expect(result.lines).toEqual(['G, Amazing grace, how C, sweet the sound']);
    expect(result.segments).toEqual([
      [
        { text: 'G!', pitch: CHORD_PITCH },
        { text: 'Amazing grace, how' },
        { text: 'C!', pitch: CHORD_PITCH },
        { text: 'sweet the sound' },
      ],
    ]);
  });

  it('defaults higherPitchForChords to off when omitted, keeping segments as one plain entry per line', () => {
    const input = {
      chordedLines: [tokenizeChordedLine('[G]Amazing grace')],
      sections: [],
    };
    const result = wrapChordedSongLines(input, { maxWords: Infinity, maxSyllables: Infinity }, true);
    expect(result.segments).toEqual([[{ text: 'G, Amazing grace' }]]);
  });
});
