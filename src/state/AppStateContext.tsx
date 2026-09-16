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
import { loadReduceHints, saveReduceHints } from '../speech/reduceHintsPreference';
import type { Setlist } from '../setlist/setlistCsv';
import type { Song } from '../types';

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
   * Advances to the next/previous song in the active setlist, skipping any
   * entry that no longer resolves. Returns the newly-active song, or null if
   * no setlist is active or the edge of the list is reached (nothing
   * changed) — callers use this to announce the new song directly rather
   * than reading back a possibly-stale `activeSong` closure.
   */
  advanceSetlist: (direction: 'next' | 'previous') => Promise<Song | null>;
  clearSetlist: () => Promise<void>;
  /**
   * Turns the active setlist's random-next mode on or off. Turning it on
   * seeds the "already played this cycle" tracking with just the current
   * song, so the very next random pick can't immediately repeat it;
   * turning it off drops that tracking since it's meaningless while random
   * mode is off. No-op if no setlist is active.
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
        const song = resolveSetlistEntry(setlist.entries[i], library);
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

  const advanceSetlist = useCallback(
    async (direction: 'next' | 'previous'): Promise<Song | null> => {
      if (!activeSetlist) {
        return null;
      }
      const { setlist, currentIndex } = activeSetlist;

      if (direction === 'next' && activeSetlist.randomEnabled) {
        const resolvableIndices = setlist.entries
          .map((_, i) => i)
          .filter((i) => resolveSetlistEntry(setlist.entries[i], library) !== null);
        const picked = pickRandomSetlistIndex(
          resolvableIndices,
          currentIndex,
          activeSetlist.playedIndices ?? [currentIndex]
        );
        if (!picked) {
          return null;
        }
        const song = resolveSetlistEntry(setlist.entries[picked.index], library);
        if (!song) {
          return null; // shouldn't happen — resolvableIndices was just filtered on exactly this check
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
        const song = resolveSetlistEntry(setlist.entries[i], library);
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
      const state: ActiveSetlistState = {
        ...activeSetlist,
        randomEnabled: enabled,
        playedIndices: enabled ? [activeSetlist.currentIndex] : undefined,
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
