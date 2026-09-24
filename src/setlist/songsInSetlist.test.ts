import { songsInSetlist } from './songsInSetlist';
import type { Song } from '../types';

const base = { rawText: '', lines: [], chordedLines: [], sections: [], addedAt: 0 };

function dropboxSong(id: string, title: string, path: string): Song {
  return { ...base, id, title, source: { type: 'dropbox', path } };
}

describe('songsInSetlist', () => {
  it('returns the resolved songs in setlist order', () => {
    const a = dropboxSong('1', 'A', '/a.pro');
    const b = dropboxSong('2', 'B', '/b.pro');
    const library = [b, a];
    const setlist = { name: 'Set', entries: [{ title: 'A', path: '/a.pro' }, { title: 'B', path: '/b.pro' }] };
    expect(songsInSetlist(library, setlist)).toEqual([a, b]);
  });

  it('skips an entry that has not been downloaded to this device', () => {
    const a = dropboxSong('1', 'A', '/a.pro');
    const setlist = { name: 'Set', entries: [{ title: 'A', path: '/a.pro' }, { title: 'Missing', path: '/missing.pro' }] };
    expect(songsInSetlist([a], setlist)).toEqual([a]);
  });

  it('does not list the same song twice if two entries resolve to it', () => {
    const a = dropboxSong('1', 'A', '/a.pro');
    const setlist = { name: 'Set', entries: [{ title: 'A', path: '/a.pro' }, { title: 'A', path: '/a.pro' }] };
    expect(songsInSetlist([a], setlist)).toEqual([a]);
  });
});
