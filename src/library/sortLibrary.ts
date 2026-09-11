import type { Song } from '../types';
import { extractArtistFromPath } from './artistFromFilename';
import type { LibrarySortMode } from './librarySortPreference';

export function artistFor(song: Song): string | null {
  if (song.source.type !== 'dropbox') {
    return null;
  }
  return extractArtistFromPath(song.source.path);
}

/**
 * Sorts a copy of the library for display. 'newest' assumes the input is
 * already newest-first (as loadLibrary/upsertLibrarySong already produce)
 * and is returned unchanged. For 'artistAZ', songs with no extractable
 * artist (anything not from Dropbox, or a Dropbox filename with no
 * "Title - Artist" separator) are grouped at the end sorted by title,
 * rather than mixed in alphabetically where an unknown artist has no
 * natural place.
 */
export function sortLibraryForDisplay(library: Song[], mode: LibrarySortMode): Song[] {
  if (mode === 'newest') {
    return library;
  }

  if (mode === 'titleAZ') {
    return [...library].sort((a, b) => a.title.localeCompare(b.title));
  }

  const withArtist: { song: Song; artist: string }[] = [];
  const withoutArtist: Song[] = [];
  for (const song of library) {
    const artist = artistFor(song);
    if (artist) {
      withArtist.push({ song, artist });
    } else {
      withoutArtist.push(song);
    }
  }
  withArtist.sort(
    (a, b) => a.artist.localeCompare(b.artist) || a.song.title.localeCompare(b.song.title)
  );
  withoutArtist.sort((a, b) => a.title.localeCompare(b.title));
  return [...withArtist.map((e) => e.song), ...withoutArtist];
}
