const mockDownloadDropboxFile = jest.fn();
jest.mock('../cloud/dropbox/dropboxApi', () => ({
  downloadDropboxFile: (...args: unknown[]) => mockDownloadDropboxFile(...args),
  dropboxFileExists: jest.fn().mockResolvedValue(true),
  uploadDropboxFile: jest.fn(),
}));

import { refreshSetlistSongs } from './refreshSetlistSongs';
import type { Song } from '../types';

beforeEach(() => mockDownloadDropboxFile.mockReset());

const existing: Song = {
  id: 'old-id',
  title: 'Amazing Grace',
  rawText: 'old',
  lines: ['old'],
  chordedLines: [[{ chord: null, text: 'old' }]],
  sections: [],
  source: { type: 'dropbox', path: '/amazing grace.pro' },
  addedAt: 123,
};

describe('refreshSetlistSongs', () => {
  it('re-downloads each entry, keeping the existing library song id and added date', async () => {
    mockDownloadDropboxFile.mockResolvedValue('{title: Amazing Grace}\n[G]Amazing grace');
    const saved: Song[] = [];
    const result = await refreshSetlistSongs(
      { name: 'Set', entries: [{ title: 'Amazing Grace', path: '/amazing grace.pro' }] },
      [existing],
      async (s) => {
        saved.push(s);
      }
    );
    expect(result).toEqual({ refreshed: 1, skipped: [], failed: [] });
    expect(saved[0].id).toBe('old-id');
    expect(saved[0].addedAt).toBe(123);
    expect(saved[0].lines).toEqual(['Amazing grace']);
  });

  it('skips entries with no path, and names failed downloads without stopping', async () => {
    mockDownloadDropboxFile.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('Some lyric line');
    const saved: Song[] = [];
    const result = await refreshSetlistSongs(
      {
        name: 'Set',
        entries: [
          { title: 'Pasted', path: '' },
          { title: 'A', path: '/a.txt' },
          { title: 'B', path: '/b.txt' },
        ],
      },
      [],
      async (s) => {
        saved.push(s);
      }
    );
    expect(result).toEqual({ refreshed: 1, skipped: ['Pasted'], failed: ['A'] });
    expect(saved).toHaveLength(1);
  });

  it('refreshes a path-less community-library song from its copy in the personal Dropbox', async () => {
    mockDownloadDropboxFile.mockResolvedValue('{title: Melt}\n[C]I will melt with you');
    const community: Song = {
      ...existing,
      id: 'c1',
      title: 'Melt',
      source: { type: 'search', path: '/community/Melt - Band [C].pro' },
    };
    const saved: Song[] = [];
    const result = await refreshSetlistSongs(
      { name: 'Set', entries: [{ title: 'Melt', path: '' }] },
      [community],
      async (s) => {
        saved.push(s);
      }
    );
    expect(mockDownloadDropboxFile).toHaveBeenCalledWith('/melt - band.pro');
    expect(result.refreshed).toBe(1);
    expect(saved[0].id).toBe('c1');
    expect(saved[0].source).toEqual({ type: 'dropbox', path: '/melt - band.pro' });
  });
});
