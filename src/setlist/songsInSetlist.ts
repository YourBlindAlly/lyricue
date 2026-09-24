import { resolveSetlistEntry } from './resolveSetlistEntry';
import type { Setlist } from './setlistCsv';
import type { Song } from '../types';

/**
 * Every library song referenced by `setlist`, in setlist order — the
 * Library screen's "Active Setlist" filter uses this to narrow its list
 * down to just those songs. An entry that hasn't been downloaded to this
 * device yet (never individually opened, nothing cached locally) simply
 * can't appear here — this only ever shows what ALREADY resolves locally,
 * same as every other Library screen listing, and doesn't fetch anything
 * on its own.
 */
export function songsInSetlist(library: Song[], setlist: Setlist): Song[] {
  const seen = new Set<string>();
  const songs: Song[] = [];
  for (const entry of setlist.entries) {
    const song = resolveSetlistEntry(entry, library);
    if (song && !seen.has(song.id)) {
      seen.add(song.id);
      songs.push(song);
    }
  }
  return songs;
}
