import { parseSong } from './parseSong';

describe('parseSong', () => {
  it('splits plain lines and drops blank lines', () => {
    const { lines, sections } = parseSong('Line one\n\nLine two\n   \nLine three');
    expect(lines).toEqual(['Line one', 'Line two', 'Line three']);
    expect(sections).toEqual([]);
  });

  it('extracts a bare "--" divider as an unlabeled section', () => {
    const { lines, sections } = parseSong('Verse line\n--\nChorus line');
    expect(lines).toEqual(['Verse line', 'Chorus line']);
    expect(sections).toEqual([{ lineIndex: 1, label: '' }]);
  });

  it('extracts a "-- Label --" style section with its label', () => {
    const { lines, sections } = parseSong('Verse line\n-- Chorus --\nChorus line');
    expect(lines).toEqual(['Verse line', 'Chorus line']);
    expect(sections).toEqual([{ lineIndex: 1, label: 'Chorus' }]);
  });

  it('extracts a "[Label]" bracketed section with its label', () => {
    const { lines, sections } = parseSong('Verse line\n[Bridge]\nBridge line');
    expect(lines).toEqual(['Verse line', 'Bridge line']);
    expect(sections).toEqual([{ lineIndex: 1, label: 'Bridge' }]);
  });

  it('records the section at the index of the line that follows it', () => {
    const { sections } = parseSong('[Intro]\nFirst line\nSecond line\n[Verse]\nThird line');
    expect(sections).toEqual([
      { lineIndex: 0, label: 'Intro' },
      { lineIndex: 2, label: 'Verse' },
    ]);
  });

  it('handles a song with no section markers at all', () => {
    const { lines, sections } = parseSong('Only\nplain\nlines');
    expect(lines).toEqual(['Only', 'plain', 'lines']);
    expect(sections).toEqual([]);
  });

  it('handles an empty song', () => {
    expect(parseSong('')).toEqual({ lines: [], chordedLines: [], sections: [], language: null });
  });

  it('trims surrounding whitespace on each line', () => {
    const { lines } = parseSong('  Padded line  \n\tTabbed line\t');
    expect(lines).toEqual(['Padded line', 'Tabbed line']);
  });

  it('produces chordedLines with no chord data, one-to-one with lines', () => {
    const { chordedLines } = parseSong('Line one\nLine two');
    expect(chordedLines).toEqual([
      [
        { chord: null, text: 'Line' },
        { chord: null, text: 'one' },
      ],
      [
        { chord: null, text: 'Line' },
        { chord: null, text: 'two' },
      ],
    ]);
  });

  it('picks up a {lang: Name} directive as a manual language override, and strips the directive line', () => {
    const { lines, language } = parseSong('{lang: Spanish}\nUno dos tres');
    expect(lines).toEqual(['Uno dos tres']);
    expect(language).toBe('es');
  });

  it('lets a manual language directive override what auto-detection would otherwise guess', () => {
    const { language } = parseSong(
      '{lang: French}\nQue bonita es la vida cuando estoy contigo\nY como me gusta bailar con esta cancion'
    );
    expect(language).toBe('fr');
  });

  it('auto-detects a language when no directive is present', () => {
    const { language } = parseSong(
      'Que bonita es la vida cuando estoy contigo\nY como me gusta bailar con esta cancion\nPorque tu eres todo lo que yo necesito, mi amor'
    );
    expect(language).toBe('es');
  });

  it('leaves language null when nothing can be confidently detected', () => {
    const { language } = parseSong('La la la\nNa na na');
    expect(language).toBeNull();
  });
});
