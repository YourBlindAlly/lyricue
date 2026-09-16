// Read-only access to the shared community song library — a separate
// Dropbox account (rusty@yourblindally.com, kept apart from Rusty's own
// personal Dropbox for storage-quota reasons) populated by a one-time
// curation project (see "chordpro songs/project notes.txt" and
// upload_to_community_dropbox.py in that same folder — not part of this
// repo). This Worker holds the one long-lived refresh token that can read
// it; the app itself never sees that token, only this backend's own
// /search and /fetch responses. Deliberately named "community library" in
// code, not "Dropbox" — the app's own UI just calls this "Search" and
// never surfaces that it's backed by Dropbox at all.

export interface CommunityLibraryEnv {
  COMMUNITY_DROPBOX_REFRESH_TOKEN: string;
}

// Dropbox's own public app-identifier for the LyriCue Dropbox app — safe to
// embed (same reasoning as DROPBOX_APP_KEY in the phone app and web tools:
// Dropbox designed this as a public client identifier, not a secret).
const DROPBOX_CLIENT_ID = '0iibd4asi022p7w';

// Same list as SONG_EXTENSIONS in src/cloud/dropbox/dropboxApi.ts — kept as
// a separate copy since this backend is a different TS project with its own
// build, not because the two are meant to drift. Used to filter search
// results so anything that ISN'T a real song file (e.g. the search-miss log
// files below) can never show up as a match.
const SONG_EXTENSIONS = ['.txt', '.cho', '.crd', '.chopro', '.chord', '.pro'];

const SEARCH_MISSES_FOLDER = '/search-misses';

// Songs shared from the web Lyric Editor's "Share with the community"
// checkbox land here, NOT directly in the searchable library root — this is
// a public, unauthenticated endpoint (the web editor has no way to hold a
// secret, since anyone can view its page source), so anything it accepts
// gets a human review pass before it's promoted into the real library.
const PENDING_CONTRIBUTIONS_FOLDER = '/pending-contributions';
const MAX_CONTRIBUTION_BYTES = 200_000;

// A control character (anything outside normal printable text plus
// newline/carriage-return/tab) is something no real hand-typed or
// web-copied song text ever contains. A cheap, high-signal way to reject a
// binary or obfuscated payload submitted to the public /submit endpoint
// without needing to understand what it actually is.
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;

export function looksLikePlainText(content: string): boolean {
  return !CONTROL_CHAR_RE.test(content);
}

// Real song text is always broken across multiple lines of reasonable
// length. A single giant line (or only one or two lines total) is how
// minified/obfuscated payloads usually look, not how anyone pastes or types
// a song — so this catches a different, complementary shape of abuse than
// the control-character check above.
const MAX_LINE_LENGTH = 2000;
const MIN_LINE_COUNT = 3;

export function looksLikeSongText(content: string): boolean {
  const lines = content.split(/\r\n|\r|\n/);
  if (lines.length < MIN_LINE_COUNT) return false;
  return lines.every((line) => line.length <= MAX_LINE_LENGTH);
}

// Same chord-bracket shape the app and the web Lyric Editor both already
// use to decide ChordPro vs. plain text — reused here so the server decides
// the real file extension itself instead of trusting whatever the client
// (or a direct HTTP request bypassing the client entirely) claims it is.
const CHORD_BRACKET_RE = /\[([^\]]*)\]/g;
const CHORD_NAME_RE = /^[A-Ga-g][#b]?(maj|min|dim|aug|sus|add)?[0-9]*m?[0-9]*(\/[A-Ga-g][#b]?)?$/;

export function decideExtension(content: string): '.cho' | '.txt' {
  CHORD_BRACKET_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CHORD_BRACKET_RE.exec(content)) !== null) {
    if (CHORD_NAME_RE.test(m[1].trim())) return '.cho';
  }
  return '.txt';
}

export type CommunitySearchResult = {
  title: string;
  artist: string | null;
  key: string | null;
  path: string;
};

async function getAccessToken(env: CommunityLibraryEnv): Promise<string> {
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: env.COMMUNITY_DROPBOX_REFRESH_TOKEN,
      client_id: DROPBOX_CLIENT_ID,
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`Community library auth failed (${res.status})`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

/**
 * Parses "Title - Artist [Key].ext" (or "Title - Artist.ext", or just
 * "Title.ext" with no artist) — the exact naming convention every file in
 * the community library was uploaded/renamed under (safe_filename() in
 * upload_to_community_dropbox.py always builds "{title} - {artist}").
 * Splits on the LAST " - ", not the first, deliberately DIFFERENT from the
 * app's own extractArtistFromPath (which uses the first) — that matters
 * here specifically because a real, common case in this library is a title
 * that itself ends in " - Alt"/" - Var" (e.g. "Rum And Coca Cola - Alt -
 * Andrews Sisters.pro"); splitting on the first " - " would wrongly shear
 * "Alt" off into the artist field instead of keeping it as part of the
 * title where it actually distinguishes one version from another.
 */
export function parseCommunityFilename(name: string): { title: string; artist: string | null; key: string | null } {
  const withoutExt = name.replace(/\.[^./]+$/, '');
  const separatorIndex = withoutExt.lastIndexOf(' - ');
  if (separatorIndex === -1) {
    return { title: withoutExt, artist: null, key: null };
  }
  const title = withoutExt.slice(0, separatorIndex).trim();
  let rest = withoutExt.slice(separatorIndex + 3).trim();

  let key: string | null = null;
  const keyMatch = rest.match(/\s*\[([^[\]]+)\]\s*$/);
  if (keyMatch) {
    key = keyMatch[1].trim();
    rest = rest.slice(0, keyMatch.index).trim();
  }

  return { title, artist: rest.length > 0 ? rest : null, key };
}

/**
 * filename_only search (not content search) — matches the way someone
 * would actually look for a song here: by title or artist, not by lyric
 * text. Dropbox's search is itself fuzzy/token-based, so a partial or
 * slightly-off query still works reasonably (confirmed live testing this
 * feature, 2026-09-15).
 */
export async function searchCommunityLibrary(
  env: CommunityLibraryEnv,
  query: string
): Promise<CommunitySearchResult[]> {
  const accessToken = await getAccessToken(env);
  const res = await fetch('https://api.dropboxapi.com/2/files/search_v2', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      options: { max_results: 25, filename_only: true },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Community library search failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as {
    matches: { metadata: { metadata: { name: string; path_lower: string } } }[];
  };
  return data.matches
    .filter((m) => {
      const { name, path_lower } = m.metadata.metadata;
      // .txt is a legitimate song extension too (plain-text songs), so
      // excluding the log folder by path is required in addition to the
      // extension check below — extension alone wouldn't catch it.
      if (path_lower.startsWith(SEARCH_MISSES_FOLDER.toLowerCase() + '/')) {
        return false;
      }
      return SONG_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));
    })
    .map((m) => {
      const { name, path_lower } = m.metadata.metadata;
      const { title, artist, key } = parseCommunityFilename(name);
      return { title, artist, key, path: path_lower };
    });
}

/**
 * Records a search that came back with zero results, as its own small file
 * under /search-misses — one file per miss (not one growing list appended
 * to) specifically to avoid a download-modify-reupload race between two
 * concurrent Worker requests missing at the same time, which a single
 * shared file would be exposed to. Rusty can review these directly in the
 * community Dropbox account, or ask for a consolidated report the same way
 * the song-library curation scripts already do for other "raw files ->
 * periodic consolidation pass" workflows in this project.
 *
 * Only ever logs the raw search text someone actually typed — the app's
 * Search screen is a single combined "title or artist" field, not two
 * separate ones, so there's no clean artist/title split to save that
 * wasn't already lost at the point of typing.
 *
 * Best-effort: a logging failure must never break the actual search
 * response the user is waiting on, so this is always called and awaited
 * inside a try/catch at the call site, never allowed to throw outward.
 */
export async function logSearchMiss(env: CommunityLibraryEnv, query: string): Promise<void> {
  const accessToken = await getAccessToken(env);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeQuery = query.replace(/[/\\:*?"<>|]/g, '').trim().slice(0, 100);
  const path = `${SEARCH_MISSES_FOLDER}/${timestamp} - ${safeQuery || 'blank'}.txt`;
  const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({ path, mode: 'add', mute: true }),
      'Content-Type': 'application/octet-stream',
    },
    body: query,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Logging search miss failed (${res.status}): ${body}`);
  }
}

/**
 * Uploads a song shared from the web Lyric Editor into the pending-review
 * holding folder (never straight into the searchable library — see the
 * comment on PENDING_CONTRIBUTIONS_FOLDER above). autorename:true so two
 * different people sharing a same-named song both land safely instead of
 * one upload failing outright on a name collision; Rusty sorts out any
 * actual duplicates when he reviews this folder.
 */
export async function submitCommunityContribution(
  env: CommunityLibraryEnv,
  filename: string,
  content: string
): Promise<{ path: string }> {
  const accessToken = await getAccessToken(env);
  const safeName = filename.replace(/[\\/:*?"<>|]/g, '').trim() || 'untitled.txt';
  const path = `${PENDING_CONTRIBUTIONS_FOLDER}/${safeName}`;
  const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({ path, mode: 'add', autorename: true, mute: true }),
      'Content-Type': 'application/octet-stream',
    },
    body: content,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Community contribution upload failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { path_lower: string };
  return { path: data.path_lower };
}

export { MAX_CONTRIBUTION_BYTES };

/** Downloads one file's raw text content by its Dropbox path (from a search result). */
export async function fetchCommunityFile(env: CommunityLibraryEnv, path: string): Promise<string> {
  const accessToken = await getAccessToken(env);
  const res = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({ path }),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Community library fetch failed (${res.status}): ${body}`);
  }
  return res.text();
}
