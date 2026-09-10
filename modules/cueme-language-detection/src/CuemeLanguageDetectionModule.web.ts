import { registerWebModule, NativeModule } from 'expo';

// No web equivalent of NaturalLanguage/NLLanguageRecognizer — a harmless
// no-op stub so the rest of the app still runs in a browser for quick
// iteration without a device. Apple-engine detection is iOS-only; the
// "Apple" toggle option simply detects nothing here, same fail-open
// fallback as the heuristic engine's own "not confident enough" case.
class CuemeLanguageDetectionModule extends NativeModule<{}> {
  async detectDominantLanguage(_text: string): Promise<string | null> {
    return null;
  }
}

export default registerWebModule(CuemeLanguageDetectionModule, 'CuemeLanguageDetectionModule');
