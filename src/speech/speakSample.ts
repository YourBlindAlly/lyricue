import * as Speech from 'expo-speech';
import { shouldUsePannedAudio, speakPanned, stopPannedSpeech } from '../audio/pannedAudio';

/**
 * Speaks one short sample (a voice preview, or the confirmation after
 * changing the pan) honoring the current pan. Returns 'fallback' when a pan is
 * set but this voice couldn't be played panned, so the sample came out
 * centered instead — the caller can tell the user, since that's exactly what
 * they would want to know before a performance.
 */
export async function speakSample(options: {
  text: string;
  voice?: string | null;
  rate: number;
  volume: number;
}): Promise<'ok' | 'fallback'> {
  await Speech.stop();
  stopPannedSpeech();

  let fellBack = false;
  if (shouldUsePannedAudio()) {
    try {
      const spoken = speakPanned({
        text: options.text,
        voice: options.voice ?? null,
        rate: options.rate,
        pitch: 1,
        volume: options.volume,
      });
      // Handled separately so a rejection that lands after the race below
      // has already settled can't surface as an unhandled rejection.
      spoken.catch(() => {});
      // A voice that can't be panned rejects within about 3 seconds (the
      // native side's own no-audio timeout), so wait slightly longer than
      // that before deciding the sample played fine.
      await Promise.race([
        spoken,
        new Promise<'started'>((resolve) => setTimeout(() => resolve('started'), 4000)),
      ]);
      return 'ok';
    } catch {
      fellBack = true;
    }
  }

  Speech.speak(options.text, {
    voice: options.voice ?? undefined,
    rate: options.rate,
    volume: options.volume,
  });
  return fellBack ? 'fallback' : 'ok';
}
