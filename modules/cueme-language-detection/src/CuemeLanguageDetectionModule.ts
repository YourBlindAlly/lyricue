import { NativeModule, requireNativeModule } from 'expo';

declare class CuemeLanguageDetectionModule extends NativeModule<{}> {
  detectDominantLanguage(text: string): Promise<string | null>;
}

export default requireNativeModule<CuemeLanguageDetectionModule>('CuemeLanguageDetection');
