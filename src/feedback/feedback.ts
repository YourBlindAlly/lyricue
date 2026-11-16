import * as Haptics from 'expo-haptics';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { loadTickSoundEnabled } from './tickSoundPreference';
import {
  applyNativePan,
  ensureEffectsLoaded,
  playPannedEffect,
  shouldUsePannedAudio,
  type EffectName,
} from '../audio/pannedAudio';
import { loadSoundPan, setCurrentSoundPan, type SoundPan } from '../audio/soundPanPreference';

const tickSource = require('../../assets/audio/tick.wav');
const endSource = require('../../assets/audio/end.wav');
const songChangeSource = require('../../assets/audio/songchange.wav');

let tickPlayer: ReturnType<typeof createAudioPlayer> | null = null;
let endPlayer: ReturnType<typeof createAudioPlayer> | null = null;
let songChangePlayer: ReturnType<typeof createAudioPlayer> | null = null;

// On by default. Loaded from storage at startup (configureAudioSession) and
// kept in sync live by Voice Settings via setTickSoundEnabled when Rusty
// flips the toggle, so a change takes effect immediately without needing to
// reload the screen.
let tickSoundEnabled = true;

/**
 * Configures the audio session so LyriCue's TTS and feedback sounds always take
 * priority — never ducked or muted for other audio, per spec.
 */
export async function configureAudioSession(): Promise<void> {
  await applyDefaultAudioMode();
  tickPlayer = createAudioPlayer(tickSource);
  endPlayer = createAudioPlayer(endSource);
  songChangePlayer = createAudioPlayer(songChangeSource);
  tickSoundEnabled = await loadTickSoundEnabled();
  await setSoundPan(await loadSoundPan());
}

async function applyDefaultAudioMode(): Promise<void> {
  await setAudioModeAsync({
    interruptionMode: 'doNotMix',
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    allowsRecording: false,
  });
}

/**
 * Applies a pan for LyriCue's beeps and voice — live, from Voice Settings, and
 * once at startup from the saved setting. Center leaves everything on the
 * normal path (expo-audio and expo-speech) exactly as it was before panning
 * existed; left or right routes the beeps (here) and the voice (useSpeech.ts)
 * through the native panned-audio engine instead.
 */
export async function setSoundPan(pan: SoundPan): Promise<void> {
  setCurrentSoundPan(pan);
  await applyNativePan(pan);
  if (pan === 'center') {
    // The panned engine mixes with other apps; put the session back the way
    // the centered path has always had it.
    await applyDefaultAudioMode();
  } else {
    await ensureEffectsLoaded();
  }
}

/** Lets Voice Settings apply a toggle change immediately, without waiting for the next app launch. */
export function setTickSoundEnabled(enabled: boolean): void {
  tickSoundEnabled = enabled;
}

/** Plays a beep through the panned engine when a pan is set; false means "play it the normal, centered way". */
function playPanned(name: EffectName): boolean {
  return shouldUsePannedAudio() && playPannedEffect(name);
}

export function playAdvanceFeedback(): void {
  // The haptic tap stays regardless of this setting — Rusty's request was
  // specifically about the audible tick, not the physical feedback.
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  if (!tickSoundEnabled) return;
  if (playPanned('tick')) return;
  void (async () => {
    await tickPlayer?.seekTo(0);
    tickPlayer?.play();
  })();
}

export function playEndOfSongFeedback(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  if (playPanned('end')) return;
  void (async () => {
    await endPlayer?.seekTo(0);
    endPlayer?.play();
  })();
}

/** A double-press detected as a setlist song-jump gets its own distinct cue — a rising two-tone chirp, different from both the per-line tick and the end-of-song chime — plus a firmer haptic than the regular line-advance tick. */
export function playSongChangeFeedback(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  if (playPanned('songchange')) return;
  void (async () => {
    await songChangePlayer?.seekTo(0);
    songChangePlayer?.play();
  })();
}
