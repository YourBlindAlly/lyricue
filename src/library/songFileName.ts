import { hasChordBrackets, mergeChordOnlyLines } from '../parsing/mergeChordOnlyLines';

/** A title made safe to use as a file name: no characters that Dropbox or Files reject, never empty. */
export function safeFileStem(title: string): string {
  const cleaned = title
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'Untitled';
}

/**
 * The file name a song made inside LyriCue is saved under: its title, with
 * a ChordPro ending when the text has real chords and a plain .txt
 * otherwise. LyriCue decides ChordPro-vs-plain from the content itself, so
 * either name reads back correctly.
 */
export function songFileName(title: string, rawText: string): string {
  const ext = hasChordBrackets(mergeChordOnlyLines(rawText)) ? '.cho' : '.txt';
  return `${safeFileStem(title)}${ext}`;
}
