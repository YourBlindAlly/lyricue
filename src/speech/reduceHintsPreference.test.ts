jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { loadReduceHints, saveReduceHints, hintOrNone } from './reduceHintsPreference';

describe('loadReduceHints / saveReduceHints', () => {
  it('defaults to false when nothing has been saved', async () => {
    expect(await loadReduceHints()).toBe(false);
  });

  it('round-trips true', async () => {
    await saveReduceHints(true);
    expect(await loadReduceHints()).toBe(true);
  });

  it('round-trips false', async () => {
    await saveReduceHints(true);
    await saveReduceHints(false);
    expect(await loadReduceHints()).toBe(false);
  });
});

describe('hintOrNone', () => {
  it('passes the hint through when reduceHints is false', () => {
    expect(hintOrNone('Swipe up for faster', false)).toBe('Swipe up for faster');
  });

  it('strips the hint when reduceHints is true', () => {
    expect(hintOrNone('Swipe up for faster', true)).toBeUndefined();
  });

  it('stays undefined either way when the hint was already undefined', () => {
    expect(hintOrNone(undefined, false)).toBeUndefined();
    expect(hintOrNone(undefined, true)).toBeUndefined();
  });
});
