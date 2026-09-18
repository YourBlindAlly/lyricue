import { downloadDropboxFile } from '../cloud/dropbox/dropboxApi';
import { buildSongFromFile } from '../parsing/buildSong';
import { resolveSetlistEntry } from './resolveSetlistEntry';
import type { Setlist } from './setlistCsv';
import type { Song } from '../types';

export type RefreshResult = { refreshed: number; skipped: number; failed: number };

/**
 * Re-downloads every song in a setlist from Dropbox and hands each fresh
 * copy to `saveSong`, replacing whatever is stored on the device. For when
 * the Dropbox files were edited (or fixed) after they were first loaded.
 *
 * An entry with no Dropbox path (a pasted song, say) has nothing to
 * download and is counted as skipped. A fresh copy keeps the id and
 * added-date of the library song it replaces, so it takes that song's
 * place rather than sitting next to it.
 */
export async function refreshSetlistSongs(
  setlist: Setlist,
  library: Song[],
  saveSong: (song: Song) => Promise<void>
): Promise<RefreshResult> {
  const result: RefreshResult = { refreshed: 0, skipped: 0, failed: 0 };
  for (const entry of setlist.entries) {
    if (!entry.path) {
      result.skipped += 1;
      continue;
    }
    try {
      const text = await downloadDropboxFile(entry.path);
      const fileName = entry.path.split('/').pop() || entry.path;
      const fresh = buildSongFromFile(text, fileName, { type: 'dropbox', path: entry.path });
      if (!fresh) {
        result.failed += 1;
        continue;
      }
      const existing = resolveSetlistEntry(entry, library);
      await saveSong(existing ? { ...fresh, id: existing.id, addedAt: existing.addedAt } : fresh);
      result.refreshed += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}
