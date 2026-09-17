jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockUploadDropboxFile = jest.fn();
const mockDeleteDropboxFile = jest.fn();
const mockListDropboxFolder = jest.fn();
const mockDownloadDropboxFile = jest.fn();
jest.mock('../cloud/dropbox/dropboxApi', () => ({
  uploadDropboxFile: (...args: unknown[]) => mockUploadDropboxFile(...args),
  deleteDropboxFile: (...args: unknown[]) => mockDeleteDropboxFile(...args),
  listDropboxFolder: (...args: unknown[]) => mockListDropboxFolder(...args),
  downloadDropboxFile: (...args: unknown[]) => mockDownloadDropboxFile(...args),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  deleteSetlist,
  importSetlistFromDropbox,
  listDropboxSetlistFiles,
  listSetlists,
  loadSetlist,
  saveSetlist,
} from './setlistStorage';

beforeEach(async () => {
  await AsyncStorage.clear();
  mockUploadDropboxFile.mockReset();
  mockDeleteDropboxFile.mockReset();
  mockListDropboxFolder.mockReset();
  mockDownloadDropboxFile.mockReset();
  mockUploadDropboxFile.mockResolvedValue(undefined);
  mockDeleteDropboxFile.mockResolvedValue(undefined);
});

describe('saveSetlist', () => {
  it('saves locally and can be read back, even if Dropbox is unreachable', async () => {
    mockUploadDropboxFile.mockRejectedValue(new Error('Not connected to Dropbox.'));
    await saveSetlist({ name: 'Gig Set', entries: [{ title: 'Song A', path: '/a.pro' }] });

    const summaries = await listSetlists();
    expect(summaries).toHaveLength(1);
    expect(summaries[0].name).toBe('Gig Set');

    const loaded = await loadSetlist(summaries[0]);
    expect(loaded).toEqual({ name: 'Gig Set', entries: [{ title: 'Song A', path: '/a.pro' }] });
  });

  it('never throws even when the Dropbox backup fails', async () => {
    mockUploadDropboxFile.mockRejectedValue(new Error('network down'));
    await expect(saveSetlist({ name: 'Gig Set', entries: [] })).resolves.toBeUndefined();
  });

  it('attempts a best-effort Dropbox backup when reachable', async () => {
    await saveSetlist({ name: 'Gig Set', entries: [{ title: 'Song A', path: '/a.pro' }] });
    expect(mockUploadDropboxFile).toHaveBeenCalledTimes(1);
    const [path, csv] = mockUploadDropboxFile.mock.calls[0];
    expect(path).toBe('/setlists/gig set.csv');
    expect(csv).toContain('Song A');
  });

  it('overwrites (same id) rather than duplicating when saved again under the same name', async () => {
    await saveSetlist({ name: 'Gig Set', entries: [{ title: 'Song A', path: '/a.pro' }] });
    await saveSetlist({ name: 'Gig Set', entries: [{ title: 'Song B', path: '/b.pro' }] });

    const summaries = await listSetlists();
    expect(summaries).toHaveLength(1);
    const loaded = await loadSetlist(summaries[0]);
    expect(loaded.entries).toEqual([{ title: 'Song B', path: '/b.pro' }]);
  });

  it('keeps two different-named setlists separate', async () => {
    await saveSetlist({ name: 'Set A', entries: [] });
    await saveSetlist({ name: 'Set B', entries: [] });
    const summaries = await listSetlists();
    expect(summaries.map((s) => s.name).sort()).toEqual(['Set A', 'Set B']);
  });
});

describe('loadSetlist', () => {
  it('throws a clear error for a setlist that no longer exists', async () => {
    await expect(loadSetlist({ id: 'missing', name: 'Ghost' })).rejects.toThrow('Ghost');
  });
});

describe('deleteSetlist', () => {
  it('removes it locally', async () => {
    await saveSetlist({ name: 'Gig Set', entries: [] });
    const [summary] = await listSetlists();

    await deleteSetlist(summary);

    expect(await listSetlists()).toEqual([]);
  });

  it('deliberately leaves the Dropbox backup untouched, as a recovery point', async () => {
    await saveSetlist({ name: 'Gig Set', entries: [] });
    const [summary] = await listSetlists();
    mockDeleteDropboxFile.mockClear();

    await deleteSetlist(summary);

    expect(mockDeleteDropboxFile).not.toHaveBeenCalled();
  });
});

describe('listDropboxSetlistFiles', () => {
  it('lists only files, filtering out any folder entries', async () => {
    mockListDropboxFolder.mockResolvedValue([
      { name: 'Gig Set.csv', path: '/setlists/gig set.csv', isFolder: false },
      { name: 'Archive', path: '/setlists/archive', isFolder: true },
    ]);
    const files = await listDropboxSetlistFiles();
    expect(mockListDropboxFolder).toHaveBeenCalledWith('/setlists', ['.csv']);
    expect(files).toEqual([{ name: 'Gig Set.csv', path: '/setlists/gig set.csv', isFolder: false }]);
  });
});

describe('importSetlistFromDropbox', () => {
  it('downloads, parses, and saves the CSV locally under a name derived from its filename', async () => {
    mockDownloadDropboxFile.mockResolvedValue('Title,Path\r\nSong A,/a.pro\r\nSong B,/b.pro');

    const result = await importSetlistFromDropbox({
      name: 'Friday Night Set.csv',
      path: '/setlists/friday night set.csv',
      isFolder: false,
    });

    expect(result).toEqual({
      name: 'Friday Night Set',
      entries: [
        { title: 'Song A', path: '/a.pro' },
        { title: 'Song B', path: '/b.pro' },
      ],
    });

    const summaries = await listSetlists();
    expect(summaries.map((s) => s.name)).toEqual(['Friday Night Set']);
    const loaded = await loadSetlist(summaries[0]);
    expect(loaded.entries).toEqual(result.entries);
  });

  it('overwrites an existing local setlist of the same imported name', async () => {
    await saveSetlist({ name: 'Friday Night Set', entries: [{ title: 'Old Song', path: '/old.pro' }] });
    mockDownloadDropboxFile.mockResolvedValue('Title,Path\r\nNew Song,/new.pro');

    await importSetlistFromDropbox({
      name: 'Friday Night Set.csv',
      path: '/setlists/friday night set.csv',
      isFolder: false,
    });

    const summaries = await listSetlists();
    expect(summaries).toHaveLength(1);
    const loaded = await loadSetlist(summaries[0]);
    expect(loaded.entries).toEqual([{ title: 'New Song', path: '/new.pro' }]);
  });
});
