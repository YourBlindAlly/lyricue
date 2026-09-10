import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useKeepAwake } from 'expo-keep-awake';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { useAppState } from '../state/AppStateContext';
import { useSpeech } from '../speech/useSpeech';
import { useAudioInterruptionResume } from '../speech/useAudioInterruptionResume';
import { loadReduceVoiceOverChatter } from '../speech/voiceOverPreference';
import { hintOrNone } from '../speech/reduceHintsPreference';
import {
  DEFAULT_LINE_LENGTH_PRESET,
  LINE_LENGTH_PRESET_LABEL,
  loadLineLengthPreset,
  nextLineLengthPreset,
  previousLineLengthPreset,
  saveLineLengthPreset,
  wrapOptionsForPreset,
  type LineLengthPreset,
} from '../parsing/lineLengthPreference';
import { loadIncludeChords, saveIncludeChords } from '../parsing/chordsPreference';
import { loadBreakAtChords, saveBreakAtChords } from '../parsing/chordLineBreaksPreference';
import { loadHigherPitchForChords, saveHigherPitchForChords } from '../speech/chordPitchPreference';
import { loadRepeatFeatureEnabled } from '../pedal/repeatFeaturePreference';
import { buildSongAnnouncement } from '../speech/songAnnouncement';
import { wrapChordedSongLines, type LineWrapResult, type SpeechSegment } from '../parsing/wrapLines';
import { playAdvanceFeedback, playEndOfSongFeedback, playSongChangeFeedback } from '../feedback/feedback';
import { RepeatController } from '../prompt/repeatController';
import { usePedalInput } from '../pedal/usePedalInput';
import { ROW_LINK_HIT_SLOP } from '../ui/hitSlop';
import { useStrings } from '../i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'Prompt'>;

// accessibilityTraits isn't in React Native's public TypeScript ViewProps,
// but this is a real, native-supported trait string (see
// accessibilityPropsConversions.h): "startsMedia" maps to
// UIAccessibilityTraitStartsMediaSession (tells VoiceOver an audio session is
// active so it backs off its own ambient speech without disabling touch).
// (allowsDirectInteraction was tried for swipe gestures on the touch strip,
// but on-device testing showed VoiceOver still claims one-finger swipes for
// its own navigation regardless of that trait — the strip uses plain
// tap-to-activate buttons now instead, which is VoiceOver's standard,
// reliable interaction model.)
function accessibilityTraitsProp(traits: string[]) {
  return { accessibilityTraits: traits } as unknown as { accessibilityTraits: never };
}

export function PromptScreen({ navigation }: Props) {
  const strings = useStrings();
  // suppressDeactivateWarnings avoids a benign unhandled-rejection when the
  // screen unmounts before the (async, web-only) Wake Lock activation settles.
  useKeepAwake(undefined, { suppressDeactivateWarnings: true });
  const { activeSong: song, activeSetlist, advanceSetlist, reduceHints } = useAppState();
  const { speakNow, speakSegments, stopImmediate, refreshVoicePreference } = useSpeech();
  // Every displaySegments entry (the title/key announcement included) is
  // this song's own content, so it always speaks in a voice matching the
  // song's language when one's known — the pedal/setlist announcements
  // below (speakNow calls) are app chrome, not song content, and
  // deliberately stay on the user's own globally selected voice.
  const speakSongSegments = useCallback(
    (segments: SpeechSegment[]) => speakSegments(segments, { languageCode: song?.language ?? null }),
    [speakSegments, song]
  );
  // React Navigation is supposed to fully unmount a screen once it's popped
  // off the stack, but Rusty found a real, reproducible case where that
  // doesn't happen cleanly: loading N different songs in a row caused each
  // song's first line to be spoken N times, growing by one per song loaded —
  // exactly what you'd hear if N still-alive-but-backgrounded PromptScreen
  // instances all independently reacted to the same shared "active song
  // changed" context update. isFocusedRef gates every place this screen
  // produces speech or reacts to pedal input, so a backgrounded instance
  // (however it ended up alive) stays silent no matter what shared state
  // changes around it — only the one instance actually on screen acts.
  const isFocused = useIsFocused();
  const isFocusedRef = useRef(isFocused);
  isFocusedRef.current = isFocused;
  // -1 means "nothing spoken yet" — the very first advance (pedal or touch)
  // reveals the title/key announcement (index 0 of displayLines below), not
  // a lyric line; the actual first lyric line is what the press after that
  // reveals. See the effect below for why this replaced auto-speaking on
  // load.
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [reduceChatter, setReduceChatter] = useState(false);
  // Both start null (rather than defaulting to a guessed value) so the very
  // first render never wraps with a wrong guess, only to have displayLines
  // change again moments later once the real saved preferences load.
  const [lineLengthPreset, setLineLengthPreset] = useState<LineLengthPreset | null>(null);
  const [includeChords, setIncludeChords] = useState<boolean | null>(null);
  const [breakAtChords, setBreakAtChords] = useState<boolean | null>(null);
  const [higherPitchForChords, setHigherPitchForChords] = useState<boolean | null>(null);
  const [repeatFeatureEnabled, setRepeatFeatureEnabled] = useState(true);

  useEffect(() => {
    loadReduceVoiceOverChatter().then(setReduceChatter);
    loadLineLengthPreset().then(setLineLengthPreset);
    loadIncludeChords().then(setIncludeChords);
    loadBreakAtChords().then(setBreakAtChords);
    loadHigherPitchForChords().then(setHigherPitchForChords);
    loadRepeatFeatureEnabled().then(setRepeatFeatureEnabled);
  }, []);

  // React Navigation reuses this screen's instance on goBack() rather than
  // remounting it, so settings changed on VoiceSettings/PedalSettings/Lines
  // (voice, reduce-VO-chatter, line-length preset, include-chords) would
  // otherwise never reach an already-mounted PromptScreen until the app
  // fully restarted.
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      refreshVoicePreference();
      loadReduceVoiceOverChatter().then(setReduceChatter);
      loadLineLengthPreset().then(setLineLengthPreset);
      loadIncludeChords().then(setIncludeChords);
      loadBreakAtChords().then(setBreakAtChords);
      loadHigherPitchForChords().then(setHigherPitchForChords);
      loadRepeatFeatureEnabled().then(setRepeatFeatureEnabled);
    });
    return unsubscribe;
  }, [navigation, refreshVoicePreference]);

  useEffect(() => {
    if (!song) {
      navigation.replace('Library');
    }
  }, [song, navigation]);

  // Swipe up/down while focused (VoiceOver's native "adjustable" gesture,
  // same mechanism used for speed/volume in Voice Settings) is the primary
  // way to change Lines/Chords/Line breaks, per Rusty's request 2026-09-07.
  // Each control ALSO keeps a plain-tap fallback — swipe-only would leave
  // sighted/VoiceOver-off users with no way to change these at all, since
  // adjustable's swipe gesture only exists when VoiceOver is running.
  // Replaces the old dedicated Line Length settings screen entirely.
  //
  // Line Length wraps in both directions (off <-> short <-> medium <-> long
  // <-> off), unlike most of this app's other adjustable controls — see
  // lineLengthPreference.ts's PRESET_ORDER comment for why. Tap and
  // swipe-up both move forward, so they share the same function.
  const handleAdjustLineLength = (direction: 'increment' | 'decrement') => {
    setLineLengthPreset((current) => {
      const base = current ?? DEFAULT_LINE_LENGTH_PRESET;
      const next = direction === 'increment' ? nextLineLengthPreset(base) : previousLineLengthPreset(base);
      void saveLineLengthPreset(next);
      return next;
    });
  };

  const handleCycleLineLength = () => handleAdjustLineLength('increment');

  const handleAdjustChords = (direction: 'increment' | 'decrement') => {
    const next = direction === 'increment';
    setIncludeChords(next);
    void saveIncludeChords(next);
  };

  const handleToggleChords = () => {
    setIncludeChords((current) => {
      const next = !current;
      void saveIncludeChords(next);
      return next;
    });
  };

  // "Lines change with chords" mode, added 2026-09-07 per Rusty's request —
  // forces every chord change to start a new line, aimed at someone learning
  // a song rather than performing one they already know. See
  // wrapLines.ts's breakAtEveryChord for the actual splitting logic.
  const handleAdjustLineBreaks = (direction: 'increment' | 'decrement') => {
    const next = direction === 'increment';
    setBreakAtChords(next);
    void saveBreakAtChords(next);
  };

  const handleToggleLineBreaks = () => {
    setBreakAtChords((current) => {
      const next = !current;
      void saveBreakAtChords(next);
      return next;
    });
  };

  // Breaking at chords only means anything if chords are actually being
  // announced — with chords off, forcing a break at a chord no one hears
  // about is pointless. Rather than guess what a chords-off user would want
  // (Rusty's own point, 2026-09-07: "we don't know where people who want
  // chords might want it"), the stored preference is left alone — turning
  // chords back on restores whatever line-break choice was last made — but
  // the EFFECTIVE value used for wrapping, and the control's own
  // interactivity, are forced to "Words" whenever chords are off.
  const lineBreaksInteractive = includeChords === true;
  const effectiveBreakAtChords = lineBreaksInteractive ? (breakAtChords ?? false) : false;

  // Speaking a chord name at a higher pitch (2026-09-09, per a tester
  // suggestion) is meaningless with chords off, same reasoning as Line
  // Breaks above — forced inert rather than guessing what a chords-off user
  // would want.
  const chordPitchInteractive = includeChords === true;
  const effectiveHigherPitchForChords = chordPitchInteractive ? (higherPitchForChords ?? false) : false;

  const handleAdjustChordPitch = (direction: 'increment' | 'decrement') => {
    const next = direction === 'increment';
    setHigherPitchForChords(next);
    void saveHigherPitchForChords(next);
  };

  const handleToggleChordPitch = () => {
    setHigherPitchForChords((current) => {
      const next = !current;
      void saveHigherPitchForChords(next);
      return next;
    });
  };

  // Re-wrapping is a system-wide preference (not per-song), applied here at
  // playback time rather than baked into Song.lines, so changing it in
  // Settings immediately affects every song, including ones already in the
  // library — not just newly imported ones. Chord position is always at
  // least a preferred break point inside wrapChordedSongLines regardless of
  // includeChords — that flag only controls whether the chord names survive
  // into the rendered text. breakAtChords escalates "preferred" to "forced".
  const spokenLines = useMemo<LineWrapResult>(() => {
    if (!song || lineLengthPreset === null || includeChords === null || breakAtChords === null) {
      return { lines: [], segments: [], sections: [] };
    }
    const options = { ...wrapOptionsForPreset(lineLengthPreset), breakAtEveryChord: effectiveBreakAtChords };
    return wrapChordedSongLines(
      { chordedLines: song.chordedLines, sections: song.sections },
      options,
      includeChords,
      effectiveHigherPitchForChords
    );
  }, [song, lineLengthPreset, includeChords, effectiveBreakAtChords, effectiveHigherPitchForChords]);

  // The title/key announcement is a synthetic "line 0" ahead of the real
  // lyrics — Rusty relies on hearing the key every time, even for songs he
  // already knows, so it needs to be something the app's own voice always
  // says, not left to chance whether VoiceOver happens to read the header.
  const displayLines = useMemo<string[]>(() => {
    if (!song || spokenLines.lines.length === 0) {
      return [];
    }
    return [buildSongAnnouncement(song.title, song.key), ...spokenLines.lines];
  }, [song, spokenLines]);

  // Parallel to displayLines, but as speech segments (plain text + optional
  // pitch) rather than flat strings — what actually gets spoken. The title
  // announcement has no chord data, so it's always a single plain segment;
  // real lyric lines carry whatever segments wrapChordedSongLines produced,
  // which is a single plain segment too unless higher-pitch-for-chords is on.
  const displaySegments = useMemo<SpeechSegment[][]>(() => {
    if (!song || spokenLines.lines.length === 0) {
      return [];
    }
    return [[{ text: buildSongAnnouncement(song.title, song.key) }], ...spokenLines.segments];
  }, [song, spokenLines]);

  // Set when a double-press just jumped to a different setlist song, so the
  // effect below knows this particular displayLines change should announce
  // itself immediately rather than wait for another press. Using a ref (not
  // just branching in onDoubleAction's own async callback) avoids a race
  // between that callback and this effect — whichever fires second would
  // otherwise clobber the other's idea of where currentIndex should land.
  const setlistJumpPendingRef = useRef(false);

  // A back or forward press's meaning depends on recent press history (see
  // repeatController.ts for the full rules), so it needs one instance that
  // persists across presses, not fresh state each render. Reset alongside
  // currentIndex below whenever displayLines changes — repeat context from
  // a previous song or a previous line-length setting is meaningless once
  // the line set underneath it has changed.
  const repeatControllerRef = useRef(new RepeatController());

  // Reset to "nothing spoken yet" whenever a song loads or the wrapped lines
  // change (e.g. the line-length preference changed and we came back to this
  // screen) — deliberately NOT auto-speaking here on an ordinary song open.
  // Speaking immediately used to race against VoiceOver's own "new screen"
  // announcement, each talking over the other; waiting for the first press
  // (pedal or touch) lets that announcement finish on its own first, same as
  // Rusty asked for. A setlist-jump double-press is a different situation —
  // we're already on this screen, focused, mid-performance, so there's no
  // VoiceOver announcement to race and announcing the new song immediately
  // (rather than requiring a third press) is exactly what was asked for.
  useEffect(() => {
    repeatControllerRef.current = new RepeatController();
    if (setlistJumpPendingRef.current) {
      setlistJumpPendingRef.current = false;
      setCurrentIndex(0);
      if (displaySegments.length > 0) {
        speakSongSegments(displaySegments[0]);
      }
    } else {
      setCurrentIndex(-1);
    }
  }, [displaySegments, speakSongSegments]);

  useEffect(() => {
    return () => stopImmediate();
  }, [stopImmediate]);

  // Repeat feature, 2026-09-09 — see repeatController.ts for the full design
  // and reasoning. Short version: a fresh "back" press repeats the current
  // line rather than moving; a quick second "back" walks back a real line
  // instead (and every quick one after that keeps walking back); a quick
  // "next" — whether alternating with a back or repeating another quick
  // next — always repeats too, since moving forward for real only ever
  // happens after a genuine pause. In practice that pause costs nothing:
  // singing the repeated line before reaching for next already takes
  // longer than the window.
  const goNext = useCallback(() => {
    if (displayLines.length === 0) return;
    const resolution = repeatFeatureEnabled ? repeatControllerRef.current.resolveNext() : 'navigate';
    if (resolution === 'repeat' && currentIndex >= 0) {
      playAdvanceFeedback();
      speakSongSegments(displaySegments[currentIndex]);
      return;
    }
    if (currentIndex >= displayLines.length - 1) {
      stopImmediate();
      playEndOfSongFeedback();
      return;
    }
    const nextIndex = currentIndex + 1;
    setCurrentIndex(nextIndex);
    playAdvanceFeedback();
    speakSongSegments(displaySegments[nextIndex]);
  }, [currentIndex, displayLines, displaySegments, repeatFeatureEnabled, speakSongSegments, stopImmediate]);

  const goPrevious = useCallback(() => {
    // currentIndex === -1 means nothing has been spoken yet — nothing to go
    // back to or repeat.
    if (displayLines.length === 0 || currentIndex < 0) {
      return;
    }
    const resolution = repeatFeatureEnabled ? repeatControllerRef.current.resolveBack() : 'navigate';
    if (resolution === 'repeat') {
      playAdvanceFeedback();
      speakSongSegments(displaySegments[currentIndex]);
      return;
    }
    const prevIndex = Math.max(0, currentIndex - 1);
    setCurrentIndex(prevIndex);
    playAdvanceFeedback();
    speakSongSegments(displaySegments[prevIndex]);
  }, [currentIndex, displayLines, displaySegments, repeatFeatureEnabled, speakSongSegments]);

  // Shared by the pedal's double-press, the on-screen song-corner buttons,
  // and the adjustable "song N of M" text below — every trigger for a
  // setlist song jump goes through this one place so they all behave
  // identically (same interrupt, same sound, same announcement).
  const jumpSetlistSong = useCallback(
    (direction: 'next' | 'previous') => {
      if (!isFocusedRef.current || !activeSetlist) return;
      playSongChangeFeedback();
      speakNow(direction === 'next' ? strings.promptScreen.nextSongAccessibilityLabel : strings.promptScreen.previousSongAccessibilityLabel);
      setlistJumpPendingRef.current = true;
      void advanceSetlist(direction).then((newSong) => {
        if (newSong) return; // the effect above will announce it once displayLines updates
        setlistJumpPendingRef.current = false;
        if (isFocusedRef.current) {
          speakNow(
            direction === 'next'
              ? strings.promptScreen.noMoreSongsInSetlistAnnouncement
              : strings.promptScreen.alreadyAtFirstSongAnnouncement
          );
        }
      });
    },
    [activeSetlist, advanceSetlist, speakNow, strings]
  );

  const { isPedalConnected } = usePedalInput({
    onAction: (action) => {
      if (!isFocusedRef.current) return;
      if (action === 'next') {
        goNext();
      } else {
        goPrevious();
      }
    },
    // A double press changes song within the active setlist — layered on
    // top of the single-press line-advance above, which already fired for
    // both presses; a no-op if no setlist is currently active. The second
    // single-press's line is still mid-flight at this point (goNext already
    // called speakNow just above, synchronously, before this handler runs),
    // so interrupt it immediately with its own distinct sound + a spoken
    // "Next/Previous song" rather than let a stale line keep playing while
    // the new song loads in the background (Rusty's report, 2026-08-30).
    onDoubleAction: (action) => {
      jumpSetlistSong(action);
    },
    onDisconnectAlert: () => {
      if (!isFocusedRef.current) return;
      speakNow(strings.promptScreen.pedalDisconnectedAnnouncement);
    },
    onConnectAlert: () => {
      if (!isFocusedRef.current) return;
      speakNow(strings.promptScreen.pedalConnectedAnnouncement);
    },
  });

  const resumeCurrentLine = useCallback(() => {
    if (isFocusedRef.current && currentIndex >= 0 && displaySegments.length > 0) {
      speakSongSegments(displaySegments[currentIndex]);
    }
  }, [currentIndex, displaySegments, speakSongSegments]);
  useAudioInterruptionResume(resumeCurrentLine);

  const flingLeft = Gesture.Fling()
    .direction(Directions.LEFT)
    .onEnd(() => goNext());
  const flingRight = Gesture.Fling()
    .direction(Directions.RIGHT)
    .onEnd(() => goPrevious());
  const screenSwipe = Gesture.Race(flingLeft, flingRight);

  if (!song) {
    return <SafeAreaView style={styles.container} edges={['top']} />;
  }

  // Shows the title/key announcement before the first press too (harmless to
  // display before it's actually spoken) — useful for a sighted person
  // glancing at the screen to see what's cued up and ready.
  const displayText = displayLines[Math.max(currentIndex, 0)];
  const isEnded = currentIndex === displayLines.length - 1;

  return (
    // edges={['top']} keeps header content (and its small link buttons)
    // clear of the notch/status bar area — without it nothing in this app
    // accounts for the safe area at all, so a reaching finger hunting for a
    // small top-row button has very little room before crossing into actual
    // system chrome (Rusty's real report, 2026-08-28).
    <SafeAreaView style={styles.container} edges={['top']} accessibilityViewIsModal>
      <View style={styles.header}>
        <View style={styles.headerTextBlock}>
          <Text style={styles.songTitle} numberOfLines={1}>
            {song.title}
            {song.key ? strings.promptScreen.keyOfSuffix(song.key) : ''}
          </Text>
          {activeSetlist ? (
            // A View wrapping the Text, not the accessibility/adjustable
            // props directly on the Text itself — Text and View share the
            // same accessibility PROP TYPES, but that doesn't guarantee
            // identical native behavior, and this exact mechanism was
            // already proven working on the lyric display (a View). Real
            // bug: applied directly to a Text, VoiceOver read the hint fine
            // but the swipe gesture never actually fired onAccessibilityAction
            // at all (Rusty's report, 2026-08-31).
            <View
              accessible
              accessibilityRole="adjustable"
              accessibilityHint={hintOrNone(strings.promptScreen.setlistJumpHint, reduceHints)}
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === 'decrement') {
                  jumpSetlistSong('next');
                } else if (event.nativeEvent.actionName === 'increment') {
                  jumpSetlistSong('previous');
                }
              }}
            >
              <Text style={styles.setlistText} numberOfLines={1}>
                {strings.promptScreen.fullSetlistText(
                  activeSetlist.setlist.name,
                  activeSetlist.currentIndex + 1,
                  activeSetlist.setlist.entries.length
                )}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.headerLinks}>
          {/* Every label in this row is deliberately identical between what's
              shown on screen and what VoiceOver speaks — they used to diverge
              (e.g. visible "Library" vs spoken "Load a different song"),
              which meant a sighted person and Rusty couldn't refer to the
              same button by the same word. Fixed 2026-08-31 per his request;
              kept short rather than padding the visible text out to match
              the old, more descriptive spoken versions. */}
          <Pressable
            hitSlop={ROW_LINK_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={isPedalConnected ? strings.promptScreen.pedalConnectedStatusLabel : strings.promptScreen.pedalNotConnectedStatusLabel}
            onPress={() => navigation.navigate('PedalSettings')}
          >
            <Text style={styles.exitLink}>
              {isPedalConnected ? strings.promptScreen.pedalConnectedStatusLabel : strings.promptScreen.pedalNotConnectedStatusLabel}
            </Text>
          </Pressable>
          <Pressable
            hitSlop={ROW_LINK_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={strings.promptScreen.voiceLinkLabel}
            onPress={() => navigation.navigate('VoiceSettings')}
          >
            <Text style={styles.exitLink}>{strings.promptScreen.voiceLinkLabel}</Text>
          </Pressable>
          <Pressable
            hitSlop={ROW_LINK_HIT_SLOP}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={strings.promptScreen.linesText}
            accessibilityValue={{ text: LINE_LENGTH_PRESET_LABEL[lineLengthPreset ?? DEFAULT_LINE_LENGTH_PRESET] }}
            accessibilityHint={hintOrNone(strings.promptScreen.linesHint, reduceHints)}
            accessibilityActions={[
              { name: 'increment', label: strings.promptScreen.longerActionLabel },
              { name: 'decrement', label: strings.promptScreen.shorterActionLabel },
            ]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'increment') {
                handleAdjustLineLength('increment');
              } else if (event.nativeEvent.actionName === 'decrement') {
                handleAdjustLineLength('decrement');
              }
            }}
            onPress={handleCycleLineLength}
          >
            <Text style={styles.exitLink}>
              {strings.promptScreen.linesLabel(LINE_LENGTH_PRESET_LABEL[lineLengthPreset ?? DEFAULT_LINE_LENGTH_PRESET])}
            </Text>
          </Pressable>
          <Pressable
            hitSlop={ROW_LINK_HIT_SLOP}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={strings.promptScreen.chordsText}
            accessibilityValue={{
              text: includeChords ? strings.promptScreen.chordsOnActionLabel : strings.promptScreen.chordsOffActionLabel,
            }}
            accessibilityHint={hintOrNone(strings.promptScreen.chordsHint, reduceHints)}
            accessibilityActions={[
              { name: 'increment', label: strings.promptScreen.chordsOnActionLabel },
              { name: 'decrement', label: strings.promptScreen.chordsOffActionLabel },
            ]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'increment') {
                handleAdjustChords('increment');
              } else if (event.nativeEvent.actionName === 'decrement') {
                handleAdjustChords('decrement');
              }
            }}
            onPress={handleToggleChords}
          >
            <Text style={styles.exitLink}>
              {includeChords ? strings.promptScreen.chordsOnLabel : strings.promptScreen.chordsOffLabel}
            </Text>
          </Pressable>
          <Pressable
            hitSlop={ROW_LINK_HIT_SLOP}
            accessible
            accessibilityRole={lineBreaksInteractive ? 'adjustable' : undefined}
            accessibilityLabel={strings.promptScreen.lineBreaksText}
            accessibilityValue={{
              text: effectiveBreakAtChords ? strings.promptScreen.lineBreaksChordsValue : strings.promptScreen.lineBreaksWordsValue,
            }}
            accessibilityHint={lineBreaksInteractive ? hintOrNone(strings.promptScreen.lineBreaksHint, reduceHints) : undefined}
            accessibilityActions={
              lineBreaksInteractive
                ? [
                    { name: 'increment', label: strings.promptScreen.lineBreaksChordsValue },
                    { name: 'decrement', label: strings.promptScreen.lineBreaksWordsValue },
                  ]
                : undefined
            }
            onAccessibilityAction={
              lineBreaksInteractive
                ? (event) => {
                    if (event.nativeEvent.actionName === 'increment') {
                      handleAdjustLineBreaks('increment');
                    } else if (event.nativeEvent.actionName === 'decrement') {
                      handleAdjustLineBreaks('decrement');
                    }
                  }
                : undefined
            }
            onPress={lineBreaksInteractive ? handleToggleLineBreaks : undefined}
          >
            <Text style={[styles.exitLink, !lineBreaksInteractive && styles.exitLinkDisabled]}>
              {effectiveBreakAtChords ? strings.promptScreen.lineBreaksAtChordsLabel : strings.promptScreen.lineBreaksAtWordsLabel}
            </Text>
          </Pressable>
          <Pressable
            hitSlop={ROW_LINK_HIT_SLOP}
            accessible
            accessibilityRole={chordPitchInteractive ? 'adjustable' : undefined}
            accessibilityLabel={strings.promptScreen.chordPitchText}
            accessibilityValue={{
              text: effectiveHigherPitchForChords
                ? strings.promptScreen.chordPitchOnActionLabel
                : strings.promptScreen.chordPitchOffActionLabel,
            }}
            accessibilityHint={chordPitchInteractive ? hintOrNone(strings.promptScreen.chordPitchHint, reduceHints) : undefined}
            accessibilityActions={
              chordPitchInteractive
                ? [
                    { name: 'increment', label: strings.promptScreen.chordPitchOnActionLabel },
                    { name: 'decrement', label: strings.promptScreen.chordPitchOffActionLabel },
                  ]
                : undefined
            }
            onAccessibilityAction={
              chordPitchInteractive
                ? (event) => {
                    if (event.nativeEvent.actionName === 'increment') {
                      handleAdjustChordPitch('increment');
                    } else if (event.nativeEvent.actionName === 'decrement') {
                      handleAdjustChordPitch('decrement');
                    }
                  }
                : undefined
            }
            onPress={chordPitchInteractive ? handleToggleChordPitch : undefined}
          >
            <Text style={[styles.exitLink, !chordPitchInteractive && styles.exitLinkDisabled]}>
              {effectiveHigherPitchForChords ? strings.promptScreen.chordPitchOnLabel : strings.promptScreen.chordPitchOffLabel}
            </Text>
          </Pressable>
          <Pressable
            hitSlop={ROW_LINK_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={strings.promptScreen.editLinkLabel}
            onPress={() => navigation.navigate('NewSong', { editSong: song })}
          >
            <Text style={styles.exitLink}>{strings.promptScreen.editLinkLabel}</Text>
          </Pressable>
          <Pressable
            hitSlop={ROW_LINK_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={strings.promptScreen.libraryLinkLabel}
            // popTo (not navigate) — React Navigation 7 changed navigate()
            // to no longer pop back to an existing route by default (that's
            // now popTo's job specifically); plain navigate('Library') was
            // pushing a brand new Library screen on top every single time
            // instead of returning to the one persistent instance, which is
            // the actual root cause of the growing navigation stack below.
            onPress={() => navigation.popTo('Library')}
          >
            <Text style={styles.exitLink}>{strings.promptScreen.libraryLinkLabel}</Text>
          </Pressable>
        </View>
      </View>

      <GestureDetector gesture={screenSwipe}>
        <View
          style={styles.lineArea}
          accessible
          accessibilityRole="adjustable"
          // A fixed label, not the live lyric text — React Native defaults an
          // accessible group's label to its children's text content, which
          // means VoiceOver was re-announcing the new line itself (in its own
          // voice) every time it changed while focused here, echoing right
          // on top of LyriCue's own TTS reading the same line (Rusty's report,
          // 2026-08-30/31). A label that never changes gives VoiceOver
          // nothing new to say on its own — the actual lyric content is
          // still spoken, just only ever through speakNow, never VoiceOver's
          // separate voice.
          accessibilityLabel={strings.promptScreen.lyricsAreaAccessibilityLabel}
          // VoiceOver always sends 'increment' for swipe-up and 'decrement'
          // for swipe-down on an adjustable element — that gesture-to-name
          // mapping is fixed, but which app action each one triggers is
          // entirely up to us. Mapped decrement (swipe down) to next and
          // increment (swipe up) to previous, matching the down-advances
          // feel of the pedal bindings (Page Down/Down Arrow -> next) rather
          // than a slider's up-increases convention (Rusty's call, 2026-08-31).
          accessibilityHint={hintOrNone(strings.promptScreen.lyricsAreaHint, reduceHints)}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'decrement') {
              goNext();
            } else if (event.nativeEvent.actionName === 'increment') {
              goPrevious();
            }
          }}
          {...(reduceChatter ? accessibilityTraitsProp(['startsMedia']) : {})}
        >
          <Text style={styles.lineText}>{displayText}</Text>
          {isEnded ? <Text style={styles.endLabel}>{strings.promptScreen.endOfSongLabel}</Text> : null}
        </View>
      </GestureDetector>

      <View style={styles.touchStrip}>
        {activeSetlist ? (
          <>
            <Pressable
              style={styles.touchStripSongSegment}
              onPress={() => jumpSetlistSong('previous')}
              accessibilityRole="button"
              accessibilityLabel={strings.promptScreen.previousSongAccessibilityLabel}
              {...(reduceChatter ? accessibilityTraitsProp(['startsMedia']) : {})}
            >
              <Text style={styles.touchStripSongLabel}>{strings.promptScreen.previousSongButtonText}</Text>
            </Pressable>
            <View style={styles.touchStripDivider} />
          </>
        ) : null}
        <Pressable
          style={styles.touchStripHalf}
          onPress={goPrevious}
          accessibilityRole="button"
          accessibilityLabel={strings.promptScreen.previousLineAccessibilityLabel}
          {...(reduceChatter ? accessibilityTraitsProp(['startsMedia']) : {})}
        >
          <Text style={styles.touchStripLabel}>{strings.promptScreen.previousLineButtonText}</Text>
        </Pressable>
        <View style={styles.touchStripDivider} />
        <Pressable
          style={styles.touchStripHalf}
          onPress={goNext}
          accessibilityRole="button"
          accessibilityLabel={strings.promptScreen.nextLineAccessibilityLabel}
          {...(reduceChatter ? accessibilityTraitsProp(['startsMedia']) : {})}
        >
          <Text style={styles.touchStripLabel}>{strings.promptScreen.nextLineButtonText}</Text>
        </Pressable>
        {activeSetlist ? (
          <>
            <View style={styles.touchStripDivider} />
            <Pressable
              style={styles.touchStripSongSegment}
              onPress={() => jumpSetlistSong('next')}
              accessibilityRole="button"
              accessibilityLabel={strings.promptScreen.nextSongAccessibilityLabel}
              {...(reduceChatter ? accessibilityTraitsProp(['startsMedia']) : {})}
            >
              <Text style={styles.touchStripSongLabel}>{strings.promptScreen.nextSongButtonText}</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  // Stacked, not a shared row — a row layout let the button cluster (grown
  // to 6 buttons over this session) squeeze the title/setlist-text block
  // down to a near-zero width, which made VoiceOver skip it entirely rather
  // than just display it awkwardly (Rusty's report, 2026-08-31: swiping
  // through the screen never reached the title or "song N of M" text at
  // all). Stacking removes the competition for horizontal space outright,
  // rather than trying to tune flex/shrink values to fend it off again as
  // more buttons get added later.
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  headerTextBlock: {
    marginBottom: 12,
  },
  songTitle: {
    color: '#999',
    fontSize: 16,
  },
  setlistText: {
    color: '#4f8cff',
    fontSize: 13,
    marginTop: 2,
  },
  headerLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  exitLink: {
    color: '#4f8cff',
    fontSize: 16,
  },
  // Line breaks control when chords are off — the setting is forced to
  // "Words" and inert (no swipe or tap) since breaking at a chord no one
  // hears about is meaningless. Dimmed to show a sighted user it's
  // currently unavailable, not just a plain, differently-worded link.
  exitLinkDisabled: {
    color: '#666',
  },
  lineArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  lineText: {
    color: '#fff',
    fontSize: 40,
    fontWeight: '600',
    textAlign: 'center',
  },
  endLabel: {
    color: '#888',
    fontSize: 18,
    marginTop: 24,
  },
  touchStrip: {
    flexDirection: 'row',
    height: 90,
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  touchStripHalf: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  touchStripDivider: {
    width: 1,
    backgroundColor: '#222',
  },
  touchStripLabel: {
    color: '#4f8cff',
    fontSize: 20,
    fontWeight: '700',
  },
  // Fixed (not flex) width — deliberately narrower "corner" zones flanking
  // the wider next/prev-line segments in the middle, per Rusty's own layout
  // description, 2026-08-31. Only rendered at all when a setlist is active.
  touchStripSongSegment: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  touchStripSongLabel: {
    color: '#4f8cff',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});
