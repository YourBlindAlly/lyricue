// Converted from app.json (2026-09-04) so a "preview" variant can be built
// with a different bundle identifier and display name — installing that
// build alongside the real app on the same phone gives it its own
// completely separate local storage, so a fresh-install/first-launch
// experience can be tried out with zero risk to the real library, setlists,
// or settings. Set APP_VARIANT=preview (see .github/workflows/build-preview-ipa.yml)
// to build that variant; unset/anything else builds the normal app exactly
// as before.
const isPreview = process.env.APP_VARIANT === 'preview';

module.exports = {
  expo: {
    name: isPreview ? 'LyriCue Preview' : 'LyriCue',
    slug: 'cueme-app',
    scheme: 'cueme',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'dark',
    backgroundColor: '#000000',
    ios: {
      supportsTablet: true,
      bundleIdentifier: isPreview ? 'com.rustyperez.cueme.preview' : 'com.rustyperez.cueme',
      // App Store Connect rejects an upload whose CFBundleVersion isn't
      // strictly higher than the last one it received for this app -
      // confirmed live 2026-09-04 ("The bundle version must be higher than
      // the previously uploaded version"). BUILD_NUMBER is set by
      // build-testflight.yml to the GitHub Actions run number, which only
      // ever increases - defaults to "1" for the unsigned/preview builds,
      // which don't go through App Store Connect at all so this never
      // matters for them.
      buildNumber: process.env.BUILD_NUMBER || '1',
      infoPlist: {
        UIBackgroundModes: ['audio'],
        GCSupportsControllerUserInteraction: true,
        // LyriCue only makes plain HTTPS calls (Dropbox API, the search
        // backend) through iOS's own networking stack - it never
        // implements or embeds an encryption algorithm itself, so it's
        // exempt from export compliance. Setting this here means App
        // Store Connect reads it straight from the build and never asks
        // the encryption question again for any future upload, instead
        // of answering it by hand every time (2026-09-07).
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#000000',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-audio',
      'expo-secure-store',
      'expo-web-browser',
      [
        'expo-splash-screen',
        {
          image: './assets/splash-icon.png',
          backgroundColor: '#000000',
          imageWidth: 260,
          resizeMode: 'contain',
        },
      ],
      'expo-localization',
    ],
  },
};
