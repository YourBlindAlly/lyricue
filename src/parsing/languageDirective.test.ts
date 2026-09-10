import { matchLanguageDirective, normalizeLanguageName } from './languageDirective';

describe('normalizeLanguageName', () => {
  it('recognizes an English name', () => {
    expect(normalizeLanguageName('Spanish')).toBe('es');
  });

  it('recognizes a short code', () => {
    expect(normalizeLanguageName('pt')).toBe('pt');
  });

  it('recognizes the language written in its own name', () => {
    expect(normalizeLanguageName('Português')).toBe('pt');
  });

  it('is case-insensitive', () => {
    expect(normalizeLanguageName('FRENCH')).toBe('fr');
  });

  it('returns null for an unrecognized name', () => {
    expect(normalizeLanguageName('Klingon')).toBeNull();
  });
});

describe('matchLanguageDirective', () => {
  it('matches {lang: Name}', () => {
    expect(matchLanguageDirective('{lang: Spanish}')).toBe('es');
  });

  it('matches {language: code}', () => {
    expect(matchLanguageDirective('{language: pt}')).toBe('pt');
  });

  it('is case-insensitive on the directive name', () => {
    expect(matchLanguageDirective('{LANG: German}')).toBe('de');
  });

  it('tolerates extra spacing', () => {
    expect(matchLanguageDirective('{  lang  :   Italian  }')).toBe('it');
  });

  it('returns null for a plain lyric line', () => {
    expect(matchLanguageDirective('Just a regular lyric line')).toBeNull();
  });

  it('returns null for a different directive', () => {
    expect(matchLanguageDirective('{key: G}')).toBeNull();
  });

  it('returns null for an unrecognized language name inside a valid directive', () => {
    expect(matchLanguageDirective('{lang: Klingon}')).toBeNull();
  });
});
