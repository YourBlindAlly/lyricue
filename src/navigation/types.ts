import type { Song } from '../types';

export type RootStackParamList = {
  Library: undefined;
  NewSong: { editSong?: Song } | undefined;
  Prompt: undefined;
  PedalSettings: undefined;
  VoiceSettings: undefined;
  LanguageVoices: undefined;
  DropboxBrowse: { path: string } | undefined;
  Setlists: undefined;
  SetlistCreator: { editSetlist?: { id: string; name: string } } | undefined;
  ImportSetlist: undefined;
  Search: undefined;
  About: undefined;
};
