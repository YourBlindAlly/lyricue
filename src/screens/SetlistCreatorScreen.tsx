import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useAppState } from '../state/AppStateContext';
import { deleteSetlist, loadSetlist, saveSetlist } from '../setlist/setlistStorage';
import type { SetlistEntry } from '../setlist/setlistCsv';
import { entryFor } from '../setlist/entryFor';
import { ensurePersonalCopyForSong } from '../search/backupSearchResult';
import type { Song } from '../types';
import { LINK_HIT_SLOP } from '../ui/hitSlop';
import { SwipeActionsRow, type SwipeAction } from '../ui/SwipeActionsRow';
import { hintOrNone } from '../speech/reduceHintsPreference';
import { useStrings } from '../i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'SetlistCreator'>;

export function SetlistCreatorScreen({ navigation, route }: Props) {
  const strings = useStrings();
  const { library, reduceHints, activeSetlist, startSetlist } = useAppState();
  const editSetlist = route.params?.editSetlist;
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState<SetlistEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  // Only meaningful while editing: whether the existing setlist's own data
  // has loaded yet, so the search/add UI below (which reads `entries`)
  // doesn't render against a still-empty list and let someone start adding
  // songs to what looks like an empty setlist before the real one arrives.
  const [isLoadingExisting, setIsLoadingExisting] = useState(!!editSetlist);

  useEffect(() => {
    if (!editSetlist) {
      return;
    }
    let cancelled = false;
    loadSetlist(editSetlist)
      .then((setlist) => {
        if (cancelled) return;
        setName(setlist.name);
        setEntries(setlist.entries);
        setIsLoadingExisting(false);
      })
      .catch((err) => {
        if (cancelled) return;
        Alert.alert(strings.setlistCreator.couldntLoadForEditingAlertTitle, err instanceof Error ? err.message : String(err));
        navigation.goBack();
      });
    return () => {
      cancelled = true;
    };
    // Deliberately run only once on mount — editSetlist identifies which
    // setlist to load, not something that should re-trigger a reload if it
    // happened to change identity across renders.
  }, []);

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

  // Deliberately empty with no search term — this used to list the WHOLE
  // library here for browsing/checking-off, which got cumbersome once a
  // library had hundreds of songs in it (raised by Rusty 2026-09-18). The
  // Library screen's own "Add to Setlist" swipe action is now the primary
  // way to build a setlist; this search box is just a fallback for adding
  // a song to a NON-active setlist being edited here, without needing to
  // leave this screen and make it active first.
  const filteredLibrary = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return [];
    }
    const sorted = [...library].sort((a, b) => a.title.localeCompare(b.title));
    return sorted.filter((song) => song.title.toLowerCase().includes(term));
  }, [library, search]);

  const handleAdd = async (song: Song) => {
    if (isAdded(song)) {
      return;
    }
    // A community-library song gets a copy in the user's own Dropbox and
    // the entry points at it; null (any other song) leaves the entry as-is.
    const personalPath = await ensurePersonalCopyForSong(song);
    setEntries((current) => [...current, entryFor(song, personalPath)]);
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
      const saved = { name: name.trim(), entries };
      await saveSetlist(saved);
      // saveSetlist upserts by NAME — if this was an edit and the name got
      // changed, that just created a second setlist under the new name
      // rather than renaming the original, leaving the old one behind.
      // Clean that up explicitly rather than orphaning it.
      if (editSetlist && editSetlist.name !== name.trim()) {
        await deleteSetlist(editSetlist);
      }
      // saveSetlist only updates the STORED setlist — if this is the one
      // currently playing, its own separate in-progress snapshot (song
      // position, etc.) doesn't pick up the edit on its own. Refresh it
      // here so editing the active setlist actually shows the change right
      // away instead of appearing to do nothing (Rusty's real report,
      // 2026-09-17 — he added a song via Edit and it correctly showed the
      // new count in this screen, but the setlist he was still following
      // kept showing the old one).
      if (editSetlist && activeSetlist?.setlist.name === editSetlist.name) {
        await startSetlist(saved);
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert(strings.setlistCreator.saveFailedAlertTitle, err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']} onAccessibilityEscape={() => navigation.goBack()}>
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
          {strings.setlistCreator.heading(!!editSetlist)}
        </Text>
      </View>

      {isLoadingExisting ? (
        <ActivityIndicator color="#fff" style={styles.spinner} />
      ) : (
        // Everything that used to sit as fixed content above this FlatList
        // (name field, the already-added songs, Save, the search box) now
        // lives in its ListHeaderComponent instead, making the WHOLE screen
        // one naturally scrolling column — the same fix already applied
        // once before to VoiceSettingsScreen for the identical bug: a fixed
        // block above a list can only grow, never shrink, so once the
        // setlist itself got long (40 songs, reported live 2026-09-17)
        // there was no way to reach entries or controls past whatever fit
        // on one screen. Folding everything into one list closes this bug
        // class permanently — no future addition to this screen can bring
        // it back, same reasoning as the original fix.
        <FlatList
          data={filteredLibrary}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <>
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
                    // Same VoiceOver custom-actions pattern as the Library
                    // screen's rows: one focusable stop per entry instead of
                    // four, swipe up or down to reach Move Up / Move Down /
                    // Remove. Only offering the moves that are actually
                    // valid at each position (no "Move Up" on the first
                    // entry, etc.) rather than a disabled action.
                    const actions = [
                      ...(canMoveUp ? [{ name: 'moveUp', label: strings.setlistCreator.moveUpActionLabel }] : []),
                      ...(canMoveDown
                        ? [{ name: 'moveDown', label: strings.setlistCreator.moveDownActionLabel }]
                        : []),
                      { name: 'remove', label: strings.setlistCreator.removeActionLabel },
                    ];
                    const swipeActions: SwipeAction[] = [
                      ...(canMoveUp
                        ? [{ key: 'moveUp', label: strings.setlistCreator.moveUpActionLabel, onPress: () => handleMove(index, -1) }]
                        : []),
                      ...(canMoveDown
                        ? [{ key: 'moveDown', label: strings.setlistCreator.moveDownActionLabel, onPress: () => handleMove(index, 1) }]
                        : []),
                      { key: 'remove', label: strings.setlistCreator.removeActionLabel, onPress: () => handleRemove(index), destructive: true },
                    ];
                    return (
                      <SwipeActionsRow
                        key={`${entry.path || entry.title}-${index}`}
                        containerStyle={styles.entryRowWrap}
                        actions={swipeActions}
                      >
                      <Pressable
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
                      </SwipeActionsRow>
                    );
                  })
                )}
              </View>

              <Pressable
                style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={isSaving}
                accessibilityRole="button"
                accessibilityLabel={
                  isSaving ? strings.setlistCreator.savingLabel : strings.setlistCreator.saveSetlistLabel(!!editSetlist)
                }
              >
                <Text style={styles.saveButtonText}>
                  {isSaving ? strings.setlistCreator.savingLabel : strings.setlistCreator.saveSetlistLabel(!!editSetlist)}
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
            </>
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {search.trim()
                ? strings.setlistCreator.noSongsMatchText
                : strings.setlistCreator.addFromLibraryInstructionText}
            </Text>
          }
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
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    padding: 20,
  },
  spinner: {
    marginTop: 20,
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
  entryRowWrap: {
    marginBottom: 6,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c1c',
    borderRadius: 8,
    padding: 10,
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
