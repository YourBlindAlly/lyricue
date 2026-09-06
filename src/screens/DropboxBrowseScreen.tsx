import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as AuthSession from 'expo-auth-session';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useAppState } from '../state/AppStateContext';
import { isDropboxConfigured, useDropboxAuth } from '../cloud/dropbox/dropboxAuth';
import {
  downloadDropboxFile,
  getDropboxAccountEmail,
  listDropboxFolder,
  type DropboxEntry,
} from '../cloud/dropbox/dropboxApi';
import { buildSongFromFile } from '../parsing/buildSong';
import { LINK_HIT_SLOP } from '../ui/hitSlop';
import { nextSortMode, SORT_MODE_LABEL } from '../library/librarySortPreference';
import {
  DEFAULT_DROPBOX_SORT_MODE,
  loadDropboxSortMode,
  saveDropboxSortMode,
} from '../cloud/dropbox/dropboxSortPreference';
import { sortDropboxEntriesForDisplay } from '../cloud/dropbox/sortDropboxEntries';
import { useStrings } from '../i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'DropboxBrowse'>;

export function DropboxBrowseScreen({ navigation, route }: Props) {
  const strings = useStrings();
  const path = route.params?.path ?? '';
  const { loadSong, addToLibrary } = useAppState();
  const { isConnected, isChecking, connect, disconnect } = useDropboxAuth();
  const [entries, setEntries] = useState<DropboxEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  const [sortMode, setSortMode] = useState(DEFAULT_DROPBOX_SORT_MODE);
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'cueme', path: 'redirect' });

  useEffect(() => {
    loadDropboxSortMode().then(setSortMode);
  }, []);

  const handleCycleSort = () => {
    setSortMode((current) => {
      const next = nextSortMode(current);
      void saveDropboxSortMode(next);
      return next;
    });
  };

  useEffect(() => {
    if (!isConnected) {
      return;
    }
    setEntries(null);
    setError(null);
    setIsSelectMode(false);
    setSelectedPaths(new Set());
    listDropboxFolder(path)
      .then(setEntries)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [isConnected, path]);

  useEffect(() => {
    if (!isConnected) {
      setAccountEmail(null);
      return;
    }
    // Shown in the header so it's obvious which Dropbox account is
    // connected — easy to mix up if more than one account has ever been
    // used on this device, and otherwise invisible from inside the app.
    getDropboxAccountEmail()
      .then(setAccountEmail)
      .catch(() => setAccountEmail(null));
  }, [isConnected]);

  const handleConnect = async () => {
    const result = await connect();
    if (!result.success && result.error) {
      Alert.alert(strings.dropboxBrowse.couldntConnectAlertTitle, result.error);
    }
  };

  const handleEntryPress = async (entry: DropboxEntry) => {
    if (entry.isFolder) {
      navigation.push('DropboxBrowse', { path: entry.path });
      return;
    }
    if (isSelectMode) {
      setSelectedPaths((current) => {
        const next = new Set(current);
        if (next.has(entry.path)) {
          next.delete(entry.path);
        } else {
          next.add(entry.path);
        }
        return next;
      });
      return;
    }
    setIsDownloading(true);
    try {
      const text = await downloadDropboxFile(entry.path);
      const song = buildSongFromFile(text, entry.name, { type: 'dropbox', path: entry.path });
      if (!song) {
        Alert.alert(strings.dropboxBrowse.emptyFileAlertTitle, strings.dropboxBrowse.emptyFileAlertMessage(entry.name));
        return;
      }
      await loadSong(song);
      // popTo, not navigate — see PromptScreen's "Library" link for why.
      navigation.popTo('Prompt');
    } catch (err) {
      Alert.alert(strings.dropboxBrowse.downloadFailedAlertTitle, err instanceof Error ? err.message : String(err));
    } finally {
      setIsDownloading(false);
    }
  };

  const files = (entries ?? []).filter((e) => !e.isFolder);
  const sortedEntries = useMemo(
    () => sortDropboxEntriesForDisplay(entries ?? [], sortMode),
    [entries, sortMode]
  );

  const handleToggleSelectMode = () => {
    setIsSelectMode((current) => !current);
    setSelectedPaths(new Set());
  };

  const handleSelectAll = () => {
    setSelectedPaths((current) =>
      current.size === files.length ? new Set() : new Set(files.map((f) => f.path))
    );
  };

  const handleImportSelected = async () => {
    const toImport = files.filter((f) => selectedPaths.has(f.path));
    if (toImport.length === 0) {
      return;
    }
    setImportProgress({ done: 0, total: toImport.length });
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    for (let i = 0; i < toImport.length; i++) {
      const entry = toImport[i];
      try {
        const text = await downloadDropboxFile(entry.path);
        const song = buildSongFromFile(text, entry.name, { type: 'dropbox', path: entry.path });
        if (song) {
          await addToLibrary(song);
          imported += 1;
        } else {
          skipped += 1;
        }
      } catch {
        failed += 1;
      }
      setImportProgress({ done: i + 1, total: toImport.length });
    }
    setImportProgress(null);
    setIsSelectMode(false);
    setSelectedPaths(new Set());
    const parts = [strings.dropboxBrowse.importedSongsText(imported)];
    if (skipped > 0) parts.push(strings.dropboxBrowse.skippedSongsText(skipped));
    if (failed > 0) parts.push(strings.dropboxBrowse.failedSongsText(failed));
    Alert.alert(strings.dropboxBrowse.importCompleteAlertTitle, parts.join(' '));
  };

  if (!isDropboxConfigured) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.headerLeft}>
          <Pressable
            hitSlop={LINK_HIT_SLOP}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={strings.dropboxBrowse.backButtonLabel}
          >
            <Text style={styles.backLink}>{strings.dropboxBrowse.backButtonLabel}</Text>
          </Pressable>
          <Text style={styles.heading} accessibilityRole="header">
            {strings.dropboxBrowse.heading}
          </Text>
        </View>
        <Text style={styles.infoText}>{strings.dropboxBrowse.notConfiguredInfoText1}</Text>
        <Text selectable style={styles.codeText}>
          {redirectUri}
        </Text>
        <Text style={styles.infoText}>{strings.dropboxBrowse.notConfiguredInfoText2}</Text>
      </SafeAreaView>
    );
  }

  if (isChecking) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (!isConnected) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.headerLeft}>
          <Pressable
            hitSlop={LINK_HIT_SLOP}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={strings.dropboxBrowse.backButtonLabel}
          >
            <Text style={styles.backLink}>{strings.dropboxBrowse.backButtonLabel}</Text>
          </Pressable>
          <Text style={styles.heading} accessibilityRole="header">
            {strings.dropboxBrowse.heading}
          </Text>
        </View>
        <Pressable
          style={styles.connectButton}
          onPress={handleConnect}
          accessibilityRole="button"
          accessibilityLabel={strings.dropboxBrowse.connectDropboxLabel}
        >
          <Text style={styles.connectButtonText}>{strings.dropboxBrowse.connectDropboxLabel}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerRow}>
        <View style={[styles.headerLeft, styles.headerLeftNoMargin]}>
          <Pressable
            hitSlop={LINK_HIT_SLOP}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={strings.dropboxBrowse.backButtonLabel}
          >
            <Text style={styles.backLink}>{strings.dropboxBrowse.backButtonLabel}</Text>
          </Pressable>
          <Text style={styles.heading} accessibilityRole="header">
            {path ? path.split('/').pop() : strings.dropboxBrowse.heading}
          </Text>
        </View>
        <View style={styles.headerButtons}>
          {files.length > 0 && (
            <Pressable
              hitSlop={LINK_HIT_SLOP}
              onPress={handleCycleSort}
              accessibilityRole="button"
              accessibilityLabel={strings.dropboxBrowse.sortLabel(SORT_MODE_LABEL[sortMode])}
              accessibilityHint={strings.dropboxBrowse.sortHint}
            >
              <Text style={styles.selectLink}>{strings.dropboxBrowse.sortLabel(SORT_MODE_LABEL[sortMode])}</Text>
            </Pressable>
          )}
          {files.length > 0 && (
            <Pressable
              hitSlop={LINK_HIT_SLOP}
              onPress={handleToggleSelectMode}
              accessibilityRole="button"
              accessibilityLabel={isSelectMode ? strings.dropboxBrowse.selectModeCancelLabel : strings.dropboxBrowse.selectLabel}
              accessibilityHint={isSelectMode ? undefined : strings.dropboxBrowse.selectHint}
            >
              <Text style={styles.selectLink}>{isSelectMode ? strings.dropboxBrowse.selectModeCancelLabel : strings.dropboxBrowse.selectLabel}</Text>
            </Pressable>
          )}
          <Pressable
            hitSlop={LINK_HIT_SLOP}
            onPress={disconnect}
            accessibilityRole="button"
            accessibilityLabel={strings.dropboxBrowse.disconnectLabel}
          >
            <Text style={styles.disconnectLink}>{strings.dropboxBrowse.disconnectLabel}</Text>
          </Pressable>
        </View>
      </View>

      {accountEmail && <Text style={styles.accountText}>{strings.dropboxBrowse.connectedAsText(accountEmail)}</Text>}

      {isSelectMode && (
        <View style={styles.selectBar}>
          <Pressable
            hitSlop={LINK_HIT_SLOP}
            onPress={handleSelectAll}
            accessibilityRole="button"
            accessibilityLabel={selectedPaths.size === files.length ? strings.dropboxBrowse.deselectAllLabel : strings.dropboxBrowse.selectAllLabel}
          >
            <Text style={styles.selectLink}>
              {selectedPaths.size === files.length ? strings.dropboxBrowse.deselectAllLabel : strings.dropboxBrowse.selectAllLabel}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.importButton, selectedPaths.size === 0 && styles.importButtonDisabled]}
            onPress={handleImportSelected}
            disabled={selectedPaths.size === 0 || importProgress !== null}
            accessibilityRole="button"
            accessibilityLabel={strings.dropboxBrowse.importSelectedLabel(selectedPaths.size)}
          >
            <Text style={styles.importButtonText}>{strings.dropboxBrowse.importSelectedLabel(selectedPaths.size)}</Text>
          </Pressable>
        </View>
      )}

      {importProgress && (
        <Text style={styles.accountText} accessibilityLiveRegion="polite">
          {strings.dropboxBrowse.importingProgressText(importProgress.done, importProgress.total)}
        </Text>
      )}

      {isDownloading && <ActivityIndicator color="#fff" style={styles.spinner} />}
      {error && <Text style={styles.errorText}>{error}</Text>}

      {entries === null && !error ? (
        <ActivityIndicator color="#fff" style={styles.spinner} />
      ) : (
        <FlatList
          data={sortedEntries}
          keyExtractor={(item) => item.path}
          ListEmptyComponent={<Text style={styles.emptyText}>{strings.dropboxBrowse.emptyText}</Text>}
          renderItem={({ item }) => {
            const isSelected = selectedPaths.has(item.path);
            return (
              <Pressable
                style={styles.entryRow}
                onPress={() => handleEntryPress(item)}
                accessibilityRole={isSelectMode && !item.isFolder ? 'checkbox' : 'button'}
                accessibilityState={
                  isSelectMode && !item.isFolder ? { checked: isSelected } : undefined
                }
                accessibilityLabel={
                  item.isFolder
                    ? strings.dropboxBrowse.entryFolderAccessibilityLabel(item.name)
                    : isSelectMode
                      ? (isSelected
                          ? strings.dropboxBrowse.entrySelectedAccessibilityLabel(item.name)
                          : strings.dropboxBrowse.entryNotSelectedAccessibilityLabel(item.name))
                      : strings.dropboxBrowse.entrySongAccessibilityLabel(item.name)
                }
              >
                <Text style={styles.entryText}>
                  {isSelectMode && !item.isFolder ? (isSelected ? '☑ ' : '☐ ') : ''}
                  {item.isFolder ? '📁 ' : '🎵 '}
                  {item.name}
                </Text>
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
  centeredContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  headerLeftNoMargin: {
    marginBottom: 0,
  },
  backLink: {
    color: '#4f8cff',
    fontSize: 16,
  },
  headerButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  selectLink: {
    color: '#4f8cff',
    fontSize: 14,
  },
  selectBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  importButton: {
    backgroundColor: '#2f6fed',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  importButtonDisabled: {
    backgroundColor: '#2a3a5c',
  },
  importButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  heading: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  accountText: {
    color: '#9ad39a',
    fontSize: 14,
    marginBottom: 16,
  },
  infoText: {
    color: '#bbb',
    fontSize: 15,
    marginBottom: 12,
    lineHeight: 21,
  },
  codeText: {
    color: '#9ad39a',
    fontSize: 14,
    backgroundColor: '#1c1c1c',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  connectButton: {
    backgroundColor: '#2f6fed',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  disconnectLink: {
    color: '#ff6b6b',
    fontSize: 14,
  },
  spinner: {
    marginTop: 20,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
    marginBottom: 12,
  },
  emptyText: {
    color: '#999',
    fontSize: 15,
  },
  entryRow: {
    backgroundColor: '#1c1c1c',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  entryText: {
    color: '#fff',
    fontSize: 16,
  },
});
