jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { loadTickSoundEnabled, saveTickSoundEnabled } from './tickSoundPreference';

describe('loadTickSoundEnabled / saveTickSoundEnabled', () => {
  it('defaults to true when nothing has been saved', async () => {
    expect(await loadTickSoundEnabled()).toBe(true);
  });

  it('round-trips false', async () => {
    await saveTickSoundEnabled(false);
    expect(await loadTickSoundEnabled()).toBe(false);
  });

  it('round-trips true', async () => {
    await saveTickSoundEnabled(false);
    await saveTickSoundEnabled(true);
    expect(await loadTickSoundEnabled()).toBe(true);
  });
});
