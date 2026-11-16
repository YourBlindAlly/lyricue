import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  downloadDropboxFileWithRev,
  uploadDropboxFile,
  uploadDropboxFileAsNew,
  uploadDropboxFileIfRevMatches,
} from './dropboxApi';
import { personalCopyPathForSong } from '../../search/backupSearchResult';
import type { Song } from '../../types';

/**
 * Saving a song edit made on the phone back to its Dropbox file, so a
 * reinstall (or a Refresh Songs) doesn't lose it. The Dropbox file is
 * overwritten with the edited text, but only if it is still exactly what
 * the phone last had (the "baseline"): if it changed in Dropbox in the
 * meantime (say, edited on the PC), nothing is overwritten and the edit is
 * saved as a separate "(phone edit)" file beside it instead. With no
 * connection the edit is queued on the phone and uploaded later.
 */

const PENDING_KEY = 'lyricue.pendingSongWrites';

export type PendingSongWrite = {
  path: string;
  /** The file's text as the phone last saw it in Dropbox, before any phone edits. */
  baseline: string;
  /** The latest edited text to put in Dropbox. */
  content: string;
};

export type WriteBackOutcome =
  | { kind: 'notApplicable' }
  | { kind: 'saved' }
  | { kind: 'savedAsCopy'; name: string }
  | { kind: 'queued' };

/** The Dropbox path an edit of this song should be written to, or null if it has no Dropbox file. */
export function writeBackPathFor(song: Song): string | null {
  if (song.source.type === 'dropbox') {
    return song.source.path;
  }
  if (song.source.type === 'search') {
    return personalCopyPathForSong(song)?.toLowerCase() ?? null;
  }
  return null;
}

/** "/folder/title.cho" becomes "/folder/title (phone edit).cho". */
export function copyPathFor(path: string): string {
  const match = path.match(/^(.*?)(\.[^./]+)?$/);
  const stem = match?.[1] ?? path;
  const ext = match?.[2] ?? '';
  return `${stem} (phone edit)${ext}`;
}

async function loadPending(): Promise<PendingSongWrite[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (p): p is PendingSongWrite =>
            p && typeof p.path === 'string' && typeof p.baseline === 'string' && typeof p.content === 'string'
        )
      : [];
  } catch {
    return [];
  }
}

async function savePending(list: PendingSongWrite[]): Promise<void> {
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(list));
}

async function removePending(path: string): Promise<void> {
  const list = await loadPending();
  await savePending(list.filter((p) => p.path !== path));
}

function errorHas(err: unknown, text: string): boolean {
  return err instanceof Error && err.message.includes(text);
}

/**
 * One attempt to put `write` into Dropbox. Resolves with what happened;
 * throws only for problems worth retrying later (no connection, not signed
 * in, a Dropbox outage).
 */
async function attempt(write: PendingSongWrite): Promise<WriteBackOutcome> {
  let remote: { text: string; rev: string | null };
  try {
    remote = await downloadDropboxFileWithRev(write.path);
  } catch (err) {
    if (errorHas(err, 'not_found')) {
      // The Dropbox file is gone; recreate it from the edit.
      await uploadDropboxFile(write.path, write.content);
      return { kind: 'saved' };
    }
    throw err;
  }
  if (remote.text === write.content) {
    return { kind: 'saved' };
  }
  if (remote.text === write.baseline && remote.rev) {
    try {
      await uploadDropboxFileIfRevMatches(write.path, write.content, remote.rev);
      return { kind: 'saved' };
    } catch (err) {
      if (!errorHas(err, 'conflict')) {
        throw err;
      }
      // Changed between the download and the upload: fall through to a copy.
    }
  }
  const name = await uploadDropboxFileAsNew(copyPathFor(write.path), write.content);
  return { kind: 'savedAsCopy', name };
}

/**
 * Writes an edited song back to its Dropbox file. Never throws: a failure
 * to reach Dropbox leaves the edit queued for later and reports 'queued'.
 * `baselineText` is the song's text from before this edit.
 */
export async function writeSongEditToDropbox(song: Song, baselineText: string): Promise<WriteBackOutcome> {
  const path = writeBackPathFor(song);
  if (!path) {
    return { kind: 'notApplicable' };
  }
  const pending = await loadPending();
  const earlier = pending.find((p) => p.path === path);
  // A still-queued earlier edit means Dropbox still holds the ORIGINAL text,
  // so keep that as the baseline instead of this edit's starting text.
  const baseline = earlier ? earlier.baseline : baselineText;
  if (!earlier && baseline === song.rawText) {
    return { kind: 'notApplicable' };
  }
  const write: PendingSongWrite = { path, baseline, content: song.rawText };
  await savePending([...pending.filter((p) => p.path !== path), write]);
  try {
    const outcome = await attempt(write);
    await removePending(path);
    return outcome;
  } catch {
    return { kind: 'queued' };
  }
}

/** Tries every queued edit again. Called at app start, when the app returns to the foreground, and before Refresh Songs. */
export async function flushPendingSongWrites(): Promise<WriteBackOutcome[]> {
  const pending = await loadPending();
  const outcomes: WriteBackOutcome[] = [];
  for (const write of pending) {
    try {
      outcomes.push(await attempt(write));
      await removePending(write.path);
    } catch {
      // Still unreachable; leave it queued.
    }
  }
  return outcomes;
}

export async function hasPendingSongWrite(path: string): Promise<boolean> {
  return (await loadPending()).some((p) => p.path === path);
}
