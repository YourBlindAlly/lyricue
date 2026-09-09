jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { loadRepeatFeatureEnabled, saveRepeatFeatureEnabled } from './repeatFeaturePreference';

describe('loadRepeatFeatureEnabled / saveRepeatFeatureEnabled', () => {
  it('defaults to true when nothing has been saved', async () => {
    expect(await loadRepeatFeatureEnabled()).toBe(true);
  });

  it('round-trips false', async () => {
    await saveRepeatFeatureEnabled(false);
    expect(await loadRepeatFeatureEnabled()).toBe(false);
  });

  it('round-trips true', async () => {
    await saveRepeatFeatureEnabled(false);
    await saveRepeatFeatureEnabled(true);
    expect(await loadRepeatFeatureEnabled()).toBe(true);
  });
});
