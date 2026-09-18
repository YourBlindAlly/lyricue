import type { SetlistEntry } from './setlistCsv';
import { personalCopyPathForSong } from '../search/backupSearchResult';
import type { Song } from '../types';

/** `pathOverride` points the entry at a different Dropbox file than the song's own, e.g. the user's copy of a community song. */
export function entryFor(song: Song, pathOverride?: string | null): SetlistEntry {
  return {
    title: song.title,
    path: pathOverride ?? (song.source.type === 'dropbox' ? song.source.path : ''),
  };
}

export function isSongInEntries(song: Song, entries: SetlistEntry[]): boolean {
  const source = song.source;
  if (source.type === 'dropbox') {
    return entries.some((e) => e.path === source.path);
  }
  const title = song.title.toLowerCase();
  const personalPath = personalCopyPathForSong(song)?.toLowerCase();
  return entries.some(
    (e) => (!e.path && e.title.toLowerCase() === title) || (!!personalPath && e.path === personalPath)
  );
}
