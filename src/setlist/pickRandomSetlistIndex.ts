/**
 * Picks the next index for a setlist's "random next" mode, avoiding a
 * repeat until every resolvable entry has come up once (the same way most
 * music apps' shuffle works) — confirmed with Rusty 2026-09-16 as the
 * expected behavior, not a true independent-random pick each time, since a
 * genuinely random pick could land on the song just played and feel like a
 * bug rather than a feature.
 *
 * `resolvableIndices` is every entry index that actually resolves to a real
 * library song right now (an entry whose file was removed from the library
 * is never a candidate — same skip-if-missing behavior the plain sequential
 * advance already has). `playedIndices` is every index already played
 * since the current "cycle" began, including the current song itself —
 * callers seed this with `[currentIndex]` the moment random mode turns on.
 *
 * Returns the newly picked index plus the playedIndices to persist, or null
 * if there's nothing else to jump to at all (e.g. only the current song
 * resolves). When every other resolvable song has already been played, this
 * starts a fresh cycle — but still never repeats the song currently
 * playing back-to-back, even across that cycle boundary.
 */
export function pickRandomSetlistIndex(
  resolvableIndices: number[],
  currentIndex: number,
  playedIndices: number[],
  random: () => number = Math.random
): { index: number; playedIndices: number[] } | null {
  const playedSet = new Set(playedIndices);
  let candidates = resolvableIndices.filter((i) => !playedSet.has(i));
  let cycleReset = false;
  if (candidates.length === 0) {
    candidates = resolvableIndices.filter((i) => i !== currentIndex);
    cycleReset = true;
  }
  if (candidates.length === 0) {
    return null;
  }
  const pick = candidates[Math.floor(random() * candidates.length)];
  return { index: pick, playedIndices: cycleReset ? [pick] : [...playedIndices, pick] };
}
