import React, { useRef } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

export type SwipeAction = {
  key: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
};

type Props = {
  actions: SwipeAction[];
  children: React.ReactNode;
  /** Outer spacing (e.g. marginBottom) — kept off the row itself so the revealed buttons line up with it. */
  containerStyle?: StyleProp<ViewStyle>;
};

/**
 * Drag a row sideways to slide its action buttons out — the same pattern as
 * iOS Mail — for sighted people using the app with VoiceOver off. The same
 * actions are already offered to VoiceOver users as swipe-up/down custom
 * actions on the row; the revealed buttons are hidden from VoiceOver on
 * purpose so they don't add extra stops to every row.
 */
export function SwipeActionsRow({ actions, children, containerStyle }: Props) {
  const swipeableRef = useRef<React.ComponentRef<typeof Swipeable>>(null);

  return (
    <View style={containerStyle}>
      <Swipeable
        ref={swipeableRef}
        overshootRight={false}
        friction={2}
        rightThreshold={40}
        renderRightActions={() => (
          <View style={styles.actions} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {actions.map((action) => (
              <Pressable
                key={action.key}
                style={[styles.button, action.destructive && styles.destructive]}
                onPress={() => {
                  swipeableRef.current?.close();
                  action.onPress();
                }}
              >
                <Text style={styles.label} numberOfLines={2}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      >
        {children}
      </Swipeable>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
  },
  button: {
    width: 84,
    backgroundColor: '#2f6fed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: '#000',
  },
  destructive: {
    backgroundColor: '#b3261e',
  },
  label: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
