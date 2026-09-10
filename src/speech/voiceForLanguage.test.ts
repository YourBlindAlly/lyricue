import type { Voice } from 'expo-speech';
import { pickVoiceForLanguage } from './voiceForLanguage';

function voice(overrides: Partial<Voice>): Voice {
  return {
    identifier: 'id',
    name: 'Name',
    language: 'en-US',
    quality: 'Default' as Voice['quality'],
    ...overrides,
  } as Voice;
}

describe('pickVoiceForLanguage', () => {
  it('matches a voice whose language starts with the given code', () => {
    const voices = [voice({ identifier: 'a', language: 'en-US' }), voice({ identifier: 'b', language: 'es-ES' })];
    expect(pickVoiceForLanguage(voices, 'es')?.identifier).toBe('b');
  });

  it('matches case-insensitively', () => {
    const voices = [voice({ identifier: 'a', language: 'PT-BR' })];
    expect(pickVoiceForLanguage(voices, 'pt')?.identifier).toBe('a');
  });

  it('prefers a non-Default quality voice over a Default one', () => {
    const voices = [
      voice({ identifier: 'default', language: 'es-ES', quality: 'Default' as Voice['quality'] }),
      voice({ identifier: 'enhanced', language: 'es-MX', quality: 'Enhanced' as Voice['quality'] }),
    ];
    expect(pickVoiceForLanguage(voices, 'es')?.identifier).toBe('enhanced');
  });

  it('falls back to a Default-quality voice when nothing better is installed', () => {
    const voices = [voice({ identifier: 'only', language: 'es-ES', quality: 'Default' as Voice['quality'] })];
    expect(pickVoiceForLanguage(voices, 'es')?.identifier).toBe('only');
  });

  it('returns null when nothing installed matches the language', () => {
    const voices = [voice({ identifier: 'a', language: 'en-US' })];
    expect(pickVoiceForLanguage(voices, 'es')).toBeNull();
  });

  it('returns null for an empty voice list', () => {
    expect(pickVoiceForLanguage([], 'es')).toBeNull();
  });

  it('picks alphabetically first by name when multiple equally-qualified matches exist', () => {
    const voices = [
      voice({ identifier: 'z', name: 'Zoe', language: 'es-ES' }),
      voice({ identifier: 'a', name: 'Ana', language: 'es-MX' }),
    ];
    expect(pickVoiceForLanguage(voices, 'es')?.identifier).toBe('a');
  });
});
