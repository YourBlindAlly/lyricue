import AsyncStorage from '@react-native-async-storage/async-storage';

export type LanguageDetectionEngine = 'heuristic' | 'apple';

const LANGUAGE_DETECTION_ENGINE_KEY = 'cueme.languageDetectionEngine';

// Heuristic stays the default — it's what every song has been using since
// the feature shipped, and switching the default out from under existing
// testers isn't the point of adding the Apple option; A/B-ing the two is.
export const DEFAULT_LANGUAGE_DETECTION_ENGINE: LanguageDetectionEngine = 'heuristic';

export async function loadLanguageDetectionEngine(): Promise<LanguageDetectionEngine> {
  const stored = await AsyncStorage.getItem(LANGUAGE_DETECTION_ENGINE_KEY);
  return stored === 'apple' ? 'apple' : DEFAULT_LANGUAGE_DETECTION_ENGINE;
}

export async function saveLanguageDetectionEngine(engine: LanguageDetectionEngine): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_DETECTION_ENGINE_KEY, engine);
}
