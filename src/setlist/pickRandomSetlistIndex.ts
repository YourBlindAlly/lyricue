/**
 * Picks the next index for a setlist's "random next" mode, avoiding a
 * repeat until every resolvable entry has genuinely been PLAYED once (the
 * same way most music apps' shuffle works) — confirmed with Rusty
 * 2026-09-16 as the expected behavior, not a true independent-random pick
 * each time, since a genuinely random pick could land on the song just
 * played and feel like a bug rather than a feature.
 *
 * Deliberately does NOT mark the newly picked song as played itself —
 * "played" is decided by the caller based on whether the song actually got
 * engaged with before it was left (see AppStateContext's advanceSetlist),
 * not by merely having been picked. A song landed on and immediately
 * skipped past again stays eligible; refined 2026-09-16 after Rusty asked
 * whether the app could tell the difference between actually playing a
 * song and just passing through it (it couldn't, until this).
 *
 * `resolvableIndices` is every entry index that actually resolves to a real
 * library song right now (an entry whose file was removed from the library
 * is never a candidate — same skip-if-missing behavior the plain sequential
 * advance already has). `currentIndex` is always excluded from the
 * candidate pool regardless of played-status — you can't jump to the song
 * you're already on. `playedIndices` is every index confirmed played since
 * the current "cycle" began.
 *
 * Returns the newly picked index plus the playedIndices to carry forward
 * (unchanged, except when a fresh cycle just started), or null if there's
 * nothing else to jump to at all (e.g. only the current song resolves).
 */
export function pickRandomSetlistIndex(
  resolvableIndices: number[],
  currentIndex: number,
  playedIndices: number[],
  random: () => number = Math.random
): { index: number; playedIndices: number[] } | null {
  const playedSet = new Set(playedIndices);
  let candidates = resolvableIndices.filter((i) => i !== currentIndex && !playedSet.has(i));
  let nextPlayed = playedIndices;
  if (candidates.length === 0) {
    // Every other resolvable song has already been played — cycle
    // complete, start a fresh one. Still never repeats the current song.
    candidates = resolvableIndices.filter((i) => i !== currentIndex);
    nextPlayed = [];
  }
  if (candidates.length === 0) {
    return null;
  }
  const pick = candidates[Math.floor(random() * candidates.length)];
  return { index: pick, playedIndices: nextPlayed };
}
