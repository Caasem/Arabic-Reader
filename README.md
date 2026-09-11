# Arabic Reader

It's a bit tedious to read... in another language especially so; reading a book with a dictionary open, even more; recording words from the dictionary whilst trying to read, eveeen more. With the costs of being efficient, this makes it more efficient to read in Arabic as an English speaker.

Arabic Reader is a browser-based (and optionally desktop, via Electron) Arabic ebook reader with an integrated
dictionary, vocabulary tracking, and FSRS spaced-repetition review.

## Main features

- **Instant dictionary lookup:** tap or click a word while reading, save it to your vocabulary, and review it later with
  FSRS spaced repetition.

## Benefits

- **Keep your reading flow:** look up and save unfamiliar words without constantly switching between apps.
- **Build lasting vocabulary:** revisit the words you encounter through FSRS spaced-repetition review.

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
