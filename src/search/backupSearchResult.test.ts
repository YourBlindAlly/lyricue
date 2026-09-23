const mockExists = jest.fn();
const mockUpload = jest.fn();
jest.mock('../cloud/dropbox/dropboxApi', () => ({
  dropboxFileExists: (...a: unknown[]) => mockExists(...a),
  uploadDropboxFile: (...a: unknown[]) => mockUpload(...a),
}));

import {
  backupSearchResultToDropbox,
  copyToPersonalDropboxIfMissing,
  personalCopyPathForSong,
  upgradeSearchSongSource,
} from './backupSearchResult';
import type { Song } from '../types';

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  mockExists.mockReset();
  mockUpload.mockReset();
  mockExists.mockResolvedValue(false);
  mockUpload.mockResolvedValue(undefined);
});

describe('backupSearchResultToDropbox', () => {
  it('uploads to a "/Title - Artist.ext" path at the Dropbox root, stripping the key', async () => {
    backupSearchResultToDropbox(
      { title: 'Hotel California', artist: 'Eagles', key: 'Bm', path: '/hotel california - eagles [bm].pro' },
      'song content'
    );
    await flush();
    expect(mockUpload).toHaveBeenCalledWith('/Hotel California - Eagles.pro', 'song content');
  });

  it('omits the artist segment when there is none', async () => {
    backupSearchResultToDropbox({ title: 'Amazing Grace', artist: null, key: null, path: '/amazing grace.chopro' }, 'x');
    await flush();
    expect(mockUpload).toHaveBeenCalledWith('/Amazing Grace.chopro', 'x');
  });

  it('never throws when the upload fails (not connected, etc.)', async () => {
    mockUpload.mockRejectedValue(new Error('Not connected to Dropbox.'));
    expect(() =>
      backupSearchResultToDropbox({ title: 'X', artist: null, key: null, path: '/x.pro' }, 'x')
    ).not.toThrow();
    await flush();
  });

  it('strips characters unsafe in a filename', async () => {
    backupSearchResultToDropbox(
      { title: 'Rock: Paper?', artist: 'A/B', key: null, path: '/rock paper - a b.txt' },
      'x'
    );
    await flush();
    expect(mockUpload).toHaveBeenCalledWith('/Rock Paper - AB.txt', 'x');
  });

  it('does not overwrite a copy that is already in the personal Dropbox', async () => {
    mockExists.mockResolvedValue(true);
    backupSearchResultToDropbox({ title: 'X', artist: null, key: null, path: '/x.pro' }, 'x');
    await flush();
    expect(mockUpload).not.toHaveBeenCalled();
  });
});

describe('copyToPersonalDropboxIfMissing', () => {
  it('returns true without uploading when the file already exists', async () => {
    mockExists.mockResolvedValue(true);
    expect(await copyToPersonalDropboxIfMissing('/x.pro', 'text')).toBe(true);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('returns false instead of throwing when Dropbox is unavailable', async () => {
    mockExists.mockRejectedValue(new Error('Not connected to Dropbox.'));
    expect(await copyToPersonalDropboxIfMissing('/x.pro', 'text')).toBe(false);
  });
});

describe('personalCopyPathForSong', () => {
  const base = { id: '1', title: 'T', rawText: '', lines: [], chordedLines: [], sections: [], addedAt: 0 };

  it('strips the [Key] suffix from a community filename', () => {
    const song: Song = {
      ...base,
      source: { type: 'search', path: "/community/I'll Melt With You - Modern English [C].pro" },
    };
    expect(personalCopyPathForSong(song)).toBe("/I'll Melt With You - Modern English.pro");
  });

  it('is null for songs that did not come from the community library', () => {
    expect(personalCopyPathForSong({ ...base, source: { type: 'manual' } })).toBeNull();
  });
});

describe('upgradeSearchSongSource', () => {
  const base = { id: '1', title: 'T', rawText: 'raw', lines: [], chordedLines: [], sections: [], addedAt: 0 };

  it('switches a search-sourced song to dropbox once the personal copy exists', async () => {
    mockExists.mockResolvedValue(false);
    const song: Song = { ...base, source: { type: 'search', path: '/community/T - A [C].pro' } };
    const upgraded = await upgradeSearchSongSource(song);
    expect(upgraded.source).toEqual({ type: 'dropbox', path: '/t - a.pro' });
    expect(mockUpload).toHaveBeenCalledWith('/T - A.pro', 'raw');
  });

  it('leaves a non-search song untouched', async () => {
    const song: Song = { ...base, source: { type: 'manual' } };
    expect(await upgradeSearchSongSource(song)).toBe(song);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('leaves the song untouched when the copy fails', async () => {
    mockExists.mockRejectedValue(new Error('Not connected to Dropbox.'));
    const song: Song = { ...base, source: { type: 'search', path: '/community/T - A [C].pro' } };
    expect(await upgradeSearchSongSource(song)).toBe(song);
  });
});
