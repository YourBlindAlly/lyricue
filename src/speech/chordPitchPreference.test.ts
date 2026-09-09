jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { loadHigherPitchForChords, saveHigherPitchForChords } from './chordPitchPreference';

describe('loadHigherPitchForChords / saveHigherPitchForChords', () => {
  it('defaults to false when nothing has been saved', async () => {
    expect(await loadHigherPitchForChords()).toBe(false);
  });

  it('round-trips true', async () => {
    await saveHigherPitchForChords(true);
    expect(await loadHigherPitchForChords()).toBe(true);
  });

  it('round-trips false', async () => {
    await saveHigherPitchForChords(true);
    await saveHigherPitchForChords(false);
    expect(await loadHigherPitchForChords()).toBe(false);
  });
});
