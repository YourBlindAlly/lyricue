jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_SOUND_PAN,
  getSoundPan,
  loadSoundPan,
  nextPanForTap,
  panLeft,
  panRight,
  panToNumber,
  saveSoundPan,
  setCurrentSoundPan,
} from './soundPanPreference';

describe('panRight / panLeft', () => {
  it('moves one step toward the right', () => {
    expect(panRight('left')).toBe('center');
    expect(panRight('center')).toBe('right');
  });

  it('moves one step toward the left', () => {
    expect(panLeft('right')).toBe('center');
    expect(panLeft('center')).toBe('left');
  });

  it('clamps at the ends instead of wrapping', () => {
    expect(panRight('right')).toBe('right');
    expect(panLeft('left')).toBe('left');
  });
});

describe('nextPanForTap', () => {
  it('cycles left, center, right, then back to left', () => {
    expect(nextPanForTap('left')).toBe('center');
    expect(nextPanForTap('center')).toBe('right');
    expect(nextPanForTap('right')).toBe('left');
  });
});

describe('panToNumber', () => {
  it('maps to the engine values', () => {
    expect(panToNumber('left')).toBe(-1);
    expect(panToNumber('center')).toBe(0);
    expect(panToNumber('right')).toBe(1);
  });
});

describe('load and save', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('defaults to center when nothing is saved', async () => {
    expect(await loadSoundPan()).toBe(DEFAULT_SOUND_PAN);
    expect(DEFAULT_SOUND_PAN).toBe('center');
  });

  it('round-trips a saved value', async () => {
    await saveSoundPan('left');
    expect(await loadSoundPan()).toBe('left');
  });

  it('falls back to center for a value it does not recognize', async () => {
    await AsyncStorage.setItem('lyricue.soundPan', 'sideways');
    expect(await loadSoundPan()).toBe('center');
  });
});

describe('current pan in memory', () => {
  it('starts at center and follows setCurrentSoundPan', () => {
    expect(getSoundPan()).toBe('center');
    setCurrentSoundPan('right');
    expect(getSoundPan()).toBe('right');
    setCurrentSoundPan('center');
  });
});
