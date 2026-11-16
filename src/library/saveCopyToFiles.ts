import { Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { songFileName } from './songFileName';

/**
 * Hands a copy of a song's text to the iOS share sheet, where "Save to
 * Files" lets the person pick any folder (iCloud Drive, On My iPhone,
 * another cloud). The copy is written under the song's title first, so the
 * file lands in Files with a sensible name. Uses the text exactly as given,
 * so unsaved changes on the edit screen are included.
 */
export async function saveCopyToFiles(title: string, rawText: string): Promise<void> {
  const file = new File(Paths.cache, songFileName(title, rawText));
  file.create({ overwrite: true });
  file.write(rawText);
  await Share.share({ url: file.uri });
}
