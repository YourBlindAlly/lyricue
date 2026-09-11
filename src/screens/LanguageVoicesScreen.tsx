import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import type { Voice } from 'expo-speech';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import {
  loadLanguageVoiceMap,
  setLanguageVoice,
  removeLanguageVoice,
  type LanguageVoiceMap,
} from '../speech/languageVoicePreference';
import { languageCatalog } from '../speech/languageCatalog';
import { languageDisplayName, groupVoicesByLanguage } from '../speech/groupVoicesByLanguage';
import { LINK_HIT_SLOP, ROW_LINK_HIT_SLOP } from '../ui/hitSlop';
import { useStrings } from '../i18n';
import { useAppState } from '../state/AppStateContext';
import { hintOrNone } from '../speech/reduceHintsPreference';

type Props = NativeStackScreenProps<RootStackParamList, 'LanguageVoices'>;

export function LanguageVoicesScreen({ navigation }: Props) {
  const strings = useStrings();
  const { reduceHints } = useAppState();
  const [map, setMap] = useState<LanguageVoiceMap>({});
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const catalog = useMemo(() => languageCatalog(), []);
  const [addLanguageCode, setAddLanguageCode] = useState(catalog[0]?.code ?? 'en');
  // Non-null while choosing a voice for a language — either adding a fresh
  // one or changing an existing entry, both go through the same picker.
  const [pickingForCode, setPickingForCode] = useState<string | null>(null);

  useEffect(() => {
    loadLanguageVoiceMap().then(setMap);
    Speech.getAvailableVoicesAsync().then(setVoices);
  }, []);

  const sections = useMemo(() => (voices ? groupVoicesByLanguage(voices) : []), [voices]);

  const voiceNameFor = (identifier: string): string =>
    voices?.find((v) => v.identifier === identifier)?.name ?? identifier;

  const handleChooseVoice = async (voice: Voice) => {
    if (!pickingForCode) return;
    const updated = await setLanguageVoice(pickingForCode, voice.identifier);
    setMap(updated);
    setPickingForCode(null);
  };

  const handleRemove = async (code: string) => {
    const updated = await removeLanguageVoice(code);
    setMap(updated);
  };

  const handleAdjustLanguage = (direction: 'increment' | 'decrement') => {
    setAddLanguageCode((current) => {
      const idx = catalog.findIndex((entry) => entry.code === current);
      const nextIdx =
        direction === 'increment' ? (idx + 1) % catalog.length : (idx - 1 + catalog.length) % catalog.length;
      return catalog[nextIdx].code;
    });
  };

  if (pickingForCode) {
    return (
      // Escape here cancels the voice picker back to the main list (the
      // same thing its own visible Back link does), not a full navigation
      // pop — this sub-view is local state, not a separate route.
      <SafeAreaView style={styles.container} edges={['top']} onAccessibilityEscape={() => setPickingForCode(null)}>
        <View style={styles.headerRow}>
          <Pressable
            hitSlop={LINK_HIT_SLOP}
            onPress={() => setPickingForCode(null)}
            accessibilityRole="button"
            accessibilityLabel={strings.languageVoices.backButtonLabel}
          >
            <Text style={styles.backLink}>{strings.languageVoices.backButtonLabel}</Text>
          </Pressable>
          <Text style={styles.heading} accessibilityRole="header">
            {strings.languageVoices.pickerHeading(languageDisplayName(pickingForCode))}
          </Text>
        </View>
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
          renderItem={({ item }) => (
            <Pressable
              style={styles.voiceRow}
              onPress={() => handleChooseVoice(item)}
              accessibilityRole="button"
              accessibilityLabel={strings.voiceSettings.voiceRowAccessibilityLabel(item.name, item.language)}
            >
              <Text style={styles.voiceName}>{item.name}</Text>
              <Text style={styles.voiceLanguage}>{item.language}</Text>
            </Pressable>
          )}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']} onAccessibilityEscape={() => navigation.goBack()}>
      <View style={styles.headerRow}>
        <Pressable
          hitSlop={LINK_HIT_SLOP}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={strings.languageVoices.backButtonLabel}
        >
          <Text style={styles.backLink}>{strings.languageVoices.backButtonLabel}</Text>
        </Pressable>
        <Text style={styles.heading} accessibilityRole="header">
          {strings.languageVoices.heading}
        </Text>
      </View>

      <ScrollView>
        <Text style={styles.introText}>{strings.languageVoices.introText}</Text>

        {Object.keys(map).length === 0 ? (
          <Text style={styles.emptyText}>{strings.languageVoices.emptyText}</Text>
        ) : (
          Object.entries(map).map(([code, voiceId]) => (
            <View key={code} style={styles.entryRow}>
              <Pressable
                style={styles.entryInfo}
                onPress={() => setPickingForCode(code)}
                accessibilityRole="button"
                accessibilityLabel={strings.languageVoices.entryAccessibilityLabel(
                  languageDisplayName(code),
                  voiceNameFor(voiceId)
                )}
                accessibilityHint={hintOrNone(strings.languageVoices.entryHint, reduceHints)}
              >
                <Text style={styles.entryLanguage}>{languageDisplayName(code)}</Text>
                <Text style={styles.entryVoice}>{voiceNameFor(voiceId)}</Text>
              </Pressable>
              <Pressable
                hitSlop={ROW_LINK_HIT_SLOP}
                style={styles.removeButton}
                onPress={() => handleRemove(code)}
                accessibilityRole="button"
                accessibilityLabel={strings.languageVoices.removeButtonLabel(languageDisplayName(code))}
              >
                <Text style={styles.removeButtonText}>{strings.languageVoices.removeButtonLabel2}</Text>
              </Pressable>
            </View>
          ))
        )}

        <Text style={styles.addHeading} accessibilityRole="header">
          {strings.languageVoices.addHeading}
        </Text>

        <View
          style={styles.addLanguageRow}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={strings.languageVoices.addLanguageText}
          accessibilityValue={{ text: languageDisplayName(addLanguageCode) }}
          accessibilityHint={hintOrNone(strings.languageVoices.addLanguageHint, reduceHints)}
          accessibilityActions={[
            { name: 'increment', label: strings.languageVoices.nextLanguageActionLabel },
            { name: 'decrement', label: strings.languageVoices.previousLanguageActionLabel },
          ]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'increment') {
              handleAdjustLanguage('increment');
            } else if (event.nativeEvent.actionName === 'decrement') {
              handleAdjustLanguage('decrement');
            }
          }}
        >
          <Text style={styles.actionLabel}>{strings.languageVoices.addLanguageText}</Text>
          <Text style={styles.addLanguageValue}>{languageDisplayName(addLanguageCode)}</Text>
        </View>

        <Pressable
          style={styles.chooseVoiceButton}
          onPress={() => setPickingForCode(addLanguageCode)}
          accessibilityRole="button"
          accessibilityLabel={strings.languageVoices.chooseVoiceButtonLabel(languageDisplayName(addLanguageCode))}
        >
          <Text style={styles.chooseVoiceButtonText}>
            {strings.languageVoices.chooseVoiceButtonLabel(languageDisplayName(addLanguageCode))}
          </Text>
        </Pressable>
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
    flexShrink: 1,
  },
  introText: {
    color: '#999',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  emptyText: {
    color: '#999',
    fontSize: 15,
    marginBottom: 16,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1c1c1c',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  entryInfo: {
    flex: 1,
  },
  entryLanguage: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  entryVoice: {
    color: '#999',
    fontSize: 13,
    marginTop: 2,
  },
  removeButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  removeButtonText: {
    color: '#ff6b6b',
    fontSize: 14,
    fontWeight: '600',
  },
  addHeading: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 24,
    marginBottom: 12,
  },
  addLanguageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1c1c1c',
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },
  actionLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  addLanguageValue: {
    color: '#4f8cff',
    fontSize: 16,
    fontWeight: '700',
  },
  chooseVoiceButton: {
    backgroundColor: '#2f6fed',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 24,
  },
  chooseVoiceButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionList: {
    flex: 1,
  },
  loadingText: {
    color: '#999',
    fontSize: 15,
    marginTop: 12,
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
  voiceName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  voiceLanguage: {
    color: '#999',
    fontSize: 13,
  },
});
