import {
  filterVoicesByLanguages,
  filterVoicesByQuality,
  filterWithFailOpen,
  preferredLanguageCodes,
} from './voiceFiltering';

describe('preferredLanguageCodes', () => {
  it('always includes English even if the device reports something else first', () => {
    expect(preferredLanguageCodes([{ languageCode: 'es' }])).toEqual(['en', 'es']);
  });

  it('does not duplicate English when the device is English', () => {
    expect(preferredLanguageCodes([{ languageCode: 'en' }])).toEqual(['en']);
  });

  it('includes a second configured language alongside English', () => {
    expect(preferredLanguageCodes([{ languageCode: 'en' }, { languageCode: 'es' }])).toEqual(['en', 'es']);
  });

  it('is case-insensitive', () => {
    expect(preferredLanguageCodes([{ languageCode: 'ES' }])).toEqual(['en', 'es']);
  });

  it('falls back to just English when given no locales', () => {
    expect(preferredLanguageCodes([])).toEqual(['en']);
  });

  it('ignores a null languageCode entry', () => {
    expect(preferredLanguageCodes([{ languageCode: null }])).toEqual(['en']);
  });
});

describe('filterVoicesByLanguages', () => {
  const voices = [
    { id: '1', language: 'en-US' },
    { id: '2', language: 'es-MX' },
    { id: '3', language: 'fr-FR' },
    { id: '4', language: 'en-GB' },
  ];

  it('keeps only voices matching the preferred codes, across regions', () => {
    const result = filterVoicesByLanguages(voices, ['en']);
    expect(result.map((v) => v.id)).toEqual(['1', '4']);
  });

  it('keeps voices for multiple preferred languages', () => {
    const result = filterVoicesByLanguages(voices, ['en', 'es']);
    expect(result.map((v) => v.id)).toEqual(['1', '2', '4']);
  });

  it('returns an empty list when nothing matches — the floor lives in filterWithFailOpen, not here', () => {
    expect(filterVoicesByLanguages(voices, ['de'])).toEqual([]);
  });
});

describe('filterVoicesByQuality', () => {
  const voices = [
    { id: '1', quality: 'Enhanced' },
    { id: '2', quality: 'Default' },
    { id: '3', quality: 'Enhanced' },
    { id: '4', quality: 'Default' },
  ];

  it('keeps only non-Default-quality voices by default', () => {
    expect(filterVoicesByQuality(voices, false).map((v) => v.id)).toEqual(['1', '3']);
  });

  // Apple's AVSpeechSynthesisVoiceQuality has three tiers (Default,
  // Enhanced, Premium) — Premium is newer and *higher* quality than
  // Enhanced, not lower, so it must never be treated as "low quality" and
  // hidden.
  it('keeps Premium-quality voices by default, alongside Enhanced', () => {
    const withPremium = [
      { id: '1', quality: 'Enhanced' },
      { id: '2', quality: 'Premium' },
      { id: '3', quality: 'Default' },
    ];
    expect(filterVoicesByQuality(withPremium, false).map((v) => v.id)).toEqual(['1', '2']);
  });

  it('keeps every voice when includeLowQuality is true', () => {
    expect(filterVoicesByQuality(voices, true)).toEqual(voices);
  });

  it('returns an empty list when nothing is above Default quality — the floor lives in filterWithFailOpen, not here', () => {
    const allDefault = [{ id: '1', quality: 'Default' }];
    expect(filterVoicesByQuality(allDefault, false)).toEqual([]);
  });
});

describe('filterWithFailOpen', () => {
  it('returns the filtered result when it is non-empty', () => {
    const voices = [1, 2, 3];
    const result = filterWithFailOpen(voices, (vs) => vs.filter((v) => v > 1));
    expect(result).toEqual([2, 3]);
  });

  it('falls back to the original input when the filter would empty it out', () => {
    const voices = [1, 2, 3];
    const result = filterWithFailOpen(voices, (vs) => vs.filter((v) => v > 10));
    expect(result).toEqual(voices);
  });

  it('does not fabricate voices when the input itself is empty', () => {
    const result = filterWithFailOpen([] as number[], (vs) => vs.filter((v) => v > 0));
    expect(result).toEqual([]);
  });

  // Regression coverage for the exact 2026-09-05 bug shape: chaining a
  // language filter into a quality filter, where either stage alone could
  // plausibly zero out a real, non-empty voice list.
  describe('chained language + quality filtering, mirroring the real screen', () => {
    const select = (voices: { language: string; quality: string }[], codes: string[], includeLowQuality: boolean) => {
      const byLanguage = filterWithFailOpen(voices, (vs) => filterVoicesByLanguages(vs, codes));
      return filterWithFailOpen(byLanguage, (vs) => filterVoicesByQuality(vs, includeLowQuality));
    };

    it('filters normally when some voices match both stages', () => {
      const voices = [
        { language: 'en-US', quality: 'Enhanced' },
        { language: 'en-US', quality: 'Default' },
        { language: 'fr-FR', quality: 'Enhanced' },
      ];
      expect(select(voices, ['en'], false)).toEqual([{ language: 'en-US', quality: 'Enhanced' }]);
    });

    it('falls open at the language stage when no voice matches the device languages', () => {
      // Simulates "only German voices installed" — the language filter
      // would otherwise reduce this to nothing.
      const voices = [
        { language: 'de-DE', quality: 'Enhanced' },
        { language: 'de-DE', quality: 'Default' },
      ];
      // Language stage falls open (keeps both), quality stage still applies on top.
      expect(select(voices, ['en'], false)).toEqual([{ language: 'de-DE', quality: 'Enhanced' }]);
    });

    it('falls open at the quality stage when nothing is above Default quality', () => {
      const voices = [
        { language: 'en-US', quality: 'Default' },
        { language: 'en-US', quality: 'Default' },
      ];
      expect(select(voices, ['en'], false)).toEqual(voices);
    });

    it('never returns empty when both stages would otherwise zero out a non-empty list', () => {
      const voices = [{ language: 'fr-FR', quality: 'Default' }];
      expect(select(voices, ['en'], false)).toEqual(voices);
    });

    it('returns empty only when there were no voices to begin with', () => {
      expect(select([], ['en'], false)).toEqual([]);
    });
  });
});
