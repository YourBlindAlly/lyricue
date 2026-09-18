import type { SetlistEntry } from './setlistCsv';
import type { Song } from '../types';

export function entryFor(song: Song): SetlistEntry {
  return {
    title: song.title,
    path: song.source.type === 'dropbox' ? song.source.path : '',
  };
}

export function isSongInEntries(song: Song, entries: SetlistEntry[]): boolean {
  const source = song.source;
  if (source.type === 'dropbox') {
    return entries.some((e) => e.path === source.path);
  }
  const title = song.title.toLowerCase();
  return entries.some((e) => !e.path && e.title.toLowerCase() === title);
}
