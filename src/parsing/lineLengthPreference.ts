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

// Ordered from "no splitting at all" to "shortest chunks" — the axis both
// the tap and swipe header controls move along, treated as a loop (Off
// follows Long the same way it precedes Short) rather than a line with hard
// ends. Rusty's request 2026-09-07: with 4 presets clamped, going from Off
// to Long took 3 swipes one-way; wrapping caps the worst case at 2 swipes
// from any preset to any other, in whichever direction is closer.
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
 * Cycles off -> short -> medium -> long -> off, wrapping at the end. Used for
 * both the tap fallback and swipe-up (increment) — unlike most of this app's
 * other adjustable controls (speed, volume), this one deliberately wraps in
 * both directions; see the PRESET_ORDER comment above for why.
 */
export function nextLineLengthPreset(current: LineLengthPreset): LineLengthPreset {
  const index = PRESET_ORDER.indexOf(current);
  return PRESET_ORDER[(index + 1) % PRESET_ORDER.length];
}

/** The reverse of nextLineLengthPreset, for swipe-down (decrement). */
export function previousLineLengthPreset(current: LineLengthPreset): LineLengthPreset {
  const index = PRESET_ORDER.indexOf(current);
  return PRESET_ORDER[(index - 1 + PRESET_ORDER.length) % PRESET_ORDER.length];
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
