import { buildSongAnnouncement } from './songAnnouncement';

describe('buildSongAnnouncement', () => {
  it('includes the key when known', () => {
    expect(buildSongAnnouncement('Beautiful Day', 'A')).toBe('Beautiful Day, Key of A');
  });

  it('omits the key phrase entirely when no key is known', () => {
    expect(buildSongAnnouncement('Beautiful Day', undefined)).toBe('Beautiful Day');
  });

  it('omits the key phrase when the key is an empty/whitespace string', () => {
    expect(buildSongAnnouncement('Beautiful Day', '   ')).toBe('Beautiful Day');
  });

  it('trims surrounding whitespace on both title and key', () => {
    expect(buildSongAnnouncement('  Beautiful Day  ', '  A  ')).toBe('Beautiful Day, Key of A');
  });

  it('includes capo alongside key when both are known', () => {
    expect(buildSongAnnouncement('Heart of Worship', 'Eb', '1')).toBe('Heart of Worship, Key of Eb, Capo 1');
  });

  it('includes capo even when no key is known', () => {
    expect(buildSongAnnouncement('Heart of Worship', undefined, '1')).toBe('Heart of Worship, Capo 1');
  });

  it('omits the capo phrase when the capo is an empty/whitespace string', () => {
    expect(buildSongAnnouncement('Beautiful Day', 'A', '   ')).toBe('Beautiful Day, Key of A');
  });

  it('trims surrounding whitespace on capo', () => {
    expect(buildSongAnnouncement('Heart of Worship', 'Eb', '  1  ')).toBe('Heart of Worship, Key of Eb, Capo 1');
  });
});
