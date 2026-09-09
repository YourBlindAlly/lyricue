import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useAppState } from '../state/AppStateContext';
import { saveSetlist } from '../setlist/setlistStorage';
import type { SetlistEntry } from '../setlist/setlistCsv';
import type { Song } from '../types';
import { LINK_HIT_SLOP } from '../ui/hitSlop';
import { hintOrNone } from '../speech/reduceHintsPreference';
import { useStrings } from '../i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'SetlistCreator'>;

function entryFor(song: Song): SetlistEntry {
  return {
    title: song.title,
    path: song.source.type === 'dropbox' ? song.source.path : '',
  };
}

export function SetlistCreatorScreen({ navigation }: Props) {
  const strings = useStrings();
  const { library, reduceHints } = useAppState();
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState<SetlistEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const addedPaths = useMemo(
    () => new Set(entries.map((e) => e.path).filter((p) => p.length > 0)),
    [entries]
  );
  const addedTitles = useMemo(
    () => new Set(entries.filter((e) => !e.path).map((e) => e.title.toLowerCase())),
    [entries]
  );

  const isAdded = (song: Song) => {
    if (song.source.type === 'dropbox') {
      return addedPaths.has(song.source.path);
    }
    return addedTitles.has(song.title.toLowerCase());
  };

  const filteredLibrary = useMemo(() => {
    const term = search.trim().toLowerCase();
    const sorted = [...library].sort((a, b) => a.title.localeCompare(b.title));
    if (!term) {
      return sorted;
    }
    return sorted.filter((song) => song.title.toLowerCase().includes(term));
  }, [library, search]);

  const handleAdd = (song: Song) => {
    if (isAdded(song)) {
      return;
    }
    setEntries((current) => [...current, entryFor(song)]);
  };

  const handleRemove = (index: number) => {
    setEntries((current) => current.filter((_, i) => i !== index));
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    setEntries((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) {
        return current;
      }
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert(strings.setlistCreator.nameNeededAlertTitle, strings.setlistCreator.nameNeededAlertMessage);
      return;
    }
    if (entries.length === 0) {
      Alert.alert(strings.setlistCreator.noSongsAddedAlertTitle, strings.setlistCreator.noSongsAddedAlertMessage);
      return;
    }
    setIsSaving(true);
    try {
      await saveSetlist({ name: name.trim(), entries });
      navigation.goBack();
    } catch (err) {
      Alert.alert(strings.setlistCreator.saveFailedAlertTitle, err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerRow}>
        <Pressable
          hitSlop={LINK_HIT_SLOP}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={strings.setlistCreator.backButtonLabel}
        >
          <Text style={styles.backLink}>{strings.setlistCreator.backButtonLabel}</Text>
        </Pressable>
        <Text style={styles.heading} accessibilityRole="header">
          {strings.setlistCreator.heading}
        </Text>
      </View>

      <TextInput
        style={styles.nameInput}
        value={name}
        onChangeText={setName}
        placeholder={strings.setlistCreator.setlistNamePlaceholder}
        placeholderTextColor="#777"
        accessibilityLabel={strings.setlistCreator.setlistNamePlaceholder}
      />

      <View style={styles.currentSection}>
        <Text style={styles.sectionLabel} accessibilityRole="header">
          {strings.setlistCreator.songsInSetlistHeading(entries.length)}
        </Text>
        {entries.length === 0 ? (
          <Text style={styles.emptyText}>{strings.setlistCreator.nothingAddedText}</Text>
        ) : (
          entries.map((entry, index) => {
            const canMoveUp = index > 0;
            const canMoveDown = index < entries.length - 1;
            // Same VoiceOver custom-actions pattern as the Library screen's
            // rows: one focusable stop per entry instead of four, swipe up
            // or down to reach Move Up / Move Down / Remove. Only offering
            // the moves that are actually valid at each position (no "Move
            // Up" on the first entry, etc.) rather than a disabled action.
            const actions = [
              ...(canMoveUp ? [{ name: 'moveUp', label: strings.setlistCreator.moveUpActionLabel }] : []),
              ...(canMoveDown ? [{ name: 'moveDown', label: strings.setlistCreator.moveDownActionLabel }] : []),
              { name: 'remove', label: strings.setlistCreator.removeActionLabel },
            ];
            return (
              <Pressable
                key={`${entry.path || entry.title}-${index}`}
                style={styles.entryRow}
                onPress={() => {}}
                accessibilityRole="button"
                accessibilityLabel={strings.setlistCreator.entryAccessibilityLabel(index + 1, entry.title)}
                accessibilityHint={hintOrNone(strings.setlistCreator.entryHint, reduceHints)}
                accessibilityActions={actions}
                onAccessibilityAction={(event) => {
                  switch (event.nativeEvent.actionName) {
                    case 'moveUp':
                      handleMove(index, -1);
                      break;
                    case 'moveDown':
                      handleMove(index, 1);
                      break;
                    case 'remove':
                      handleRemove(index);
                      break;
                  }
                }}
              >
                <Text style={styles.entryPosition}>{index + 1}.</Text>
                <Text style={styles.entryTitle} numberOfLines={1}>
                  {entry.title}
                </Text>
              </Pressable>
            );
          })
        )}
      </View>

      <Pressable
        style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={isSaving}
        accessibilityRole="button"
        accessibilityLabel={isSaving ? strings.setlistCreator.savingLabel : strings.setlistCreator.saveSetlistLabel}
      >
        <Text style={styles.saveButtonText}>
          {isSaving ? strings.setlistCreator.savingLabel : strings.setlistCreator.saveSetlistLabel}
        </Text>
      </Pressable>

      <TextInput
        style={styles.searchInput}
        value={search}
        onChangeText={setSearch}
        placeholder={strings.setlistCreator.searchPlaceholder}
        placeholderTextColor="#777"
        accessibilityLabel={strings.setlistCreator.searchPlaceholder}
      />

      <FlatList
        data={filteredLibrary}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.emptyText}>{strings.setlistCreator.noSongsMatchText}</Text>}
        renderItem={({ item }) => {
          const added = isAdded(item);
          return (
            <Pressable
              style={[styles.libraryRow, added && styles.libraryRowAdded]}
              onPress={() => handleAdd(item)}
              disabled={added}
              accessibilityRole="button"
              accessibilityLabel={added ? strings.setlistCreator.addedAccessibilityLabel(item.title) : item.title}
              accessibilityHint={added ? undefined : hintOrNone(strings.setlistCreator.addHint, reduceHints)}
            >
              <Text style={styles.libraryTitle} numberOfLines={1}>
                {item.title}
              </Text>
              {added ? <Text style={styles.addedMark}>{strings.setlistCreator.addedMarkText}</Text> : null}
            </Pressable>
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
  nameInput: {
    backgroundColor: '#1c1c1c',
    color: '#fff',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  currentSection: {
    marginBottom: 12,
  },
  sectionLabel: {
    color: '#999',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyText: {
    color: '#999',
    fontSize: 14,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c1c',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    gap: 10,
  },
  entryPosition: {
    color: '#777',
    fontSize: 14,
    width: 20,
  },
  entryTitle: {
    color: '#fff',
    fontSize: 15,
    flex: 1,
  },
  saveButton: {
    backgroundColor: '#2f6fed',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  saveButtonDisabled: {
    backgroundColor: '#2a3a5c',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  searchInput: {
    backgroundColor: '#1c1c1c',
    color: '#fff',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  libraryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#141414',
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
  },
  libraryRowAdded: {
    opacity: 0.5,
  },
  libraryTitle: {
    color: '#fff',
    fontSize: 15,
    flex: 1,
  },
  addedMark: {
    color: '#9ad39a',
    fontSize: 13,
    marginLeft: 8,
  },
});
