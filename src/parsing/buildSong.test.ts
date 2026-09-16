import { buildSong, buildSongFromFile } from './buildSong';

describe('buildSong', () => {
  it('builds a plain-text song when the content has no real chords', () => {
    const song = buildSong('Amazing grace, how sweet the sound\nThat saved a wretch like me', 'Amazing Grace', {
      type: 'manual',
    });
    expect(song?.title).toBe('Amazing Grace');
    expect(song?.key).toBeUndefined();
    expect(song?.chordedLines.every((line) => line.length === 0 || line.every((w) => !w.chord))).toBe(true);
  });

  it('builds a ChordPro-aware song when the content has real inline chord brackets, with no file extension involved', () => {
    const song = buildSong('[C]Amazing grace, how [G]sweet the sound', 'Amazing Grace', { type: 'manual' });
    expect(song?.lines[0]).toBe('Amazing grace, how sweet the sound');
    expect(song?.chordedLines[0].some((w) => w.chord === 'C')).toBe(true);
    expect(song?.chordedLines[0].some((w) => w.chord === 'G')).toBe(true);
  });

  it('detects and merges a bare, unbracketed chord-above-lyric layout even with no ChordPro extension', () => {
    // The exact shape a Word document typed by hand is likely to use —
    // covered in detail by mergeChordOnlyLines.test.ts; this just confirms
    // buildSong actually reaches for that behavior via content alone.
    const song = buildSong('C\nAmazing grace', 'Amazing Grace', { type: 'manual' });
    expect(song?.chordedLines[0].some((w) => w.chord === 'C')).toBe(true);
  });

  it('does not mistake a bracketed section label alone for a chord', () => {
    const song = buildSong('[Chorus]\nAmazing grace, how sweet the sound', 'Amazing Grace', { type: 'manual' });
    expect(song?.chordedLines.every((line) => line.every((w) => !w.chord))).toBe(true);
  });
});

describe('buildSongFromFile', () => {
  it('routes an explicit .cho extension through ChordPro parsing regardless of content', () => {
    const song = buildSongFromFile('{title: Test}\n\nJust plain lyrics, no chords at all', 'Test.cho', {
      type: 'file',
    });
    expect(song?.title).toBe('Test');
  });

  it('routes a .docx-derived text through the same content-based decision as a manual paste', () => {
    const song = buildSongFromFile('C\nAmazing grace', 'Amazing Grace.docx', { type: 'file' });
    expect(song?.chordedLines[0].some((w) => w.chord === 'C')).toBe(true);
    expect(song?.title).toBe('Amazing Grace');
  });
});
