import ExpoModulesCore
import NaturalLanguage

/// Bridges Apple's on-device NaturalLanguage framework to JS as the second,
/// switchable language-detection engine alongside LyriCue's own hand-rolled
/// heuristic (see src/speech/languageDetection.ts) — added specifically so
/// Rusty can A/B the two live via the "Language detection" toggle in Voice
/// Settings, rather than committing to one sight unseen. Apple's recognizer
/// covers far more languages than the hand-rolled heuristic's fixed 7-word
/// profile list, at the cost of being untestable without a real device (no
/// Mac in this project's toolchain — see the JS side's own tests for what
/// *can* be verified without one).
public class CuemeLanguageDetectionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CuemeLanguageDetection")

    // The static dominantLanguage(for:) form is stateless and thread-safe,
    // unlike a shared NLLanguageRecognizer instance (which Apple's own docs
    // say not to use from more than one thread at once, and which needs an
    // explicit reset() between calls) — simplest correct choice for a
    // one-shot bridge function with no need to keep any recognizer state
    // between calls.
    AsyncFunction("detectDominantLanguage") { (text: String) -> String? in
      guard let language = NLLanguageRecognizer.dominantLanguage(for: text) else {
        return nil
      }
      return language.rawValue
    }
  }
}
