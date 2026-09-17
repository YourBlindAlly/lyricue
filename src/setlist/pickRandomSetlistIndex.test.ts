import { pickRandomSetlistIndex } from './pickRandomSetlistIndex';

describe('pickRandomSetlistIndex', () => {
  it('picks an unplayed index, leaving playedIndices untouched (the pick itself is not marked played)', () => {
    const result = pickRandomSetlistIndex([0, 1, 2, 3], 0, [], () => 0);
    // random() = 0 picks the first candidate in filtered order: [1, 2, 3][0] = 1
    expect(result).toEqual({ index: 1, playedIndices: [] });
  });

  it('never picks the current index, even when it is not itself in playedIndices', () => {
    // Nothing has been confirmed played yet (e.g. random mode was just
    // turned on), but the song you're currently on must never be re-picked.
    const result = pickRandomSetlistIndex([0, 1, 2, 3], 0, [], () => 0.99);
    expect(result?.index).not.toBe(0);
  });

  it('never picks an already-played index while unplayed ones remain', () => {
    const result = pickRandomSetlistIndex([0, 1, 2, 3], 0, [1, 2], () => 0.999);
    // Only index 3 remains unplayed and isn't the current song.
    expect(result).toEqual({ index: 3, playedIndices: [1, 2] });
  });

  it('leaves a skipped (never engaged, so never marked played) song eligible again immediately', () => {
    // Index 1 was landed on and left without playedIndices ever including
    // it (the caller only adds a song once it's been genuinely engaged
    // with) — it must remain a normal candidate, not be excluded.
    const result = pickRandomSetlistIndex([0, 1, 2, 3], 1, [0], () => 0);
    // Candidates (excluding current=1 and played=[0]): [2, 3][0] = 2 —
    // note index 1 itself isn't a candidate only because it's the current
    // song, not because it was "played".
    expect(result).toEqual({ index: 2, playedIndices: [0] });
  });

  it('starts a fresh cycle once every other resolvable song has been played, without repeating the current one', () => {
    const result = pickRandomSetlistIndex([0, 1, 2, 3], 0, [1, 2, 3], () => 0);
    expect(result).toEqual({ index: 1, playedIndices: [] });
  });

  it('returns null when nothing else resolves at all (only the current song is in the library)', () => {
    const result = pickRandomSetlistIndex([2], 2, [], () => 0);
    expect(result).toBeNull();
  });

  it('skips indices that are no longer resolvable (e.g. a song removed from the library)', () => {
    const result = pickRandomSetlistIndex([0, 1, 3], 0, [], () => 0.99);
    expect([1, 3]).toContain(result?.index);
    expect(result?.index).not.toBe(2);
  });

  it('uses the provided random function to select among the candidate pool uniformly', () => {
    // Candidates excluding current (0): [1, 2, 3]; random()=0.5 -> floor(0.5*3)=1 -> candidates[1] = 2.
    const result = pickRandomSetlistIndex([0, 1, 2, 3], 0, [], () => 0.5);
    expect(result).toEqual({ index: 2, playedIndices: [] });
  });
});
