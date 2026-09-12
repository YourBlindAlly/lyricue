import { isJunkLine } from './junkLineFilter';

describe('isJunkLine', () => {
  it('flags a bare https URL', () => {
    expect(isJunkLine('https://www.youtube.com/watch?v=Yim4--J44gk')).toBe(true);
  });

  it('flags a URL combined with a capo note on the same line', () => {
    expect(isJunkLine(' https://www.youtube.com/watch?v=Yim4--J44gk  Capo 2')).toBe(true);
  });

  it('flags a www. link with no protocol', () => {
    expect(isJunkLine('www.ultimate-guitar.com/tab/some-song')).toBe(true);
  });

  it('flags a standalone capo note', () => {
    expect(isJunkLine('Capo 2')).toBe(true);
    expect(isJunkLine('Capo: 3rd fret')).toBe(true);
    expect(isJunkLine('capo no capo')).toBe(true);
  });

  it('does not flag a real lyric line', () => {
    expect(isJunkLine("Lately, I've been, I've been losing sleep")).toBe(false);
  });

  it('does not flag a real lyric line whose first word merely starts with "capo"', () => {
    expect(isJunkLine('Capon crowed at dawn over the yard')).toBe(false);
  });

  it('flags a "TIP:" performance-note aside', () => {
    expect(isJunkLine('TIP:  If transposing, play the transposed root chord.')).toBe(true);
    expect(isJunkLine('tip: capo up two')).toBe(true);
  });

  it('does not flag a real lyric line that merely contains the word "tip"', () => {
    expect(isJunkLine("I'll leave a tip, then I'm gone")).toBe(false);
  });

  it('flags freeform performance notes beyond just capo', () => {
    expect(isJunkLine('Tuning: Drop D')).toBe(true);
    expect(isJunkLine('Strumming pattern: D D U U D U')).toBe(true);
    expect(isJunkLine('Drop D tuning')).toBe(true);
    expect(isJunkLine('Open tuning')).toBe(true);
  });

  it('does not flag a real lyric line that happens to start with "Strummin\'"', () => {
    // Shaped after a real false-positive found live 2026-09-04 (a genuine
    // lyric line starting with "Strummin'", not "strum"/"strumming"), using
    // an invented line here rather than quoting the actual song.
    expect(isJunkLine("Strummin' along under the summer sky tonight")).toBe(false);
  });

  it('flags a standalone six-string tab diagram line', () => {
    expect(isJunkLine('e|--------------------------------|')).toBe(true);
    expect(isJunkLine('G|-777/99/1111\\9/11/12\\999/11-11\\-9h11p9h11p9h11-|')).toBe(true);
  });

  it('flags a tab diagram line using flat/sharp alternate-tuning string labels', () => {
    expect(isJunkLine('Eb|-------0------|')).toBe(true);
    expect(isJunkLine('F#|-------0------|')).toBe(true);
  });

  it('flags an inline chord-plus-tab-riff line even without brackets around every chord', () => {
    expect(isJunkLine('[D5]       [A5]       [G5]       [A5]   G|-6--7--9--7--6--7-|')).toBe(true);
    expect(isJunkLine('[D5]       [A5]        [G5]               A5 G|-6--7--9--7--6--7-|')).toBe(
      true
    );
  });

  it('flags a pipe-less tab diagram line (string letter on both ends)', () => {
    // Shaped after a real line found live 2026-09-04 in "Higher" (Creed) —
    // a tab style with no pipe character at all.
    expect(isJunkLine('e--------------------------------e')).toBe(true);
    expect(isJunkLine('g----7---------------------------g')).toBe(true);
    expect(isJunkLine('d----7---------5----------7------d')).toBe(true);
  });

  it('does not flag a real lyric line', () => {
    expect(isJunkLine('And the cat sat quietly on the mat by the door')).toBe(false);
  });

  it('flags a line that trims down to nothing but stray punctuation', () => {
    // Real bug found live 2026-09-12 in "Have You Ever Seen the Rain"
    // (CCR): a line of trailing whitespace ending in a lone "." — a
    // leftover formatting artifact, spoken as if it were a real lyric.
    expect(isJunkLine('                                        .')).toBe(true);
    expect(isJunkLine('...')).toBe(true);
    expect(isJunkLine('!?')).toBe(true);
  });

  it('does not flag a bare "-" or "--" — this app\'s own section-marker convention', () => {
    expect(isJunkLine('-')).toBe(false);
    expect(isJunkLine('--')).toBe(false);
  });

  it('does not flag a real lyric line that is short and ends in punctuation', () => {
    expect(isJunkLine('Yeah!')).toBe(false);
    expect(isJunkLine('Why?')).toBe(false);
  });
});
