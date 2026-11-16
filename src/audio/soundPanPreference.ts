import AsyncStorage from '@react-native-async-storage/async-storage';

// Where LyriCue's own sound (its voice and its beeps) sits in the stereo
// field. Added 2026-11-15 for performing with a hard-wired stereo feed:
// VoiceOver can be panned to one side so only the monitor hears it, and
// LyriCue goes to that same side so the other side stays clean for the PA.
// Three fixed positions, not a slider — the point is hard left or hard
// right, and center is the normal, unpanned behavior.
export const SOUND_PANS = ['left', 'center', 'right'] as const;
export type SoundPan = (typeof SOUND_PANS)[number];

export const DEFAULT_SOUND_PAN: SoundPan = 'center';

// New key, so it follows the project's current naming (see AGENTS.md); the
// older cueme.* keys stay as they are.
const SOUND_PAN_KEY = 'lyricue.soundPan';

export async function loadSoundPan(): Promise<SoundPan> {
  const stored = await AsyncStorage.getItem(SOUND_PAN_KEY);
  return (SOUND_PANS as readonly string[]).includes(stored ?? '') ? (stored as SoundPan) : DEFAULT_SOUND_PAN;
}

export async function saveSoundPan(pan: SoundPan): Promise<void> {
  await AsyncStorage.setItem(SOUND_PAN_KEY, pan);
}

/** One step toward the right, clamped at the end rather than wrapping — for the swipe-up gesture. */
export function panRight(current: SoundPan): SoundPan {
  const index = SOUND_PANS.indexOf(current);
  return SOUND_PANS[Math.min(index + 1, SOUND_PANS.length - 1)];
}

/** One step toward the left, clamped at the end rather than wrapping — for the swipe-down gesture. */
export function panLeft(current: SoundPan): SoundPan {
  const index = SOUND_PANS.indexOf(current);
  return SOUND_PANS[Math.max(index - 1, 0)];
}

/** Left -> Center -> Right -> back to Left. For a plain tap, which (unlike a swipe) has no direction to go on. */
export function nextPanForTap(current: SoundPan): SoundPan {
  const index = SOUND_PANS.indexOf(current);
  return SOUND_PANS[(index + 1) % SOUND_PANS.length];
}

/** The -1..1 value the native audio engine takes. */
export function panToNumber(pan: SoundPan): number {
  if (pan === 'left') return -1;
  if (pan === 'right') return 1;
  return 0;
}

// The pan currently in effect, kept in memory so the speech hook and the
// sound effects can read it synchronously on every call without hitting
// storage. Set at startup (configureAudioSession) and live by Voice Settings.
let currentSoundPan: SoundPan = DEFAULT_SOUND_PAN;

export function getSoundPan(): SoundPan {
  return currentSoundPan;
}

export function setCurrentSoundPan(pan: SoundPan): void {
  currentSoundPan = pan;
}
