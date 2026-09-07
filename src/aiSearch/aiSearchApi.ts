import { AI_SEARCH_APP_SECRET, AI_SEARCH_BACKEND_URL } from './config';

// AI_SEARCH_BACKEND_URL always ends in "/search" (see config.ts) — the
// feedback endpoint lives alongside it on the same Worker.
const AI_SEARCH_FEEDBACK_URL = AI_SEARCH_BACKEND_URL.replace(/\/search$/, '/feedback');

export type AiSearchResult = {
  title: string;
  artist: string;
  lyricsText: string;
  sourceUrl: string | null;
};

/**
 * Calls the LyriCue song-search backend (see backend/ in this repo). Throws
 * with a message suitable to show directly to Rusty in an Alert — the
 * backend already returns human-readable `error` strings for the cases
 * that are expected to happen in normal use (not found, misconfigured).
 */
export async function searchSongWithAi(
  title: string,
  artist: string,
  includeChords: boolean
): Promise<AiSearchResult> {
  const res = await fetch(AI_SEARCH_BACKEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Secret': AI_SEARCH_APP_SECRET,
    },
    body: JSON.stringify({ title, artist, includeChords }),
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // fall through to the generic status-based error below
  }

  if (!res.ok) {
    const errorData = data && typeof data === 'object' ? (data as { error?: unknown; detail?: unknown }) : null;
    const message =
      errorData && typeof errorData.error === 'string' ? errorData.error : `Search failed (${res.status})`;
    // `detail` (present on unexpected backend failures, not on the
    // expected "couldn't find lyrics" case) carries the real underlying
    // reason — appended so a failure is self-diagnosable from the app's
    // own error alert instead of needing to dig through Worker logs.
    const detail = errorData && typeof errorData.detail === 'string' ? errorData.detail : null;
    throw new Error(detail ? `${message}\n\n${detail}` : message);
  }

  const result = data as Partial<AiSearchResult> | null;
  if (!result || typeof result.lyricsText !== 'string') {
    throw new Error('Search returned an unexpected response.');
  }

  return {
    title: result.title ?? title,
    artist: result.artist ?? artist,
    lyricsText: result.lyricsText,
    sourceUrl: typeof result.sourceUrl === 'string' ? result.sourceUrl : null,
  };
}

export type AiSearchFeedback = {
  title: string;
  artist: string;
  includeChords: boolean;
  sourceUrl: string | null;
  rating: 'accepted' | 'rejected';
};

/**
 * Fire-and-forget: logs whether Rusty kept or discarded an AI search result,
 * alongside the automated search logs on the same backend, so a real human
 * verdict is visible next to the completeness gate's own reasoning. Never
 * awaited by callers and never throws — a logging call failing shouldn't
 * block or alarm anyone using the review screen.
 */
export function sendSearchFeedback(feedback: AiSearchFeedback): void {
  if (!isAiSearchFeedbackConfigured()) {
    return;
  }
  fetch(AI_SEARCH_FEEDBACK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Secret': AI_SEARCH_APP_SECRET,
    },
    body: JSON.stringify(feedback),
  }).catch(() => {
    // Best-effort only — see doc comment above.
  });
}

function isAiSearchFeedbackConfigured(): boolean {
  return AI_SEARCH_FEEDBACK_URL.trim().length > 0;
}
