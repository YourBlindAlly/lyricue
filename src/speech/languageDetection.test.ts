import { detectSongLanguage } from './languageDetection';

describe('detectSongLanguage', () => {
  it('detects English lyrics', () => {
    const lines = [
      'The way you love me is all that I need',
      'And when you hold my hand I know that this is real',
      'But you and I were made for this, my dear, from the very start',
    ];
    expect(detectSongLanguage(lines)).toBe('en');
  });

  it('detects Spanish lyrics', () => {
    const lines = [
      'Que bonita es la vida cuando estoy contigo',
      'Y como me gusta bailar con esta cancion',
      'Porque tu eres todo lo que yo necesito, mi amor',
    ];
    expect(detectSongLanguage(lines)).toBe('es');
  });

  it('detects Portuguese lyrics, distinguishing them from Spanish', () => {
    const lines = [
      'Você não sabe o quanto eu te amo, então escuta essa canção',
      'Ele e ela sempre estão juntos, e isso não é segredo pra ninguém',
      'Muito obrigado por tudo, meu coração é seu também',
    ];
    expect(detectSongLanguage(lines)).toBe('pt');
  });

  it('detects French lyrics', () => {
    const lines = [
      'Je vous aime et je ne sais pas pourquoi',
      'Mais vous et nous, nous sommes tout pour la vie',
      'Avec vous je vois que tout est possible',
    ];
    expect(detectSongLanguage(lines)).toBe('fr');
  });

  it('detects German lyrics', () => {
    const lines = [
      'Ich liebe dich und das ist nicht nur ein Wort',
      'Du und ich, wir sind für immer wie ein Team',
      'Aber die Zeit ist nicht auf unserer Seite',
    ];
    expect(detectSongLanguage(lines)).toBe('de');
  });

  it('returns null for an empty song', () => {
    expect(detectSongLanguage([])).toBeNull();
  });

  it('returns null when there is not enough signal to be confident', () => {
    expect(detectSongLanguage(['La la la', 'Na na na'])).toBeNull();
  });
});
