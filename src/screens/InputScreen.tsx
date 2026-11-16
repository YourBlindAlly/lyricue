import React, { useState } from 'react';
import { AccessibilityInfo, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useAppState } from '../state/AppStateContext';
import { buildSong } from '../parsing/buildSong';
import { writeSongEditToDropbox } from '../cloud/dropbox/songWriteBack';
import { saveCopyToFiles } from '../library/saveCopyToFiles';
import { LINK_HIT_SLOP } from '../ui/hitSlop';
import { useStrings } from '../i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'NewSong'>;

export function InputScreen({ navigation, route }: Props) {
  const strings = useStrings();
  const editSong = route.params?.editSong;
  const { loadSong, updateSongInPlace } = useAppState();
  const [title, setTitle] = useState(editSong?.title ?? '');
  const [rawText, setRawText] = useState(editSong?.rawText ?? '');

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
    await loadSong(song);
    // Send the edit back to the song's Dropbox file in the background (or,
    // for a song made here, create its file in the notebook folder), so a
    // reinstall or Refresh Songs doesn't lose it. Never blocks leaving this
    // screen; the result is spoken by VoiceOver when it is known.
    writeSongEditToDropbox(song, editSong?.rawText ?? '')
      .then(async (outcome) => {
        if (outcome.kind === 'created') {
          // From now on the song points at its Dropbox file, so later edits write back to it.
          await updateSongInPlace({ ...song, source: { type: 'dropbox', path: outcome.path } });
          AccessibilityInfo.announceForAccessibility(strings.inputScreen.dropboxCreated);
        } else if (outcome.kind === 'createFailed') {
          AccessibilityInfo.announceForAccessibility(strings.inputScreen.dropboxCreateFailed);
        }
        if (outcome.kind === 'saved') {
          AccessibilityInfo.announceForAccessibility(strings.inputScreen.dropboxSaved);
        } else if (outcome.kind === 'queued') {
          AccessibilityInfo.announceForAccessibility(strings.inputScreen.dropboxQueued);
        } else if (outcome.kind === 'savedAsCopy') {
          AccessibilityInfo.announceForAccessibility(strings.inputScreen.dropboxSavedAsCopy(outcome.name));
        }
      })
      .catch(() => {});
    // popTo, not navigate — see PromptScreen's "Library" link for why. This
    // screen is always pushed on top of either an existing Prompt (editing)
    // or Library (new song); popTo correctly returns to that existing
    // Prompt in the first case, and replaces this screen with a fresh
    // Prompt (rather than leaving it stranded in history) in the second.
    navigation.popTo('Prompt');
  };

  const handleSaveCopyToFiles = () => {
    const built = buildSong(rawText, title, { type: 'manual' });
    saveCopyToFiles(built?.title ?? title, rawText).catch(() => {});
  };

  const handleCancel = () => {
    navigation.goBack();
  };

  return (
    // Escape mirrors the visible Cancel button exactly — lands back on
    // whichever screen actually opened this one (Library for a new song,
    // Prompt for editing an existing one), since handleCancel's plain
    // goBack() already handles both correctly. Same VoiceOver
    // two-finger-scrub support as PromptScreen. SafeAreaView (not
    // KeyboardAvoidingView) has to be the element actually carrying
    // onAccessibilityEscape — confirmed live 2026-09-15 that
    // KeyboardAvoidingView doesn't reliably forward the two-finger "Z"
    // scrub gesture the same way every other screen's root does.
    // KeyboardAvoidingView is kept nested inside, purely for its real
    // padding behavior (this screen's multiline lyrics box genuinely needs
    // it, unlike Search's single-line query field).
    <SafeAreaView style={styles.container} edges={['top']} onAccessibilityEscape={handleCancel}>
      <KeyboardAvoidingView style={styles.flexOne} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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

        <Pressable
          style={[styles.copyButton, !canLoad && styles.copyButtonDisabled]}
          onPress={handleSaveCopyToFiles}
          disabled={!canLoad}
          accessibilityRole="button"
          accessibilityLabel={strings.inputScreen.saveCopyToFilesLabel}
          accessibilityHint={strings.inputScreen.saveCopyToFilesHint}
          accessibilityState={{ disabled: !canLoad }}
        >
          <Text style={styles.copyButtonText}>{strings.inputScreen.saveCopyToFilesLabel}</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    padding: 20,
  },
  flexOne: {
    flex: 1,
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
  copyButton: {
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4f8cff',
    paddingVertical: 14,
    alignItems: 'center',
  },
  copyButtonDisabled: {
    borderColor: '#2a3a5c',
    opacity: 0.5,
  },
  copyButtonText: {
    color: '#4f8cff',
    fontSize: 17,
    fontWeight: '600',
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
