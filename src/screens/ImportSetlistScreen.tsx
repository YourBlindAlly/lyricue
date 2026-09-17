import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as AuthSession from 'expo-auth-session';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { isDropboxConfigured, useDropboxAuth } from '../cloud/dropbox/dropboxAuth';
import type { DropboxEntry } from '../cloud/dropbox/dropboxApi';
import { importSetlistFromDropbox, listDropboxSetlistFiles } from '../setlist/setlistStorage';
import { setlistNameFromFilename } from '../setlist/setlistCsv';
import { useAppState } from '../state/AppStateContext';
import { LINK_HIT_SLOP } from '../ui/hitSlop';
import { useStrings } from '../i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'ImportSetlist'>;

/**
 * Pulls in a setlist CSV that already sits in Dropbox's /setlists folder —
 * either this app's own best-effort backup of a setlist built on-device, or
 * (the real reason this screen exists) a CSV some OTHER tool wrote there
 * directly in the same Title,Path format, e.g. a web-based setlist builder.
 * Reuses saveSetlist's local-storage-first architecture: importing just
 * means "parse this CSV and save it like any other setlist," so once
 * imported it behaves identically to one built by hand in SetlistCreator —
 * same offline playback guarantee, same overwrite-by-name behavior.
 */
export function ImportSetlistScreen({ navigation }: Props) {
  const strings = useStrings();
  const { activeSetlist, startSetlist } = useAppState();
  const { isConnected, isChecking, connect } = useDropboxAuth();
  const [entries, setEntries] = useState<DropboxEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importingPath, setImportingPath] = useState<string | null>(null);
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'cueme', path: 'redirect' });

  useEffect(() => {
    if (!isConnected) {
      return;
    }
    setEntries(null);
    setError(null);
    listDropboxSetlistFiles()
      .then(setEntries)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [isConnected]);

  const handleConnect = async () => {
    const result = await connect();
    if (!result.success && result.error) {
      Alert.alert(strings.importSetlist.couldntConnectAlertTitle, result.error);
    }
  };

  const handleEntryPress = async (entry: DropboxEntry) => {
    setImportingPath(entry.path);
    try {
      const setlist = await importSetlistFromDropbox(entry);
      // importSetlistFromDropbox only updates the STORED setlist — if
      // this is the one currently playing, its own separate in-progress
      // snapshot (song position, etc.) doesn't pick up the change on its
      // own. Refresh it here so a re-import of the active setlist actually
      // shows the new song count right away instead of appearing to do
      // nothing (Rusty's real report, 2026-09-17).
      if (activeSetlist?.setlist.name === setlist.name) {
        await startSetlist(setlist);
      }
      Alert.alert(
        strings.importSetlist.importedAlertTitle,
        strings.importSetlist.importedAlertMessage(setlist.name, setlist.entries.length)
      );
      navigation.goBack();
    } catch (err) {
      Alert.alert(strings.importSetlist.importFailedAlertTitle, err instanceof Error ? err.message : String(err));
    } finally {
      setImportingPath(null);
    }
  };

  if (!isDropboxConfigured) {
    return (
      <SafeAreaView style={styles.container} edges={['top']} onAccessibilityEscape={() => navigation.goBack()}>
        <View style={styles.headerLeft}>
          <Pressable
            hitSlop={LINK_HIT_SLOP}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={strings.importSetlist.backButtonLabel}
          >
            <Text style={styles.backLink}>{strings.importSetlist.backButtonLabel}</Text>
          </Pressable>
          <Text style={styles.heading} accessibilityRole="header">
            {strings.importSetlist.heading}
          </Text>
        </View>
        <Text style={styles.infoText}>{strings.importSetlist.notConfiguredInfoText1}</Text>
        <Text selectable style={styles.codeText}>
          {redirectUri}
        </Text>
        <Text style={styles.infoText}>{strings.importSetlist.notConfiguredInfoText2}</Text>
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
      <SafeAreaView style={styles.container} edges={['top']} onAccessibilityEscape={() => navigation.goBack()}>
        <View style={styles.headerLeft}>
          <Pressable
            hitSlop={LINK_HIT_SLOP}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={strings.importSetlist.backButtonLabel}
          >
            <Text style={styles.backLink}>{strings.importSetlist.backButtonLabel}</Text>
          </Pressable>
          <Text style={styles.heading} accessibilityRole="header">
            {strings.importSetlist.heading}
          </Text>
        </View>
        <Pressable
          style={styles.connectButton}
          onPress={handleConnect}
          accessibilityRole="button"
          accessibilityLabel={strings.importSetlist.connectDropboxLabel}
        >
          <Text style={styles.connectButtonText}>{strings.importSetlist.connectDropboxLabel}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']} onAccessibilityEscape={() => navigation.goBack()}>
      <View style={styles.headerLeft}>
        <Pressable
          hitSlop={LINK_HIT_SLOP}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={strings.importSetlist.backButtonLabel}
        >
          <Text style={styles.backLink}>{strings.importSetlist.backButtonLabel}</Text>
        </Pressable>
        <Text style={styles.heading} accessibilityRole="header">
          {strings.importSetlist.heading}
        </Text>
      </View>

      <Text style={styles.infoText}>{strings.importSetlist.explainerText}</Text>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {entries === null && !error ? (
        <ActivityIndicator color="#fff" style={styles.spinner} />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.path}
          ListEmptyComponent={<Text style={styles.emptyText}>{strings.importSetlist.emptyText}</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.entryRow}
              onPress={() => handleEntryPress(item)}
              disabled={importingPath !== null}
              accessibilityRole="button"
              accessibilityLabel={strings.importSetlist.entryAccessibilityLabel(setlistNameFromFilename(item.name))}
              accessibilityHint={strings.importSetlist.entryHint}
            >
              <Text style={styles.entryText}>{setlistNameFromFilename(item.name)}</Text>
              {importingPath === item.path && <ActivityIndicator color="#fff" style={styles.rowSpinner} />}
            </Pressable>
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
  centeredContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
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
  spinner: {
    marginTop: 20,
  },
  rowSpinner: {
    marginTop: 8,
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
    fontSize: 17,
    fontWeight: '600',
  },
});
