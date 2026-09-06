export type DeviceLocale = { languageCode: string | null };

/**
 * Distinct language codes to show voices for by default: English always
 * (the app's own baseline), plus whatever other language(s) the device
 * itself is configured for (iOS Settings > General > Language & Region) —
 * so a device set up for a second language surfaces those voices too,
 * without showing every installed voice in every language up front.
 */
export function preferredLanguageCodes(locales: DeviceLocale[]): string[] {
  const codes = new Set<string>(['en']);
  for (const locale of locales) {
    const code = locale.languageCode?.trim().toLowerCase();
    if (code) {
      codes.add(code);
    }
  }
  return Array.from(codes);
}

/** A voice's base language code from its BCP-47 tag (e.g. "en-US" -> "en"). */
function baseLanguageCode(voiceLanguage: string): string {
  return voiceLanguage.split('-')[0]?.trim().toLowerCase() ?? '';
}

/** Filters a voice list down to just the given preferred language codes. */
export function filterVoicesByLanguages<T extends { language: string }>(
  voices: T[],
  preferredCodes: string[]
): T[] {
  return voices.filter((voice) => preferredCodes.includes(baseLanguageCode(voice.language)));
}

/**
 * Filters a voice list down to higher-than-Default-quality voices, unless
 * `includeLowQuality` is true — most iOS devices have a "Default" (compact,
 * always present) voice plus one or more separately-downloaded higher
 * quality voices per language (Apple's own "Enhanced" and "Premium" tiers,
 * Premium being the newest and best); showing only the higher tiers by
 * default keeps the list from being dominated by lower-quality entries most
 * people won't want, per Rusty's request 2026-09-05.
 *
 * expo-speech's iOS native module only checked for `.enhanced` and reported
 * every other AVSpeechSynthesisVoiceQuality case — including genuine
 * `.premium` voices — as "Default" (patched in patches/expo-speech+*.patch
 * to also report "Premium"). Until that patch was added, this filter's
 * "Enhanced only" default silently hid every Premium-tier voice, which is
 * actually the *highest* quality Apple offers, not a low one — confirmed
 * live 2026-09-05 when Rusty's downloaded voices vanished entirely from the
 * list, leaving only the always-shown System default and current-voice
 * rows. Checking `!== 'Default'` rather than `=== 'Enhanced'` means any
 * future Apple quality tier this library maps through correctly still
 * counts as "not low quality" without needing another one-off fix here.
 */
export function filterVoicesByQuality<T extends { quality: string }>(
  voices: T[],
  includeLowQuality: boolean
): T[] {
  if (includeLowQuality) {
    return voices;
  }
  return voices.filter((voice) => voice.quality !== 'Default');
}
