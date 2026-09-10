jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import {
  loadLanguageVoiceMap,
  saveLanguageVoiceMap,
  setLanguageVoice,
  removeLanguageVoice,
  voiceForLanguageCode,
} from './languageVoicePreference';

describe('languageVoicePreference', () => {
  it('defaults to an empty map when nothing has been saved', async () => {
    expect(await loadLanguageVoiceMap()).toEqual({});
  });

  it('round-trips a saved map', async () => {
    await saveLanguageVoiceMap({ es: 'voice-a', pt: 'voice-b' });
    expect(await loadLanguageVoiceMap()).toEqual({ es: 'voice-a', pt: 'voice-b' });
  });

  it('setLanguageVoice adds/updates one entry without disturbing others', async () => {
    await saveLanguageVoiceMap({ es: 'voice-a' });
    const updated = await setLanguageVoice('pt', 'voice-b');
    expect(updated).toEqual({ es: 'voice-a', pt: 'voice-b' });
    expect(await loadLanguageVoiceMap()).toEqual({ es: 'voice-a', pt: 'voice-b' });
  });

  it('setLanguageVoice overwrites an existing entry for the same language', async () => {
    await saveLanguageVoiceMap({ es: 'voice-a' });
    const updated = await setLanguageVoice('es', 'voice-new');
    expect(updated).toEqual({ es: 'voice-new' });
  });

  it('removeLanguageVoice deletes one entry without disturbing others', async () => {
    await saveLanguageVoiceMap({ es: 'voice-a', pt: 'voice-b' });
    const updated = await removeLanguageVoice('es');
    expect(updated).toEqual({ pt: 'voice-b' });
    expect(await loadLanguageVoiceMap()).toEqual({ pt: 'voice-b' });
  });

  it('handles removing a language that has no entry', async () => {
    await saveLanguageVoiceMap({ es: 'voice-a' });
    const updated = await removeLanguageVoice('fr');
    expect(updated).toEqual({ es: 'voice-a' });
  });
});

describe('voiceForLanguageCode', () => {
  it('finds an exact 2-letter code', () => {
    expect(voiceForLanguageCode({ es: 'voice-a' }, 'es')).toBe('voice-a');
  });

  it('matches a regional code against its 2-letter prefix', () => {
    expect(voiceForLanguageCode({ pt: 'voice-b' }, 'pt-BR')).toBe('voice-b');
  });

  it('is case-insensitive', () => {
    expect(voiceForLanguageCode({ pt: 'voice-b' }, 'PT-pt')).toBe('voice-b');
  });

  it('returns null when there is no entry for that language', () => {
    expect(voiceForLanguageCode({ es: 'voice-a' }, 'fr')).toBeNull();
  });
});
