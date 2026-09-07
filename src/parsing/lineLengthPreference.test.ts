jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import {
  nextLineLengthPreset,
  previousLineLengthPreset,
  LINE_LENGTH_PRESET_LABEL,
} from './lineLengthPreference';

describe('nextLineLengthPreset', () => {
  it('cycles off -> short -> medium -> long -> off, wrapping', () => {
    expect(nextLineLengthPreset('off')).toBe('short');
    expect(nextLineLengthPreset('short')).toBe('medium');
    expect(nextLineLengthPreset('medium')).toBe('long');
    expect(nextLineLengthPreset('long')).toBe('off');
  });
});

describe('previousLineLengthPreset', () => {
  it('cycles the reverse direction, wrapping', () => {
    expect(previousLineLengthPreset('off')).toBe('long');
    expect(previousLineLengthPreset('long')).toBe('medium');
    expect(previousLineLengthPreset('medium')).toBe('short');
    expect(previousLineLengthPreset('short')).toBe('off');
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
