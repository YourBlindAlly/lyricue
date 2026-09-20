import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useAppState } from '../state/AppStateContext';
import { pickAndImportLocalFile } from '../library/importLocalFile';
import {
  DEFAULT_SORT_MODE,
  loadLibrarySortMode,
  nextSortMode,
  previousSortMode,
  saveLibrarySortMode,
  SORT_MODE_LABEL,
} from '../library/librarySortPreference';
import { artistFor, sortLibraryForDisplay } from '../library/sortLibrary';
import { hintOrNone } from '../speech/reduceHintsPreference';
import { LINK_HIT_SLOP } from '../ui/hitSlop';
import { SwipeActionsRow } from '../ui/SwipeActionsRow';
import { useStrings } from '../i18n';
import type { Song } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Library'>;

type SongRowProps = {
  song: Song;
  accessibilityLabel: string;
  accessibilityHint: string | undefined;
  editActionLabel: string;
  deleteActionLabel: string;
  addToSetlistActionLabel: string;
  sourceLabel: string;
  onPress: (song: Song) => void;
  onEdit: (song: Song) => void;
  onDelete: (song: Song) => void;
  onAddToSetlist: (song: Song) => void;
};

// Its own memoized component, not an inline function inside FlatList's
// renderItem, specifically so a library resort (which touches every row's
// position, not its content) doesn't force every visible row to fully
// re-render — React can recognize an unchanged song (same id, same props)
// and skip re-rendering it even though its position in the list moved,
// as long as the callback props below stay referentially stable too.
const SongRow = React.memo(function SongRow({
  song,
  accessibilityLabel,
  accessibilityHint,
  editActionLabel,
  deleteActionLabel,
  addToSetlistActionLabel,
  sourceLabel,
  onPress,
  onEdit,
  onDelete,
  onAddToSetlist,
}: SongRowProps) {
  return (
    <SwipeActionsRow
      containerStyle={styles.songRowWrap}
      actions={[
        { key: 'add', label: addToSetlistActionLabel, onPress: () => onAddToSetlist(song) },
        { key: 'edit', label: editActionLabel, onPress: () => onEdit(song) },
        { key: 'delete', label: deleteActionLabel, onPress: () => onDelete(song), destructive: true },
      ]}
    >
    <Pressable
      style={styles.songRow}
      onPress={() => onPress(song)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      // VoiceOver custom actions — swipe up/down while this row has focus
      // to cycle through Edit/Delete, double-tap to perform whichever is
      // selected — instead of separate Edit/Remove buttons that used to
      // cost two extra swipe-stops per song just to move to the next one.
      accessibilityActions={[
        { name: 'edit', label: editActionLabel },
        { name: 'delete', label: deleteActionLabel },
        { name: 'addToSetlist', label: addToSetlistActionLabel },
      ]}
      onAccessibilityAction={(event) => {
        switch (event.nativeEvent.actionName) {
          case 'edit':
            onEdit(song);
            break;
          case 'delete':
            onDelete(song);
            break;
          case 'addToSetlist':
            onAddToSetlist(song);
            break;
        }
      }}
    >
      <Text style={styles.songTitle} numberOfLines={1}>
        {song.title}
      </Text>
      <Text style={styles.songSource}>{sourceLabel}</Text>
    </Pressable>
    </SwipeActionsRow>
  );
});

export function LibraryScreen({ navigation }: Props) {
  const strings = useStrings();
  const SOURCE_LABEL: Record<Song['source']['type'], string> = {
    manual: strings.library.sourceLabelPasted,
    file: strings.library.sourceLabelImportedFile,
    dropbox: strings.library.sourceLabelDropbox,
    search: strings.library.sourceLabelSearch,
    demo: strings.library.sourceLabelDemoSong,
  };
  const {
    library,
    isLibraryLoaded,
    loadSong,
    removeFromLibrary,
    reduceHints,
    activeSetlist,
    addSongToActiveSetlist,
    createSetlistWithSong,
    clearSetlist,
    startOverSetlist,
    resumeSetlist,
  } = useAppState();
  const [isImporting, setIsImporting] = useState(false);
  const [sortMode, setSortMode] = useState(DEFAULT_SORT_MODE);
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditingSearch, setIsEditingSearch] = useState(false);
  const searchInputRef = useRef<TextInput>(null);

  // Raised by Rusty 2026-09-15: no way to get back to the full library once
  // you'd started typing in this box — shown while actively editing it, OR
  // whenever a search is still narrowing the list (so it's still reachable
  // after tapping away from the field with results on screen, not just
  // while the keyboard is up). Clears the query AND blurs the field, so a
  // single tap always gets the whole library back regardless of which of
  // the two states triggered it.
  const showCancelSearch = isEditingSearch || searchQuery.trim().length > 0;
  const handleCancelSearch = () => {
    setSearchQuery('');
    searchInputRef.current?.blur();
  };

  useEffect(() => {
    loadLibrarySortMode().then(setSortMode);
  }, []);

  // Swipe up/down while focused (VoiceOver's native "adjustable" gesture) is
  // the primary way to change this, per the standing rule that every
  // adjustable control defaults to swipe first — tap still cycles forward
  // as the sighted/no-VoiceOver fallback.
  const handleAdjustSort = (direction: 'increment' | 'decrement') => {
    setSortMode((current) => {
      const next = direction === 'increment' ? nextSortMode(current) : previousSortMode(current);
      void saveLibrarySortMode(next);
      return next;
    });
  };

  // 'newest' relies on `library` already arriving newest-first from
  // upsertLibrarySong/loadLibrary — sortLibraryForDisplay leaves that order
  // untouched and only actually re-sorts for the other two modes.
  const sortedLibrary = useMemo(
    () => sortLibraryForDisplay(library, sortMode),
    [library, sortMode]
  );

  // Filters the already-sorted list rather than re-deriving order, so
  // typing a search never changes result ordering out from under you —
  // it just narrows the same list down. Matches on title always; artist
  // only when one can be extracted (Dropbox-sourced songs named "Title -
  // Artist", same helper the artist sort mode already uses).
  const filteredLibrary = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return sortedLibrary;
    return sortedLibrary.filter((song) => {
      if (song.title.toLowerCase().includes(query)) return true;
      const artist = artistFor(song);
      return artist ? artist.toLowerCase().includes(query) : false;
    });
  }, [sortedLibrary, searchQuery]);

  // Plain navigate (not popTo) is correct here specifically because Library
  // is always the root screen when this fires — every "return to Library"
  // link elsewhere uses popTo, which fully collapses the stack back down to
  // just this screen, so Prompt never exists yet at this point and a normal
  // push is exactly right.
  const handleOpenSong = useCallback(
    async (song: Song) => {
      await loadSong(song);
      navigation.navigate('Prompt');
    },
    [loadSong, navigation]
  );

  const handleImportFile = async () => {
    setIsImporting(true);
    try {
      // The system file picker has been observed to hang indefinitely when
      // browsing into some third-party cloud providers (Google Drive's Files
      // extension in particular) instead of resolving or rejecting — without
      // this timeout, that leaves the button stuck disabled until the app is
      // force-quit. Dropbox's own dedicated screen doesn't have this problem.
      const song = await Promise.race([
        pickAndImportLocalFile(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), 30000)
        ),
      ]);
      if (song) {
        await loadSong(song);
        navigation.navigate('Prompt');
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'TIMEOUT') {
        Alert.alert(
          strings.library.filePickerUnresponsiveTitle,
          strings.library.filePickerUnresponsiveMessage
        );
      } else {
        Alert.alert(strings.library.importFailedTitle, err instanceof Error ? err.message : String(err));
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleRemove = useCallback(
    (song: Song) => {
      Alert.alert(strings.library.removeSongAlertTitle, strings.library.removeSongAlertMessage(song.title), [
        { text: strings.library.cancelLabel, style: 'cancel' },
        { text: strings.library.removeLabel, style: 'destructive', onPress: () => removeFromLibrary(song.id) },
      ]);
    },
    [strings, removeFromLibrary]
  );

  const handleEditSong = useCallback(
    (song: Song) => {
      navigation.navigate('NewSong', { editSong: song });
    },
    [navigation]
  );

  // "Add to setlist" quick action — raised by Rusty 2026-09-17 to skip
  // navigating to the setlist editor just to queue up one more song.
  // With no setlist currently active, this starts a brand new one so it
  // becomes the active setlist immediately: a second quick-add right after
  // lands in that SAME setlist rather than spawning another one, since the
  // action's behavior/label depends entirely on whether a setlist is active.
  const handleAddToSetlist = useCallback(
    (song: Song) => {
      if (activeSetlist) {
        const setlistName = activeSetlist.setlist.name;
        addSongToActiveSetlist(song).then(({ added }) => {
          AccessibilityInfo.announceForAccessibility(
            added
              ? strings.library.addedToSetlistAnnouncement(setlistName)
              : strings.library.alreadyInSetlistAnnouncement(setlistName)
          );
        });
        return;
      }
      // Date-qualified default name, not a static "New Setlist" — saveSetlist
      // upserts local setlists BY NAME, so a static default would silently
      // merge a second quick-started setlist into the first one instead of
      // creating a separate one.
      const defaultName = strings.library.newSetlistDefaultName(
        new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
      );
      Alert.prompt(
        strings.library.newSetlistPromptTitle,
        undefined,
        [
          { text: strings.library.cancelLabel, style: 'cancel' },
          {
            text: strings.library.createSetlistLabel,
            onPress: (enteredName?: string) => {
              const finalName = (enteredName ?? '').trim() || defaultName;
              createSetlistWithSong(finalName, song).then(() => {
                AccessibilityInfo.announceForAccessibility(
                  strings.library.newSetlistCreatedAnnouncement(finalName)
                );
              });
            },
          },
        ],
        'plain-text',
        defaultName
      );
    },
    [activeSetlist, addSongToActiveSetlist, createSetlistWithSong, strings]
  );

  // Resume button (shown only while a setlist is active): plain activation
  // goes back into the setlist where it left off; the VoiceOver custom
  // actions start it over or stop following it, so neither needs a trip to
  // the Setlists screen. Plain navigate is right here for the same reason
  // as handleOpenSong: Library is the root, so Prompt never already exists.
  const handleResume = useCallback(async () => {
    await resumeSetlist();
    navigation.navigate('Prompt');
  }, [resumeSetlist, navigation]);

  const handleStartOver = useCallback(async () => {
    const song = await startOverSetlist();
    if (song) {
      navigation.navigate('Prompt');
    }
  }, [startOverSetlist, navigation]);

  const addToSetlistActionLabel = activeSetlist
    ? strings.library.addToSetlistActionLabel(activeSetlist.setlist.name)
    : strings.library.addToNewSetlistActionLabel;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.heading} accessibilityRole="header">
          {strings.library.heading}
        </Text>
        <Pressable
          hitSlop={LINK_HIT_SLOP}
          onPress={() => navigation.navigate('About')}
          accessibilityRole="button"
          accessibilityLabel={strings.library.infoAccessibilityLabel}
        >
          <Text style={styles.aboutLink}>{strings.library.infoLinkText}</Text>
        </Pressable>
      </View>

      {/* Ordered by how often each is actually used — Dropbox and Setlists
          first, Import File last, since it's both the least-used path now
          that Dropbox works well and the one with a known reliability issue
          (the system file picker can hang browsing into Google Drive). */}
      {activeSetlist ? (
        <SwipeActionsRow
          containerStyle={styles.resumeWrap}
          actions={[
            { key: 'startOver', label: strings.library.startOverActionLabel, onPress: () => void handleStartOver() },
            {
              key: 'stop',
              label: strings.library.stopFollowingActionLabel,
              onPress: () => void clearSetlist(),
              destructive: true,
            },
          ]}
        >
        <Pressable
          style={styles.resumeButton}
          onPress={() => void handleResume()}
          accessibilityRole="button"
          accessibilityLabel={strings.library.resumeSetlistLabel(
            activeSetlist.setlist.name,
            activeSetlist.currentIndex + 1,
            activeSetlist.setlist.entries.length
          )}
          accessibilityHint={hintOrNone(strings.library.resumeSetlistHint, reduceHints)}
          accessibilityActions={[
            { name: 'startOver', label: strings.library.startOverActionLabel },
            { name: 'stop', label: strings.library.stopFollowingActionLabel },
          ]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'startOver') {
              void handleStartOver();
            } else if (event.nativeEvent.actionName === 'stop') {
              void clearSetlist();
            }
          }}
        >
          <Text style={styles.resumeButtonText} numberOfLines={2}>
            {strings.library.resumeSetlistLabel(
              activeSetlist.setlist.name,
              activeSetlist.currentIndex + 1,
              activeSetlist.setlist.entries.length
            )}
          </Text>
        </Pressable>
        </SwipeActionsRow>
      ) : null}

      <View style={styles.actionsRow}>
        <Pressable
          style={styles.actionButton}
          onPress={() => navigation.navigate('DropboxBrowse')}
          accessibilityRole="button"
          accessibilityLabel={strings.library.dropboxButtonLabel}
        >
          <Text style={styles.actionButtonText}>{strings.library.dropboxButtonLabel}</Text>
        </Pressable>
        <Pressable
          style={styles.actionButton}
          onPress={() => navigation.navigate('Setlists')}
          accessibilityRole="button"
          accessibilityLabel={strings.library.setlistsButtonLabel}
        >
          <Text style={styles.actionButtonText}>{strings.library.setlistsButtonLabel}</Text>
        </Pressable>
        <Pressable
          style={styles.actionButton}
          onPress={() => navigation.navigate('NewSong')}
          accessibilityRole="button"
          accessibilityLabel={strings.library.addSongButtonLabel}
        >
          <Text style={styles.actionButtonText}>{strings.library.addSongButtonLabel}</Text>
        </Pressable>
        <Pressable
          style={styles.actionButton}
          onPress={() => navigation.navigate('Search')}
          accessibilityRole="button"
          accessibilityLabel={strings.library.searchButtonLabel}
        >
          <Text style={styles.actionButtonText}>{strings.library.searchButtonLabel}</Text>
        </Pressable>
        <Pressable
          style={styles.actionButton}
          onPress={handleImportFile}
          disabled={isImporting}
          accessibilityRole="button"
          accessibilityLabel={isImporting ? strings.library.importingLabel : strings.library.importFileLabel}
        >
          <Text style={styles.actionButtonText}>
            {isImporting ? strings.library.importingLabel : strings.library.importFileLabel}
          </Text>
        </Pressable>
      </View>

      {isLibraryLoaded && library.length > 0 ? (
        <Pressable
          style={styles.sortButton}
          onPress={() => handleAdjustSort('increment')}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={strings.library.sortText}
          accessibilityValue={{ text: SORT_MODE_LABEL[sortMode] }}
          accessibilityHint={hintOrNone(strings.library.sortButtonHint, reduceHints)}
          accessibilityActions={[
            { name: 'increment', label: strings.library.nextSortActionLabel },
            { name: 'decrement', label: strings.library.previousSortActionLabel },
          ]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'increment') {
              handleAdjustSort('increment');
            } else if (event.nativeEvent.actionName === 'decrement') {
              handleAdjustSort('decrement');
            }
          }}
        >
          <Text style={styles.sortButtonText}>{strings.library.sortButtonLabel(SORT_MODE_LABEL[sortMode])}</Text>
        </Pressable>
      ) : null}

      {isLibraryLoaded && library.length > 0 ? (
        <>
          <Text style={styles.searchLabel} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {strings.library.searchLabel}
          </Text>
          <View style={styles.searchRow}>
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={strings.library.searchPlaceholder}
              placeholderTextColor="#777"
              accessibilityLabel={strings.library.searchAccessibilityLabel}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
              onFocus={() => setIsEditingSearch(true)}
              onBlur={() => setIsEditingSearch(false)}
            />
            {showCancelSearch && (
              <Pressable
                hitSlop={LINK_HIT_SLOP}
                onPress={handleCancelSearch}
                accessibilityRole="button"
                accessibilityLabel={strings.library.cancelSearchLabel}
              >
                <Text style={styles.cancelSearchLink}>{strings.library.cancelSearchLabel}</Text>
              </Pressable>
            )}
          </View>
        </>
      ) : null}

      {isLibraryLoaded && library.length === 0 ? (
        <Text style={styles.emptyText}>{strings.library.emptyLibraryText}</Text>
      ) : isLibraryLoaded && searchQuery.trim() && filteredLibrary.length === 0 ? (
        <Text style={styles.emptyText}>{strings.library.noSearchResultsText(searchQuery.trim())}</Text>
      ) : (
        <FlatList
          data={filteredLibrary}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SongRow
              song={item}
              accessibilityLabel={strings.library.songRowAccessibilityLabel(item.title, SOURCE_LABEL[item.source.type])}
              accessibilityHint={hintOrNone(strings.library.songRowAccessibilityHint, reduceHints)}
              editActionLabel={strings.library.editActionLabel}
              deleteActionLabel={strings.library.deleteActionLabel}
              addToSetlistActionLabel={addToSetlistActionLabel}
              sourceLabel={SOURCE_LABEL[item.source.type]}
              onPress={handleOpenSong}
              onEdit={handleEditSong}
              onDelete={handleRemove}
              onAddToSetlist={handleAddToSetlist}
            />
          )}
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
  aboutLink: {
    color: '#4f8cff',
    fontSize: 16,
  },
  resumeWrap: {
    marginBottom: 14,
  },
  resumeButton: {
    backgroundColor: '#1f7a3d',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  resumeButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  actionButton: {
    backgroundColor: '#2f6fed',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    color: '#999',
    fontSize: 15,
    marginTop: 12,
  },
  sortButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#1c1c1c',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  sortButtonText: {
    color: '#4f8cff',
    fontSize: 14,
    fontWeight: '600',
  },
  searchLabel: {
    color: '#bbb',
    fontSize: 14,
    marginBottom: 6,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#1c1c1c',
    color: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  cancelSearchLink: {
    color: '#4f8cff',
    fontSize: 16,
  },
  songRowWrap: {
    marginBottom: 10,
  },
  songRow: {
    backgroundColor: '#1c1c1c',
    borderRadius: 10,
    padding: 14,
  },
  songTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  songSource: {
    color: '#999',
    fontSize: 13,
    marginTop: 2,
  },
});
