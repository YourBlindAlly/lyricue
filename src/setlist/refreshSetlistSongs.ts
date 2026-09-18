import { downloadDropboxFile } from '../cloud/dropbox/dropboxApi';
import { buildSongFromFile } from '../parsing/buildSong';
import { ensurePersonalCopyForSong } from '../search/backupSearchResult';
import { resolveSetlistEntry } from './resolveSetlistEntry';
import type { Setlist } from './setlistCsv';
import type { Song } from '../types';

export type RefreshResult = {
  refreshed: number;
  /** Titles with no Dropbox file to download (a pasted song, say), left as they are. */
  skipped: string[];
  /** Titles whose download or parse failed. */
  failed: string[];
};

/**
 * Re-downloads every song in a setlist from Dropbox and hands each fresh
 * copy to `saveSong`, replacing whatever is stored on the device. For when
 * the Dropbox files were edited (or fixed) after they were first loaded.
 *
 * An entry with no Dropbox path has nothing to download and is reported as
 * skipped — except a community-library song, which gets a copy made in the
 * user's own Dropbox first (never overwriting one already there) and is
 * then refreshed from it. A fresh copy keeps the id and added-date of the
 * library song it replaces, so it takes that song's place rather than
 * sitting next to it.
 */
export async function refreshSetlistSongs(
  setlist: Setlist,
  library: Song[],
  saveSong: (song: Song) => Promise<void>
): Promise<RefreshResult> {
  const result: RefreshResult = { refreshed: 0, skipped: [], failed: [] };
  for (const entry of setlist.entries) {
    const existing = resolveSetlistEntry(entry, library);
    let path = entry.path;
    if (!path && existing) {
      path = (await ensurePersonalCopyForSong(existing)) ?? '';
    }
    if (!path) {
      result.skipped.push(entry.title);
      continue;
    }
    try {
      const text = await downloadDropboxFile(path);
      const fileName = path.split('/').pop() || path;
      const fresh = buildSongFromFile(text, fileName, { type: 'dropbox', path });
      if (!fresh) {
        result.failed.push(entry.title);
        continue;
      }
      await saveSong(existing ? { ...fresh, id: existing.id, addedAt: existing.addedAt } : fresh);
      result.refreshed += 1;
    } catch {
      result.failed.push(entry.title);
    }
  }
  return result;
}
