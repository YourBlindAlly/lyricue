import {
  downloadDropboxFile,
  listDropboxFolder,
  uploadDropboxFile,
  type DropboxEntry,
} from '../cloud/dropbox/dropboxApi';
import {
  parseSetlistCsv,
  sanitizeSetlistFilename,
  serializeSetlistCsv,
  setlistNameFromFilename,
  type Setlist,
} from './setlistCsv';
import {
  loadLocalSetlists,
  makeSetlistId,
  removeLocalSetlist,
  upsertLocalSetlist,
  type StoredSetlist,
} from './localSetlistStorage';

const SETLISTS_FOLDER = '/setlists';

export type SetlistSummary = { id: string; name: string };

function dropboxPathFor(name: string): string {
  return `${SETLISTS_FOLDER}/${sanitizeSetlistFilename(name)}`.toLowerCase();
}

/**
 * Best-effort only — saving or deleting a setlist must never depend on
 * Dropbox being reachable. Local storage (below) is the real, source-of-
 * truth copy; this just keeps a backup in sync when there's a connection,
 * silently skipping when there isn't (not connected, no signal, etc.).
 */
async function backupToDropbox(stored: StoredSetlist): Promise<void> {
  try {
    await uploadDropboxFile(dropboxPathFor(stored.name), serializeSetlistCsv(stored.entries));
  } catch {
    // Intentionally silent — see doc comment above.
  }
}

export async function listSetlists(): Promise<SetlistSummary[]> {
  const stored = await loadLocalSetlists();
  return stored.map((s) => ({ id: s.id, name: s.name }));
}

export async function loadSetlist(summary: SetlistSummary): Promise<Setlist> {
  const stored = await loadLocalSetlists();
  const found = stored.find((s) => s.id === summary.id);
  if (!found) {
    throw new Error(`"${summary.name}" no longer exists.`);
  }
  return { name: found.name, entries: found.entries };
}

/**
 * Saves a setlist locally (always succeeds, works offline, overwrites any
 * existing local setlist of the same name) and backs it up to Dropbox on a
 * best-effort basis.
 */
export async function saveSetlist(setlist: Setlist): Promise<void> {
  const current = await loadLocalSetlists();
  const existing = current.find((s) => s.name === setlist.name);
  const stored: StoredSetlist = {
    id: existing?.id ?? makeSetlistId(),
    name: setlist.name,
    entries: setlist.entries,
    updatedAt: Date.now(),
  };
  await upsertLocalSetlist(stored);
  void backupToDropbox(stored);
}

/**
 * Deletes a setlist locally ONLY — deliberately leaves its Dropbox backup
 * alone. Confirmed with Rusty 2026-09-17 after he deleted a setlist on his
 * phone and, with the old behavior (which also deleted the Dropbox copy),
 * lost his only way to get it back; it had to be rebuilt by hand from
 * conversation history. A stray backup file costs nothing and Dropbox's
 * own /setlists folder isn't otherwise something Rusty browses, so keeping
 * it as a recovery point has no real downside — deleting a setlist here
 * should only mean "stop showing this in my list," not "destroy the only
 * other copy of it that exists."
 */
export async function deleteSetlist(summary: SetlistSummary): Promise<void> {
  await removeLocalSetlist(summary.id);
}

/**
 * Lists the .csv setlist files sitting in Dropbox's /setlists folder — this
 * includes both this app's own backups (see backupToDropbox above) and any
 * setlist CSV a DIFFERENT tool wrote directly into that same folder in the
 * same Title,Path format (e.g. a web-based setlist builder), since nothing
 * here distinguishes the two. Never used for normal playback (that's local
 * storage only, see the module doc comment above) — this is purely the
 * source list for importSetlistFromDropbox below.
 */
export async function listDropboxSetlistFiles(): Promise<DropboxEntry[]> {
  const entries = await listDropboxFolder(SETLISTS_FOLDER, ['.csv']);
  return entries.filter((e) => !e.isFolder);
}

/**
 * Pulls one Dropbox CSV into local storage as a real, playable setlist — the
 * setlist's name comes from the CSV's own filename (reversing
 * sanitizeSetlistFilename), since the CSV format itself has no separate name
 * field. Overwrites any existing local setlist of the same name, same as
 * saving an edit would (see saveSetlist above).
 */
export async function importSetlistFromDropbox(entry: DropboxEntry): Promise<Setlist> {
  const csv = await downloadDropboxFile(entry.path);
  const setlist: Setlist = {
    name: setlistNameFromFilename(entry.name),
    entries: parseSetlistCsv(csv),
  };
  await saveSetlist(setlist);
  return setlist;
}
