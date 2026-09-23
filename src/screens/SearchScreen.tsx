import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useAppState } from '../state/AppStateContext';
import { buildSongFromFile } from '../parsing/buildSong';
import { fetchSearchResult, searchLibrary, type SearchResult } from '../search/searchApi';
import { upgradeSearchSongSource } from '../search/backupSearchResult';
import { isSearchConfigured } from '../search/config';
import { LINK_HIT_SLOP } from '../ui/hitSlop';
import { useStrings } from '../i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'Search'>;

// Tapping a result downloads and loads it straight into the library, no
// review screen in between — unlike the retired AI-search flow, these are
// real curated files, not AI-generated text that might come back wrong or
// garbled, so the same "trust it, land on Prompt" pattern the Dropbox
// browse screen already uses for the personal library fits here too.
export function SearchScreen({ navigation }: Props) {
  const strings = useStrings();
  const { loadSong, addToLibrary } = useAppState();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const [isEditingQuery, setIsEditingQuery] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const configured = isSearchConfigured();
  const canSearch = configured && !isSearching && query.trim().length > 0;

  // Blurs the field and dismisses the keyboard without submitting or
  // navigating away — raised by Rusty 2026-09-15: typing something in, then
  // changing your mind, had no way to just stop editing and stay on this
  // screen (Return submits, the two-finger scrub leaves the screen
  // entirely). Same "Cancel next to the search box" pattern iOS's own
  // Settings/Messages search bars use, not something invented here.
  const handleCancelEditing = () => {
    inputRef.current?.blur();
  };

  const handleSearch = async () => {
    setIsSearching(true);
    setResults(null);
    try {
      const found = await searchLibrary(query.trim());
      setResults(found);
    } catch (err) {
      Alert.alert(strings.search.searchFailedTitle, err instanceof Error ? err.message : String(err));
    } finally {
      setIsSearching(false);
    }
  };

  const handleResultPress = async (result: SearchResult) => {
    setLoadingPath(result.path);
    try {
      const content = await fetchSearchResult(result.path);
      const fileName = result.path.split('/').pop() ?? result.title;
      const song = buildSongFromFile(content, fileName, { type: 'search', path: result.path });
      if (!song) {
        Alert.alert(strings.search.emptyResultAlertTitle, strings.search.emptyResultAlertMessage(result.title));
        return;
      }
      await loadSong(song);
      // Fire-and-forget, never awaited — copies the song to the user's own
      // Dropbox and, once that succeeds, switches the library entry's
      // source over to it (addToLibrary, not loadSong, so this can land
      // later without clobbering whatever's active by then). Silent/
      // best-effort like the setlist backup — not something the user needs
      // to wait on or confirm.
      upgradeSearchSongSource(song).then((upgraded) => {
        if (upgraded !== song) {
          void addToLibrary(upgraded);
        }
      });
      // popTo, not navigate — see PromptScreen's "Library" link for why.
      navigation.popTo('Prompt');
    } catch (err) {
      Alert.alert(strings.search.loadFailedAlertTitle, err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingPath(null);
    }
  };

  const resultLabel = (r: SearchResult) => {
    const parts = [r.title];
    if (r.artist) parts.push(r.artist);
    return parts.join(' — ');
  };

  const resultAccessibilityLabel = (r: SearchResult) => {
    const parts = [r.title];
    if (r.artist) parts.push(r.artist);
    if (r.key) parts.push(strings.search.keySuffix(r.key));
    return parts.join(', ');
  };

  return (
    // SafeAreaView, not KeyboardAvoidingView, as the root — matches every
    // other screen's onAccessibilityEscape pattern (Setlists, Import
    // Setlist, Setlist Creator, Prompt). Confirmed live 2026-09-15 that
    // KeyboardAvoidingView does not reliably forward the two-finger "Z"
    // scrub gesture the same way; Setlist Creator has its own TextInput
    // with no KeyboardAvoidingView at all and works fine, so this isn't
    // actually needed for the keyboard-avoidance behavior either.
    <SafeAreaView style={styles.container} edges={['top']} onAccessibilityEscape={() => navigation.goBack()}>
      <View style={styles.headerRow}>
        <Pressable
          hitSlop={LINK_HIT_SLOP}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={strings.search.backButtonLabel}
        >
          <Text style={styles.backLink}>{strings.search.backButtonLabel}</Text>
        </Pressable>
        <Text style={styles.heading} accessibilityRole="header">
          {strings.search.heading}
        </Text>
      </View>

      {!configured ? (
        <Text style={styles.notConfiguredText}>{strings.search.notConfiguredText}</Text>
      ) : (
        <>
          <View style={styles.queryRow}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              placeholder={strings.search.queryPlaceholder}
              accessibilityLabel={strings.search.queryLabel}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
              onFocus={() => setIsEditingQuery(true)}
              onBlur={() => setIsEditingQuery(false)}
              editable={!isSearching}
              clearButtonMode="while-editing"
            />
            {isEditingQuery && (
              <Pressable
                hitSlop={LINK_HIT_SLOP}
                onPress={handleCancelEditing}
                accessibilityRole="button"
                accessibilityLabel={strings.search.cancelEditingLabel}
              >
                <Text style={styles.cancelEditingLink}>{strings.search.cancelEditingLabel}</Text>
              </Pressable>
            )}
          </View>

          <Pressable
            style={[styles.searchButton, !canSearch && styles.searchButtonDisabled]}
            onPress={handleSearch}
            disabled={!canSearch}
            accessibilityRole="button"
            accessibilityLabel={isSearching ? strings.search.searchingLabel : strings.search.searchLabel}
            accessibilityState={{ disabled: !canSearch }}
          >
            {isSearching ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.searchButtonText}>{strings.search.searchLabel}</Text>
            )}
          </Pressable>

          {results !== null && (
            <FlatList
              style={styles.resultsList}
              data={results}
              keyExtractor={(item) => item.path}
              ListEmptyComponent={<Text style={styles.emptyText}>{strings.search.noResultsText}</Text>}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.resultRow}
                  onPress={() => handleResultPress(item)}
                  disabled={loadingPath !== null}
                  accessibilityRole="button"
                  accessibilityLabel={resultAccessibilityLabel(item)}
                  accessibilityHint={strings.search.resultHint}
                >
                  <Text style={styles.resultText}>{resultLabel(item)}</Text>
                  {loadingPath === item.path && <ActivityIndicator color="#fff" style={styles.rowSpinner} />}
                </Pressable>
              )}
            />
          )}
        </>
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
  queryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: '#1c1c1c',
    color: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  cancelEditingLink: {
    color: '#4f8cff',
    fontSize: 16,
  },
  searchButton: {
    backgroundColor: '#2f6fed',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  searchButtonDisabled: {
    backgroundColor: '#2a3a5c',
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  resultsList: {
    marginTop: 20,
  },
  resultRow: {
    backgroundColor: '#1c1c1c',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  resultText: {
    color: '#fff',
    fontSize: 16,
  },
  rowSpinner: {
    marginTop: 8,
  },
  emptyText: {
    color: '#999',
    fontSize: 15,
  },
  notConfiguredText: {
    color: '#999',
    fontSize: 15,
  },
});
