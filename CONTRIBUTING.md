# Contributing

Thanks for helping. This is a small project, so the process is light.

## Setup

```bash
npm install
npm run dev        # Vite dev server
```

Open the app and use "Try the sample book" on the Library screen for a book to test with.

## Checks to run before a pull request

```bash
npm run lint       # oxlint
npm run test:unit  # vitest
npm run build      # type-checks (tsc -b) and builds
npm test           # Playwright end-to-end tests
```

The end-to-end suite starts its own dev server (see `playwright.config.ts`). If you run several copies at once, give
each its own port so they do not reuse one another's server.

## Dictionary data

The data files under `public/*-data/` are generated, not hand-edited.

- Al-Wasīṭ, Al-Ṣiḥāḥ and Maqāyīs: `python scripts/extract-lexicon-data.py path/to/db.sqlite` (the database comes from
  the arabic_lexicons project; see each folder's `SOURCE-README.md`).
- Baranov: the build reads the repo-root `russian.txt`. If it is missing the build still succeeds and the dictionary is
  simply empty.
- Do not add data whose licence you cannot state. Record its source in a `SOURCE-README.md` and in `NOTICE.md`.

## Branches, versions and commits

- Work on a branch, not on `main`, and open a pull request.
- Bump `version` in `package.json` and add a `CHANGELOG.md` entry for every user-visible change.
- Keep each commit to one change so it can be reverted on its own.
- Do not commit copyrighted books or fonts you are not allowed to redistribute.

## Native builds

```bash
# Android
npm run android:sync     # build the web app and copy it into the Android project
npm run android:open     # open in Android Studio
npm run android:build    # debug APK
npm run android:install  # build and install on a connected device

# iOS
npm run ios:sync
npm run ios:open         # open in Xcode

# Desktop (Electron)
npm run electron:dev
npm run electron:build:win   # also :mac and :linux
```

## Reporting a bug

Say what you did, what you expected and what happened, plus the version shown in the app and your browser or device.
