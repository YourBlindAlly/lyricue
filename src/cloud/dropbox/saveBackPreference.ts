import AsyncStorage from '@react-native-async-storage/async-storage';

const SAVE_BACK_KEY = 'lyricue.saveBackToDropbox';

/**
 * Whether song edits and newly created songs are sent to Dropbox. On by
 * default: only an explicit stored 'false' turns it off.
 */
export async function loadSaveBackToDropbox(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SAVE_BACK_KEY)) !== 'false';
  } catch {
    return true;
  }
}

export async function saveSaveBackToDropbox(value: boolean): Promise<void> {
  await AsyncStorage.setItem(SAVE_BACK_KEY, String(value));
}
