import { AccessibilityInfo } from 'react-native';
import { writeSongEditToDropbox } from './songWriteBack';
import type { Strings } from '../../i18n';
import type { Song } from '../../types';

/**
 * Sends a song to Dropbox without making anyone wait: an edit of a Dropbox
 * song overwrites its file, and a song with no Dropbox file yet (made here,
 * or imported from the Files app) gets one created in the notebook folder,
 * after which the song points at it. The outcome is spoken by VoiceOver
 * once it is known. `baselineText` is the song's text before this change
 * ('' for a song with no earlier version).
 */
export function saveSongToDropboxInBackground(
  song: Song,
  baselineText: string,
  updateSongInPlace: (song: Song) => Promise<void>,
  strings: Strings
): void {
  writeSongEditToDropbox(song, baselineText)
    .then(async (outcome) => {
      switch (outcome.kind) {
        case 'created':
          await updateSongInPlace({ ...song, source: { type: 'dropbox', path: outcome.path } });
          AccessibilityInfo.announceForAccessibility(strings.inputScreen.dropboxCreated);
          break;
        case 'createFailed':
          AccessibilityInfo.announceForAccessibility(strings.inputScreen.dropboxCreateFailed);
          break;
        case 'saved':
          AccessibilityInfo.announceForAccessibility(strings.inputScreen.dropboxSaved);
          break;
        case 'queued':
          AccessibilityInfo.announceForAccessibility(strings.inputScreen.dropboxQueued);
          break;
        case 'savedAsCopy':
          AccessibilityInfo.announceForAccessibility(strings.inputScreen.dropboxSavedAsCopy(outcome.name));
          break;
        default:
          break;
      }
    })
    .catch(() => {});
}
