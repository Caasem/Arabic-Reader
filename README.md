# Arabic Reader

An EPUB reader built for reading classical and modern Arabic. Tap any word and get a real dictionary entry, not a
guess. Everything runs on your device — nothing you read is ever sent anywhere.

**[Try it live](https://caasem.github.io/Arabic-Reader/)** — open it, tap the browser's install/"Add to Home Screen"
option, and it's a real app on your phone or desktop from there. No app store, no account.

It runs in the browser, installs as a PWA, or packages as a native Android, iOS, or desktop app.

This started as a browser extension. It grew into a full reading app, and kept the dictionary and vocabulary
pipeline that made the extension useful in the first place.

## What it does

**Reading**

- Opens any EPUB. Paginated or scrolling, single or two-column, RTL-first throughout.
- Tap a word for its definition, root, and grammatical form, right where you're reading.
- Footnotes resolve inline. Bookmarks and highlights save automatically.
- Focus mode fades the interface away and leaves just the page.

**Dictionary**

- A full offline Arabic dictionary, around 136,000 entries, built into the app from the start. No download, no
  waiting.
- A second dictionary, Al-Wasīṭ, is available as an optional add-on.
- Word lookups include the root and morphological form, not just a translation.

**Vocabulary**

- Every word you look up is tracked automatically, with how often you've seen it and the sentence you found it in.
- Save words to a personal vocabulary list and review them with FSRS, the same spaced-repetition algorithm behind
  modern Anki.
- Sync saved words to a local Anki install with one click.
- Vocabulary Levels grades every word in a book by real difficulty, using a frequency list built from a
  23,000-word classical Arabic corpus, not a guess at what's common.

**Speed reading**

- A fullscreen RSVP mode for Arabic, with an optimal recognition point, adjustable speed, and a summary when
  you're done.

**Your data**

- No account. No server. Everything lives in your browser or on your device.
- Export your whole library and vocabulary as a backup file whenever you want, and import it back later.

## Getting started

```bash
npm install
npm run dev       # start the dev server
npm run build     # production build to dist/
npm run preview   # serve the production build locally
npm test          # run the Playwright test suite
```

### Android

```bash
npm run android:sync     # build the web app and copy it into the Android project
npm run android:open     # open the project in Android Studio
npm run android:build    # build a debug APK
npm run android:install  # build and install onto a connected device
```

### iOS

```bash
npm run ios:sync   # build the web app and copy it into the iOS project
npm run ios:open   # open the project in Xcode
```

### Desktop (Electron)

```bash
npm run electron:dev        # run the desktop shell against a local build
npm run electron:build:win  # package a Windows build
npm run electron:build:mac  # package a macOS build
npm run electron:build:linux
```

## License

This project is licensed under the **GNU General Public License v2.0** — see [`LICENSE`](./LICENSE).

It bundles Arabic dictionary and morphological-analysis data derived from Tim Buckwalter's AraMorph analyzer (via
the Linguistic Data Consortium), which is itself GPLv2-licensed. See `public/dictionary-data/GPL.redistributable.txt`
and `public/dictionary-data/SOURCE-README.md` for that data's own attribution and license text. Vocabulary Levels is
powered by a word frequency list built from the KSUCCA (King Saud University Corpus of Classical Arabic), included at
`public/vocab-list-data/the-list.tsv`.

Because this app bundles GPLv2-licensed data and ships it to your browser or device, this repository's source is
made available here to satisfy the GPL's source-availability requirement for anyone running the built app.
