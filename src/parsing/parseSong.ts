import type { SectionMarker } from '../types';
import type { ChordedWord } from './chordedWord';
import { tokenizePlainLine } from './chordedWord';
import { isJunkLine } from './junkLineFilter';
import { matchLanguageDirective } from './languageDirective';
import type { SongLanguageCode } from '../speech/languageDetection';

const BARE_DIVIDER = /^--+$/;
const LABELED_DASH = /^--+\s*(.+?)\s*--*$/;
const BRACKETED = /^\[(.+)\]$/;

function sectionLabelFor(trimmed: string): string | null {
  if (BARE_DIVIDER.test(trimmed)) {
    return '';
  }
  const bracketed = trimmed.match(BRACKETED);
  if (bracketed) {
    return bracketed[1].trim();
  }
  const dashed = trimmed.match(LABELED_DASH);
  if (dashed) {
    return dashed[1].trim();
  }
  return null;
}

export type ParsedSong = {
  lines: string[];
  chordedLines: ChordedWord[][];
  sections: SectionMarker[];
  /**
   * A manual {lang: ...} override, or null if the song's text doesn't have
   * one. Deliberately NOT auto-detected here anymore — which detection
   * engine (or none) runs is a runtime choice (see Voice Settings'
   * "Language detection" toggle and resolveSongLanguage.ts), not something
   * baked into parsing/storage, so switching engines takes effect on
   * already-saved songs too without needing to re-parse them.
   */
  language: SongLanguageCode | null;
};

/**
 * Splits raw pasted/imported text into spoken lines, pulling out section-marker
 * lines ("--", "-- Chorus --", "[Chorus]") into a separate section index instead
 * of speaking them, and a `{lang: ...}` directive line (ChordPro-style, works
 * here too since plain-text songs never use curly braces for anything else)
 * into a manual language override. Blank lines are treated as formatting
 * only and dropped.
 */
export function parseSong(rawText: string): ParsedSong {
  const lines: string[] = [];
  const chordedLines: ChordedWord[][] = [];
  const sections: SectionMarker[] = [];
  let manualLanguage: SongLanguageCode | null = null;

  for (const rawLine of rawText.split(/\r\n|\r|\n/)) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0 || isJunkLine(trimmed)) {
      continue;
    }

    const languageDirective = matchLanguageDirective(trimmed);
    if (languageDirective) {
      manualLanguage = languageDirective;
      continue;
    }

    const label = sectionLabelFor(trimmed);
    if (label !== null) {
      sections.push({ lineIndex: lines.length, label });
      continue;
    }

    lines.push(trimmed);
    chordedLines.push(tokenizePlainLine(trimmed));
  }

  return { lines, chordedLines, sections, language: manualLanguage };
}
