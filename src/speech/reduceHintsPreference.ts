import AsyncStorage from '@react-native-async-storage/async-storage';

const REDUCE_HINTS_KEY = 'cueme.reduceHints';

/**
 * Off by default — VoiceOver speaks each control's usage hint (e.g. "swipe
 * up for faster, down for slower") every time focus lands on it, genuinely
 * useful while learning the app but repetitive once a control is familiar.
 * Rusty's report 2026-09-08, after recording a demo: "good when you're
 * first getting to know the app, not so good when you know what the
 * controls do." Turning this on strips accessibilityHint from every
 * interactive control app-wide via hintOrNone below, leaving the label and
 * current value untouched.
 */
export async function loadReduceHints(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(REDUCE_HINTS_KEY);
  return raw === 'true';
}

export async function saveReduceHints(value: boolean): Promise<void> {
  await AsyncStorage.setItem(REDUCE_HINTS_KEY, String(value));
}

/** Applies the reduceHints preference to a single accessibilityHint value. */
export function hintOrNone(hint: string | undefined, reduceHints: boolean): string | undefined {
  return reduceHints ? undefined : hint;
}
