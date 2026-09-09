import { RepeatController, REPEAT_WINDOW_MS } from './repeatController';

describe('RepeatController', () => {
  it('a fresh back press always repeats', () => {
    const c = new RepeatController();
    expect(c.resolveBack(1000)).toBe('repeat');
  });

  it('a fresh next press (no repeat history) navigates normally', () => {
    const c = new RepeatController();
    expect(c.resolveNext(1000)).toBe('navigate');
  });

  it('a second quick back walks back a real line instead of repeating again', () => {
    const c = new RepeatController();
    expect(c.resolveBack(1000)).toBe('repeat');
    expect(c.resolveBack(1000 + REPEAT_WINDOW_MS - 1)).toBe('navigate');
  });

  it('every quick back after the first keeps navigating, not repeating', () => {
    const c = new RepeatController();
    expect(c.resolveBack(1000)).toBe('repeat');
    expect(c.resolveBack(1100)).toBe('navigate');
    expect(c.resolveBack(1200)).toBe('navigate');
    expect(c.resolveBack(1300)).toBe('navigate');
  });

  it('a quick next right after a back repeats instead of advancing (alternation)', () => {
    const c = new RepeatController();
    expect(c.resolveBack(1000)).toBe('repeat');
    expect(c.resolveNext(1100)).toBe('repeat');
  });

  it('a second quick next in a row still repeats — forward never breaks out early', () => {
    const c = new RepeatController();
    expect(c.resolveBack(1000)).toBe('repeat');
    expect(c.resolveNext(1100)).toBe('repeat');
    expect(c.resolveNext(1200)).toBe('repeat');
    expect(c.resolveNext(1300)).toBe('repeat');
  });

  it('a back/next alternation can continue repeating indefinitely while quick', () => {
    const c = new RepeatController();
    expect(c.resolveBack(1000)).toBe('repeat');
    expect(c.resolveNext(1100)).toBe('repeat');
    expect(c.resolveBack(1200)).toBe('repeat'); // alternation again (last was fwd)
    expect(c.resolveNext(1300)).toBe('repeat');
  });

  it('a next that comes after a real pause following a repeat finally advances', () => {
    const c = new RepeatController();
    expect(c.resolveBack(1000)).toBe('repeat');
    expect(c.resolveNext(1000 + REPEAT_WINDOW_MS + 1)).toBe('navigate');
  });

  it('a back that comes after a real pause starts a fresh repeat again', () => {
    const c = new RepeatController();
    expect(c.resolveBack(1000)).toBe('repeat');
    expect(c.resolveBack(1100)).toBe('navigate');
    // long pause, then back again — fresh, so it repeats rather than
    // continuing to walk backward from where the pause happened
    expect(c.resolveBack(1100 + REPEAT_WINDOW_MS + 1)).toBe('repeat');
  });

  it('plain repeated next presses with no back ever pressed just navigate normally each time', () => {
    const c = new RepeatController();
    expect(c.resolveNext(1000)).toBe('navigate');
    expect(c.resolveNext(1050)).toBe('navigate');
    expect(c.resolveNext(1100)).toBe('navigate');
  });

  it('respects a custom window', () => {
    const c = new RepeatController(200);
    expect(c.resolveBack(1000)).toBe('repeat');
    expect(c.resolveBack(1199)).toBe('navigate');
  });
});
