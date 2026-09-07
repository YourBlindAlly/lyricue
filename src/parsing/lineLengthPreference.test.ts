jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import {
  increaseLineLengthPreset,
  decreaseLineLengthPreset,
  nextLineLengthPreset,
  LINE_LENGTH_PRESET_LABEL,
} from './lineLengthPreference';

describe('nextLineLengthPreset', () => {
  it('cycles off -> short -> medium -> long -> off', () => {
    expect(nextLineLengthPreset('off')).toBe('short');
    expect(nextLineLengthPreset('short')).toBe('medium');
    expect(nextLineLengthPreset('medium')).toBe('long');
    expect(nextLineLengthPreset('long')).toBe('off');
  });
});

describe('increaseLineLengthPreset', () => {
  it('moves one step toward longer lines', () => {
    expect(increaseLineLengthPreset('off')).toBe('short');
    expect(increaseLineLengthPreset('short')).toBe('medium');
    expect(increaseLineLengthPreset('medium')).toBe('long');
  });

  it('clamps at Long instead of wrapping', () => {
    expect(increaseLineLengthPreset('long')).toBe('long');
  });
});

describe('decreaseLineLengthPreset', () => {
  it('moves one step toward shorter lines', () => {
    expect(decreaseLineLengthPreset('long')).toBe('medium');
    expect(decreaseLineLengthPreset('medium')).toBe('short');
    expect(decreaseLineLengthPreset('short')).toBe('off');
  });

  it('clamps at Off instead of wrapping', () => {
    expect(decreaseLineLengthPreset('off')).toBe('off');
  });
});

describe('LINE_LENGTH_PRESET_LABEL', () => {
  it('has a label for every preset', () => {
    expect(LINE_LENGTH_PRESET_LABEL).toEqual({
      short: 'Short',
      medium: 'Medium',
      long: 'Long',
      off: 'Off',
    });
  });
});
