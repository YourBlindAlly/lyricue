jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { loadBreakAtChords, saveBreakAtChords } from './chordLineBreaksPreference';

describe('loadBreakAtChords / saveBreakAtChords', () => {
  it('defaults to false when nothing has been saved', async () => {
    expect(await loadBreakAtChords()).toBe(false);
  });

  it('round-trips true', async () => {
    await saveBreakAtChords(true);
    expect(await loadBreakAtChords()).toBe(true);
  });

  it('round-trips false', async () => {
    await saveBreakAtChords(true);
    await saveBreakAtChords(false);
    expect(await loadBreakAtChords()).toBe(false);
  });
});
