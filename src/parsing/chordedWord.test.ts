import { tokenizeChordedLine, tokenizePlainLine } from './chordedWord';

describe('tokenizeChordedLine', () => {
  it('attaches a chord to the word immediately following it', () => {
    expect(tokenizeChordedLine('[G]Amazing [C]grace')).toEqual([
      { chord: 'G', text: 'Amazing' },
      { chord: 'C', text: 'grace' },
    ]);
  });

  it('leaves words with no preceding chord unattached', () => {
    expect(tokenizeChordedLine('[G]Amazing grace, how [C]sweet the sound')).toEqual([
      { chord: 'G', text: 'Amazing' },
      { chord: null, text: 'grace,' },
      { chord: null, text: 'how' },
      { chord: 'C', text: 'sweet' },
      { chord: null, text: 'the' },
      { chord: null, text: 'sound' },
    ]);
  });

  it('splits a chord glued directly onto the end of a word with no space', () => {
    expect(tokenizeChordedLine('Someone who cares[G]')).toEqual([
      { chord: null, text: 'Someone' },
      { chord: null, text: 'who' },
      { chord: null, text: 'cares' },
    ]);
  });

  it('drops a trailing chord with no following word to attach to', () => {
    expect(tokenizeChordedLine('Reach out and touch faith [G] [Em]')).toEqual([
      { chord: null, text: 'Reach' },
      { chord: null, text: 'out' },
      { chord: null, text: 'and' },
      { chord: null, text: 'touch' },
      { chord: null, text: 'faith' },
    ]);
  });

  it('reassembles a word split by a chord glued on both sides', () => {
    expect(tokenizeChordedLine('It was won[C]derful')).toEqual([
      { chord: null, text: 'It' },
      { chord: null, text: 'was' },
      { chord: 'C', text: 'wonderful' },
    ]);
  });

  it('reassembles a word split by two chords glued on both sides, keeping the first chord', () => {
    expect(tokenizeChordedLine('won[C]der[D]ful')).toEqual([{ chord: 'C', text: 'wonderful' }]);
  });

  it('strips a hyphen marking the syllable break before a mid-word chord, not just the bracket', () => {
    // Real bug found live 2026-09-11 — a common chart convention hyphenates
    // a word at the syllable where the chord lands (e.g. "Navi-[F]dad").
    // The hyphen is a visual chord-placement aid, not part of the word;
    // left in, it read as "wonder-ful" (two words with a pause) instead of
    // "wonderful" once the bracket was stripped for chords-off playback.
    expect(tokenizeChordedLine('It was won-[C]derful')).toEqual([
      { chord: null, text: 'It' },
      { chord: null, text: 'was' },
      { chord: 'C', text: 'wonderful' },
    ]);
  });

  it('strips a hyphen before each of two chords glued mid-word', () => {
    expect(tokenizeChordedLine('won-[C]der-[D]ful')).toEqual([{ chord: 'C', text: 'wonderful' }]);
  });

  it('keeps a different chord glued to the end of a word instead of dropping it, attaching it forward to the next word', () => {
    // Found live 2026-09-04 via the new chord-line-merge feature — a chord
    // glued to a word's front and a DIFFERENT chord glued to its back (the
    // chord changes right as that word ends) was silently discarding the
    // second chord entirely.
    expect(tokenizeChordedLine('[G]Real[C] lyric[D] line')).toEqual([
      { chord: 'G', text: 'Real' },
      { chord: 'C', text: 'lyric' },
      { chord: 'D', text: 'line' },
    ]);
  });

  it('handles a line with no chords at all', () => {
    expect(tokenizeChordedLine('Plain lyric line')).toEqual([
      { chord: null, text: 'Plain' },
      { chord: null, text: 'lyric' },
      { chord: null, text: 'line' },
    ]);
  });

  it('handles an empty line', () => {
    expect(tokenizeChordedLine('')).toEqual([]);
  });

  it('ignores a bracketed section label rather than treating it as a chord', () => {
    expect(tokenizeChordedLine('[Chorus] [G]Amazing grace')).toEqual([
      { chord: 'G', text: 'Amazing' },
      { chord: null, text: 'grace' },
    ]);
  });

  it('drops bracket-wrapped bar/rhythm notation entirely instead of producing empty-text pseudo-chords', () => {
    // Real bug found live 2026-09-17 ("Have You Ever Seen the Rain") — a
    // scraped source wrote its instrumental bar line as bracket-wrapped bar
    // and dash characters glued together with no spaces, e.g.
    // "[|][Am][|][-][|][C][|]". Every bracket used to be treated as a
    // chord unconditionally, so each "|"/"-" became its own chord token
    // with nothing to attach it to (nothing real is ever glued to a bar
    // character), producing a chain of {chord: '|', text: ''}-style
    // entries. Heard live as "a strange pause" mid-line — either the app
    // tried to speak the bogus chord name with chords on, or the sequence
    // forced a string of unnatural chunk breaks either way. None of it
    // should produce any ChordedWord at all, real or empty.
    expect(tokenizeChordedLine('Been that way for [C]all my time. [|][Am][|][-][|][C][|]')).toEqual([
      { chord: null, text: 'Been' },
      { chord: null, text: 'that' },
      { chord: null, text: 'way' },
      { chord: null, text: 'for' },
      { chord: 'C', text: 'all' },
      { chord: null, text: 'my' },
      { chord: null, text: 'time.' },
    ]);
  });

  it('treats a bar-separated alternate chord as a chord, keeping the first, and reassembles a word split by it', () => {
    // Found live 2026-09-18 ("Ordinary World", Duran Duran) — a file merged
    // from two chord charts wrote both as "[A|D]". Not recognized as a
    // chord, the bracket was dropped and "ave[Em|A]nue" became two words.
    expect(tokenizeChordedLine('[A|D]on the ave[Em|A]nue')).toEqual([
      { chord: 'A', text: 'on' },
      { chord: null, text: 'the' },
      { chord: 'Em', text: 'avenue' },
    ]);
  });

  it('drops a standalone line made entirely of bar/rhythm notation, producing no words at all', () => {
    expect(tokenizeChordedLine('[|][Am][|][-][|][C][|][-][|][Em][|]')).toEqual([]);
  });
});

describe('tokenizePlainLine', () => {
  it('produces words with no chord data', () => {
    expect(tokenizePlainLine('Plain lyric line')).toEqual([
      { chord: null, text: 'Plain' },
      { chord: null, text: 'lyric' },
      { chord: null, text: 'line' },
    ]);
  });
});
