// Short language codes this app can detect/match a voice for. Kept as its
// own union (not a free-form string) so a typo in a profile or a directive
// can't silently produce a code nothing else recognizes.
export type SongLanguageCode = 'en' | 'es' | 'pt' | 'fr' | 'it' | 'de' | 'uk';

type LanguageProfile = {
  code: SongLanguageCode;
  // Common, short function words for this language, matched as whole words
  // (case-insensitive) against the song's own text — reliable on a whole
  // song's worth of lyrics, which is always what this runs against, never a
  // single short line.
  words: string[];
  // Characters that appear in this language's normal spelling and not in
  // the others detected here (e.g. Portuguese ã/ç vs Spanish ñ) — a strong,
  // low-noise signal used to break ties between otherwise-similar languages
  // that share many common short words (Spanish and Portuguese especially).
  distinctiveChars?: string[];
};

const PROFILES: LanguageProfile[] = [
  {
    code: 'en',
    words: [
      'the', 'and', 'you', 'that', 'with', 'for', 'this', 'your', 'have', 'from',
      'are', 'was', 'will', 'not', 'but', 'what', 'they', 'she', 'him', 'her',
    ],
  },
  {
    code: 'es',
    words: [
      'que', 'de', 'la', 'el', 'en', 'los', 'las', 'una', 'para', 'con',
      'se', 'más', 'mas', 'pero', 'como', 'su', 'por', 'esta', 'este', 'yo',
      'tú', 'muy', 'porque', 'nosotros', 'está', 'son', 'esto', 'eso', 'mucho', 'todo',
    ],
    distinctiveChars: ['ñ', '¿', '¡'],
  },
  {
    code: 'pt',
    words: [
      'que', 'de', 'não', 'o', 'a', 'do', 'da', 'em', 'um', 'uma',
      'para', 'com', 'se', 'mais', 'mas', 'como', 'seu', 'por', 'você', 'isso',
      'então', 'muito', 'também', 'ele', 'ela', 'eles', 'elas', 'tudo', 'está', 'são',
    ],
    distinctiveChars: ['ã', 'õ', 'ç'],
  },
  {
    code: 'fr',
    words: [
      'le', 'la', 'les', 'de', 'et', 'un', 'une', 'des', 'est', 'pour',
      'que', 'qui', 'pas', 'sur', 'avec', 'vous', 'nous', 'ne', 'mais', 'tout',
    ],
    distinctiveChars: ['œ'],
  },
  {
    code: 'it',
    words: [
      'che', 'di', 'la', 'il', 'un', 'una', 'per', 'con', 'non', 'sono',
      'questo', 'questa', 'come', 'più', 'anche', 'mio', 'tuo', 'suo',
    ],
  },
  {
    code: 'de',
    words: [
      'der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'mit', 'für',
      'auf', 'sie', 'ich', 'du', 'wir', 'aber', 'wie', 'was', 'zu',
    ],
    distinctiveChars: ['ß'],
  },
  {
    code: 'uk',
    words: ['і', 'та', 'це', 'не', 'ти', 'я', 'він', 'вона', 'що', 'як', 'на', 'до'],
    distinctiveChars: ['і', 'ї', 'є', 'ґ'],
  },
];

// A stop-word hit is one point; a distinctive character is worth more since
// it's a much lower-noise signal (it either belongs to that language's
// normal spelling or it doesn't) — mainly what separates Spanish from
// Portuguese when both score similarly on shared common words.
const DISTINCTIVE_CHAR_WEIGHT = 2;
const MIN_CONFIDENT_SCORE = 3;

function scoreProfile(words: Set<string>, text: string, profile: LanguageProfile): number {
  let score = 0;
  for (const word of profile.words) {
    if (words.has(word)) score += 1;
  }
  if (profile.distinctiveChars) {
    for (const ch of profile.distinctiveChars) {
      if (text.includes(ch)) score += DISTINCTIVE_CHAR_WEIGHT;
    }
  }
  return score;
}

/**
 * Guesses a song's language from its lyric lines, so a matching TTS voice
 * can be picked automatically instead of always using the single globally
 * selected voice. Deliberately a simple stop-word/distinctive-character
 * heuristic rather than a statistical model or a third-party dependency —
 * no bundle-size or bundler-compatibility risk, fully unit-testable, and
 * accurate enough run against a whole song's text (never a single short
 * line, where a heuristic like this would be far less reliable).
 *
 * Returns null whenever no language scores confidently (or two are tied) —
 * that's a deliberate "don't guess" fallback, same as the fail-open pattern
 * used elsewhere in this app (see voiceFiltering.ts): the caller falls back
 * to the user's own globally selected voice, which is always a safe result,
 * never nothing at all.
 */
export function detectSongLanguage(lines: string[]): SongLanguageCode | null {
  const text = lines.join(' ').toLowerCase();
  const words = new Set(text.match(/[\p{L}]+/gu) ?? []);
  if (words.size === 0) return null;

  let bestCode: SongLanguageCode | null = null;
  let bestScore = 0;
  let secondBestScore = 0;
  for (const profile of PROFILES) {
    const score = scoreProfile(words, text, profile);
    if (score > bestScore) {
      secondBestScore = bestScore;
      bestScore = score;
      bestCode = profile.code;
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
  }

  if (bestCode === null || bestScore < MIN_CONFIDENT_SCORE) return null;
  if (bestScore === secondBestScore) return null; // genuine tie — don't guess
  return bestCode;
}
