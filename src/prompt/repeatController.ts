/**
 * Repeat window, chosen to comfortably cover "I just pressed the wrong
 * button" or "play that again right now" without being so long that an
 * ordinary next press made a beat later gets swallowed into a repeat.
 */
export const REPEAT_WINDOW_MS = 1000;

type PressType = 'back' | 'fwd';

/** What a given press should do: re-speak the current line, or actually navigate. */
export type PressResolution = 'repeat' | 'navigate';

/**
 * Decides whether a back/forward press repeats the current line or actually
 * moves, per Rusty's design (2026-09-09):
 *
 * - A "back" press with no recent repeat activity always repeats the
 *   current line first, rather than immediately walking back a line -- this
 *   is what "starts" a repeat.
 * - A second, quick "back" (same button, within the window) walks back a
 *   real line instead of repeating again, and every quick "back" after
 *   that keeps walking back one real line at a time -- so rewinding
 *   multiple lines fast still works, it just costs one repeat up front.
 * - A quick "fwd" (within the window), whether it's alternating with a
 *   preceding back or repeating a preceding fwd, always repeats -- moving
 *   forward for real only ever happens after a genuine pause. This is
 *   deliberate: skipping past a line you just asked to hear again is a
 *   worse mistake than making someone wait a beat, whereas going back
 *   further is a reasonable thing to want quickly.
 * - In ordinary use this "wait" costs nothing: singing the repeated line
 *   before reaching for next already takes longer than the window.
 */
export class RepeatController {
  // Tracks the resolution alongside the press so plain fast-forward
  // clicking (a chain of next presses that never touched back) can keep
  // navigating normally — only a fwd press that itself resolved as a
  // repeat (via alternation, or continuing an active repeat chain) locks
  // the next fwd press into repeating too.
  private lastPress: { type: PressType; atMs: number; resolution: PressResolution } | null = null;

  constructor(private readonly windowMs: number = REPEAT_WINDOW_MS) {}

  private withinWindow(now: number): boolean {
    return this.lastPress !== null && now - this.lastPress.atMs < this.windowMs;
  }

  resolveBack(now: number = Date.now()): PressResolution {
    if (!this.withinWindow(now)) {
      this.lastPress = { type: 'back', atMs: now, resolution: 'repeat' };
      return 'repeat';
    }
    if (this.lastPress!.type === 'back') {
      this.lastPress = { type: 'back', atMs: now, resolution: 'navigate' };
      return 'navigate';
    }
    this.lastPress = { type: 'back', atMs: now, resolution: 'repeat' };
    return 'repeat';
  }

  resolveNext(now: number = Date.now()): PressResolution {
    if (!this.withinWindow(now)) {
      this.lastPress = { type: 'fwd', atMs: now, resolution: 'navigate' };
      return 'navigate';
    }
    const last = this.lastPress!;
    if (last.type === 'fwd' && last.resolution === 'navigate') {
      // Continuing a plain fast-forward click chain that never touched back.
      this.lastPress = { type: 'fwd', atMs: now, resolution: 'navigate' };
      return 'navigate';
    }
    this.lastPress = { type: 'fwd', atMs: now, resolution: 'repeat' };
    return 'repeat';
  }
}
