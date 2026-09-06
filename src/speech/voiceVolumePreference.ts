import AsyncStorage from '@react-native-async-storage/async-storage';

// expo-speech's `volume` option: 0.0 (muted) to 1.0 (max), default 1.0.
// Same stepped-preset pattern as voiceRatePreference.ts, for the same
// reasons — no new native dependency, consistent with the rest of the app.
// Starts at 0.2 rather than 0.0 since a fully-muted lyric prompter isn't a
// useful state to land on.
export const VOLUME_PRESETS = [0.2, 0.4, 0.6, 0.8, 1.0] as const;
export type VoiceVolume = (typeof VOLUME_PRESETS)[number];

export const DEFAULT_VOICE_VOLUME: VoiceVolume = 1.0;

const VOICE_VOLUME_KEY = 'cueme.voiceVolume';

export async function loadVoiceVolume(): Promise<VoiceVolume> {
  const stored = await AsyncStorage.getItem(VOICE_VOLUME_KEY);
  const parsed = stored ? Number(stored) : NaN;
  return (VOLUME_PRESETS as readonly number[]).includes(parsed)
    ? (parsed as VoiceVolume)
    : DEFAULT_VOICE_VOLUME;
}

export async function saveVoiceVolume(volume: VoiceVolume): Promise<void> {
  await AsyncStorage.setItem(VOICE_VOLUME_KEY, String(volume));
}

/** One step louder/quieter, clamped at the ends rather than wrapping — for the swipe-up/down gesture. */
export function increaseVoiceVolume(current: VoiceVolume): VoiceVolume {
  const index = VOLUME_PRESETS.indexOf(current);
  return VOLUME_PRESETS[Math.min(index + 1, VOLUME_PRESETS.length - 1)];
}

export function decreaseVoiceVolume(current: VoiceVolume): VoiceVolume {
  const index = VOLUME_PRESETS.indexOf(current);
  return VOLUME_PRESETS[Math.max(index - 1, 0)];
}

export function voiceVolumeLabel(volume: VoiceVolume): string {
  return `${Math.round(volume * 100)}%`;
}
