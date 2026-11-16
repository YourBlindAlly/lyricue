import { NativeModule, requireNativeModule } from 'expo';

declare class LyricuePannedAudioModule extends NativeModule {
  /** -1 = hard left, 0 = center, 1 = hard right. Any non-zero value brings the audio engine up; zero lets it go idle. */
  setPan(pan: number): Promise<void>;
  /** Decodes a bundled sound file (a file:// URI) into memory so playEffect can play it with no delay. */
  loadEffect(name: string, uri: string): Promise<void>;
  playEffect(name: string): Promise<void>;
  /**
   * Speaks one piece of text through the panned audio engine. Resolves
   * 'done' when it finishes or 'stopped' when stopSpeech cut it off; rejects
   * if the voice can't be played this way (the caller then falls back to
   * normal, centered speech).
   */
  speak(
    text: string,
    voiceIdentifier: string | null,
    rate: number,
    pitch: number,
    volume: number
  ): Promise<'done' | 'stopped'>;
  stopSpeech(): Promise<void>;
}

export default requireNativeModule<LyricuePannedAudioModule>('LyricuePannedAudio');
