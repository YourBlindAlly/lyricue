import AsyncStorage from '@react-native-async-storage/async-storage';

/** Language code (2-letter prefix, e.g. "es") -> chosen voice identifier. */
export type LanguageVoiceMap = Record<string, string>;

const LANGUAGE_VOICE_MAP_KEY = 'cueme.languageVoiceMap';

export async function loadLanguageVoiceMap(): Promise<LanguageVoiceMap> {
  const stored = await AsyncStorage.getItem(LANGUAGE_VOICE_MAP_KEY);
  if (!stored) return {};
  try {
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveLanguageVoiceMap(map: LanguageVoiceMap): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_VOICE_MAP_KEY, JSON.stringify(map));
}

export async function setLanguageVoice(code: string, voiceIdentifier: string): Promise<LanguageVoiceMap> {
  const map = await loadLanguageVoiceMap();
  const updated = { ...map, [code]: voiceIdentifier };
  await saveLanguageVoiceMap(updated);
  return updated;
}

export async function removeLanguageVoice(code: string): Promise<LanguageVoiceMap> {
  const map = await loadLanguageVoiceMap();
  const updated = { ...map };
  delete updated[code];
  await saveLanguageVoiceMap(updated);
  return updated;
}

/** Looks up a voice for a detected/tagged language code, matching on the 2-letter language prefix so "pt-BR" and "pt-PT" share one "pt" entry. */
export function voiceForLanguageCode(map: LanguageVoiceMap, languageCode: string): string | null {
  const prefix = languageCode.slice(0, 2).toLowerCase();
  return map[prefix] ?? null;
}
