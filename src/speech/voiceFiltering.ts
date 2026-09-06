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
 * Premium being the newest and best). expo-speech's iOS native module only
 * checked for `.enhanced` and reported every other tier — including genuine
 * `.premium` voices — as "Default" (patched in
 * patches/expo-speech+57.0.1.patch to report Premium correctly). Checking
 * `!== 'Default'` rather than `=== 'Enhanced'` means Premium voices count as
 * high quality too, and any future Apple tier this library maps through
 * correctly still counts as "not low quality" without another one-off fix.
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

/**
 * Applies `filterFn` to `voices`, but if doing so would wipe the list out
 * entirely, returns `voices` unchanged instead. This is the safety net that
 * makes "the whole Voice Settings list silently goes empty" — the exact
 * 2026-09-05 bug, root cause never fully confirmed without device access —
 * structurally impossible from here on: whichever filter stage would
 * otherwise hide everything just no-ops instead, so the worst case is
 * "shows more voices than intended," never "shows nothing with no
 * explanation." Does not fabricate voices: an empty input still produces an
 * empty output.
 */
export function filterWithFailOpen<T>(voices: T[], filterFn: (voices: T[]) => T[]): T[] {
  if (voices.length === 0) {
    return voices;
  }
  const result = filterFn(voices);
  return result.length === 0 ? voices : result;
}
