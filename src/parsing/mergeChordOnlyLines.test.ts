import { mergeChordOnlyLines } from './mergeChordOnlyLines';

describe('mergeChordOnlyLines', () => {
  it('merges a chord-only line into the next lyric line at word boundaries', () => {
    const input = ['[G5]         [D5]', 'When dreaming, I am guided'].join('\n');
    // D5 sits at column 13, one character closer to the end of "dreaming,"
    // (column 14) than to the start of "I" (column 15) — nearest boundary
    // wins, so it lands right after the comma, not before "I".
    expect(mergeChordOnlyLines(input)).toBe('[G5]When dreaming,[D5] I am guided');
  });

  it('snaps a chord to the end of the nearest word rather than mid-word', () => {
    // The D5 column sits inside "guided" — should land at the end of the
    // nearest word (either "am" or "guided"), never inside a word.
    const input = ['        [D5]', 'When I am guided through'].join('\n');
    const result = mergeChordOnlyLines(input);
    expect(result).not.toMatch(/gu\[D5\]ided|gui\[D5\]ded/); // never intra-word
    expect(result.replace(/\[D5\]/, '')).toBe('When I am guided through');
  });

  it('appends a trailing chord past the end of the lyric line', () => {
    const input = ['                              [D5]', 'Short line'].join('\n');
    expect(mergeChordOnlyLines(input)).toBe('Short line[D5]');
  });

  it('places a leading chord before the first word', () => {
    const input = ['[G5]', 'First word here'].join('\n');
    expect(mergeChordOnlyLines(input)).toBe('[G5]First word here');
  });

  it('does not treat a section label in brackets as a chord', () => {
    const input = ['[Intro]', 'Some lyric line here'].join('\n');
    expect(mergeChordOnlyLines(input)).toBe('[Intro]\nSome lyric line here');
  });

  it('does not treat "Chorus" or "Bridge" as chords despite starting with a valid chord letter', () => {
    expect(mergeChordOnlyLines(['[Chorus]', 'A real lyric line'].join('\n'))).toBe(
      '[Chorus]\nA real lyric line'
    );
    expect(mergeChordOnlyLines(['[Bridge]', 'Another real lyric line'].join('\n'))).toBe(
      '[Bridge]\nAnother real lyric line'
    );
  });

  it('does not touch a line that already mixes real words with inline chords', () => {
    const input = '[G]Already [C]inline, leave this alone';
    expect(mergeChordOnlyLines(input)).toBe(input);
  });

  it('tolerates a blank line between the chord-only line and the lyric line', () => {
    const input = ['[G5]         [D5]', '', 'When dreaming, I am guided'].join('\n');
    expect(mergeChordOnlyLines(input)).toBe('[G5]When dreaming,[D5] I am guided');
  });

  it('drops a chord-only line with no usable lyric line after it (end of section)', () => {
    const input = ['[G5]  [D5]', '{end_of_verse}'].join('\n');
    expect(mergeChordOnlyLines(input)).toBe('{end_of_verse}');
  });

  it('drops (rather than corrupting) a chord-only line sitting right before a bracket-style section label', () => {
    // Real bug found live 2026-09-11: without the section-label exclusion,
    // this merged the chords straight into "[Verse 2]" itself, producing
    // something like "[Verse[A#] 2]" — which then partially survived the
    // main ChordPro parser's bracket-stripping as stray leftover text
    // (a floating "2" rendered as if it were a real lyric line).
    const input = ['[Amaj7][A#][A]', '[Verse 2]', 'A real lyric line'].join('\n');
    expect(mergeChordOnlyLines(input)).toBe('[Verse 2]\nA real lyric line');
  });

  it('drops a chord-only line immediately followed by another chord-only line', () => {
    const input = ['[G5]', '[D5]', 'A real lyric line'].join('\n');
    // The first chord-only line has nothing usable right after it (another
    // chord-only line), so it's dropped; the second one merges normally.
    expect(mergeChordOnlyLines(input)).toBe('[D5]A real lyric line');
  });

  it('handles multiple chords resolving to the same insertion point, preserving order', () => {
    // Both chords sit well past "Word" (columns 10 and 14 against a word
    // spanning 0-4), so both are nearest to the same boundary — its end —
    // and should land there together, original left-to-right order kept.
    const input = ['          [Am][C]', 'Word'].join('\n');
    expect(mergeChordOnlyLines(input)).toBe('Word[Am][C]');
  });

  it('leaves plain lyric-only text with no brackets at all untouched', () => {
    const input = ['A line with no chords', 'Another plain line'].join('\n');
    expect(mergeChordOnlyLines(input)).toBe(input);
  });

  it('recognizes real chords with accidentals, minor, sevenths, and slash bass notes', () => {
    const input = ['[F#m7]  [D/F#]  [Csus4]  [Bb]', 'Real lyric content here'].join('\n');
    const result = mergeChordOnlyLines(input);
    expect(result).toContain('[F#m7]');
    expect(result).toContain('[D/F#]');
    expect(result).toContain('[Csus4]');
    expect(result).toContain('[Bb]');
    expect(result).not.toContain('\n'); // fully merged into one line
  });
});
