import { pickRandomSetlistIndex } from './pickRandomSetlistIndex';

describe('pickRandomSetlistIndex', () => {
  it('picks an unplayed index, marking it played alongside the existing history', () => {
    const result = pickRandomSetlistIndex([0, 1, 2, 3], 0, [0], () => 0);
    // random() = 0 picks the first candidate in filtered order: [1, 2, 3][0] = 1
    expect(result).toEqual({ index: 1, playedIndices: [0, 1] });
  });

  it('never picks an already-played index while unplayed ones remain', () => {
    const result = pickRandomSetlistIndex([0, 1, 2, 3], 0, [0, 1, 2], () => 0.999);
    // Only index 3 remains unplayed, regardless of the random() value.
    expect(result).toEqual({ index: 3, playedIndices: [0, 1, 2, 3] });
  });

  it('starts a fresh cycle once every other resolvable song has been played, without repeating the current one', () => {
    // Everything except the current song (0) has already been played —
    // cycle complete. Should reset and pick from everything except 0.
    const result = pickRandomSetlistIndex([0, 1, 2, 3], 0, [0, 1, 2, 3], () => 0);
    expect(result).toEqual({ index: 1, playedIndices: [1] });
  });

  it('returns null when nothing else resolves at all (only the current song is in the library)', () => {
    const result = pickRandomSetlistIndex([2], 2, [2], () => 0);
    expect(result).toBeNull();
  });

  it('skips indices that are no longer resolvable (e.g. a song removed from the library)', () => {
    // Index 2 is missing from resolvableIndices entirely (its song was
    // removed) — it must never be picked even though it's not in playedIndices.
    const result = pickRandomSetlistIndex([0, 1, 3], 0, [0], () => 0.99);
    expect([1, 3]).toContain(result?.index);
    expect(result?.index).not.toBe(2);
  });

  it('uses the provided random function to select among the candidate pool uniformly', () => {
    // Three unplayed candidates [1, 2, 3]; random()=0.5 -> floor(0.5*3)=1 -> candidates[1] = 2.
    const result = pickRandomSetlistIndex([0, 1, 2, 3], 0, [0], () => 0.5);
    expect(result).toEqual({ index: 2, playedIndices: [0, 2] });
  });
});
