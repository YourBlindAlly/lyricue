jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import {
  increaseVoiceVolume,
  decreaseVoiceVolume,
  voiceVolumeLabel,
  DEFAULT_VOICE_VOLUME,
} from './voiceVolumePreference';

describe('increaseVoiceVolume', () => {
  it('moves one step louder', () => {
    expect(increaseVoiceVolume(0.6)).toBe(0.8);
  });

  it('clamps at the loudest preset instead of wrapping', () => {
    expect(increaseVoiceVolume(1.0)).toBe(1.0);
  });
});

describe('decreaseVoiceVolume', () => {
  it('moves one step quieter', () => {
    expect(decreaseVoiceVolume(0.6)).toBe(0.4);
  });

  it('clamps at the quietest preset instead of wrapping', () => {
    expect(decreaseVoiceVolume(0.2)).toBe(0.2);
  });
});

describe('voiceVolumeLabel', () => {
  it('labels the default volume as 100%', () => {
    expect(voiceVolumeLabel(DEFAULT_VOICE_VOLUME)).toBe('100%');
  });

  it('labels every other preset as a percentage', () => {
    expect(voiceVolumeLabel(0.2)).toBe('20%');
    expect(voiceVolumeLabel(0.6)).toBe('60%');
  });
});
