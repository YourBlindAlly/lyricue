import { chunkChordedLine, renderChunk, wrapLine, wrapChordedSongLines } from './wrapLines';
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
});
