import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useAppState } from '../state/AppStateContext';
import { deleteSetlist, listSetlists, loadSetlist, type SetlistSummary } from '../setlist/setlistStorage';
import { hintOrNone } from '../speech/reduceHintsPreference';
import { LINK_HIT_SLOP } from '../ui/hitSlop';
import { useStrings } from '../i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'Setlists'>;

export function SetlistsScreen({ navigation }: Props) {
  const strings = useStrings();
  const { activeSetlist, startSetlist, clearSetlist, reduceHints } = useAppState();
  const [setlists, setSetlists] = useState<SetlistSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingOne, setIsLoadingOne] = useState(false);

  const refresh = useCallback(() => {
    setSetlists(null);
    setError(null);
    listSetlists()
      .then(setSetlists)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  // React Navigation's 'focus' event doesn't fire for the initial mount, only
  // on RETURN visits — so load once up front too (e.g. after saving a new
  // setlist on the creator screen and coming back here).
  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', refresh);
    return unsubscribe;
  }, [navigation, refresh]);

  const handleOpen = async (summary: SetlistSummary) => {
    setIsLoadingOne(true);
    try {
      const setlist = await loadSetlist(summary);
      const result = await startSetlist(setlist);
      if (!result.started) {
        Alert.alert(
          strings.setlists.nothingToPlayAlertTitle,
          strings.setlists.nothingToPlayAlertMessage(summary.name)
        );
        return;
      }
      // popTo, not navigate — see PromptScreen's "Library" link for why.
      navigation.popTo('Prompt');
    } catch (err) {
      Alert.alert(strings.setlists.couldntLoadSetlistAlertTitle, err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingOne(false);
    }
  };

  const handleDelete = (summary: SetlistSummary) => {
    Alert.alert(strings.setlists.deleteSetlistAlertTitle, strings.setlists.deleteSetlistAlertMessage(summary.name), [
      { text: strings.setlists.cancelLabel, style: 'cancel' },
      {
        text: strings.setlists.deleteLabel,
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSetlist(summary);
            setSetlists((current) => (current ?? []).filter((s) => s.id !== summary.id));
          } catch (err) {
            Alert.alert(strings.setlists.deleteFailedAlertTitle, err instanceof Error ? err.message : String(err));
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']} onAccessibilityEscape={() => navigation.goBack()}>
      <View style={styles.headerRow}>
        <Pressable
          hitSlop={LINK_HIT_SLOP}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={strings.setlists.backButtonLabel}
        >
          <Text style={styles.backLink}>{strings.setlists.backButtonLabel}</Text>
        </Pressable>
        <Text style={styles.heading} accessibilityRole="header">
          {strings.setlists.heading}
        </Text>
      </View>

      {/* Setlists live on this device first and foremost — creating, playing,
          and deleting one never depends on Dropbox being connected or
          reachable. A backup copy is kept in sync with Dropbox in the
          background on a best-effort basis whenever there's a connection,
          purely for safekeeping/restoring later, never required for normal
          use (Rusty's own point, 2026-08-31: a setlist he already built
          should still open with no signal at a venue, even if Dropbox
          itself is unreachable). */}
      <Pressable
        style={styles.newButton}
        onPress={() => navigation.navigate('SetlistCreator')}
        accessibilityRole="button"
        accessibilityLabel={strings.setlists.newSetlistLabel}
      >
        <Text style={styles.newButtonText}>{strings.setlists.newSetlistLabel}</Text>
      </Pressable>

      {isLoadingOne && <ActivityIndicator color="#fff" style={styles.spinner} />}
      {error && <Text style={styles.errorText}>{error}</Text>}

      {setlists === null && !error ? (
        <ActivityIndicator color="#fff" style={styles.spinner} />
      ) : (
        <FlatList
          data={setlists ?? []}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
                <Text style={styles.emptyText}>{strings.setlists.emptyText}</Text>
              }
              renderItem={({ item }) => {
                // The active setlist's own row does double duty instead of
                // needing a separate always-visible "currently playing"
                // banner plus a Stop button plus this same row again below
                // it (Rusty's own complaint, 2026-08-30, about the old
                // three-part layout): tapping it resumes exactly where
                // playback left off rather than restarting from song 1, and
                // "Stop following this setlist" is a VoiceOver custom action
                // on the row (swipe up/down), the same one-row-many-actions
                // pattern already used on Library/Setlist Creator rows.
                const isActive = activeSetlist?.setlist.name === item.name;
                // Deleting the currently-playing setlist is disallowed here
                // rather than handled as a special case — stop it first,
                // then delete, avoids a confusing half-stopped state.
                return (
                  <Pressable
                    style={styles.setlistRow}
                    onPress={() => (isActive ? navigation.popTo('Prompt') : handleOpen(item))}
                    accessibilityRole="button"
                    accessibilityLabel={
                      isActive
                        ? strings.setlists.activePlayingAccessibilityLabel(
                            item.name,
                            activeSetlist!.currentIndex + 1,
                            activeSetlist!.setlist.entries.length
                          )
                        : item.name
                    }
                    accessibilityHint={hintOrNone(
                      isActive ? strings.setlists.resumeHint : strings.setlists.playHint,
                      reduceHints
                    )}
                    accessibilityActions={
                      isActive
                        ? [{ name: 'stop', label: strings.setlists.stopFollowingActionLabel }]
                        : [{ name: 'delete', label: strings.setlists.deleteLabel }]
                    }
                    onAccessibilityAction={(event) => {
                      switch (event.nativeEvent.actionName) {
                        case 'stop':
                          clearSetlist();
                          break;
                        case 'delete':
                          handleDelete(item);
                          break;
                      }
                    }}
                  >
                    <Text style={styles.setlistName}>{item.name}</Text>
                    {isActive ? (
                      <Text style={styles.activeText} numberOfLines={1}>
                        {strings.setlists.playingStatusText(
                          activeSetlist!.currentIndex + 1,
                          activeSetlist!.setlist.entries.length
                        )}
                      </Text>
                    ) : null}
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
  newButton: {
    backgroundColor: '#2f6fed',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  newButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  activeText: {
    color: '#9ad39a',
    fontSize: 14,
    marginTop: 4,
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
  setlistRow: {
    backgroundColor: '#1c1c1c',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  setlistName: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
