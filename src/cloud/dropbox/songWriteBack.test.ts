jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockDownload = jest.fn();
const mockUploadOverwrite = jest.fn();
const mockUploadIfRev = jest.fn();
const mockUploadNew = jest.fn();
jest.mock('./dropboxApi', () => ({
  downloadDropboxFileWithRev: (...a: unknown[]) => mockDownload(...a),
  uploadDropboxFile: (...a: unknown[]) => mockUploadOverwrite(...a),
  uploadDropboxFileIfRevMatches: (...a: unknown[]) => mockUploadIfRev(...a),
  uploadDropboxFileAsNew: (...a: unknown[]) => mockUploadNew(...a),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  copyPathFor,
  flushPendingSongWrites,
  hasPendingSongWrite,
  writeBackPathFor,
  writeSongEditToDropbox,
} from './songWriteBack';
import { saveSaveBackToDropbox } from './saveBackPreference';
import type { Song } from '../../types';

function song(overrides: Partial<Song>): Song {
  return {
    id: 's1',
    title: 'Amazing Grace',
    rawText: 'edited',
    lines: ['edited'],
    chordedLines: [[{ chord: null, text: 'edited' }]],
    sections: [],
    source: { type: 'dropbox', path: '/amazing grace - john newton.cho' },
    addedAt: 1,
    ...overrides,
  };
}

const PATH = '/amazing grace - john newton.cho';

beforeEach(async () => {
  await AsyncStorage.clear();
  mockDownload.mockReset();
  mockUploadOverwrite.mockReset();
  mockUploadIfRev.mockReset();
  mockUploadNew.mockReset();
  mockUploadOverwrite.mockResolvedValue(undefined);
  mockUploadIfRev.mockResolvedValue(undefined);
  mockUploadNew.mockResolvedValue({ name: "copy.cho", path: "/x/copy.cho" });
});

describe('creating a new song', () => {
  const manual = (o: Partial<Song> = {}) => song({ source: { type: 'manual' }, title: 'New Tune', rawText: 'la la', ...o });

  it('creates the file in the notebook folder, not the main folder', async () => {
    mockUploadNew.mockResolvedValue({ name: 'New Tune.txt', path: '/notebook/new tune.txt' });
    const out = await writeSongEditToDropbox(manual(), '');
    expect(out).toEqual({ kind: 'created', path: '/notebook/new tune.txt', name: 'New Tune.txt' });
    expect(mockUploadNew).toHaveBeenCalledWith('/notebook/New Tune.txt', 'la la');
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('also creates the file for a song imported from the Files app, even with no edits', async () => {
    mockUploadNew.mockResolvedValue({ name: 'Old Hymn.txt', path: '/notebook/old hymn.txt' });
    const out = await writeSongEditToDropbox(manual({ source: { type: 'file' }, title: 'Old Hymn' }), '');
    expect(out).toEqual({ kind: 'created', path: '/notebook/old hymn.txt', name: 'Old Hymn.txt' });
    expect(mockUploadNew).toHaveBeenCalledWith('/notebook/Old Hymn.txt', 'la la');
  });

  it('names a song with chords .cho', async () => {
    mockUploadNew.mockResolvedValue({ name: 'x.cho', path: '/notebook/x.cho' });
    await writeSongEditToDropbox(manual({ rawText: '[G]la la' }), '');
    expect(mockUploadNew).toHaveBeenCalledWith('/notebook/New Tune.cho', '[G]la la');
  });

  it('says nothing at all when Dropbox was never connected', async () => {
    mockUploadNew.mockRejectedValue(new Error('Not connected to Dropbox.'));
    expect(await writeSongEditToDropbox(manual(), '')).toEqual({ kind: 'notApplicable' });
  });

  it('reports a failure to create when Dropbox is connected but unreachable', async () => {
    mockUploadNew.mockRejectedValue(new Error('Network request failed'));
    expect(await writeSongEditToDropbox(manual(), '')).toEqual({ kind: 'createFailed' });
  });
});

describe('the save-back setting', () => {
  it('does nothing for edits or new songs while off, and keeps queued edits queued', async () => {
    mockDownload.mockRejectedValue(new Error('Network request failed'));
    await writeSongEditToDropbox(song({}), 'old');
    await saveSaveBackToDropbox(false);

    mockDownload.mockReset();
    expect(await writeSongEditToDropbox(song({ rawText: 'again' }), 'old')).toEqual({ kind: 'notApplicable' });
    expect(await writeSongEditToDropbox(song({ source: { type: 'manual' } }), '')).toEqual({ kind: 'notApplicable' });
    expect(await flushPendingSongWrites()).toEqual([]);
    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockUploadNew).not.toHaveBeenCalled();
    expect(await hasPendingSongWrite(PATH)).toBe(true);
  });

  it('is on by default', async () => {
    mockDownload.mockResolvedValue({ text: 'old', rev: 'r1' });
    expect((await writeSongEditToDropbox(song({}), 'old')).kind).toBe('saved');
  });
});

describe('writeBackPathFor', () => {
  it('uses a Dropbox song\'s own path', () => {
    expect(writeBackPathFor(song({}))).toBe(PATH);
  });
  it('uses the personal copy path for a community search song', () => {
    expect(
      writeBackPathFor(song({ source: { type: 'search', path: '/community/Amazing Grace - John Newton [G].cho' } }))
    ).toBe('/amazing grace - john newton.cho');
  });
  it('is null for songs with no Dropbox file', () => {
    expect(writeBackPathFor(song({ source: { type: 'manual' } }))).toBeNull();
    expect(writeBackPathFor(song({ source: { type: 'file' } }))).toBeNull();
  });
});

describe('copyPathFor', () => {
  it('adds the marker before the extension', () => {
    expect(copyPathFor('/a/title - artist.cho')).toBe('/a/title - artist (phone edit).cho');
  });
  it('handles a path with no extension', () => {
    expect(copyPathFor('/title')).toBe('/title (phone edit)');
  });
});

describe('writeSongEditToDropbox', () => {
  it('does nothing for a demo song (no Dropbox file)', async () => {
    const out = await writeSongEditToDropbox(song({ source: { type: 'demo' } }), 'old');
    expect(out).toEqual({ kind: 'notApplicable' });
    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockUploadNew).not.toHaveBeenCalled();
  });

  it('does nothing when the text did not actually change', async () => {
    const out = await writeSongEditToDropbox(song({ rawText: 'same' }), 'same');
    expect(out).toEqual({ kind: 'notApplicable' });
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('overwrites the Dropbox file when it still matches what the phone had', async () => {
    mockDownload.mockResolvedValue({ text: 'old', rev: 'r1' });
    const out = await writeSongEditToDropbox(song({}), 'old');
    expect(out).toEqual({ kind: 'saved' });
    expect(mockUploadIfRev).toHaveBeenCalledWith(PATH, 'edited', 'r1');
    expect(mockUploadNew).not.toHaveBeenCalled();
    expect(await hasPendingSongWrite(PATH)).toBe(false);
  });

  it('saves a separate copy, overwriting nothing, when the Dropbox file changed meanwhile', async () => {
    mockDownload.mockResolvedValue({ text: 'edited on the PC', rev: 'r2' });
    const out = await writeSongEditToDropbox(song({}), 'old');
    expect(out).toEqual({ kind: 'savedAsCopy', name: 'copy.cho' });
    expect(mockUploadIfRev).not.toHaveBeenCalled();
    expect(mockUploadNew).toHaveBeenCalledWith('/amazing grace - john newton (phone edit).cho', 'edited');
    expect(await hasPendingSongWrite(PATH)).toBe(false);
  });

  it('saves a copy when the file changes between the download and the upload', async () => {
    mockDownload.mockResolvedValue({ text: 'old', rev: 'r1' });
    mockUploadIfRev.mockRejectedValue(new Error('Dropbox request failed (409): path/conflict/file'));
    const out = await writeSongEditToDropbox(song({}), 'old');
    expect(out.kind).toBe('savedAsCopy');
  });

  it('recreates the file if it was deleted from Dropbox', async () => {
    mockDownload.mockRejectedValue(new Error('Dropbox request failed (409): path/not_found'));
    const out = await writeSongEditToDropbox(song({}), 'old');
    expect(out).toEqual({ kind: 'saved' });
    expect(mockUploadOverwrite).toHaveBeenCalledWith(PATH, 'edited');
  });

  it('queues the edit when Dropbox cannot be reached, and later flushes it', async () => {
    mockDownload.mockRejectedValue(new Error('Network request failed'));
    const out = await writeSongEditToDropbox(song({}), 'old');
    expect(out).toEqual({ kind: 'queued' });
    expect(await hasPendingSongWrite(PATH)).toBe(true);

    mockDownload.mockResolvedValue({ text: 'old', rev: 'r1' });
    const flushed = await flushPendingSongWrites();
    expect(flushed).toEqual([{ kind: 'saved' }]);
    expect(mockUploadIfRev).toHaveBeenCalledWith(PATH, 'edited', 'r1');
    expect(await hasPendingSongWrite(PATH)).toBe(false);
  });

  it('keeps a queued edit queued while still offline', async () => {
    mockDownload.mockRejectedValue(new Error('Network request failed'));
    await writeSongEditToDropbox(song({}), 'old');
    expect(await flushPendingSongWrites()).toEqual([]);
    expect(await hasPendingSongWrite(PATH)).toBe(true);
  });

  it('a second edit while the first is still queued keeps the ORIGINAL baseline', async () => {
    mockDownload.mockRejectedValue(new Error('Network request failed'));
    await writeSongEditToDropbox(song({ rawText: 'edit one' }), 'old');
    // Back online; Dropbox still has the original text.
    mockDownload.mockResolvedValue({ text: 'old', rev: 'r1' });
    const out = await writeSongEditToDropbox(song({ rawText: 'edit two' }), 'edit one');
    expect(out).toEqual({ kind: 'saved' });
    expect(mockUploadIfRev).toHaveBeenCalledWith(PATH, 'edit two', 'r1');
    expect(mockUploadNew).not.toHaveBeenCalled();
  });
});
