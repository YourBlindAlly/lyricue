import React from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { LINK_HIT_SLOP } from '../ui/hitSlop';
import { useStrings } from '../i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'About'>;

const CONTACT_EMAIL = 'rusty.perez@gmail.com';

export function AboutScreen({ navigation }: Props) {
  const strings = useStrings();
  // On a genuine first launch, About is the root screen — there's nothing to
  // go back to. A "Back" link there would be confusing (nothing was
  // navigated away from), so first-time visitors get a clear "Get Started"
  // button at the end of the content instead, and no Back link at all.
  const isFirstLaunch = !navigation.canGoBack();
  const handleContinue = () => navigation.navigate('Library');

  const handleContact = () => {
    Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('LyriCue feedback')}`).catch(() => {
      Alert.alert(strings.about.contactFailedTitle, strings.about.contactFailedMessage(CONTACT_EMAIL));
    });
  };

  return (
    // No escape handler at all on first launch — matches there being no
    // visible Back link either, since this is a required onboarding step
    // with nowhere to go back to yet.
    <SafeAreaView
      style={styles.container}
      edges={['top']}
      onAccessibilityEscape={isFirstLaunch ? undefined : () => navigation.goBack()}
    >
      <View style={styles.headerRow}>
        {!isFirstLaunch && (
          <Pressable
            hitSlop={LINK_HIT_SLOP}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={strings.about.backButtonLabel}
          >
            <Text style={styles.backLink}>{strings.about.backButtonLabel}</Text>
          </Pressable>
        )}
        <Text style={styles.heading} accessibilityRole="header">
          {strings.about.heading}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Image
          source={require('../../assets/splash-icon.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          accessible={false}
        />

        <Text style={styles.paragraph}>{strings.about.introParagraph}</Text>

        <Text style={styles.paragraph}>{strings.about.feedbackParagraph(CONTACT_EMAIL)}</Text>

        <Pressable
          style={styles.contactButton}
          onPress={handleContact}
          accessibilityRole="button"
          accessibilityLabel={strings.about.contactButtonLabel}
          accessibilityHint={strings.about.contactButtonAccessibilityHint}
        >
          <Text style={styles.contactButtonText}>{strings.about.contactButtonLabel}</Text>
        </Pressable>

        <Text style={styles.paragraph}>{strings.about.gettingStartedParagraph}</Text>

        <Text style={styles.paragraph}>{strings.about.lyricsScreenParagraph}</Text>

        <Text style={styles.paragraph}>{strings.about.voiceParagraph}</Text>

        <Text style={styles.versionText}>
          {strings.about.versionText(Constants.expoConfig?.version ?? '1.0.0')}
        </Text>

        {isFirstLaunch && (
          <Pressable
            style={styles.continueButton}
            onPress={handleContinue}
            accessibilityRole="button"
            accessibilityLabel={strings.about.getStartedButtonLabel}
          >
            <Text style={styles.continueButtonText}>{strings.about.getStartedButtonLabel}</Text>
          </Pressable>
        )}
      </ScrollView>
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
    minHeight: 24,
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
  scrollContent: {
    paddingBottom: 30,
  },
  logo: {
    width: '100%',
    height: 140,
    marginBottom: 24,
  },
  paragraph: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 18,
  },
  contactButton: {
    backgroundColor: '#1c1c1c',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2f6fed',
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 18,
  },
  contactButtonText: {
    color: '#4f8cff',
    fontSize: 16,
    fontWeight: '600',
  },
  versionText: {
    color: '#999',
    fontSize: 13,
    marginTop: 10,
  },
  continueButton: {
    backgroundColor: '#2f6fed',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});
