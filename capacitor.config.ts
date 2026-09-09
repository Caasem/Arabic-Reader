import type { CapacitorConfig } from '@capacitor/cli';

// Wraps the same built PWA (dist/) that vite build already produces for
// the web and Electron targets in a native WebView/WKWebView shell (see
// android/README-BUILD.md and ios/README-BUILD.md for each platform's build
// steps), so the Android/iOS app is the identical app -- same code, same
// offline-first IndexedDB storage, same service worker-precached dictionary
// data -- just installed as a real app instead of "Add to Home Screen".
//
// Deliberately NOT configured for either platform's store: no
// play-services/play-asset plugins, Play Billing, or Firebase on Android;
// no App Store Connect/TestFlight setup for iOS. `npx cap add android` /
// `npx cap add ios` alone produce a plain project you can sideload/run
// straight onto your own device (assembleDebug's .apk on Android, an
// Xcode Run on iOS) -- there's nothing here that depends on either
// platform's store or its background services being present.
const config: CapacitorConfig = {
  appId: 'org.arabicreader.app',
  appName: 'Arabic Reader',
  webDir: 'dist',
  // Capacitor's default local WebView origin (https://localhost) serves
  // dist/ with real root-absolute paths, matching how vite build emits
  // asset URLs (/assets/..., /icons/...) -- the same reason the Electron
  // build (see electron/main.cjs) runs a local HTTP server instead of
  // loading dist/index.html via file://, where those absolute paths would
  // 404. No androidScheme override needed; the default already does this.
  android: {
    // Keep app data (IndexedDB/vocabulary, saved books) across app updates
    // -- these are reinstalled/upgraded .apks, not fresh installs, and
    // losing a reader's saved vocabulary on every update would be a
    // regression from the PWA/Electron builds' behavior.
    allowMixedContent: false,
  },
};

export default config;
