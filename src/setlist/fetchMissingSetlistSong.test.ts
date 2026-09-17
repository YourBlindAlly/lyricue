const mockDownloadDropboxFile = jest.fn();
jest.mock('../cloud/dropbox/dropboxApi', () => ({
  downloadDropboxFile: (...args: unknown[]) => mockDownloadDropboxFile(...args),
}));

import { fetchMissingSetlistSong } from './fetchMissingSetlistSong';

beforeEach(() => {
  mockDownloadDropboxFile.mockReset();
});

describe('fetchMissingSetlistSong', () => {
  it('downloads and parses the song from its Dropbox path', async () => {
    mockDownloadDropboxFile.mockResolvedValue('{title: Amazing Grace}\n[G]Amazing grace, how sweet the sound');
    const song = await fetchMissingSetlistSong({ title: 'Amazing Grace', path: '/amazing grace.pro' });
    expect(mockDownloadDropboxFile).toHaveBeenCalledWith('/amazing grace.pro');
    expect(song?.title).toBe('Amazing Grace');
    expect(song?.source).toEqual({ type: 'dropbox', path: '/amazing grace.pro' });
  });

  it('derives the filename (for extension/title-fallback purposes) from the last path segment', async () => {
    mockDownloadDropboxFile.mockResolvedValue('Plain lyrics, no title directive');
    const song = await fetchMissingSetlistSong({ title: 'Reliroo', path: '/reliroo - rusty perez.txt' });
    // No {title:} directive and a plain .txt extension — falls back to the
    // filename stem, same as opening it fresh from Dropbox Browse would.
    expect(song?.title).toBe('reliroo - rusty perez');
  });

  it('returns null without throwing when the download fails (offline, file deleted, etc.)', async () => {
    mockDownloadDropboxFile.mockRejectedValue(new Error('network down'));
    const song = await fetchMissingSetlistSong({ title: 'Reliroo', path: '/reliroo - rusty perez.txt' });
    expect(song).toBeNull();
  });

  it('returns null immediately for an entry with no path, without calling Dropbox', async () => {
    const song = await fetchMissingSetlistSong({ title: 'Reliroo', path: '' });
    expect(song).toBeNull();
    expect(mockDownloadDropboxFile).not.toHaveBeenCalled();
  });

  it('returns null when the downloaded content is empty (nothing to build a song from)', async () => {
    mockDownloadDropboxFile.mockResolvedValue('');
    const song = await fetchMissingSetlistSong({ title: 'Reliroo', path: '/reliroo - rusty perez.txt' });
    expect(song).toBeNull();
  });
});
