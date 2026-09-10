import { useCallback, useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';
import { loadVoicePreference } from './voicePreference';
import { DEFAULT_VOICE_RATE, loadVoiceRate, type VoiceRate } from './voiceRatePreference';
import { DEFAULT_VOICE_VOLUME, loadVoiceVolume, type VoiceVolume } from './voiceVolumePreference';
import { pickVoiceForLanguage } from './voiceForLanguage';
import type { SpeechSegment } from '../parsing/wrapLines';

export function useSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const mounted = useRef(true);
  const voiceIdRef = useRef<string | null>(null);
  const rateRef = useRef<VoiceRate>(DEFAULT_VOICE_RATE);
  const volumeRef = useRef<VoiceVolume>(DEFAULT_VOICE_VOLUME);
  // Every installed voice, loaded once and used only to auto-pick a
  // per-song voice match (see speakSegments' languageCode option) — never
  // overwrites the user's own globally selected voice (voiceIdRef above),
  // just supersedes it for the one call that's speaking a song whose
  // detected/tagged language differs from the user's default voice.
  const voicesRef = useRef<Speech.Voice[]>([]);
  // Every speakNow() call claims the next id and checks it's still current
  // right before actually speaking — if a newer call came in while this one
  // was awaiting Speech.stop(), this one was superseded and silently backs
  // off instead of racing it. Without this, two speakNow calls issued close
  // together (e.g. a stale line from a pedal press, immediately followed by
  // "Next song" once a double-press is recognized) can both end up audible,
  // in submission order, since each call's own internal stop()+speak() has
  // no way to know a newer one is already in flight (Rusty's report,
  // 2026-08-31 — reading the stale line before "Next song" before "No more
  // songs in this setlist", none of them properly cut off).
  const requestIdRef = useRef(0);

  useEffect(() => {
    mounted.current = true;
    loadVoicePreference().then((id) => {
      voiceIdRef.current = id;
    });
    loadVoiceRate().then((rate) => {
      rateRef.current = rate;
    });
    loadVoiceVolume().then((volume) => {
      volumeRef.current = volume;
    });
    Speech.getAvailableVoicesAsync().then((voices) => {
      voicesRef.current = voices;
    });
    return () => {
      mounted.current = false;
      Speech.stop();
    };
  }, []);

  /**
   * Re-reads the voice and rate preferences from storage. Needed because a
   * screen doesn't remount when you navigate back to it (React Navigation
   * keeps the existing instance), so a voice or rate picked in Settings
   * would otherwise never reach an already-mounted prompter screen's speech
   * hook.
   */
  const refreshVoicePreference = useCallback(async () => {
    voiceIdRef.current = await loadVoicePreference();
    rateRef.current = await loadVoiceRate();
    volumeRef.current = await loadVoiceVolume();
  }, []);

  /**
   * Stops whatever is currently being spoken (if anything) and immediately
   * starts speaking `text` — this is the "cut off and jump" behavior the
   * pedal's forward press needs, not a queued/sequential speak.
   *
   * Speech.stop() is asynchronous even though it looks like a fire-and-forget
   * call. Calling speak() right after it without awaiting let the old
   * utterance's stop and the new utterance's start land out of order, which
   * could cut the new line off partway through shortly after it started —
   * found via real on-device testing where lines were "fading away" before
   * finishing.
   */
  /**
   * Speaks a sequence of segments back to back, each at its own pitch —
   * the underlying mechanism for both speakNow (a single plain-pitch
   * segment) and the higher-pitch-for-chords feature (a chord-name segment
   * at a raised pitch, then a normal-pitch segment for the words after it).
   * expo-speech applies one pitch per speak() call, so a mid-utterance
   * pitch change means chaining separate speak() calls via onDone rather
   * than one call for the whole line.
   *
   * Shares speakNow's stop-then-await, request-id-guarded start so a newer
   * call (of either function) still cleanly supersedes an older one even
   * mid-sequence — each step re-checks the request id before speaking,
   * exactly like the single-segment case did.
   */
  const speakSegments = useCallback((segments: SpeechSegment[], options?: { languageCode?: string | null }) => {
    const requestId = ++requestIdRef.current;
    // A song-specific language (manual {lang:} tag or auto-detected) picks
    // a matching installed voice for just this call, without touching the
    // user's own globally selected voice — falls back to that global voice
    // unchanged whenever no language is given, or nothing installed
    // matches it (e.g. the language's voice was never downloaded).
    //
    // Real bug found live 2026-09-11: this used to run pickVoiceForLanguage
    // unconditionally whenever ANY language was detected, including English
    // — which meant an ordinary English song (the heuristic engine detects
    // English confidently for most real songs) silently swapped Rusty's own
    // chosen voice for whichever English voice pickVoiceForLanguage's own
    // alphabetical/quality selection happened to land on, not the voice he
    // actually picked in Voice Settings. Fix: first check whether the
    // user's already-selected voice already speaks the detected language —
    // if so, just keep using it, no override needed at all. Only reach for
    // pickVoiceForLanguage when the current voice doesn't match (a real
    // cross-language song) or nothing specific is selected (System default).
    let voiceIdForThisCall = voiceIdRef.current;
    if (options?.languageCode) {
      const currentVoice = voiceIdRef.current
        ? voicesRef.current.find((v) => v.identifier === voiceIdRef.current)
        : undefined;
      const currentVoiceAlreadyMatches =
        !!currentVoice && currentVoice.language.toLowerCase().startsWith(options.languageCode.toLowerCase());
      if (!currentVoiceAlreadyMatches) {
        const languageVoice = pickVoiceForLanguage(voicesRef.current, options.languageCode);
        if (languageVoice) voiceIdForThisCall = languageVoice.identifier;
      }
    }

    const speakFrom = (index: number) => {
      if (!mounted.current || requestIdRef.current !== requestId) return;
      if (index >= segments.length) {
        setIsSpeaking(false);
        return;
      }
      const segment = segments[index];
      const isLast = index === segments.length - 1;
      Speech.speak(segment.text, {
        voice: voiceIdForThisCall ?? undefined,
        rate: rateRef.current,
        volume: volumeRef.current,
        pitch: segment.pitch ?? 1.0,
        // Gives AVSpeechSynthesizer its own audio session instead of sharing
        // the app-wide one that the tick/end-of-song sound effects (expo-audio)
        // also touch — fixed lines "fading" partway through, which turned out
        // to be same-process session hand-off between the two playback
        // engines, not the stop()/speak() ordering above.
        useApplicationAudioSession: false,
        onDone: () => {
          if (isLast) {
            if (mounted.current) setIsSpeaking(false);
          } else {
            speakFrom(index + 1);
          }
        },
        onStopped: () => {
          if (mounted.current) setIsSpeaking(false);
        },
        onError: () => {
          if (mounted.current) setIsSpeaking(false);
        },
      });
    };

    (async () => {
      await Speech.stop();
      if (!mounted.current) return;
      if (requestIdRef.current !== requestId) return; // superseded by a newer call — don't speak stale content
      setIsSpeaking(true);
      speakFrom(0);
    })();
  }, []);

  const speakNow = useCallback(
    (text: string) => {
      speakSegments([{ text }]);
    },
    [speakSegments]
  );

  const stopImmediate = useCallback(() => {
    requestIdRef.current++; // invalidates any speakNow() still awaiting Speech.stop() from before this call
    Speech.stop();
    setIsSpeaking(false);
  }, []);

  return { isSpeaking, speakNow, speakSegments, stopImmediate, refreshVoicePreference };
}
