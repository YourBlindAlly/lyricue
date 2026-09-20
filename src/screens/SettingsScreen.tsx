import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useAppState } from '../state/AppStateContext';
import {
  DEFAULT_LINE_LENGTH_PRESET,
  LINE_LENGTH_PRESET_LABEL,
  loadLineLengthPreset,
  nextLineLengthPreset,
  previousLineLengthPreset,
  saveLineLengthPreset,
  type LineLengthPreset,
} from '../parsing/lineLengthPreference';
import { loadIncludeChords } from '../parsing/chordsPreference';
import { loadBreakAtChords, saveBreakAtChords } from '../parsing/chordLineBreaksPreference';
import { loadHigherPitchForChords, saveHigherPitchForChords } from '../speech/chordPitchPreference';
import { hintOrNone } from '../speech/reduceHintsPreference';
import { LINK_HIT_SLOP } from '../ui/hitSlop';
import { useStrings } from '../i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

type AdjustableRowProps = {
  label: string;
  valueText: string;
  /** Shown as the row's on-screen value; also spoken as VoiceOver's value. */
  hint?: string;
  interactive: boolean;
  incrementLabel: string;
  decrementLabel: string;
  onIncrement: () => void;
  onDecrement: () => void;
  onPress: () => void;
};

// Swipe up/down while focused is the primary way to change one of these
// (VoiceOver's adjustable gesture); a plain tap stays as the sighted /
// VoiceOver-off fallback — same pattern the lyrics screen used for these
// controls before they moved here.
function AdjustableRow({
  label,
  valueText,
  hint,
  interactive,
  incrementLabel,
  decrementLabel,
  onIncrement,
  onDecrement,
  onPress,
}: AdjustableRowProps) {
  return (
    <Pressable
      style={styles.row}
      accessible
      accessibilityRole={interactive ? 'adjustable' : undefined}
      accessibilityLabel={label}
      accessibilityValue={{ text: valueText }}
      accessibilityHint={interactive ? hint : undefined}
      accessibilityActions={
        interactive
          ? [
              { name: 'increment', label: incrementLabel },
              { name: 'decrement', label: decrementLabel },
            ]
          : undefined
      }
      onAccessibilityAction={
        interactive
          ? (event) => {
              if (event.nativeEvent.actionName === 'increment') onIncrement();
              else if (event.nativeEvent.actionName === 'decrement') onDecrement();
            }
          : undefined
      }
      onPress={interactive ? onPress : undefined}
    >
      <Text style={[styles.rowLabel, !interactive && styles.rowDisabled]}>{label}</Text>
      <Text style={[styles.rowValue, !interactive && styles.rowDisabled]}>{valueText}</Text>
    </Pressable>
  );
}

export function SettingsScreen({ navigation }: Props) {
  const strings = useStrings();
  const { reduceHints } = useAppState();
  const [lineLengthPreset, setLineLengthPreset] = useState<LineLengthPreset>(DEFAULT_LINE_LENGTH_PRESET);
  const [includeChords, setIncludeChords] = useState(false);
  const [breakAtChords, setBreakAtChords] = useState(false);
  const [higherPitchForChords, setHigherPitchForChords] = useState(false);

  const load = useCallback(() => {
    loadLineLengthPreset().then((v) => setLineLengthPreset(v ?? DEFAULT_LINE_LENGTH_PRESET));
    loadIncludeChords().then((v) => setIncludeChords(v === true));
    loadBreakAtChords().then((v) => setBreakAtChords(v === true));
    loadHigherPitchForChords().then((v) => setHigherPitchForChords(v === true));
  }, []);

  useEffect(() => {
    load();
    return navigation.addListener('focus', load);
  }, [load, navigation]);

  const adjustLineLength = (direction: 'increment' | 'decrement') => {
    setLineLengthPreset((current) => {
      const next = direction === 'increment' ? nextLineLengthPreset(current) : previousLineLengthPreset(current);
      void saveLineLengthPreset(next);
      return next;
    });
  };

  const setBreaks = (next: boolean) => {
    setBreakAtChords(next);
    void saveBreakAtChords(next);
  };

  const setPitch = (next: boolean) => {
    setHigherPitchForChords(next);
    void saveHigherPitchForChords(next);
  };

  // Both chord options only mean anything while chords are being spoken, so
  // they read as "Words" / off and ignore input with chords off — the saved
  // choice is left alone and comes back when chords are turned on again.
  const chordsOn = includeChords;
  const effectiveBreaks = chordsOn && breakAtChords;
  const effectivePitch = chordsOn && higherPitchForChords;

  return (
    <SafeAreaView style={styles.container} edges={['top']} onAccessibilityEscape={() => navigation.goBack()}>
      <View style={styles.headerRow}>
        <Pressable
          hitSlop={LINK_HIT_SLOP}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={strings.settingsScreen.backButtonLabel}
        >
          <Text style={styles.backLink}>{strings.settingsScreen.backButtonLabel}</Text>
        </Pressable>
        <Text style={styles.heading} accessibilityRole="header">
          {strings.settingsScreen.heading}
        </Text>
      </View>

      <ScrollView>
        <Pressable
          style={styles.row}
          accessibilityRole="button"
          accessibilityLabel={strings.settingsScreen.pedalLinkLabel}
          onPress={() => navigation.navigate('PedalSettings')}
        >
          <Text style={styles.rowLabel}>{strings.settingsScreen.pedalLinkLabel}</Text>
        </Pressable>
        <Pressable
          style={styles.row}
          accessibilityRole="button"
          accessibilityLabel={strings.settingsScreen.voiceLinkLabel}
          onPress={() => navigation.navigate('VoiceSettings')}
        >
          <Text style={styles.rowLabel}>{strings.settingsScreen.voiceLinkLabel}</Text>
        </Pressable>

        <AdjustableRow
          label={strings.promptScreen.linesText}
          valueText={LINE_LENGTH_PRESET_LABEL[lineLengthPreset]}
          hint={hintOrNone(strings.promptScreen.linesHint, reduceHints)}
          interactive
          incrementLabel={strings.promptScreen.longerActionLabel}
          decrementLabel={strings.promptScreen.shorterActionLabel}
          onIncrement={() => adjustLineLength('increment')}
          onDecrement={() => adjustLineLength('decrement')}
          onPress={() => adjustLineLength('increment')}
        />
        <AdjustableRow
          label={strings.promptScreen.lineBreaksText}
          valueText={effectiveBreaks ? strings.promptScreen.lineBreaksChordsValue : strings.promptScreen.lineBreaksWordsValue}
          hint={hintOrNone(strings.promptScreen.lineBreaksHint, reduceHints)}
          interactive={chordsOn}
          incrementLabel={strings.promptScreen.lineBreaksChordsValue}
          decrementLabel={strings.promptScreen.lineBreaksWordsValue}
          onIncrement={() => setBreaks(true)}
          onDecrement={() => setBreaks(false)}
          onPress={() => setBreaks(!breakAtChords)}
        />
        <AdjustableRow
          label={strings.promptScreen.chordPitchText}
          valueText={effectivePitch ? strings.promptScreen.chordPitchOnActionLabel : strings.promptScreen.chordPitchOffActionLabel}
          hint={hintOrNone(strings.promptScreen.chordPitchHint, reduceHints)}
          interactive={chordsOn}
          incrementLabel={strings.promptScreen.chordPitchOnActionLabel}
          decrementLabel={strings.promptScreen.chordPitchOffActionLabel}
          onIncrement={() => setPitch(true)}
          onDecrement={() => setPitch(false)}
          onPress={() => setPitch(!higherPitchForChords)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    padding: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 16,
  },
  backLink: {
    color: '#4f8cff',
    fontSize: 16,
  },
  heading: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  row: {
    backgroundColor: '#1c1c1c',
    borderRadius: 10,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  rowLabel: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    flexShrink: 1,
  },
  rowValue: {
    color: '#4f8cff',
    fontSize: 16,
  },
  rowDisabled: {
    opacity: 0.4,
  },
});
