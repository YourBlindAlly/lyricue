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
  mockUploadNew.mockResolvedValue('copy.cho');
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
  it('does nothing for a song with no Dropbox file', async () => {
    const out = await writeSongEditToDropbox(song({ source: { type: 'manual' } }), 'old');
    expect(out).toEqual({ kind: 'notApplicable' });
    expect(mockDownload).not.toHaveBeenCalled();
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
