import CuemeLanguageDetection from '../../modules/cueme-language-detection/src/CuemeLanguageDetectionModule';

/**
 * Apple's own on-device NaturalLanguage detector, as the second, switchable
 * language-detection engine alongside the hand-rolled heuristic in
 * languageDetection.ts (see Voice Settings' "Language detection" toggle).
 * Unlike the heuristic's fixed 7-language profile list, this can recognize
 * any language Apple's NLLanguageRecognizer knows — a real advantage raised
 * directly by Rusty — at the cost of being a native call this project's
 * toolchain (no Mac) can't unit-test the way the heuristic is tested.
 *
 * Returns whatever raw language code Apple's recognizer reports (not
 * narrowed to the heuristic's SongLanguageCode union), or null if it
 * couldn't determine one — pickVoiceForLanguage matches on a plain language
 * prefix, so an unrestricted code still works for picking a voice even for
 * a language the heuristic has no profile for at all.
 */
export async function detectDominantLanguageApple(text: string): Promise<string | null> {
  return CuemeLanguageDetection.detectDominantLanguage(text);
}
