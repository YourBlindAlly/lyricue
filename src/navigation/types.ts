import type { Song } from '../types';

export type AiSearchMeta = {
  title: string;
  artist: string;
  includeChords: boolean;
  sourceUrl: string | null;
};

export type RootStackParamList = {
  Library: undefined;
  NewSong:
    | { editSong?: Song; prefill?: { title: string; rawText: string }; aiSearchMeta?: AiSearchMeta }
    | undefined;
  Prompt: undefined;
  PedalSettings: undefined;
  VoiceSettings: undefined;
  LanguageVoices: undefined;
  DropboxBrowse: { path: string } | undefined;
  Setlists: undefined;
  SetlistCreator: undefined;
  FindSong: undefined;
  About: undefined;
};
