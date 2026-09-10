import { resolveSongLanguage } from './resolveSongLanguage';

describe('resolveSongLanguage', () => {
  it('always uses a manual override, regardless of engine', async () => {
    const song = { language: 'es', lines: ['whatever text is here'] };
    const detectApple = jest.fn().mockResolvedValue('fr');
    expect(await resolveSongLanguage(song, 'apple', detectApple)).toBe('es');
    expect(await resolveSongLanguage(song, 'heuristic', detectApple)).toBe('es');
    expect(detectApple).not.toHaveBeenCalled();
  });

  it('runs the heuristic engine when selected and no override is present', async () => {
    const song = {
      language: null,
      lines: [
        'Que bonita es la vida cuando estoy contigo',
        'Y como me gusta bailar con esta cancion',
        'Porque tu eres todo lo que yo necesito, mi amor',
      ],
    };
    const detectApple = jest.fn().mockResolvedValue('fr');
    expect(await resolveSongLanguage(song, 'heuristic', detectApple)).toBe('es');
    expect(detectApple).not.toHaveBeenCalled();
  });

  it('runs the Apple engine when selected and no override is present', async () => {
    const song = { language: null, lines: ['some lyric line'] };
    const detectApple = jest.fn().mockResolvedValue('pt-BR');
    expect(await resolveSongLanguage(song, 'apple', detectApple)).toBe('pt-BR');
    expect(detectApple).toHaveBeenCalledWith('some lyric line');
  });

  it('returns null when the heuristic finds no confident match', async () => {
    const song = { language: null, lines: ['La la la', 'Na na na'] };
    const detectApple = jest.fn();
    expect(await resolveSongLanguage(song, 'heuristic', detectApple)).toBeNull();
  });

  it('returns null when the Apple engine reports nothing', async () => {
    const song = { language: null, lines: ['some lyric line'] };
    const detectApple = jest.fn().mockResolvedValue(null);
    expect(await resolveSongLanguage(song, 'apple', detectApple)).toBeNull();
  });

  it('treats a missing language field the same as null', async () => {
    const song = { lines: ['some lyric line'] };
    const detectApple = jest.fn().mockResolvedValue('de');
    expect(await resolveSongLanguage(song, 'apple', detectApple)).toBe('de');
  });
});
