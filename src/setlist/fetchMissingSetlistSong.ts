import { downloadDropboxFile } from '../cloud/dropbox/dropboxApi';
import { buildSongFromFile } from '../parsing/buildSong';
import type { SetlistEntry } from './setlistCsv';
import type { Song } from '../types';

/**
 * Downloads and parses a setlist entry's song directly from Dropbox for
 * when it isn't already in the local library — the common case for a song
 * that's only ever lived in Dropbox and was never individually opened on
 * THIS device before. Without this, such an entry looks identical to one
 * that's genuinely missing/deleted, and gets silently skipped forever, even
 * though the file is right there — reported live 2026-09-17: several songs
 * on a freshly built setlist kept getting skipped every time, consistently,
 * because they'd simply never been opened on the phone before, not because
 * anything was actually wrong with them.
 *
 * Returns null (never throws) on any failure — offline, the file no longer
 * exists, etc. — so the caller can fall back to its existing "skip this
 * entry" behavior exactly as before this existed.
 */
export async function fetchMissingSetlistSong(entry: SetlistEntry): Promise<Song | null> {
  if (!entry.path) {
    return null;
  }
  try {
    const text = await downloadDropboxFile(entry.path);
    const fileName = entry.path.split('/').pop() || entry.path;
    return buildSongFromFile(text, fileName, { type: 'dropbox', path: entry.path });
  } catch {
    return null;
  }
}
