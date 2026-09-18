import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { saveActiveSong } from '../storage/activeSong';
import {
  clearActiveSetlist,
  loadActiveSetlist,
  saveActiveSetlist,
  type ActiveSetlistState,
} from '../storage/activeSetlist';
import { loadLibrary, removeLibrarySong, upsertLibrarySong } from '../library/libraryStorage';
import { resolveSetlistEntry } from '../setlist/resolveSetlistEntry';
import { pickRandomSetlistIndex } from '../setlist/pickRandomSetlistIndex';
import { fetchMissingSetlistSong } from '../setlist/fetchMissingSetlistSong';
import { saveSetlist } from '../setlist/setlistStorage';
import { entryFor, isSongInEntries } from '../setlist/entryFor';
import { loadReduceHints, saveReduceHints } from '../speech/reduceHintsPreference';
import type { Setlist, SetlistEntry } from '../setlist/setlistCsv';
import type { Song } from '../types';

/**
 * Resolves a setlist entry against the local library first (fast, no
 * network), falling back to downloading it fresh from Dropbox when it
 * isn't there yet — the common case for a song that's only ever lived in
 * Dropbox and was never individually opened on this device before. See
 * fetchMissingSetlistSong's own doc comment for the real report this
 * fixes: such a song looked identical to a genuinely missing one and got
 * silently skipped forever.
 */
async function resolveOrFetchSetlistEntry(entry: SetlistEntry, library: Song[]): Promise<Song | null> {
  return resolveSetlistEntry(entry, library) ?? (await fetchMissingSetlistSong(entry));
}

type AppStateValue = {
  activeSong: Song | null;
  library: Song[];
  isLibraryLoaded: boolean;
  /** Sets a song as active (persists it) and adds/updates it in the library. */
  loadSong: (song: Song) => Promise<void>;
  /** Adds/updates a song in the library WITHOUT making it the active song — for bulk import. */
  addToLibrary: (song: Song) => Promise<void>;
  removeFromLibrary: (id: string) => Promise<void>;
  /** The currently loaded setlist and position within it, or null if none is active. */
  activeSetlist: ActiveSetlistState | null;
  /** Loads a setlist, resolves its first available song against the library, and makes it active. */
  startSetlist: (setlist: Setlist) => Promise<{ started: boolean }>;
  /**
   * Appends a song to the end of the currently active setlist (no-op with
   * `added: false` if no setlist is active, or if the song is already in
   * it). Deliberately does NOT go through `startSetlist` — the active
   * setlist's `currentIndex` must stay exactly where it is, since this is
   * meant for quickly queueing up a song mid-performance without disturbing
   * what's currently playing.
   */
  addSongToActiveSetlist: (song: Song) => Promise<{ added: boolean }>;
  /**
   * Creates a brand new one-song setlist under the given name, saves it, and
   * makes it the active setlist (so a second quick-add right after lands in
   * this same new setlist instead of creating another one).
   */
  createSetlistWithSong: (name: string, song: Song) => Promise<void>;
  /**
   * Advances to the next/previous song in the active setlist, skipping any
   * entry that no longer resolves. Returns the newly-active song, or null if
   * no setlist is active or the edge of the list is reached (nothing
   * changed) — callers use this to announce the new song directly rather
   * than reading back a possibly-stale `activeSong` closure.
   *
   * `wasEngaged` (random-next mode only) says whether the song being LEFT
   * should count as genuinely played — the caller's own call, based on
   * whether the singer actually advanced into its lyrics rather than just
   * landing on it and immediately jumping away again. Only a genuinely
   * played song is excluded from random-next's "not yet played this cycle"
   * pool; a merely-passed-through song stays eligible.
   */
  advanceSetlist: (direction: 'next' | 'previous', options?: { wasEngaged?: boolean }) => Promise<Song | null>;
  clearSetlist: () => Promise<void>;
  /**
   * Turns the active setlist's random-next mode on or off. No-op if no
   * setlist is active. Turning it off drops the "played this cycle"
   * tracking since it's meaningless while random mode is off.
   */
  setRandomSetlist: (enabled: boolean) => Promise<void>;
  /** Off by default. When on, VoiceOver usage hints ("swipe up for faster") are stripped from every control app-wide — see src/speech/reduceHintsPreference.ts. */
  reduceHints: boolean;
  setReduceHints: (value: boolean) => Promise<void>;
};

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({
  children,
  initialActiveSong,
}: {
  children: React.ReactNode;
  initialActiveSong: Song | null;
}) {
  const [activeSong, setActiveSong] = useState<Song | null>(initialActiveSong);
  const [library, setLibrary] = useState<Song[]>([]);
  const [isLibraryLoaded, setIsLibraryLoaded] = useState(false);
  const [activeSetlist, setActiveSetlistState] = useState<ActiveSetlistState | null>(null);
  const [reduceHints, setReduceHintsState] = useState(false);

  useEffect(() => {
    loadLibrary().then((songs) => {
      setLibrary(songs);
      setIsLibraryLoaded(true);
    });
    loadActiveSetlist().then(setActiveSetlistState);
    loadReduceHints().then(setReduceHintsState);
  }, []);

  const setReduceHints = useCallback(async (value: boolean) => {
    setReduceHintsState(value);
    await saveReduceHints(value);
  }, []);

  const loadSong = useCallback(async (song: Song) => {
    setActiveSong(song);
    await saveActiveSong(song);
    const updated = await upsertLibrarySong(song);
    setLibrary(updated);
  }, []);

  const addToLibrary = useCallback(async (song: Song) => {
    const updated = await upsertLibrarySong(song);
    setLibrary(updated);
  }, []);

  const removeFromLibrary = useCallback(async (id: string) => {
    const updated = await removeLibrarySong(id);
    setLibrary(updated);
  }, []);

  const startSetlist = useCallback(
    async (setlist: Setlist): Promise<{ started: boolean }> => {
      for (let i = 0; i < setlist.entries.length; i++) {
        const song = await resolveOrFetchSetlistEntry(setlist.entries[i], library);
        if (song) {
          await loadSong(song);
          const state: ActiveSetlistState = { setlist, currentIndex: i };
          setActiveSetlistState(state);
          await saveActiveSetlist(state);
          return { started: true };
        }
      }
      return { started: false };
    },
    [library, loadSong]
  );

  const addSongToActiveSetlist = useCallback(
    async (song: Song): Promise<{ added: boolean }> => {
      if (!activeSetlist) {
        return { added: false };
      }
      if (isSongInEntries(song, activeSetlist.setlist.entries)) {
        return { added: false };
      }
      const updatedSetlist: Setlist = {
        ...activeSetlist.setlist,
        entries: [...activeSetlist.setlist.entries, entryFor(song)],
      };
      await saveSetlist(updatedSetlist);
      const state: ActiveSetlistState = { ...activeSetlist, setlist: updatedSetlist };
      setActiveSetlistState(state);
      await saveActiveSetlist(state);
      return { added: true };
    },
    [activeSetlist]
  );

  const createSetlistWithSong = useCallback(
    async (name: string, song: Song): Promise<void> => {
      const setlist: Setlist = { name, entries: [entryFor(song)] };
      await saveSetlist(setlist);
      await startSetlist(setlist);
    },
    [startSetlist]
  );

  const advanceSetlist = useCallback(
    async (direction: 'next' | 'previous', options?: { wasEngaged?: boolean }): Promise<Song | null> => {
      if (!activeSetlist) {
        return null;
      }
      const { setlist, currentIndex } = activeSetlist;

      if (direction === 'next' && activeSetlist.randomEnabled) {
        // Awaited so a song that's only ever lived in Dropbox (never opened
        // on this device before) still counts as a real candidate rather
        // than being silently excluded from the shuffle pool forever — a
        // one-time network cost per song, same reasoning as
        // resolveOrFetchSetlistEntry above; once fetched it's cached in the
        // library and every check after this is the fast, local path.
        const resolvableIndices: number[] = [];
        for (let i = 0; i < setlist.entries.length; i++) {
          if (await resolveOrFetchSetlistEntry(setlist.entries[i], library)) {
            resolvableIndices.push(i);
          }
        }
        // The song being LEFT only counts toward "played this cycle" if it
        // was actually engaged with — see the doc comment on advanceSetlist
        // in the context type above for why this can't just always be true.
        const basePlayed = activeSetlist.playedIndices ?? [];
        const playedSoFar =
          options?.wasEngaged && !basePlayed.includes(currentIndex) ? [...basePlayed, currentIndex] : basePlayed;
        const picked = pickRandomSetlistIndex(resolvableIndices, currentIndex, playedSoFar);
        if (!picked) {
          return null;
        }
        const song = await resolveOrFetchSetlistEntry(setlist.entries[picked.index], library);
        if (!song) {
          return null; // shouldn't happen — resolvableIndices was just built on exactly this check
        }
        await loadSong(song);
        const state: ActiveSetlistState = {
          ...activeSetlist,
          currentIndex: picked.index,
          playedIndices: picked.playedIndices,
        };
        setActiveSetlistState(state);
        await saveActiveSetlist(state);
        return song;
      }

      const step = direction === 'next' ? 1 : -1;
      for (let i = currentIndex + step; i >= 0 && i < setlist.entries.length; i += step) {
        const song = await resolveOrFetchSetlistEntry(setlist.entries[i], library);
        if (song) {
          await loadSong(song);
          const state: ActiveSetlistState = { ...activeSetlist, currentIndex: i };
          setActiveSetlistState(state);
          await saveActiveSetlist(state);
          return song;
        }
      }
      // No further resolvable song in that direction (edge of the setlist,
      // or every remaining entry is missing from the library) — stay put.
      return null;
    },
    [activeSetlist, library, loadSong]
  );

  const setRandomSetlist = useCallback(
    async (enabled: boolean) => {
      if (!activeSetlist) {
        return;
      }
      // Starts empty either way: pickRandomSetlistIndex already excludes
      // the current song from candidates unconditionally, so there's no
      // need to presume it "played" just because it happened to be playing
      // when random mode was switched on.
      const state: ActiveSetlistState = {
        ...activeSetlist,
        randomEnabled: enabled,
        playedIndices: enabled ? [] : undefined,
      };
      setActiveSetlistState(state);
      await saveActiveSetlist(state);
    },
    [activeSetlist]
  );

  const clearSetlist = useCallback(async () => {
    setActiveSetlistState(null);
    await clearActiveSetlist();
  }, []);

  return (
    <AppStateContext.Provider
      value={{
        activeSong,
        library,
        isLibraryLoaded,
        loadSong,
        addToLibrary,
        removeFromLibrary,
        activeSetlist,
        startSetlist,
        addSongToActiveSetlist,
        createSetlistWithSong,
        advanceSetlist,
        setRandomSetlist,
        clearSetlist,
        reduceHints,
        setReduceHints,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error('useAppState must be used within an AppStateProvider');
  }
  return ctx;
}
