import * as Haptics from 'expo-haptics';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

const tickSource = require('../../assets/audio/tick.wav');
const endSource = require('../../assets/audio/end.wav');
const songChangeSource = require('../../assets/audio/songchange.wav');

let tickPlayer: ReturnType<typeof createAudioPlayer> | null = null;
let endPlayer: ReturnType<typeof createAudioPlayer> | null = null;
let songChangePlayer: ReturnType<typeof createAudioPlayer> | null = null;

/**
 * Configures the audio session so LyriCue's TTS and feedback sounds always take
 * priority — never ducked or muted for other audio, per spec.
 */
export async function configureAudioSession(): Promise<void> {
  await setAudioModeAsync({
    interruptionMode: 'doNotMix',
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    allowsRecording: false,
  });
  tickPlayer = createAudioPlayer(tickSource);
  endPlayer = createAudioPlayer(endSource);
  songChangePlayer = createAudioPlayer(songChangeSource);
}

export function playAdvanceFeedback(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  void (async () => {
    await tickPlayer?.seekTo(0);
    tickPlayer?.play();
  })();
}

export function playEndOfSongFeedback(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  void (async () => {
    await endPlayer?.seekTo(0);
    endPlayer?.play();
  })();
}

/** A double-press detected as a setlist song-jump gets its own distinct cue — a rising two-tone chirp, different from both the per-line tick and the end-of-song chime — plus a firmer haptic than the regular line-advance tick. */
export function playSongChangeFeedback(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  void (async () => {
    await songChangePlayer?.seekTo(0);
    songChangePlayer?.play();
  })();
}
