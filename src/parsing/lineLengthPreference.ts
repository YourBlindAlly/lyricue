import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LineWrapOptions } from './wrapLines';

export type LineLengthPreset = 'short' | 'medium' | 'long' | 'off';

// Rusty's own stated comfort zone (4-7 words, ~8 syllables) is "medium" —
// the default. Short/long give room either side without a custom-number UI.
export const LINE_LENGTH_OPTIONS: Record<Exclude<LineLengthPreset, 'off'>, LineWrapOptions> = {
  short: { maxWords: 4, maxSyllables: 5 },
  medium: { maxWords: 6, maxSyllables: 8 },
  long: { maxWords: 9, maxSyllables: 12 },
};

export const DEFAULT_LINE_LENGTH_PRESET: LineLengthPreset = 'medium';

const LINE_LENGTH_KEY = 'cueme.lineLengthPreset';

// Ordered from "no splitting at all" to "shortest chunks" — the axis the
// swipe-adjustable header control moves along. Off sits at one end rather
// than wrapping in after Long, since it isn't "more splitting than Long",
// it's "no splitting" — a real endpoint, not a fourth step on the scale.
const PRESET_ORDER: LineLengthPreset[] = ['off', 'short', 'medium', 'long'];

export async function loadLineLengthPreset(): Promise<LineLengthPreset> {
  const stored = await AsyncStorage.getItem(LINE_LENGTH_KEY);
  if (stored && (PRESET_ORDER as string[]).includes(stored)) {
    return stored as LineLengthPreset;
  }
  return DEFAULT_LINE_LENGTH_PRESET;
}

export async function saveLineLengthPreset(preset: LineLengthPreset): Promise<void> {
  await AsyncStorage.setItem(LINE_LENGTH_KEY, preset);
}

/**
 * One step toward longer/shorter lines, clamped at either end rather than
 * wrapping — for the swipe-up/down "adjustable" gesture, same reasoning as
 * voiceRatePreference's increase/decrease (Rusty's 2026-09-07 request to
 * make this swipe-adjustable instead of a tap-to-cycle button, matching the
 * pattern already built for Speed/Volume).
 */
export function increaseLineLengthPreset(current: LineLengthPreset): LineLengthPreset {
  const index = PRESET_ORDER.indexOf(current);
  return PRESET_ORDER[Math.min(index + 1, PRESET_ORDER.length - 1)];
}

export function decreaseLineLengthPreset(current: LineLengthPreset): LineLengthPreset {
  const index = PRESET_ORDER.indexOf(current);
  return PRESET_ORDER[Math.max(index - 1, 0)];
}

export const LINE_LENGTH_PRESET_LABEL: Record<LineLengthPreset, string> = {
  short: 'Short',
  medium: 'Medium',
  long: 'Long',
  off: 'Off',
};

/**
 * Resolves a preset to wrap options. 'off' uses caps that no real line will
 * ever hit, so every line comes out as a single unsplit chunk — i.e. spoken
 * exactly as authored — while still going through the same chording/section
 * remap pipeline as every other preset (so "Off" + "Include chords" still
 * speaks chord names, just without any length-based splitting).
 */
export function wrapOptionsForPreset(preset: LineLengthPreset): LineWrapOptions {
  if (preset === 'off') {
    return { maxWords: Infinity, maxSyllables: Infinity };
  }
  return LINE_LENGTH_OPTIONS[preset];
}
