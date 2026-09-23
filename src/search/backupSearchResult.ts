import { dropboxFileExists, uploadDropboxFile } from '../cloud/dropbox/dropboxApi';
import type { SearchResult } from './searchApi';
import type { Song } from '../types';

// Strip characters not safe in a filename, matching the same convention
// this whole project already uses everywhere a song filename gets built
// (see safe_filename() in upload_to_community_dropbox.py and the other
// curation scripts in "chordpro songs/").
function safeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '').trim();
}

function extensionFromPath(path: string): string {
  const match = path.match(/\.[^./]+$/);
  return match ? match[0] : '.txt';
}

/** Where a community song's copy lives in the user's own Dropbox: "/Title - Artist.ext", no "[Key]" suffix. */
export function personalCopyPath(title: string, artist: string | null, communityPath: string): string {
  const base = artist ? `${title} - ${artist}` : title;
  return `/${safeFilename(base)}${extensionFromPath(communityPath)}`;
}

/**
 * Same path, worked out from a loaded Song instead of a search result — a
 * community song's own filename is "Title - Artist [Key].ext", so the
 * "[Key]" suffix is stripped to match the user's own naming convention.
 * Null for a song that didn't come from the community library.
 */
export function personalCopyPathForSong(song: Song): string | null {
  if (song.source.type !== 'search') {
    return null;
  }
  const fileName = song.source.path.split('/').pop() ?? '';
  const ext = extensionFromPath(fileName);
  const stem = fileName.slice(0, fileName.length - ext.length).replace(/\s*\[[^\]]*\]\s*$/, '');
  return stem ? `/${safeFilename(stem)}${ext}` : null;
}

/**
 * Writes `content` to the user's own Dropbox at `path` ONLY if nothing is
 * there yet — never overwrites, so a copy the user has since edited (on the
 * PC, say) is never clobbered by re-opening the community original. Returns
 * whether the file now exists there (already did, or was just written);
 * false, never a throw, when Dropbox isn't reachable.
 */
export async function copyToPersonalDropboxIfMissing(path: string, content: string): Promise<boolean> {
  try {
    if (await dropboxFileExists(path)) {
      return true;
    }
    await uploadDropboxFile(path, content);
    return true;
  } catch {
    return false;
  }
}

/**
 * Best-effort backup of a song loaded via Search into the user's OWN
 * Dropbox — same "silent, never blocks, never alarms" pattern as
 * setlistStorage.ts's backupToDropbox. Worth doing specifically for
 * Search results (unlike a pasted or locally-imported song) because a
 * search result is the one import path with no other existing copy
 * anywhere the user could re-import from if the device were lost or
 * reset — it only ever lived in the community library, not in anything
 * of the user's own, until this copies it over. Uses the same "Title -
 * Artist.ext" convention and root-level placement as every other file the
 * user's own Dropbox browsing already expects, and deliberately does NOT
 * carry over the "[Key]" suffix the community copy has — the user's own
 * Dropbox never uses that convention (see the 2026-09-12 cleanup that
 * removed it there), kept consistent on purpose.
 */
export function backupSearchResultToDropbox(result: SearchResult, content: string): void {
  void copyToPersonalDropboxIfMissing(personalCopyPath(result.title, result.artist, result.path), content);
}

/**
 * For a community-library song being added to a setlist: makes sure a copy
 * is in the user's own Dropbox (never overwriting one already there) and
 * returns its lowercase path, matching how Dropbox paths are stored
 * everywhere else, so the setlist entry can point at the user's own copy.
 * Null for any other kind of song, or when the copy couldn't be made.
 */
export async function ensurePersonalCopyForSong(song: Song): Promise<string | null> {
  const path = personalCopyPathForSong(song);
  if (!path) {
    return null;
  }
  return (await copyToPersonalDropboxIfMissing(path, song.rawText)) ? path.toLowerCase() : null;
}

/**
 * For a song loaded from the community Search: once a copy exists in the
 * user's own Dropbox, returns a copy of `song` with its source switched to
 * that Dropbox file — so the Library shows "Dropbox" instead of "Search"
 * and points at a file that's genuinely backed up and editable, instead of
 * staying labeled "Search" forever even after the copy is sitting right
 * there (raised by Rusty 2026-09-23). Returns `song` unchanged for any
 * other source, or if a copy couldn't be made (not connected, etc.).
 */
export async function upgradeSearchSongSource(song: Song): Promise<Song> {
  if (song.source.type !== 'search') {
    return song;
  }
  const path = await ensurePersonalCopyForSong(song);
  return path ? { ...song, source: { type: 'dropbox', path } } : song;
}
