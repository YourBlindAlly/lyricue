import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { usePedalInput } from '../pedal/usePedalInput';
import type { PedalAction } from '../pedal/keyBindings';
import { loadRepeatFeatureEnabled, saveRepeatFeatureEnabled } from '../pedal/repeatFeaturePreference';
import { LINK_HIT_SLOP } from '../ui/hitSlop';
import { useStrings } from '../i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'PedalSettings'>;

/**
 * One VoiceOver stop, swipe-adjustable + tap fallback -- the same pattern
 * VoiceSettingsScreen's toggles use, per the standing rule that every
 * toggle defaults to swipe as the primary interaction (confirmed 2026-09-09
 * that this applies to plain on/off controls too, not just multi-state
 * ones).
 */
function ToggleRow({
  label,
  hint,
  value,
  onValueChange,
  onLabel,
  offLabel,
  stateOnLabel,
  stateOffLabel,
}: {
  label: string;
  hint: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  onLabel: string;
  offLabel: string;
  stateOnLabel: string;
  stateOffLabel: string;
}) {
  return (
    <Pressable
      style={styles.toggleRow}
      onPress={() => onValueChange(!value)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: value ? stateOnLabel : stateOffLabel }}
      accessibilityHint={hint}
      accessibilityActions={[
        { name: 'increment', label: onLabel },
        { name: 'decrement', label: offLabel },
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment') {
          onValueChange(true);
        } else if (event.nativeEvent.actionName === 'decrement') {
          onValueChange(false);
        }
      }}
    >
      <Text style={styles.actionLabel}>{label}</Text>
      <Switch value={value} pointerEvents="none" />
    </Pressable>
  );
}

export function PedalSettingsScreen({ navigation }: Props) {
  const strings = useStrings();
  const [repeatFeatureEnabled, setRepeatFeatureEnabled] = useState(true);

  useEffect(() => {
    loadRepeatFeatureEnabled().then(setRepeatFeatureEnabled);
  }, []);

  const handleToggleRepeatFeature = (value: boolean) => {
    setRepeatFeatureEnabled(value);
    void saveRepeatFeatureEnabled(value);
  };
  const ACTION_LABELS: Record<PedalAction, string> = {
    next: strings.pedalSettings.actionLabelNext,
    previous: strings.pedalSettings.actionLabelPrevious,
  };
  const onBack = () => navigation.goBack();

  const {
    isPedalConnected,
    bindings,
    assignBinding,
    isCapturing,
    captureNextKey,
    cancelCapture,
    alertOnDisconnect,
    setAlertOnDisconnect,
  } = usePedalInput();

  const [capturingAction, setCapturingAction] = React.useState<PedalAction | null>(null);

  const handleAssign = async (action: PedalAction) => {
    setCapturingAction(action);
    const event = await captureNextKey();
    assignBinding(action, event);
    setCapturingAction(null);
  };

  const handleCancelCapture = () => {
    cancelCapture();
    setCapturingAction(null);
  };

  const bindingsForAction = (action: PedalAction) =>
    bindings.filter((b) => b.action === action);

  return (
    // Same VoiceOver two-finger-scrub "Escape" support as PromptScreen —
    // mirrors the visible Back link's own onBack, landing back on Prompt
    // (where this screen is always opened from). See PromptScreen.tsx.
    <SafeAreaView style={styles.container} edges={['top']} onAccessibilityEscape={onBack}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Pressable hitSlop={LINK_HIT_SLOP} onPress={onBack} accessibilityRole="button" accessibilityLabel={strings.pedalSettings.backButtonLabel}>
            <Text style={styles.backLink}>{strings.pedalSettings.backButtonLabel}</Text>
          </Pressable>
        <Text style={styles.heading} accessibilityRole="header">
          {strings.pedalSettings.heading}
        </Text>
      </View>

      <Text style={styles.statusText}>
        {isPedalConnected ? strings.pedalSettings.pedalConnectedStatus : strings.pedalSettings.pedalNotConnectedStatus}
      </Text>

      {(['next', 'previous'] as PedalAction[]).map((action) => (
        <View key={action} style={styles.actionRow}>
          <Text style={styles.actionLabel}>{ACTION_LABELS[action]}</Text>
          <Text style={styles.currentKeys}>
            {bindingsForAction(action).map((b) => b.keyName).join(', ') || strings.pedalSettings.notSetLabel}
          </Text>
          {isCapturing && capturingAction === action ? (
            <View style={styles.captureRow}>
              <Text style={styles.capturingText}>{strings.pedalSettings.waitingForPressText}</Text>
              <Pressable
                hitSlop={LINK_HIT_SLOP}
                onPress={handleCancelCapture}
                accessibilityRole="button"
                accessibilityLabel={strings.pedalSettings.cancelLabel}
              >
                <Text style={styles.cancelLink}>{strings.pedalSettings.cancelLabel}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={styles.assignButton}
              onPress={() => handleAssign(action)}
              disabled={isCapturing}
              accessibilityRole="button"
              accessibilityLabel={strings.pedalSettings.assignButtonLabel}
            >
              <Text style={styles.assignButtonText}>{strings.pedalSettings.assignButtonLabel}</Text>
            </Pressable>
          )}
        </View>
      ))}

      <ToggleRow
        label={strings.pedalSettings.alertOnDisconnectLabel}
        hint={strings.pedalSettings.alertOnDisconnectHint}
        value={alertOnDisconnect}
        onValueChange={setAlertOnDisconnect}
        onLabel={strings.pedalSettings.alertOnDisconnectOnActionLabel}
        offLabel={strings.pedalSettings.alertOnDisconnectOffActionLabel}
        stateOnLabel={strings.pedalSettings.alertOnDisconnectStateOnLabel}
        stateOffLabel={strings.pedalSettings.alertOnDisconnectStateOffLabel}
      />

      <ToggleRow
        label={strings.pedalSettings.repeatFeatureLabel}
        hint={strings.pedalSettings.repeatFeatureHint}
        value={repeatFeatureEnabled}
        onValueChange={handleToggleRepeatFeature}
        onLabel={strings.pedalSettings.repeatOnActionLabel}
        offLabel={strings.pedalSettings.repeatOffActionLabel}
        stateOnLabel={strings.pedalSettings.repeatStateOnLabel}
        stateOffLabel={strings.pedalSettings.repeatStateOffLabel}
      />
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scroll: {
    flex: 1,
  },
  content: {
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
  statusText: {
    color: '#9ad39a',
    fontSize: 15,
    marginBottom: 24,
  },
  actionRow: {
    backgroundColor: '#1c1c1c',
    borderRadius: 10,
    padding: 16,
    marginBottom: 14,
  },
  actionLabel: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  currentKeys: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 4,
    marginBottom: 12,
  },
  assignButton: {
    backgroundColor: '#2f6fed',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  assignButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  captureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  capturingText: {
    color: '#ffcc66',
    fontSize: 15,
  },
  cancelLink: {
    color: '#ff6b6b',
    fontSize: 15,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1c1c1c',
    borderRadius: 10,
    padding: 16,
    marginTop: 10,
  },
});
