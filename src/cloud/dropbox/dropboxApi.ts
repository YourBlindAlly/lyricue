import { getValidDropboxAccessToken } from './dropboxAuth';
import { CHORDPRO_EXTENSIONS } from '../../parsing/buildSong';

const SONG_EXTENSIONS = ['.txt', ...CHORDPRO_EXTENSIONS];

export type DropboxEntry = {
  name: string;
  path: string;
  isFolder: boolean;
  /** ISO 8601 timestamp — undefined for folders, which Dropbox doesn't report a modified time for. */
  modifiedAt?: string;
};

async function authorizedFetch(url: string, init: RequestInit): Promise<Response> {
  const accessToken = await getValidDropboxAccessToken();
  if (!accessToken) {
    throw new Error('Not connected to Dropbox.');
  }
  const res = await fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Dropbox request failed (${res.status}): ${body}`);
  }
  return res;
}

/**
 * Lists folders and files matching `extensions` at `path` ('' for the root).
 * A folder that doesn't exist yet (e.g. a "Setlists" folder before the first
 * setlist has ever been saved) is treated as empty rather than an error —
 * Dropbox creates parent folders automatically on upload, so there's no
 * separate "create this folder" step needed before the first save.
 */
export async function listDropboxFolder(
  path: string,
  extensions: string[] = SONG_EXTENSIONS
): Promise<DropboxEntry[]> {
  let res: Response;
  try {
    res = await authorizedFetch('https://api.dropboxapi.com/2/files/list_folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('path/not_found')) {
      return [];
    }
    throw err;
  }
  const data = (await res.json()) as {
    entries: { '.tag': string; name: string; path_lower: string; server_modified?: string }[];
  };
  return data.entries
    .filter(
      (e) => e['.tag'] === 'folder' || extensions.some((ext) => e.name.toLowerCase().endsWith(ext))
    )
    .map((e) => ({
      name: e.name,
      path: e.path_lower,
      isFolder: e['.tag'] === 'folder',
      modifiedAt: e.server_modified,
    }))
    .sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

/** Writes (or overwrites) a text file at `path`, creating any missing parent folders. */
export async function uploadDropboxFile(path: string, content: string): Promise<void> {
  await authorizedFetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      'Dropbox-API-Arg': JSON.stringify({ path, mode: 'overwrite', mute: true }),
      'Content-Type': 'application/octet-stream',
    },
    body: content,
  });
}

/** Moves/renames a file from `fromPath` to `toPath`, creating any missing destination parent folders. */
export async function moveDropboxFile(fromPath: string, toPath: string): Promise<void> {
  await authorizedFetch('https://api.dropboxapi.com/2/files/move_v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from_path: fromPath, to_path: toPath }),
  });
}

/** Deletes a file at `path` — Dropbox moves it to its own trash rather than purging it immediately, so this is recoverable from dropbox.com if needed. */
export async function deleteDropboxFile(path: string): Promise<void> {
  await authorizedFetch('https://api.dropboxapi.com/2/files/delete_v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
}

export async function downloadDropboxFile(path: string): Promise<string> {
  const res = await authorizedFetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: { 'Dropbox-API-Arg': JSON.stringify({ path }) },
  });
  return res.text();
}

/** Whether a file already exists at `path`. Throws on anything other than a clean "not found". */
export async function dropboxFileExists(path: string): Promise<boolean> {
  try {
    await authorizedFetch('https://api.dropboxapi.com/2/files/get_metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    return true;
  } catch (err) {
    if (err instanceof Error && err.message.includes('not_found')) {
      return false;
    }
    throw err;
  }
}

/**
 * Returns the email of the currently-connected Dropbox account. Surfaced in
 * the UI specifically so it's obvious which account got authorized — easy to
 * mix up if more than one Dropbox account has ever been used on a device.
 */
export async function getDropboxAccountEmail(): Promise<string | null> {
  const res = await authorizedFetch('https://api.dropboxapi.com/2/users/get_current_account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'null',
  });
  const data = (await res.json()) as { email?: string };
  return data.email ?? null;
}
