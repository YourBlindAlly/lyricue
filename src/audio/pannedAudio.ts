import { Image } from 'react-native';
import { getSoundPan, panToNumber, type SoundPan } from './soundPanPreference';

// Thin, failure-proof wrapper around the native panned-audio module
// (modules/lyricue-panned-audio). The module only exists in a real iOS build;
// in Expo Go, on the web, or under Jest the require throws, and everything
// here quietly reports "not available" so callers fall back to the normal,
// centered speech and sounds.
type NativePannedAudio = typeof import('../../modules/lyricue-panned-audio/src/LyricuePannedAudioModule').default;

let native: NativePannedAudio | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  native = require('../../modules/lyricue-panned-audio/src/LyricuePannedAudioModule').default;
} catch {
  native = null;
}

export function pannedAudioAvailable(): boolean {
  return native !== null;
}

/** True when a pan is set AND the native engine to honor it exists. */
export function shouldUsePannedAudio(): boolean {
  return native !== null && getSoundPan() !== 'center';
}

export async function applyNativePan(pan: SoundPan): Promise<void> {
  if (!native) return;
  try {
    await native.setPan(panToNumber(pan));
  } catch {
    // Nothing useful to do — the next speak/effect call reports its own failure.
  }
}

const effectSources = {
  tick: require('../../assets/audio/tick.wav'),
  end: require('../../assets/audio/end.wav'),
  songchange: require('../../assets/audio/songchange.wav'),
};
export type EffectName = keyof typeof effectSources;

let effectsLoaded = false;

/** Hands the bundled beeps to the native engine once. Safe to call repeatedly. */
export async function ensureEffectsLoaded(): Promise<boolean> {
  if (!native) return false;
  if (effectsLoaded) return true;
  try {
    for (const name of Object.keys(effectSources) as EffectName[]) {
      const uri = Image.resolveAssetSource(effectSources[name])?.uri;
      if (!uri) return false;
      await native.loadEffect(name, uri);
    }
    effectsLoaded = true;
    return true;
  } catch {
    return false;
  }
}

/** Plays a beep through the panned engine. Returns false if it couldn't, so the caller can play it centered instead. */
export function playPannedEffect(name: EffectName): boolean {
  if (!native || !effectsLoaded) return false;
  void native.playEffect(name).catch(() => {});
  return true;
}

export type PannedSpeechOptions = {
  text: string;
  voice: string | null;
  rate: number;
  pitch: number;
  volume: number;
};

/** Speaks through the panned engine. Resolves when finished or cut off; rejects if this voice can't be played that way. */
export function speakPanned(options: PannedSpeechOptions): Promise<'done' | 'stopped'> {
  if (!native) return Promise.reject(new Error('Panned audio is not available'));
  return native.speak(options.text, options.voice, options.rate, options.pitch, options.volume);
}

export function stopPannedSpeech(): void {
  if (!native) return;
  void native.stopSpeech().catch(() => {});
}
