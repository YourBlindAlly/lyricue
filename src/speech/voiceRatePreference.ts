import AsyncStorage from '@react-native-async-storage/async-storage';

// expo-speech's `rate` option: 1.0 is normal speed. A stepped preset list
// (same cycling-button pattern as lineLengthPreference.ts) rather than a
// slider — no new native dependency needed, and stays consistent with how
// the rest of the app already handles this kind of setting.
export const RATE_PRESETS = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0] as const;
export type VoiceRate = (typeof RATE_PRESETS)[number];

export const DEFAULT_VOICE_RATE: VoiceRate = 1.0;

const VOICE_RATE_KEY = 'cueme.voiceRate';

export async function loadVoiceRate(): Promise<VoiceRate> {
  const stored = await AsyncStorage.getItem(VOICE_RATE_KEY);
  const parsed = stored ? Number(stored) : NaN;
  return (RATE_PRESETS as readonly number[]).includes(parsed)
    ? (parsed as VoiceRate)
    : DEFAULT_VOICE_RATE;
}

export async function saveVoiceRate(rate: VoiceRate): Promise<void> {
  await AsyncStorage.setItem(VOICE_RATE_KEY, String(rate));
}

/**
 * One step faster/slower, clamped at the ends of the preset list rather than
 * wrapping — for the swipe-up/swipe-down "adjustable" gesture (Rusty's
 * request 2026-09-05: tapping the button all the way around to go back down
 * a step was a pain). Wrapping makes sense for a single forward-only tap
 * button; it doesn't for a control you can already move in either direction
 * directly, so going past either end just stays there instead of jumping to
 * the opposite end.
 */
export function increaseVoiceRate(current: VoiceRate): VoiceRate {
  const index = RATE_PRESETS.indexOf(current);
  return RATE_PRESETS[Math.min(index + 1, RATE_PRESETS.length - 1)];
}

export function decreaseVoiceRate(current: VoiceRate): VoiceRate {
  const index = RATE_PRESETS.indexOf(current);
  return RATE_PRESETS[Math.max(index - 1, 0)];
}

export function voiceRateLabel(rate: VoiceRate): string {
  return rate === 1.0 ? 'Normal' : `${rate}x`;
}
