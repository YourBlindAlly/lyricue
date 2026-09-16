import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { buildSongFromFile } from '../parsing/buildSong';
import { extractDocxText } from '../parsing/extractDocxText';
import type { Song } from '../types';

function isDocx(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.docx');
}

/** Opens the system file picker and returns a parsed Song, or null if cancelled/empty. */
export async function pickAndImportLocalFile(): Promise<Song | null> {
  // '*/*' rather than a specific MIME type — ChordPro's extensions (.cho,
  // .crd, .chopro, .chord, .pro) generally have no OS-registered type on
  // iOS, so filtering by MIME type would silently hide them from the picker.
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
  if (result.canceled || !result.assets[0]) {
    return null;
  }
  const asset = result.assets[0];
  const file = new File(asset.uri);
  // A .docx is a zip archive, not plain text — reading its raw bytes and
  // pulling the text back out of word/document.xml, rather than decoding it
  // as UTF-8 like every other supported file, is what fixes the import
  // error a Word file produced before this existed.
  const text = isDocx(asset.name) ? await extractDocxText(await file.arrayBuffer()) : await file.text();
  return buildSongFromFile(text, asset.name, { type: 'file' });
}
