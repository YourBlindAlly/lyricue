import { migrateSong } from './migrateSong';
import type { Song } from '../types';

function makeSong(overrides: Partial<Song>): Song {
  return {
    id: 'id',
    title: 'Untitled',
    rawText: 'Line one\nLine two',
    lines: ['Line one', 'Line two'],
    chordedLines: [
      [{ chord: null, text: 'Line' }, { chord: null, text: 'one' }],
      [{ chord: null, text: 'Line' }, { chord: null, text: 'two' }],
    ],
    sections: [],
    source: { type: 'manual' },
    addedAt: 0,
    ...overrides,
  };
}

describe('migrateSong', () => {
  it('derives chordedLines from lines when the field is missing (pre-update persisted data)', () => {
    // Simulates JSON.parse of data saved before chordedLines existed —
    // the field is simply absent, not an empty array.
    const legacy = makeSong({}) as unknown as Record<string, unknown>;
    delete legacy.chordedLines;
    const migrated = migrateSong(legacy as unknown as Song);
    expect(migrated.chordedLines).toEqual([
      [{ chord: null, text: 'Line' }, { chord: null, text: 'one' }],
      [{ chord: null, text: 'Line' }, { chord: null, text: 'two' }],
    ]);
  });

  it('does not mutate title or an already-set key when migrating', () => {
    const song = makeSong({ title: 'My Song', key: 'G' });
    const migrated = migrateSong(song);
    expect(migrated.title).toBe('My Song');
    expect(migrated.key).toBe('G');
  });

  it('backfills capo by re-parsing rawText, for a song saved before capo directives were recognized', () => {
    // Simulates a real ChordPro song already in the library from before the
    // {capo:} directive was parsed at all — it was always in the file's raw
    // text, just never surfaced onto the Song object until re-parsed.
    const song = makeSong({
      title: 'Heart of Worship',
      source: { type: 'dropbox', path: '/Heart of Worship - Matt Redman.pro' },
      rawText: '{title: Heart of Worship}\n{key: Eb}\n{capo: 1}\n[D]I simply come',
      lines: ['I simply come'],
      chordedLines: [[{ chord: 'D', text: 'I' }, { chord: null, text: 'simply' }, { chord: null, text: 'come' }]],
      capo: undefined,
    });
    const migrated = migrateSong(song);
    expect(migrated.capo).toBe('1');
  });

  it('does not overwrite an already-set capo when migrating', () => {
    const song = makeSong({
      source: { type: 'dropbox', path: '/Song.pro' },
      rawText: '{capo: 2}\n[D]A line',
      lines: ['A line'],
      chordedLines: [[{ chord: 'D', text: 'A' }, { chord: null, text: 'line' }]],
      capo: '5',
    });
    const migrated = migrateSong(song);
    expect(migrated.capo).toBe('5');
  });

  // The core behavior this whole module exists for: parsing logic (junk-line
  // filtering, section handling, etc.) keeps improving after a song was
  // first imported, and re-deriving lines/chordedLines from rawText on every
  // load — not just once at import — is what lets an already-in-the-library
  // song benefit from a later parser fix without being manually re-imported.
  describe('re-parsing from rawText on every load', () => {
    it('re-filters a junk line that the parser now catches but let through before (plain text)', () => {
      const song = makeSong({
        source: { type: 'manual' },
        rawText: 'Real lyric line\nhttps://example.com/some-tab',
        // Simulates a song imported before the URL junk-filter existed —
        // the stray link is still sitting in the persisted `lines`.
        lines: ['Real lyric line', 'https://example.com/some-tab'],
      });
      const migrated = migrateSong(song);
      expect(migrated.lines).toEqual(['Real lyric line']);
    });

    it('re-filters a junk line in a Dropbox-sourced ChordPro file, using the ChordPro parser', () => {
      const song = makeSong({
        source: { type: 'dropbox', path: '/songs/example.pro' },
        rawText: '{title: Example}\n[G]Real lyric line\nTIP: play it soft',
        lines: ['Real lyric line', 'TIP: play it soft'],
      });
      const migrated = migrateSong(song);
      expect(migrated.lines).toEqual(['Real lyric line']);
      expect(migrated.chordedLines[0]).toEqual([
        { chord: 'G', text: 'Real' },
        { chord: null, text: 'lyric' },
        { chord: null, text: 'line' },
      ]);
    });

    it('always uses the plain-text parser for a manual/pasted song, regardless of content', () => {
      // InputScreen never routes pasted text through ChordPro parsing, so a
      // pasted song containing a literal "[Chorus]"-style plain-text section
      // marker must stay a section marker, not get stripped as if it were a
      // chord bracket.
      const song = makeSong({
        source: { type: 'manual' },
        rawText: '[Chorus]\nReal lyric line',
        lines: ['[Chorus]', 'Real lyric line'],
        sections: [],
      });
      const migrated = migrateSong(song);
      expect(migrated.lines).toEqual(['Real lyric line']);
      expect(migrated.sections).toEqual([{ lineIndex: 0, label: 'Chorus' }]);
    });

    it('infers ChordPro for a locally-imported file (no stored filename) from existing chord data', () => {
      const song = makeSong({
        source: { type: 'file' },
        rawText: '[G]Real lyric line\nTIP: play it soft',
        lines: ['Real lyric line', 'TIP: play it soft'],
        chordedLines: [
          [{ chord: 'G', text: 'Real' }, { chord: null, text: 'lyric' }, { chord: null, text: 'line' }],
          [{ chord: null, text: 'TIP: play it soft' }],
        ],
      });
      const migrated = migrateSong(song);
      expect(migrated.lines).toEqual(['Real lyric line']);
      expect(migrated.chordedLines[0]).toEqual([
        { chord: 'G', text: 'Real' },
        { chord: null, text: 'lyric' },
        { chord: null, text: 'line' },
      ]);
    });

    it('keeps the existing already-parsed data if re-parsing rawText somehow produces nothing', () => {
      const song = makeSong({ rawText: '' });
      const migrated = migrateSong(song);
      expect(migrated.lines).toEqual(song.lines);
    });
  });
});
