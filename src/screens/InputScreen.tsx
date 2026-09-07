import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useAppState } from '../state/AppStateContext';
import { buildSong } from '../parsing/buildSong';
import { sendSearchFeedback } from '../aiSearch/aiSearchApi';
import { LINK_HIT_SLOP } from '../ui/hitSlop';
import { useStrings } from '../i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'NewSong'>;

export function InputScreen({ navigation, route }: Props) {
  const strings = useStrings();
  const editSong = route.params?.editSong;
  const prefill = route.params?.prefill;
  const aiSearchMeta = route.params?.aiSearchMeta;
  const { loadSong } = useAppState();
  const [title, setTitle] = useState(editSong?.title ?? prefill?.title ?? '');
  const [rawText, setRawText] = useState(editSong?.rawText ?? prefill?.rawText ?? '');

  const canLoad = rawText.trim().length > 0;

  const handleLoad = async () => {
    const song = buildSong(rawText, title, editSong?.source ?? { type: 'manual' });
    if (!song) {
      return;
    }
    // Editing an existing song updates it in place rather than adding a
    // duplicate library entry.
    if (editSong) {
      song.id = editSong.id;
      song.addedAt = editSong.addedAt;
    }
    if (aiSearchMeta) {
      sendSearchFeedback({ ...aiSearchMeta, rating: 'accepted' });
    }
    await loadSong(song);
    // popTo, not navigate — see PromptScreen's "Library" link for why. This
    // screen is always pushed on top of either an existing Prompt (editing)
    // or Library (new song); popTo correctly returns to that existing
    // Prompt in the first case, and replaces this screen with a fresh
    // Prompt (rather than leaving it stranded in history) in the second.
    navigation.popTo('Prompt');
  };

  const handleCancel = () => {
    if (aiSearchMeta) {
      sendSearchFeedback({ ...aiSearchMeta, rating: 'rejected' });
    }
    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.headerRow}>
        <Text style={styles.heading} accessibilityRole="header">
          {editSong ? strings.inputScreen.editHeading : strings.inputScreen.addHeading}
        </Text>
        <Pressable
          hitSlop={LINK_HIT_SLOP}
          onPress={handleCancel}
          accessibilityRole="button"
          accessibilityLabel={strings.inputScreen.cancelLabel}
        >
          <Text style={styles.cancelLink}>{strings.inputScreen.cancelLabel}</Text>
        </Pressable>
      </View>

      <Text style={styles.label} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {strings.inputScreen.titleLabel}
      </Text>
      <TextInput
        style={styles.titleInput}
        value={title}
        onChangeText={setTitle}
        placeholder={strings.inputScreen.titlePlaceholder}
        accessibilityLabel={strings.inputScreen.titleLabel}
        returnKeyType="next"
      />

      <Text style={styles.label} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {strings.inputScreen.lyricsLabel}
      </Text>
      <TextInput
        style={styles.bodyInput}
        value={rawText}
        onChangeText={setRawText}
        placeholder={strings.inputScreen.lyricsPlaceholder}
        placeholderTextColor="#8a8a8a"
        multiline
        textAlignVertical="top"
        accessibilityLabel={strings.inputScreen.lyricsLabel}
      />

      <Pressable
        style={[styles.loadButton, !canLoad && styles.loadButtonDisabled]}
        onPress={handleLoad}
        disabled={!canLoad}
        accessibilityRole="button"
        accessibilityLabel={editSong ? strings.inputScreen.saveChangesLabel : strings.inputScreen.loadSongLabel}
        accessibilityState={{ disabled: !canLoad }}
      >
        <Text style={styles.loadButtonText}>
          {editSong ? strings.inputScreen.saveChangesLabel : strings.inputScreen.loadSongLabel}
        </Text>
      </Pressable>
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
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  heading: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  cancelLink: {
    color: '#4f8cff',
    fontSize: 16,
  },
  label: {
    color: '#bbb',
    fontSize: 14,
    marginBottom: 6,
    marginTop: 10,
  },
  titleInput: {
    backgroundColor: '#1c1c1c',
    color: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  bodyInput: {
    flex: 1,
    backgroundColor: '#1c1c1c',
    color: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    marginBottom: 16,
  },
  loadButton: {
    backgroundColor: '#2f6fed',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  loadButtonDisabled: {
    backgroundColor: '#2a3a5c',
  },
  loadButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});
