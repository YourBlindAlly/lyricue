import {
  decideExtension,
  fetchCommunityFile,
  logSearchMiss,
  looksLikePlainText,
  looksLikeSongText,
  MAX_CONTRIBUTION_BYTES,
  searchCommunityLibrary,
  submitCommunityContribution,
  type CommunityLibraryEnv,
} from './communityLibrary';

export interface Env extends CommunityLibraryEnv {
  APP_SHARED_SECRET: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-App-Secret',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

type SearchRequestBody = { query?: string };
type FetchRequestBody = { path?: string };

async function handleSearch(request: Request, env: Env): Promise<Response> {
  let body: SearchRequestBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const query = (body.query ?? '').trim();
  if (!query) {
    return json({ error: 'query is required' }, 400);
  }

  const startedAt = Date.now();
  try {
    const results = await searchCommunityLibrary(env, query);
    // Metadata-only logging (the query text and how many results came
    // back), same "never log actual song content" policy this backend has
    // always used — see the git history of this file for the equivalent
    // AI-search-era logging this replaces.
    console.log(JSON.stringify({ event: 'library_search', query, resultCount: results.length, ms: Date.now() - startedAt }));
    if (results.length === 0) {
      // Best-effort, never allowed to affect the actual search response —
      // a failure here just means one missed request to review later, not
      // something worth showing the user or retrying.
      try {
        await logSearchMiss(env, query);
      } catch (err) {
        console.log(JSON.stringify({ event: 'search_miss_log_failed', query, error: err instanceof Error ? err.message : String(err) }));
      }
    }
    return json({ results });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.log(JSON.stringify({ event: 'library_search', query, error: detail, ms: Date.now() - startedAt }));
    return json({ error: 'Search failed — try again in a moment.', detail }, 502);
  }
}

async function handleFetch(request: Request, env: Env): Promise<Response> {
  let body: FetchRequestBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const path = (body.path ?? '').trim();
  if (!path) {
    return json({ error: 'path is required' }, 400);
  }

  try {
    const content = await fetchCommunityFile(env, path);
    return json({ content });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.log(JSON.stringify({ event: 'library_fetch', path, error: detail }));
    return json({ error: "Couldn't load that song — try again in a moment.", detail }, 502);
  }
}

type SubmitRequestBody = { filename?: string; content?: string };

/**
 * Handles a song shared from the web Lyric Editor's "Share with the
 * community" checkbox. This route is deliberately reachable without
 * APP_SHARED_SECRET (see the routing note below) — a public write endpoint
 * on a page whose source anyone can read. What keeps it safe isn't a
 * secret, it's that: (1) the content has to actually look like plain song
 * text, not a binary/obfuscated payload; (2) the server — not whoever is
 * calling this — decides the real file extension; (3) everything lands in
 * PENDING_CONTRIBUTIONS_FOLDER, never the live searchable library, so
 * nothing reaches another user's search results or device until Rusty
 * reviews and promotes it by hand.
 */
async function handleSubmit(request: Request, env: Env): Promise<Response> {
  let body: SubmitRequestBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const rawFilename = (body.filename ?? '').trim();
  const content = body.content ?? '';
  if (!rawFilename) return json({ error: 'filename is required' }, 400);
  if (!content.trim()) return json({ error: 'content is required' }, 400);
  if (content.length > MAX_CONTRIBUTION_BYTES) {
    return json({ error: 'That file is too large to share.' }, 400);
  }
  if (!looksLikePlainText(content) || !looksLikeSongText(content)) {
    return json({ error: "That doesn't look like song text, so nothing was shared." }, 400);
  }

  const baseName = rawFilename.replace(/\.[^./]+$/, '');
  const filename = baseName + decideExtension(content);

  try {
    const { path } = await submitCommunityContribution(env, filename, content);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    console.log(JSON.stringify({ event: 'community_contribution', path, ip }));
    return json({ path });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.log(JSON.stringify({ event: 'community_contribution_failed', filename, error: detail }));
    return json({ error: 'Could not share this song right now — try again later.', detail }, 502);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method !== 'POST' || (path !== '/search' && path !== '/fetch' && path !== '/submit')) {
      return json({ error: 'Not found' }, 404);
    }

    // /submit is the one deliberately public route — see the comment on
    // handleSubmit for why it can't carry APP_SHARED_SECRET the way /search
    // and /fetch do.
    if (path !== '/submit') {
      if (!env.APP_SHARED_SECRET || request.headers.get('X-App-Secret') !== env.APP_SHARED_SECRET) {
        return json({ error: 'Unauthorized' }, 401);
      }
    }

    if (path === '/fetch') {
      return handleFetch(request, env);
    }
    if (path === '/submit') {
      return handleSubmit(request, env);
    }
    return handleSearch(request, env);
  },
};
