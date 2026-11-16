import { safeFileStem, songFileName } from './songFileName';

describe('safeFileStem', () => {
  it('removes characters files cannot contain', () => {
    expect(safeFileStem('AC/DC: Back "in" Black?')).toBe('ACDC Back in Black');
  });
  it('collapses extra spaces', () => {
    expect(safeFileStem('  My   Song  ')).toBe('My Song');
  });
  it('falls back when nothing usable is left', () => {
    expect(safeFileStem('???')).toBe('Untitled');
    expect(safeFileStem('')).toBe('Untitled');
  });
});

describe('songFileName', () => {
  it('uses .txt for plain lyrics', () => {
    expect(songFileName('New Song', 'line one\nline two')).toBe('New Song.txt');
  });
  it('uses .cho when the text has real chords', () => {
    expect(songFileName('New Song', '[G]line one\n[C]line two')).toBe('New Song.cho');
  });
});
