# Changelog

We're not using git for this project yet, so versions are tracked here plus
in the `VERSION` file, and each delivered zip is named with its version
(`arabic-reader-app-v<version>.zip`, kept in `/root/work/releases/`). Bump
`VERSION` and add an entry here whenever a delivered zip changes.

## v0.8.0 — 2026-09-08

Android support: real touch gestures for the dictionary popup, and a genuine installable `.apk` — no Google Play required.

- **Touch gestures for the Reader's word lookups** (`components/reader/Reader.tsx`, new `DictionaryBubble.tsx`). Single tap, double tap, and hold (long-press) are each independently configurable in a new **Settings → Touch gestures** section to one of: show a condensed definition bubble, quick-save straight to vocabulary with no dialog, open the full dictionary popup, or do nothing (falls back to the pre-existing click behavior). Defaults: single tap → bubble, double tap → quick-save, hold → off.
  - Single tap fires its action *instantly*, with no artificial delay to wait-and-see whether a second tap is coming — a second tap on the same word within 350ms is what retroactively counts as a double-tap, on top of (not instead of) whatever the first tap already did. This was a deliberate tradeoff (discussed and confirmed before implementing): a delayed single-tap would make the *default*, most-common interaction feel laggy on every use, just to make the less-common double-tap gesture slightly simpler to detect.
  - New condensed `DictionaryBubble` component: one gloss line plus a "+"/"✓" save button, anchored above or below the tapped word depending on available space. Reuses the exact same lookup/save primitives (`dictionaryManager.lookup`, `vocabularyService.recordLookup`/`isSaved`/`saveToVocabulary`) as the full popup and quick-save — no separate, divergent dictionary path.
  - Fixed a real bug caught while writing an end-to-end test with genuine (not synthetic) touch input: the bubble's backdrop originally covered the whole screen and intercepted all touches, which meant the *second* tap of a double-tap always hit the backdrop (dismissing the bubble from tap #1) instead of ever reaching the tapped word — silently making the double-tap gesture unreachable under the default bindings. Fixed by making the bubble's backdrop click/touch-through and having Reader's own tap handling dismiss it explicitly instead (`DictionaryBubble.css`, `Reader.tsx`); double-tap also now explicitly closes any bubble tap #1 opened, since the spec calls for double-tap to never leave one on screen.
  - Never calls `preventDefault()` on `touchstart`/`touchmove`, only conditionally on `touchend` — native page scrolling (Scrolling layout) and drag-to-select (for highlighting) keep working exactly as before; a touch with `action: 'none'` bound, or one that moved past a small threshold, falls straight through to the pre-existing click → full popup path untouched.
- **Vocabulary backup (export/import) is no longer Settings-only.** Extracted into a shared `useVocabBackup()` hook + `<BackupControls />` component, now also shown directly in the Vocabulary tab and the Review tab (a compact variant, next to each tab's own header) — so backing up doesn't require a trip to Settings first.
- **Android app via Capacitor**, wrapping the same `dist/` build the PWA and Electron desktop app already use — same offline-first IndexedDB storage, same precached dictionary data, genuinely the same app. New `android/` native project (`npx cap add android`), `capacitor.config.ts`, and `npm run android:sync`/`android:open`/`android:build` scripts. No Play Services, Play Billing, or Firebase dependency anywhere — the output is a plain sideloadable `.apk`, matching the explicit "no Google Play required" goal. App icon generated from the project's existing `icon128.png` into every launcher density plus an adaptive-icon foreground layer over the app's own background color.
  - This session's sandbox has no Android SDK and its network egress blocks Google's and Maven Central's Maven repos, so the actual Gradle compile (`./gradlew assembleDebug`) can't run here — confirmed, not just assumed (checked for a local SDK/cache, then confirmed both `dl.google.com` and `repo.maven.apache.org` are proxy-blocked). The full native project and a `.github/workflows/build-android.yml` CI workflow (builds and uploads a debug APK on every push, using GitHub's hosted runners which have the SDK and open internet) are included so producing the actual `.apk` is a `git push` or an Android Studio open-and-build away — see `android/README-BUILD.md` for exact steps either way.
- New Playwright suite `e2e_test_touch_gestures.js` drives real touch input through the DevTools Protocol's `Input` domain (a raw CDP session, `Input.dispatchTouchEvent`) rather than in-page `element.dispatchEvent(new TouchEvent(...))`. Worth noting for future touch-related tests in this project: the synthetic-dispatch approach was tried first and reproducibly wedged the epub reader's sandboxed content iframe (its script execution got stuck mid-navigation, "Blocked script execution ... sandboxed" in the console, `frame.evaluate` never resolving) — untrusted, script-dispatched touch events interacting badly with the sandboxed `about:srcdoc` iframe epub.js renders content into. Trusted CDP-injected touch input doesn't hit that path and was confirmed to work reliably.

## v0.7.1 — 2026-09-08

Bug fix: reported dictionary lookups sometimes failing with "no definition found" for words that looked completely normal (e.g. بيت).

- **Root cause:** `reader/tokenizer/arabicTokenizer.ts`'s word-matching regex (`ARABIC_WORD_RE`) matches any run of characters in the Arabic Unicode block — but that block also contains Arabic-script *punctuation* (، ؛ ؟ ٪ ٬ ٫ ۔ and others), which sit in the same code-point ranges as the letters. A plain ASCII comma after a word was already handled correctly (it's outside that range), but real Arabic punctuation glued itself onto the adjacent word — turning a click on "بيت،" into a lookup for the literal string "بيت،", which of course isn't in any dictionary. Confirmed with a direct regex test before touching anything.
- **Fix:** `tokenize()` now splits each matched Arabic run further wherever one of these punctuation characters occurs (new `ARABIC_PUNCTUATION_RE`), emitting the punctuation as its own separate non-Arabic token — same treatment ASCII punctuation already got. Handles punctuation at the start, middle, or end of a run (e.g. `بيت؛ذهب` with no space now splits into `بيت` / `؛` / `ذهب` correctly, not just the common case of punctuation followed by a space).
- Verified directly against a set of Arabic-punctuation cases (comma، semicolon، question mark، decimal/thousands separators) before and after the fix, then re-ran all 10 Playwright suites — all pass, confirming this didn't disturb normal word tokenization (diacritics, clitics, etc. all still work as before).

## v0.7.0 — 2026-08-29

Two things, from the "what do we need before publishing this for free" discussion: the start of a reliability pass, and a real Windows desktop build.

- **Windows desktop app (Electron), fully offline.** New `electron/main.cjs` runs a tiny local HTTP server serving the exact same production build the web deploy uses (no `file://` path hacks, no Electron-only build config — root-relative asset paths and the PWA manifest just work) and opens it in a plain `BrowserWindow`. `npm run electron:dev` runs it from source; `npm run electron:build:win` (or `:mac`/`:linux`) produces installers via `electron-builder` (added as a dependency, config lives in `package.json`'s `build` block). Confirmed working with a real headless (Xvfb) smoke test that screenshots the rendered app inside Electron before trusting a packaged build. Produced a genuine portable Windows `.exe` (~103MB without the optional 65MB Vocab Levels dataset bundled in, ~162MB with it) — no installer step, no admin rights, works fully offline out of the box since everything the app does was already client-side. Delivered to the user split into 4 parts (this chat's 30MB file limit) with a plain-language `copy /b` reassembly guide and a SHA-256 to verify the reassembled file. Building a *signed* NSIS installer (rather than the portable target) needs Wine's 32-bit/WoW64 support, which this session's Linux sandbox doesn't have fully configured — the `electron-builder` config and scripts are in place for that regardless; it would just need running from an actual Windows machine or CI.
- **React error boundary** (`components/shared/ErrorBoundary.tsx`) now wraps the whole app in `main.tsx`. Previously a single uncaught exception anywhere in the component tree blanked the entire screen with no recovery path — a real problem the moment this has real users instead of just me testing it. The fallback screen explicitly reassures that saved books/vocabulary/progress live in IndexedDB and are unaffected by a render crash, and offers a reload button plus the raw error message behind a details toggle.
- **Backup reminder banner** (`components/shared/BackupReminder.tsx`, `backupReminder.ts`) — this app has no cloud sync; everything lives in one browser's IndexedDB. A quiet, dismissible banner now nudges someone to export a backup once they've saved 15+ vocabulary words and haven't backed up in the last 14 days (localStorage-tracked, never nags more than once a week after being dismissed). `Settings → Backup`'s export button now records the timestamp this checks against.
- **GPL compliance.** Confirmed the bundled AraMorph dictionary/morphology data (from this project's own browser-extension predecessor) is GPLv2 — meaning publicly distributing this app (the browser downloads that data as part of the build) requires making the app's own source available too, not just the data files. Resolved: added a root [`LICENSE`](./LICENSE) (GPLv2, matching the data's own license), rewrote `README.md` (was still the unedited Vite template) with a real description and a License section explaining the GPLv2/CC BY-SA 4.0 attribution, added a `license: "GPL-2.0"` field to `package.json`, added an in-app attribution note next to the AraMorph settings (`Settings → Dictionaries`, alongside the existing CAMeL CC BY-SA note in `Settings → Vocabulary Levels`), and initialized a local git repository with the full source committed (`git init` + initial commit — this sandbox has `git` but not `gh`/network push access, so the repo is ready to push to a GitHub/GitLab remote from the user's own machine to make it *publicly* available; a local repo alone doesn't yet satisfy "available to anyone running the app" the way a public URL would).

## v0.6.0 — 2026-08-29

New section: **Speed Reader**, a fullscreen Arabic RSVP (Rapid Serial Visual Presentation) reader — one word at a time in a fixed central position, built as a genuinely separate reading environment rather than an animation bolted onto the existing Reader.

- **Fullscreen Focus Mode** — a dedicated `.rsvp-focus` overlay (real Fullscreen API, best-effort — some environments refuse it, and reading still works fine without it) hides all normal app chrome. Default state is just the centered Arabic word; a minimal control bar (Play/Pause, Previous/Next word, WPM, progress, Exit) fades in on mouse movement or a tap and auto-hides after ~2.6s of inactivity while playing — pausing keeps it visible. `C` toggles it manually.
- **Full keyboard control** — `Space` play/pause, `←`/`→` previous/next word, `↑`/`↓` adjust WPM by 25, `F` toggle fullscreen, `C` toggle controls, `R` restart, `Esc` exit, `H`/`?` shortcut help panel.
- **ORP (Optimal Recognition Point) mode**, on by default — keeps each word's approximate recognition letter aligned to a fixed central marker regardless of word length. Implemented for Arabic without ever reversing a string: `speedReader/orp.ts` groups the word into letter+diacritic clusters (so tashkīl never gets separated from its base letter), then splits at a heuristic pivot cluster into before/pivot/after pieces, rendered inside a `direction: rtl` CSS grid so the browser's own bidi and shaping handle everything — the "before" piece (read first) lands on the right, matching normal Arabic reading order. Falls back to plain centered text for single-cluster words (too short for a stable split) or when switched off.
- **Speed control** — preset buttons (100/150/200/250/300/400/500/600 WPM) plus a slider and live numeric readout in the settings popover; changes apply immediately (the playback timer reschedules on every WPM change) and the chosen WPM is remembered for next time (`speedReaderWpm` in preferences).
- **Progress** — a subtle seek-able progress bar ("1,248 / 8,532 words · 14.6%") in the control bar; clicking/dragging it jumps to that position in the book.
- **Context Mode**, off by default — shows a small window of surrounding text beneath the word with the current word visually picked out, toggleable independently of ORP so the default view stays completely bare.
- **Dictionary integration** — clicking the current word opens the same `DictionaryPopup` the normal Reader uses (root, definitions, multiple providers, the existing encounter/lookup counters), and does *not* auto-save it — "+ Add to vocabulary" stays a separate, explicit action, same as everywhere else in the app.
- **Playback controls** — Play/Pause/Restart/Previous/Next plus ±10-word jump buttons; timing is calculated per word (longer words and sentence-ending punctuation get a bit more dwell time rather than a strictly fixed interval).
- **Text navigation** — before entering Focus Mode, pick a book (reusing the same Library) and a starting chapter, or resume exactly where a previous session left off. Position (book, chapter, word index) is saved continuously (new `speedReaderPositions` Dexie table) so closing the app and coming back offers a "Resume where you left off" button.
- **Reading statistics** — each session logs words read, duration, and average WPM to a new `speedReaderSessions` table; a "Session Complete" summary (words read, reading time, average speed, book progress) appears when a session finishes playing to the end, and the setup screen shows a lifetime-average-WPM badge plus each book's 3 most recent sessions.
- Built entirely on the app's real data: a new `speedReader/tokenStream.ts` opens the book's actual EPUB spine (the same `ePub()`/`section.load()` approach `vocabRarity/bookVocabIndex.ts` already established as a second consumer of the raw epub.js `Book` handle, alongside `EpubService.ts`) and flattens it into whitespace-delimited tokens in book order — no rendering, no hard-coded demo text, no separate app.
- New Dexie schema v4 (`speedReaderPositions`, `speedReaderSessions` tables — purely additive, no migration needed) and three new `ReaderPreferences` fields (`speedReaderWpm`, `speedReaderOrpEnabled`, `speedReaderContextEnabled`).
- New Playwright suite `e2e_test_speed_reader.js` covering entering Focus Mode, playback advancing the word index, WPM changes, Previous/Next, the ORP and Context Mode toggles, dictionary lookup from the RSVP word, progress-bar seeking, resume-after-exit, and the session-complete summary — all 10 suites (9 pre-existing + this one) pass. Fixed 4 pre-existing suites whose `hasText: 'Read'` nav-tab locator ambiguously substring-matched the new "Speed Reader" label — narrowed to the label element with an exact-match regex.

## v0.5.1 — 2026-08-29

Swapped the Review tab's scheduler from simple Leitner boxes to FSRS (Free Spaced Repetition Scheduler) — the same algorithm Anki itself has defaulted to since v23.10, replacing the older SM-2 family. Leitner boxes only had one lever (advance a box or drop to box 1), so both interval growth and "how forgiving is a lapse" were crude approximations; FSRS instead tracks per-card difficulty, stability, and predicted retrievability, and schedules from those directly.

- **New dependency:** `ts-fsrs@5.4.1`.
- **`VocabularyItem`** replaces `srBox`/`srDueAt` with the FSRS state block: `fsrsDue`, `fsrsStability`, `fsrsDifficulty`, `fsrsScheduledDays`, `fsrsLearningSteps`, `fsrsReps`, `fsrsLapses`, `fsrsState`, `fsrsLastReview`. Dexie schema bumped to v3 (new `fsrsDue` index), with a migration that backfills existing saved words into FSRS's initial "New" state, carrying over their old due date.
- **Review UI** is now four buttons — Again / Hard / Good / Easy, matching Anki's own grading scale — instead of a single right/wrong choice. Each button previews the interval it will schedule (e.g. "10m", "3d", "2mo") before you tap it, computed by running the scheduler for all four grades without committing (`vocabularyService.previewGrades()`); the card's status pill now reads New/Learning/Review/Relearning (FSRS's own states) instead of "Box N of M".
- All 9 Playwright suites re-run and pass against this change, including the review-flow assertions in `e2e_test_new_features.js`.

## v0.5.0 — 2026-08-29

The six roadmap items logged and assessed earlier are all built: spaced-repetition review, sentence context, quick-add shortcut, export/import, AnkiConnect sync, and offline/PWA support. See `claude/roadmap-next-features.md` in the project for the original assessment each of these was built against.

- **Spaced-repetition review** — the Review tab is a real feature now, not a placeholder. Simple Leitner-box scheduling (`LEITNER_INTERVALS_DAYS = [1, 3, 7, 14, 30, 90]` days): a correct answer advances a box (longer wait next time), an incorrect answer drops straight back to box 1 (due again tomorrow). New words are due immediately so they show up in the very next session. `VocabularyItem` gained `srBox`/`srDueAt` fields (Dexie schema bumped to v2 with a migration that backfills existing saved words as immediately due) and a `srDueAt` index for an efficient "what's due" query.
- **Sentence context (togglable, off by default)** — the `sentence` field already existed in the data model from earlier but was never populated. `Settings → Dictionaries → "Capture sentence context"` turns on `extractSentence()` (new, `reader/wordInteraction/extractSentence.ts`), which finds the containing sentence around a clicked word using the DOM Range API and Arabic/Latin sentence-ending punctuation, falling back to a fixed character window for unpunctuated text (some Arabic texts run long without periods). Shown in the dictionary popup, the Vocabulary card, and used as the "Back" context on Review cards and Anki notes.
- **Quick-add shortcut (togglable, off by default)** — `Settings → Dictionaries → "Quick-add shortcut"` enables Ctrl+Shift+A, which saves the most recently looked-up word straight to vocabulary without opening the popup's "+ Add" button — a small toast confirms it (or explains why not, e.g. nothing looked up yet). Modeled on the same shortcut in this project's earlier browser extension.
- **Export/import vocabulary** — `Settings → Backup` downloads a JSON file with everything that only lived in this browser's IndexedDB (vocabulary, per-word encounter/lookup history, highlights); importing it back in (here, or in a different browser) restores it, upserting by id so a re-import doesn't create duplicates.
- **AnkiConnect sync** — `Settings → Anki sync` pushes saved vocabulary to a running Anki desktop app via the AnkiConnect add-on (`src/anki/ankiConnect.ts`, adapted from the working request shapes in this project's own earlier extension — `anki.js`/`anki-queue.js`). Each word is synced once (`syncedToAnki` flag); re-running only sends what's new. Note: AnkiConnect enforces CORS by origin, so the first sync will very likely fail until the user adds this app's address to AnkiConnect's `webCorsOriginList` (Anki → Tools → Add-ons → AnkiConnect → Config) — the failure message says so explicitly rather than just "sync failed."
- **Offline support + installable PWA** — added `vite-plugin-pwa` with a service-worker precache covering the app shell and the bundled AraMorph dictionary data (~3.8MB total), so the dictionary and previously-opened books work fully offline, not just "probably cached by the browser." The 65MB Vocabulary Levels frequency-rarity file is deliberately *not* forced into the precache (would make every install 17x bigger for a feature that's off by default) — it's cached the first time it's actually fetched (i.e. the first time Vocabulary Levels is enabled) via a runtime CacheFirst rule, and reused offline from then on. Also adds a web app manifest + icons so the app is installable to a home screen on iPad/Android (and desktop) — the icons here are upscaled from the project's existing 128px icon since no larger source was available, so they're a bit soft; worth swapping in higher-resolution art later if that matters.
- New Playwright suites `e2e_test_new_features.js` (sentence context, quick-add, review, export/import, Anki-unreachable error path) and `e2e_test_offline.js` (service-worker precache, full offline reload, dictionary data availability offline) — all 9 suites now pass, including the pre-existing 7.

## v0.4.3 — 2026-08-29

Fixed real reading jank — general sluggishness reported across the whole app, not tied to any one feature.

- **Root cause:** on every rendered section (i.e. every page turn, or every
  new section scrolled into view in scrolling mode), the app fired two
  separate IndexedDB operations *per distinct word on the page* — one to
  update its encounter count (a `get` then a `put`), one to check whether
  it was already saved to vocabulary (a full scan of that book's saved
  words, filtered in JS). A page of Arabic prose easily has 100-400+
  distinct words, all fired concurrently with no batching — so a single
  page turn could kick off many hundreds of overlapping IndexedDB
  transactions and DOM queries competing for the main thread. That's a
  very plausible source of the "whole app feels jaggy/laggy" report,
  independent of Vocabulary Levels or anything else — this affects every
  page turn in the base reading experience.
- **Fix:** both operations are now batched to run once per section instead
  of once per word. `vocabularyService.recordEncounters()` (new) reads all
  of a section's words in a single `bulkGet` and writes them all back in a
  single `bulkPut`, replacing the old per-word `recordEncounter()` loop.
  The "is this word already saved" check now fetches the book's saved
  vocabulary once per section (already-existing `listForBook()`) and does
  one pass over the section's DOM, instead of one query + one DOM search
  per word. Net effect: a page turn now does 2 IndexedDB round-trips
  total, not 2×(distinct word count).
- All 7 Playwright suites re-verified passing against this change; nothing
  about the encounter-count/lookup-count/saved behavior itself changed,
  only how it's batched.
- If reading still feels sluggish after this build, it's worth checking
  whether `npm run dev` vs. `npm run build && npm run preview` was being
  used (dev mode is meaningfully slower by design — see the note in the
  README/setup docs) — but this fix should help either way.

## v0.4.2 — 2026-08-29

Hardened `npm run setup:vocab-data` against the exact failure it was built to prevent.

- Even after v0.4.1, a report came back showing the same "not valid gzip
  data (wrong magic bytes)" error in the app. The setup script itself had
  no way to catch a bad output before writing it — a truncated download
  (dropped connection mid-fetch) would silently produce a corrupt ZIP that
  either failed to parse (safe — script errors out, nothing written) or,
  worse, an existing bad `.gzbin` file from an earlier failed/manual
  attempt would simply be left in place if the script errored before
  reaching the write step, with nothing telling the user their file was
  still bad.
- `scripts/fetch-vocab-data.mjs` now: (1) checks the downloaded ZIP's size
  against the server's `Content-Length` header and fails with a clear
  "download is incomplete, re-run" message if they don't match, instead of
  a confusing "no End Of Central Directory record found"; (2) checks each
  extracted entry's size against the size recorded in the ZIP's own
  central directory, catching truncated/corrupted extraction; (3) after
  gzip-compressing the output, decompresses it again in-process and
  verifies it matches byte-for-byte before writing anything to disk; (4)
  writes to a temp file and renames it into place atomically, so a
  process interrupted mid-write (crash, Ctrl-C, disk full) can never leave
  a half-written file at the path the app reads from. Any failure now also
  prints an explicit "no file was written, safe to just re-run" line.
- Net effect: if the script prints "Done" and "Verified: file starts with
  gzip magic bytes and decompresses back to the extracted data correctly",
  the resulting file is now provably valid gzip data containing exactly
  what was extracted from the official release — that class of error
  should no longer be possible from a script run that reports success. If
  it's still hit after re-running `npm run setup:vocab-data` on this
  build, the download itself (or the release URL) is the next thing to
  check, and the script's console output is the place to look first.

## v0.4.1 — 2026-08-28

One-command setup for the Vocabulary Levels data, plus a clearer error if it's ever malformed.

- **`npm run setup:vocab-data`** — a new script (`scripts/fetch-vocab-data.mjs`)
  downloads the CAMeL frequency-list release directly, extracts the `.tsv`
  from its ZIP container, and gzips it into the exact path/format the app
  expects — one command, no manual unzip/re-gzip/rename steps, no extra
  dependencies (only Node's built-in `fetch` and `zlib`, including a small
  hand-rolled ZIP central-directory reader since Node has no built-in ZIP
  support). Replaces the multi-step manual instructions from v0.4.0, which
  were reported as too fiddly — and easy to get subtly wrong (e.g. renaming
  the downloaded `.zip` straight to `.gzbin` without actually re-compressing
  it, which produces a file that looks right but isn't).
- **Clearer failure mode for a malformed data file.** `frequencyIndex.ts`
  now checks the gzip magic bytes before attempting decompression and
  throws a specific, actionable error ("...may have been renamed from a
  .zip without actually being converted to gzip. Run `npm run
  setup:vocab-data`...") instead of the browser's opaque "incorrect header
  check" — this was reported as the actual symptom hit when the manual
  setup steps went wrong.
- **Test fix:** `e2e_test_settings.js` had a real (if narrow) race — no
  wait between the last Settings checkbox change and a page reload,
  unlike the rest of that same test — that the new Vocabulary Levels
  feature's extra IndexedDB activity on the Settings screen was
  apparently just enough added latency to expose. Preference writes are
  fire-and-forget (`PreferencesContext.updatePrefs`), so a reload that
  happens too soon after a change can race the write; added a short wait
  matching the pattern already used elsewhere in that test file.

## v0.4.0 — 2026-08-28

Vocabulary Levels: a per-book, rarity-tiered vocabulary browser, plus a rarity badge on every word lookup.

- **Word rarity, powered by the CAMeL Arabic Frequency Lists.** Bundles the
  full Modern Standard Arabic frequency list (11.4M unique word types, CC
  BY-SA 4.0, CAMeL Lab/NYU Abu Dhabi — attribution and citation in
  `public/frequency-data/CAMEL-NOTICE.txt`) and, opt-in via Settings or the
  new panel below, builds a word→frequency-rank lookup from it. Each word
  gets a `beginner`/`intermediate`/`advanced` tier from its rank (rank ≤
  2,000 / ≤ 10,000 / beyond, with words never seen in the 11.4M-word list
  tracked separately as "unlisted" but shown grouped with Advanced), plus an
  exact percentile shown as a small badge in the dictionary popup (e.g.
  "Intermediate · top 74%").
  - **A real architecture pivot happened while building this.** The first
    implementation stored one IndexedDB row per word; benchmarking against
    this app's IndexedDB backend measured ~3,600 row-writes/sec, which
    would make ingesting 11.4M rows take the better part of an hour — not
    a reasonable one-time cost. Parsing the same data into a single
    in-memory `Map` instead takes ~14 seconds, so that's what actually
    ships: the ~65MB bundled dataset is fetched once (cached by the
    browser afterward) and reprocessed into an in-memory index each time
    the app is opened and the feature is used, rather than persisted
    word-by-word. Both `Settings → Vocabulary Levels` and the panel itself
    reflect this honestly ("takes a few seconds to process each time you
    open the app") rather than promising a one-time cost the architecture
    doesn't actually deliver.
- **New "Vocab Levels" nav tab.** Opens a collapsible/expandable split
  panel alongside the book: every distinct word tokenized from the current
  book (not just ones you've looked up), grouped by tier, with an
  occurrence count per word. Clicking a word jumps the book pane straight
  to it (briefly highlighted); a Prev/Next stepper walks through every
  occurrence of that word across the whole book, not just the first one.
  Location tracking walks the book's full spine via epub.js's
  `section.load()` (the same mechanism the v0.3.0 footnote feature uses
  for cross-file notes) rather than requiring every chapter to already be
  on-screen.
- **Export.** A plain-text, tier-grouped word list for whichever tier is
  currently showing, via a manual "Export" button in the panel.
- **Bug fix, found while building this:** `section.load()` (epub.js)
  actually resolves with the section's root *Element* (`xml.documentElement`),
  not a full `Document`, despite its own JSDoc claiming otherwise. This
  silently broke two things: the new book-wide word scanner (fixed before
  it ever shipped, since it's new code) and, more importantly, the
  existing v0.3.0 cross-file footnote resolution (`resolveFootnote.ts`),
  which called `.getElementById()`/`.body` on that value — methods that
  don't exist on a plain `Element`, only on a real `Document`. Same-document
  footnotes (the common case) never hit this path and were unaffected, but
  cross-file footnotes (e.g. a shared "endnotes.xhtml") would have silently
  failed to resolve since v0.3.0. Fixed by switching to `querySelector`
  throughout, which works identically on both shapes.

## v0.3.1 — 2026-08-28

Condensed translation-on-hover, opt-in.

- **Hover to peek a word's translation, without opening the full popup.**
  New "Show translation on hover" toggle in Settings → Dictionaries, off by
  default. When on, hovering a word with a mouse (not a tap — touch is
  unaffected) shows a small condensed pill above it with a one-line,
  truncated gloss from the first dictionary result, styled to match the
  Kindle-style overlay the request was modeled on. It appears after a short
  200ms hover-intent delay (so a pointer just passing over text on its way
  elsewhere doesn't flash a preview per word), disappears on mouseout, and
  is purely informational (`pointer-events: none`) — clicking or tapping the
  word still opens the full `DictionaryPopup` exactly as before, unaffected
  by whether the hover pill is showing. Implemented as a new `HoverPreview`
  component plus `mouseover`/`mouseout` listeners in `Reader.tsx`'s existing
  per-section `onRendered` wiring, with a debounce timer + monotonic token
  guard (same pattern used for footnote loading) so a stale lookup can't
  resurrect a preview after the pointer has moved on. Reads the toggle via
  the existing `prefsRef` pattern so flipping it mid-read doesn't require
  re-attaching listeners.

## v0.3.0 — 2026-08-28

Three reading-UX changes: a scrollable reading mode, clearer page-turn
buttons, and footnotes that no longer make you flip away from your place.

- **Scrollable reading, with a toggle.** New "Layout" control in Settings
  (Paged / Scrolling), backed by a new `readingFlow` preference. Uses
  epub.js's own `rendition.flow()` to switch live without reopening the
  book, and persists like every other reading preference. `EpubService`
  tracks the currently-applied flow so repeated `applyPreferences()` calls
  (e.g. dragging the font-size slider) don't redundantly reset scroll/page
  position by calling `flow()` when nothing changed.
- **Next/Previous buttons now say "Next" and "Previous".** They were
  icon-only (‹ ›) before. The arrows are kept as a secondary cue since their
  direction is intentionally reversed to match RTL page-turning, but the
  text is what actually says which way each button goes. On narrow screens
  they collapse back to icon-only circular buttons to keep the footer from
  crowding the progress bar.
- **Footnotes now open in place instead of navigating away.** epub.js
  intercepts *every* internal link click itself and jumps the whole
  rendition to wherever it points — there's no per-link opt-out built in, so
  the reader had no way to tell a footnote reference from a real navigation
  link, and flicking through a long note meant losing your reading position
  entirely. Reader.tsx now runs its own click listener in the capture phase
  (`src/reader/footnotes/resolveFootnote.ts`), ahead of epub.js's own
  handler, and recognizes footnote-shaped links via EPUB3 `epub:type` /
  ARIA `role="doc-noteref"` markup, common footnote/endnote class names, or
  (for older/converted books with no semantic markup at all) a same-document
  link whose text is just a bare or bracketed number. A recognized link is
  resolved — same-document notes read directly from the DOM, cross-file
  notes load via `book.spine`/`section.load()` — and shown in a small
  `FootnotePopup` instead of navigating. The note's HTML is passed through
  an allowlist sanitizer (`sanitizeFootnoteHtml`) before being rendered
  outside epub.js's sandboxed content iframe, since unlike the book's main
  content it isn't otherwise isolated; `<script>`/`<style>`/similar tags are
  dropped entirely rather than just unwrapped, so their contents can't leak
  into the popup as visible text either. If a link can't be confidently
  resolved, the popup falls back to a "Go to note" button that performs the
  normal navigation on request, so nothing is ever silently unreachable —
  and anything not recognized as a footnote at all is left completely alone,
  falling through to epub.js's normal link handling as before.
- New tests: `e2e_test_reading_ux.js` (button labels, the Layout toggle
  actually making the epub.js stage scrollable, its persistence across
  reload, and a same-document footnote round-trip including the sanitizer)
  and `e2e_test_footnote_fallback.js` (the "Go to note" fallback path for an
  unresolvable footnote).

## v0.2.2 — 2026-08-28

Fixes dictionary popups showing raw morphological "noise" alongside an
otherwise-correct translation (e.g. `+at/PVSUFF_SUBJ:3FS+hu/PVSUFF_DO:3MS</pos`
tacked onto a gloss).

- **Parsing bug:** `createDictTable()` (in `engine.ts`) extracted a dict
  line's `<pos>...</pos>` tag with a regex that only recognized the closing
  tag when followed by a space (` <pos>|</pos> `). Every dictionary line ends
  right after `</pos>` with no trailing space, so that branch never matched —
  the closing tag stayed stuck onto the extracted string, e.g.
  `+hu/POSS_PRON_3MS</pos>`. Fixed by matching the whole `<pos>...</pos>`
  span directly with `/<pos>([\s\S]*?)<\/pos>/` and stripping it from the
  gloss regardless of what follows.
- **Design fix, not just the parsing bug:** even correctly extracted, that
  `pos` field is a raw Buckwalter affix-analysis string (which prefix/suffix
  morphemes combined to form the word — internal grammar-matching data, not
  a conventional noun/verb/etc. label). Displaying it as a tag next to the
  gloss read as noise regardless of the parsing bug, so `AramorphDictionaryProvider`
  no longer surfaces it in `DictionaryEntry.senses[].pos` at all. The
  grammatical role is usually already spelled out in plain English inside
  the gloss itself (e.g. "write [he/it <verb>]"). The `root` field (shown
  separately in the popup) is unaffected and still displayed.
- Added a regression check to `e2e_test_bundled_dict.js` asserting no
  `<pos>`/`</pos>` fragments or raw AraMorph affix codes (`PVSUFF`, `NSUFF`,
  `POSS_PRON`, `/DET+`, `/CONJ+`, `/PREP+`) ever appear in a popup again.

## v0.2.1 — 2026-08-28

Fixes a real bug: clicking a word did nothing at all under `npm run dev`
(worked fine in a production build/`vite preview`).

- **Root cause:** React 18 `<StrictMode>` (already on in `main.tsx`)
  deliberately mounts effects twice in development — mount, cleanup, mount —
  to surface exactly this class of bug. `Reader.tsx`'s effect opens an
  `EpubService` and calls `svc.destroy()` on cleanup; `EpubService.open()` is
  a long async chain (read file → parse EPUB → render into the container →
  load nav → display). Under the dev-only double-mount, `destroy()` could run
  on the first instance while its `open()` was still mid-flight, leaving a
  zombie epub.js rendition attached to the same DOM container the second
  (real) instance was also rendering into — so word-wrapping silently
  produced 0 wrapped words and clicks did nothing. Production builds are
  unaffected (StrictMode's double-invoke is dev-only).
- **Fix:** `EpubService` now tracks a `destroyed` flag and checks it after
  every `await` inside `open()`, bailing out (and cleaning up whatever it
  already constructed) rather than attaching a torn-down instance to the
  container. Verified with a headless Playwright run against `npm run dev`
  with StrictMode left on: word-wrapping and dictionary popups now work
  correctly on first load.
- No user-facing feature changes; this is a dev-mode-only fix. (The
  `Cannot read properties of undefined (reading 'replaceCss')` console error
  some may still notice on book-open is a separate, harmless epub.js
  internal-storage race unrelated to this bug — it appears in both dev and
  production builds and doesn't affect functionality.)

## v0.2.0 — 2026-08-28

Real dictionary data integration (AraMorph, from the DictionaryChromeExtension
project) is now the default dictionary, plus reading preferences and
dictionary switching from the previous version are unchanged.

- **AraMorph is bundled by default.** The six data files (`dictprefixes`,
  `dictstems` — 136k stem entries, `dictsuffixes`, `tableab`, `tableac`,
  `tablebc`) ship under `public/dictionary-data/` and are fetched + parsed
  automatically on first run — no upload required. The result is cached in
  IndexedDB so later loads are instant.
- **AraMorph is now the sole default-enabled dictionary provider**; the two
  mock dictionaries (A/B) are still available and toggleable in Settings but
  start OFF.
- Settings panel: the AraMorph "Data loaded" badge now reflects the async
  bundled load (previously it only updated after a manual upload). Copy and
  button labels updated ("Upload custom files" / "Replace with custom files"
  / "Reset to default") since upload is now an override, not a requirement.
- Added `AramorphDictionaryProvider.resetToBundled()` so "Reset to default"
  drops a custom upload and reloads the bundled dataset, rather than leaving
  the dictionary empty.
- GPL attribution: `gpl.txt`, `GPL.redistributable.txt`, the extension's
  top-level `LICENSE`, and its `README.md` (as `SOURCE-README.md`) are bundled
  alongside the data files in `public/dictionary-data/`.
- New Playwright test `e2e_test_bundled_dict.js`: confirms the bundled
  dictionary auto-loads with zero manual upload, AraMorph is enabled by
  default while mocks are not, and a real lookup (كتاب → "book") resolves
  through the full bundled dataset.
- `e2e_test_settings.js` updated: mocks are no longer enabled by default, so
  the provider-filtering test now explicitly enables both mocks first; button
  text updated to match the new Settings copy.

## v0.1.0 — 2026-08-28 (earlier build)

- Reading preference controls (theme, font size, line height, reading width)
  backed by a `PreferencesContext` and persisted via Dexie/IndexedDB, applied
  live to the epub.js rendition.
- Dictionary switching UI in a new Settings panel: enable/disable individual
  dictionary providers; lookups only query enabled providers.
- First integration of the AraMorph engine as a real (non-mock) dictionary
  provider, gated behind a manual 6-file upload in Settings (no bundled
  default data yet).
- Highlighting, vocabulary list, and library/reader flows from prior work
  (see `README.md` for the full feature list) carried forward unchanged.
