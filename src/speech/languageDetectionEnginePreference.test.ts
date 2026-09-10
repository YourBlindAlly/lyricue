jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import {
  loadLanguageDetectionEngine,
  saveLanguageDetectionEngine,
} from './languageDetectionEnginePreference';

describe('loadLanguageDetectionEngine / saveLanguageDetectionEngine', () => {
  it('defaults to heuristic when nothing has been saved', async () => {
    expect(await loadLanguageDetectionEngine()).toBe('heuristic');
  });

  it('round-trips apple', async () => {
    await saveLanguageDetectionEngine('apple');
    expect(await loadLanguageDetectionEngine()).toBe('apple');
  });

  it('round-trips back to heuristic', async () => {
    await saveLanguageDetectionEngine('apple');
    await saveLanguageDetectionEngine('heuristic');
    expect(await loadLanguageDetectionEngine()).toBe('heuristic');
  });
});
