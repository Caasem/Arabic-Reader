import type { CapacitorConfig } from '@capacitor/cli';

// Wraps the same built PWA (dist/) that vite build already produces for
// the web and Electron targets in a native Android WebView shell, so the
// Android app is the identical app -- same code, same offline-first
// IndexedDB storage, same service worker-precached dictionary data -- just
// installed as a real .apk instead of "Add to Home Screen".
//
// Deliberately NOT configured for Google Play: no play-services/play-asset
// plugins, no Play Billing, no Firebase. `npx cap add android` alone
// produces a plain Gradle Android project that assembleDebug/assembleRelease
// straight into a sideloadable .apk (see android/README-BUILD.md), which is
// exactly what "no Google Play should be required" calls for -- there's
// nothing here that depends on Play Services being installed on the device,
// and nothing that requires the Play Store to distribute it.
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
