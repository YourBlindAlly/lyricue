import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import type { Voice } from 'expo-speech';
import * as Localization from 'expo-localization';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { loadVoicePreference, saveVoicePreference } from '../speech/voicePreference';
import {
  loadReduceVoiceOverChatter,
  saveReduceVoiceOverChatter,
} from '../speech/voiceOverPreference';
import {
  loadShowLowQualityVoices,
  saveShowLowQualityVoices,
} from '../speech/showLowQualityVoicesPreference';
import {
  loadTickSoundEnabled,
  saveTickSoundEnabled,
} from '../feedback/tickSoundPreference';
import { setTickSoundEnabled } from '../feedback/feedback';
import {
  DEFAULT_VOICE_RATE,
  decreaseVoiceRate,
  increaseVoiceRate,
  loadVoiceRate,
  saveVoiceRate,
  voiceRateLabel,
  type VoiceRate,
} from '../speech/voiceRatePreference';
import {
  DEFAULT_VOICE_VOLUME,
  decreaseVoiceVolume,
  increaseVoiceVolume,
  loadVoiceVolume,
  saveVoiceVolume,
  voiceVolumeLabel,
  type VoiceVolume,
} from '../speech/voiceVolumePreference';
import {
  filterVoicesByLanguages,
  filterVoicesByQuality,
  filterWithFailOpen,
  preferredLanguageCodes,
} from '../speech/voiceFiltering';
import { groupVoicesByLanguage } from '../speech/groupVoicesByLanguage';
import { LINK_HIT_SLOP } from '../ui/hitSlop';
import { useStrings } from '../i18n';
import { useAppState } from '../state/AppStateContext';
import { hintOrNone } from '../speech/reduceHintsPreference';

type Props = NativeStackScreenProps<RootStackParamList, 'VoiceSettings'>;

/**
 * A settings row that toggles a boolean, presented as ONE VoiceOver stop
 * instead of three (label, hint, switch) — wrapping the whole row in a
 * single accessible element with accessibilityRole="switch" means a swipe
 * lands on it once and a double-tap toggles it, matching how a native iOS
 * Settings row behaves. The visual Switch stays purely decorative
 * (pointerEvents="none") since the outer Pressable now owns both the tap
 * and the accessibility interaction. Fixes Rusty's report 2026-09-05 that
 * reaching either toggle on this screen took 2-3 swipes.
 */
function ToggleRow({
  label,
  hint,
  value,
  onValueChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      style={styles.chatterRow}
      onPress={() => onValueChange(!value)}
      accessible
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <View style={styles.chatterTextBlock}>
        <Text style={styles.actionLabel}>{label}</Text>
        <Text style={styles.chatterHint}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} pointerEvents="none" />
    </Pressable>
  );
}

export function VoiceSettingsScreen({ navigation }: Props) {
  const strings = useStrings();
  const { reduceHints, setReduceHints } = useAppState();
  const onBack = () => navigation.goBack();
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reduceChatter, setReduceChatter] = useState(false);
  const [showLowQuality, setShowLowQuality] = useState(false);
  const [tickSound, setTickSound] = useState(true);
  const [rate, setRate] = useState<VoiceRate>(DEFAULT_VOICE_RATE);
  const [volume, setVolume] = useState<VoiceVolume>(DEFAULT_VOICE_VOLUME);
  // English always, plus whatever other language(s) the device itself is
  // set to (iOS Settings > General > Language & Region) — computed once
  // from expo-localization rather than re-derived on every render.
  const [preferredCodes, setPreferredCodes] = useState<string[]>(['en']);

  useEffect(() => {
    (async () => {
      const [available, saved, chatterSetting, showLowQ, savedRate, savedVolume, savedTickSound] =
        await Promise.all([
          Speech.getAvailableVoicesAsync(),
          loadVoicePreference(),
          loadReduceVoiceOverChatter(),
          loadShowLowQualityVoices(),
          loadVoiceRate(),
          loadVoiceVolume(),
          loadTickSoundEnabled(),
        ]);
      setVoices(available);
      setSelectedId(saved);
      setReduceChatter(chatterSetting);
      setShowLowQuality(showLowQ);
      setRate(savedRate);
      setVolume(savedVolume);
      setTickSound(savedTickSound);
      setPreferredCodes(preferredLanguageCodes(Localization.getLocales()));
    })();
    return () => {
      Speech.stop();
    };
  }, []);

  const handleToggleReduceChatter = (value: boolean) => {
    setReduceChatter(value);
    void saveReduceVoiceOverChatter(value);
  };

  const handleToggleShowLowQuality = (value: boolean) => {
    setShowLowQuality(value);
    void saveShowLowQualityVoices(value);
  };

  const handleToggleTickSound = (value: boolean) => {
    setTickSound(value);
    setTickSoundEnabled(value);
    void saveTickSoundEnabled(value);
  };

  const handleToggleReduceHints = (value: boolean) => {
    void setReduceHints(value);
  };

  // Swipe up/down while focused (VoiceOver's native "adjustable" gesture,
  // same mechanism as the lyric line and song-jump header elsewhere in the
  // app) — a direct, bidirectional alternative to tapping the button all
  // the way around, per Rusty's request 2026-09-05.
  const handleAdjustRate = (direction: 'increment' | 'decrement') => {
    setRate((current) => {
      const next = direction === 'increment' ? increaseVoiceRate(current) : decreaseVoiceRate(current);
      void saveVoiceRate(next);
      return next;
    });
  };

  const handleAdjustVolume = (direction: 'increment' | 'decrement') => {
    setVolume((current) => {
      const next =
        direction === 'increment' ? increaseVoiceVolume(current) : decreaseVoiceVolume(current);
      void saveVoiceVolume(next);
      return next;
    });
  };

  const handleSelect = (voice: Voice) => {
    setSelectedId(voice.identifier);
    void saveVoicePreference(voice.identifier);
  };

  const handleUseDefault = () => {
    setSelectedId(null);
    void saveVoicePreference(null);
  };

  // Speech.stop() is asynchronous even though it looks like a fire-and-forget
  // call — calling speak() right after it without awaiting lets the old
  // utterance's stop and the new one's start land out of order, which can
  // silently drop the new one (the same bug class already fixed once in
  // useSpeech.ts's speakNow, but never applied here — confirmed live
  // 2026-09-05: any Preview tap after the very first one in a session could
  // fail silently, read by Rusty as "only the top voice's Preview works").
  const handlePreview = async (voice: Voice) => {
    await Speech.stop();
    Speech.speak(strings.voiceSettings.previewSpokenText, { voice: voice.identifier, rate, volume });
  };

  // Filters by device language(s) then by quality, but each stage is
  // wrapped in filterWithFailOpen: if a stage would reduce a non-empty list
  // to nothing, it no-ops instead of hiding everything. This screen's
  // filtering shipped once already (2026-09-05), went completely empty on
  // live testing except the two always-shown special rows below, and was
  // reverted without a fully confirmed root cause — this fail-open
  // wrapping makes that exact failure mode structurally impossible going
  // forward, regardless of which stage (or some future device quirk) is
  // actually at fault. See src/speech/voiceFiltering.ts for the filters
  // themselves and their tests.
  const sections = useMemo(() => {
    const all = voices ?? [];
    const byLanguage = filterWithFailOpen(all, (vs) => filterVoicesByLanguages(vs, preferredCodes));
    const byQuality = filterWithFailOpen(byLanguage, (vs) => filterVoicesByQuality(vs, showLowQuality));
    return groupVoicesByLanguage(byQuality);
  }, [voices, showLowQuality, preferredCodes]);

  // Surfaced near the top so it's findable without scrolling a long,
  // language-grouped list — separate from the always-there "System
  // default" row below, which only needs this when a specific device
  // voice (not the default) is the current pick.
  const currentVoice = useMemo(
    () => voices?.find((v) => v.identifier === selectedId) ?? null,
    [voices, selectedId]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerRow}>
        <Pressable hitSlop={LINK_HIT_SLOP} onPress={onBack} accessibilityRole="button" accessibilityLabel={strings.voiceSettings.backButtonLabel}>
          <Text style={styles.backLink}>{strings.voiceSettings.backButtonLabel}</Text>
        </Pressable>
        <Text style={styles.heading} accessibilityRole="header">
          {strings.voiceSettings.heading}
        </Text>
      </View>

      <ToggleRow
        label={strings.voiceSettings.reduceChatterLabel}
        hint={strings.voiceSettings.reduceChatterHint}
        value={reduceChatter}
        onValueChange={handleToggleReduceChatter}
      />

      <ToggleRow
        label={strings.voiceSettings.reduceHintsLabel}
        hint={strings.voiceSettings.reduceHintsHint}
        value={reduceHints}
        onValueChange={handleToggleReduceHints}
      />

      <View
        style={styles.rateRow}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={strings.voiceSettings.speakingSpeedText}
        accessibilityValue={{ text: voiceRateLabel(rate) }}
        accessibilityHint={hintOrNone(strings.voiceSettings.speakingSpeedHint, reduceHints)}
        accessibilityActions={[
          { name: 'increment', label: strings.voiceSettings.fasterActionLabel },
          { name: 'decrement', label: strings.voiceSettings.slowerActionLabel },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'increment') {
            handleAdjustRate('increment');
          } else if (event.nativeEvent.actionName === 'decrement') {
            handleAdjustRate('decrement');
          }
        }}
      >
        <Text style={styles.actionLabel}>{strings.voiceSettings.speakingSpeedText}</Text>
        <Text style={styles.rateValue}>{voiceRateLabel(rate)}</Text>
      </View>

      <View
        style={styles.rateRow}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={strings.voiceSettings.speakingVolumeText}
        accessibilityValue={{ text: voiceVolumeLabel(volume) }}
        accessibilityHint={hintOrNone(strings.voiceSettings.speakingVolumeHint, reduceHints)}
        accessibilityActions={[
          { name: 'increment', label: strings.voiceSettings.louderActionLabel },
          { name: 'decrement', label: strings.voiceSettings.quieterActionLabel },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'increment') {
            handleAdjustVolume('increment');
          } else if (event.nativeEvent.actionName === 'decrement') {
            handleAdjustVolume('decrement');
          }
        }}
      >
        <Text style={styles.actionLabel}>{strings.voiceSettings.speakingVolumeText}</Text>
        <Text style={styles.rateValue}>{voiceVolumeLabel(volume)}</Text>
      </View>

      <ToggleRow
        label={strings.voiceSettings.tickSoundLabel}
        hint={strings.voiceSettings.tickSoundHint}
        value={tickSound}
        onValueChange={handleToggleTickSound}
      />

      <Pressable
        style={[styles.voiceRow, selectedId === null && styles.voiceRowSelected]}
        onPress={handleUseDefault}
        accessibilityRole="button"
        accessibilityLabel={strings.voiceSettings.systemDefaultLabel}
        accessibilityState={{ selected: selectedId === null }}
      >
        <Text style={styles.voiceName}>{strings.voiceSettings.systemDefaultLabel}</Text>
        {selectedId === null ? <Text style={styles.selectedMark}>{strings.voiceSettings.selectedLabel}</Text> : null}
      </Pressable>

      {currentVoice ? (
        <View style={styles.currentVoiceBlock}>
          <Text style={styles.currentVoiceLabel}>{strings.voiceSettings.currentVoiceLabel}</Text>
          <View style={[styles.voiceRow, styles.voiceRowSelected]}>
            <View style={styles.voiceInfo}>
              <Text style={styles.voiceName}>{currentVoice.name}</Text>
              <Text style={styles.voiceLanguage}>{currentVoice.language}</Text>
            </View>
            <Pressable
              style={styles.previewButton}
              onPress={() => handlePreview(currentVoice)}
              accessibilityRole="button"
              accessibilityLabel={strings.voiceSettings.previewButtonLabel}
            >
              <Text style={styles.previewButtonText}>{strings.voiceSettings.previewButtonLabel}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <ToggleRow
        label={strings.voiceSettings.showLowQualityLabel}
        hint={strings.voiceSettings.showLowQualityHint}
        value={showLowQuality}
        onValueChange={handleToggleShowLowQuality}
      />

      <SectionList
        style={styles.sectionList}
        sections={sections}
        keyExtractor={(item) => item.identifier}
        ListEmptyComponent={
          voices === null ? (
            <Text style={styles.loadingText}>{strings.voiceSettings.loadingVoicesText}</Text>
          ) : (
            <Text style={styles.loadingText}>{strings.voiceSettings.noVoicesFoundText}</Text>
          )
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader} accessibilityRole="header">
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => {
          const isSelected = item.identifier === selectedId;
          return (
            <View style={[styles.voiceRow, isSelected && styles.voiceRowSelected]}>
              <Pressable
                style={styles.voiceInfo}
                onPress={() => handleSelect(item)}
                accessibilityRole="button"
                accessibilityLabel={strings.voiceSettings.voiceRowAccessibilityLabel(item.name, item.language)}
                accessibilityState={{ selected: isSelected }}
              >
                <Text style={styles.voiceName}>{item.name}</Text>
                <Text style={styles.voiceLanguage}>{item.language}</Text>
                {isSelected ? <Text style={styles.selectedMark}>{strings.voiceSettings.selectedLabel}</Text> : null}
              </Pressable>
              <Pressable
                style={styles.previewButton}
                onPress={() => handlePreview(item)}
                accessibilityRole="button"
                accessibilityLabel={strings.voiceSettings.previewButtonLabel}
              >
                <Text style={styles.previewButtonText}>{strings.voiceSettings.previewButtonLabel}</Text>
              </Pressable>
            </View>
          );
        }}
      />
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
  // Without flex: 1 here, the list has no bounded height to scroll within —
  // it just renders every row at its own natural size, so anything past
  // the visible screen is simply unreachable rather than scrollable.
  // Confirmed live 2026-09-05: voices sorting alphabetically after a
  // certain point (Spanish, after the English variants) never appeared no
  // matter how much was scrolled — this fixes that.
  sectionList: {
    flex: 1,
  },
  loadingText: {
    color: '#999',
    fontSize: 15,
    marginTop: 12,
  },
  chatterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1c1c1c',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    gap: 12,
  },
  chatterTextBlock: {
    flex: 1,
  },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1c1c1c',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  rateValue: {
    color: '#4f8cff',
    fontSize: 16,
    fontWeight: '700',
  },
  actionLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  chatterHint: {
    color: '#999',
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  currentVoiceBlock: {
    marginBottom: 16,
  },
  currentVoiceLabel: {
    color: '#999',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  sectionHeader: {
    color: '#999',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    backgroundColor: '#000',
    paddingTop: 14,
    paddingBottom: 6,
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1c1c1c',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  voiceRowSelected: {
    borderWidth: 1,
    borderColor: '#4f8cff',
  },
  voiceInfo: {
    flex: 1,
  },
  voiceName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  voiceLanguage: {
    color: '#999',
    fontSize: 13,
    marginTop: 2,
  },
  selectedMark: {
    color: '#4f8cff',
    fontSize: 13,
    marginTop: 4,
  },
  previewButton: {
    backgroundColor: '#2f6fed',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginLeft: 12,
  },
  previewButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
