# Arabic Reader

A browser-based (and optionally desktop, via Electron) Arabic ebook reader with an integrated dictionary, vocabulary
tracking, spaced-repetition review (FSRS), Anki sync, and a fullscreen Arabic speed-reading (RSVP) mode. Everything
runs client-side — books, vocabulary, and progress are stored locally in the browser (IndexedDB); nothing is sent to
a server.

This is the spiritual successor to an earlier browser-extension version of the same idea (see `anki.js`,
`background.js`, `panel.html` and friends in this project's history) — the reading experience is now a full app
rather than a popup, and the dictionary/vocabulary/review pipeline carries over from it.

## Features

- EPUB reading with tap/click-to-look-up dictionary integration (multiple dictionary providers, including a bundled
  offline Arabic morphological analyzer)
- Personal vocabulary list with per-word encounter history and optional sentence context
- Spaced-repetition review using FSRS (the same scheduling algorithm modern Anki uses)
- One-way sync of saved vocabulary to a local Anki install via AnkiConnect
- Vocabulary Levels — frequency-based rarity badges and beginner/intermediate/advanced word lists, from a personal
  ~5,300-word frequency-ordered list built into the app (no download, ready instantly)
- A fullscreen Arabic speed-reading (RSVP) mode with an Optimal-Recognition-Point display, adjustable WPM, and
  reading statistics
- Installable as an offline-capable PWA, or packaged as a standalone Windows/macOS/Linux desktop app (Electron)
- Export/import your vocabulary and progress as a JSON backup at any time — there is no cloud account and no
  server-side copy of your data

## Getting started

```bash
npm install
npm run dev       # start the dev server
npm run build      # production build to dist/
npm run preview    # serve the production build locally
```

### Desktop build (Electron)

```bash
npm run electron:dev        # run the desktop shell against a local build
npm run electron:build:win  # package a Windows build (electron-builder)
npm run electron:build:mac  # package a macOS build
npm run electron:build:linux
```

## License

This project is licensed under the **GNU General Public License v2.0** — see [`LICENSE`](./LICENSE).

It bundles Arabic dictionary and morphological-analysis data derived from Tim Buckwalter's AraMorph analyzer (via
the Linguistic Data Consortium), which is itself GPLv2-licensed; see `public/dictionary-data/GPL.redistributable.txt`
and `public/dictionary-data/SOURCE-README.md` for that data's own attribution and license text. The Vocabulary Levels
feature is powered by a personal, hand-curated Arabic vocabulary list (`public/vocab-list-data/the-list.tsv`).

Because this app bundles GPLv2-licensed data and ships it to your browser, this repository's source code is made
available here to satisfy the GPL's source-availability requirement for anyone running the built app.
