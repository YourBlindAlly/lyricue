import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { searchSongWithAi } from '../aiSearch/aiSearchApi';
import { isAiSearchConfigured } from '../aiSearch/config';
import { LINK_HIT_SLOP } from '../ui/hitSlop';
import { useStrings } from '../i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'FindSong'>;

export function FindSongScreen({ navigation }: Props) {
  const strings = useStrings();
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [includeChords, setIncludeChords] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const configured = isAiSearchConfigured();
  const canSearch = configured && !isSearching && title.trim().length > 0;

  const handleSearch = async () => {
    setIsSearching(true);
    try {
      const result = await searchSongWithAi(title.trim(), artist.trim(), includeChords);
      // Land on the same paste/review screen as every other import path —
      // nothing gets saved to the library until Rusty reviews it and taps
      // Save, since an AI result could be wrong or garbled.
      navigation.navigate('NewSong', {
        prefill: { title: result.title, rawText: result.lyricsText },
        aiSearchMeta: {
          title: title.trim(),
          artist: artist.trim(),
          includeChords,
          sourceUrl: result.sourceUrl,
        },
      });
    } catch (err) {
      Alert.alert(strings.findSong.searchFailedTitle, err instanceof Error ? err.message : String(err));
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      onAccessibilityEscape={() => navigation.goBack()}
    >
      <View style={styles.headerRow}>
        <Pressable
          hitSlop={LINK_HIT_SLOP}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={strings.findSong.backButtonLabel}
        >
          <Text style={styles.backLink}>{strings.findSong.backButtonLabel}</Text>
        </Pressable>
        <Text style={styles.heading} accessibilityRole="header">
          {strings.findSong.heading}
        </Text>
      </View>

      {!configured ? (
        <Text style={styles.notConfiguredText}>{strings.findSong.notConfiguredText}</Text>
      ) : (
        <>
          <Text style={styles.experimentalNotice}>{strings.findSong.experimentalNoticeText}</Text>

          <Text style={styles.label} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {strings.findSong.titleLabel}
          </Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder={strings.findSong.titlePlaceholder}
            accessibilityLabel={strings.findSong.titleLabel}
            returnKeyType="next"
            editable={!isSearching}
          />

          <Text style={styles.label} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {strings.findSong.artistLabel}
          </Text>
          <TextInput
            style={styles.input}
            value={artist}
            onChangeText={setArtist}
            placeholder={strings.findSong.artistPlaceholder}
            accessibilityLabel={strings.findSong.artistAccessibilityLabel}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
            editable={!isSearching}
          />

          <Pressable
            style={styles.chordsRow}
            onPress={() => {
              if (!isSearching) setIncludeChords((current) => !current);
            }}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={strings.findSong.includeChordsLabel}
            accessibilityValue={{
              text: includeChords
                ? strings.findSong.includeChordsStateOnLabel
                : strings.findSong.includeChordsStateOffLabel,
            }}
            accessibilityHint={strings.findSong.includeChordsHint}
            accessibilityState={{ disabled: isSearching }}
            accessibilityActions={[
              { name: 'increment', label: strings.findSong.includeChordsOnActionLabel },
              { name: 'decrement', label: strings.findSong.includeChordsOffActionLabel },
            ]}
            onAccessibilityAction={(event) => {
              if (isSearching) return;
              if (event.nativeEvent.actionName === 'increment') {
                setIncludeChords(true);
              } else if (event.nativeEvent.actionName === 'decrement') {
                setIncludeChords(false);
              }
            }}
          >
            <Text style={styles.chordsLabel}>{strings.findSong.includeChordsLabel}</Text>
            <Switch value={includeChords} pointerEvents="none" />
          </Pressable>

          <Pressable
            style={[styles.searchButton, !canSearch && styles.searchButtonDisabled]}
            onPress={handleSearch}
            disabled={!canSearch}
            accessibilityRole="button"
            accessibilityLabel={isSearching ? strings.findSong.searchingLabel : strings.findSong.searchLabel}
            accessibilityState={{ disabled: !canSearch }}
          >
            {isSearching ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.searchButtonText}>{strings.findSong.searchLabel}</Text>
            )}
          </Pressable>

          <Text style={styles.hintText}>{strings.findSong.hintText}</Text>
        </>
      )}
    </KeyboardAvoidingView>
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
    gap: 14,
    marginBottom: 20,
  },
  backLink: {
    color: '#4f8cff',
    fontSize: 16,
  },
  heading: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  label: {
    color: '#bbb',
    fontSize: 14,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#1c1c1c',
    color: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  chordsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
  },
  chordsLabel: {
    color: '#fff',
    fontSize: 16,
  },
  searchButton: {
    backgroundColor: '#2f6fed',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  searchButtonDisabled: {
    backgroundColor: '#2a3a5c',
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  hintText: {
    color: '#999',
    fontSize: 13,
    marginTop: 12,
  },
  notConfiguredText: {
    color: '#999',
    fontSize: 15,
  },
  experimentalNotice: {
    color: '#e0a640',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
});
