# Crowd sense ranking: infrastructure spec

Status: draft for review, 2026-10-05. Not implemented.
Platforms: Web, Windows/Mac (Electron), iOS and Android (Capacitor), same web code as everything else.
Related: [storage-and-sync.md](storage-and-sync.md) (this feature must not leak into it, see section 10).

## 1. Goal

A word often shows many dictionary entries and meanings. When a reader saves a word from the popup, the entry they chose is a vote for it. There is **no new control**: the signal is the reader's normal saves (the round + on an entry, saving a selection, saving an edited meaning). With consent, those saves are counted across all readers. They are pseudonymous: linked to a random install ID, not a name or email, but still linkable to each other and to the books and words chosen (sections 2 and 12). The popup then lists the most saved entry first inside each dictionary, and, where the data supports it, the most chosen meaning first inside an entry. The rest move lower.

**What the reader sees:** an order, a "Best fit here" tag, a dotted underline on words readers often stop on, a "Before this chapter" list, an auto-built glossary, and a flashcard that starts with the best-fit meaning. **No vote counts are ever shown in the app, and no button, icon or screen is added to the popup to collect votes.**

### Non-goals

- Nothing is sold, licensed or disclosed to a third party, and no export to outsiders is built. The hosting provider is the one exception in kind: it runs the servers as a processor under our contract, so it can see network addresses and the stored votes. The consent text says this.
- The crowd never adds, edits or removes dictionary content. It only **reorders** meanings that already exist.
- No free-text "suggest a meaning".
- No new buttons or controls in the dictionary popup for voting. Only what the reader already does counts.
- No accounts with passwords.

## 2. Principles

1. **Reading never needs the network.** Without a ranking file the popup behaves exactly as it does today (dictionary order).
2. **Opt-in, off by default.** One switch controls every send. Turning it off stops sending and deletes the queue.
3. **Pseudonymous and aggregate-only.** Votes are linked to a random install ID, not to a person, and carry no name, email, reading history or text. They do reveal which book, word and meaning an install chose, and the consent text says so (section 12). The word "anonymous" is not used in the product or the privacy page.
4. **Reorder only.** The worst possible outcome is a bad order, never missing or invented content.
5. **Kill switch.** A server-side flag and a local setting can each turn the feature off without an app update.
6. **Rankings are signed.** The app uses a ranking file only after verifying its signature.

## 3. Decision: this is our first backend

[storage-and-sync.md](storage-and-sync.md) lists "No backend of ours" as a principle for the sync options. This feature is the first thing that needs one, so that principle gets an explicit exception: **the backend exists only for crowd ranking, holds no user content, and the app is fully functional without it.** Sync stays server-free. Update that principle's wording when this ships.

## 4. Architecture

```
 Reader device                         Our backend                          Reader devices
 ─────────────                         ───────────                          ──────────────
 save in popup ──► consent gate ──► outbox queue ──(HTTPS, signed)──► Ingest API ──► Votes store
                                                                         │ validates, rate-limits
                                                                         ▼
                                                                  Aggregation job (nightly)
                                                                         │ thresholds, weighting, snapshots
                                                                         ▼
                                                              Ranking packs + manifest (signed)
                                                                         │ static files on a CDN
 popup reorders ◄── verify signature ◄── pack cache ◄──(GET, ETag)───────┘
```

Two clearly separate paths:

- **Write path** (rare, small): device → Ingest API → Votes store.
- **Read path** (frequent, cacheable): device → static signed packs. No database is touched when a reader opens a book.

This keeps cost near zero and lets the read path survive a backend outage.

## 5. Identifiers

### 5.1 `senseKey`: one meaning, stable across rebuilds

`DictionaryEntrySense` has no id today (`src/types/dictionary.ts`). A vote must still point at a meaning after a dictionary is regenerated (`scripts/extract-lexicon-data.py`), so the key is derived from content, not position.

```
senseKey = base32( sha256( providerId | normalize(headword) | normalize(gloss) )[0..10] )
```

- `normalize`: Unicode NFC, strip tashkeel for the headword only, trim, collapse whitespace, lowercase Latin.
- The popup computes it at render time; nothing is stored in the dictionaries.
- Two senses whose normalised content is identical share one key and are indistinguishable. This is accepted: they are the same meaning to a reader, and a sense index is **not** used because it would change when a dictionary is re-ordered.
- `providerId` is part of the key, so a key is only meaningful inside one dictionary (see 8.2).
- A pack carries, per word, a list of `senseKey` values. A key the client does not know is ignored.

### 5.1b `entryKey`: one dictionary entry

The round + saves a whole entry, so the main vote unit is the entry, not the meaning. An entry is one headword block in one dictionary (a verb form, a noun), with its own meanings.

```
entryKey = base32( sha256( providerId | normalizeArabic(headword) | normalizeArabic(root) | verbForm )[0..10] )
```

- It is computed at render time from the entry's own fields (`headword`, `root`, `verbForm`), like `senseKey`, and uses no position.
- Two entries that normalise identically share a key, as with `senseKey`.
- A `senseKey` (5.1) is only used when a finer signal can name a single meaning inside an entry (see 8.2 and 10.5).

### 5.2 `lemmaKey`: what a word is

`lemmaKey = sha256(normalize(lemma) | pos)[0..10]`, using the lemma from morphology (`MorphologicalAnalysis.lemma`) or the headword when there is none. A pooled ranking (section 8.2) is keyed by `lemmaKey`.

### 5.3 `bookKey`: which book

These hashes are **not secret**. A known title or dictionary word can be hashed and matched. They keep the wire format small and stop casual reading of logs; they do not hide what a book or word is. Treat every key as readable (section 12).

`BookMeta.id` is local, so it cannot identify a book across readers. Use:

```
bookKey = sha256( normalize(title) | normalize(author) | language )[0..12]
```

- It identifies a **work**, not a file. Different files of the same book match.
- Different editions or translations can differ. If the EPUB has an ISBN or `dc:identifier`, include it as an optional second key (`editionKey`) and prefer it when both exist.
- The file itself is never hashed or sent.

### 5.4 `installId` and install key

- At first opt-in the app generates an **Ed25519 keypair** and keeps the private key on the device (Keychain/Keystore where available, else IndexedDB). `installId = base32(sha256(publicKey)[0..16])`.
- There is no username and no password. The public key is registered on first use (trust on first use).
- Reset in Settings creates a new pair. Old votes stay counted under the old ID until deleted or until the install expires (section 12).
- **Signing proves a request came from the holder of a key. It does not prove the holder is a real reader.** One person can create many keys, so signatures give no Sybil protection. That comes only from weighting, rate limits and thresholds (sections 8 and 13), which raise the cost of abuse without proving real reading.
- At registration the server also issues a random **recovery code**, shown once in Settings and kept in the key store. It is the second way to authenticate a deletion (section 11).
- The key is **not** part of the synced tables and is never exported with backups.

## 6. Data collected

Per vote (one message item):

| Field | Example | Notes |
|---|---|---|
| `bookKey` | `k7q2m9…` | From section 5.3 |
| `lemmaKey` | `p4d8x1…` | From section 5.2 |
| `providerId` | `baranov` | Which dictionary the entry belongs to |
| `entryKey` | `e5t1a8…` | From section 5.1b. The main vote unit |
| `senseKey` | `h2v9c0…` | Optional, from section 5.1. Only when one meaning inside the entry can be named (see 10.5) |
| `source` | `entry`, `selection` or `edit` | Which existing save action produced the vote |
| `pos` | `0` | Zero-based position of the saved entry (or meaning) when it was shown, used to correct for position bias (8.2) |
| `rev` | `17` | Per-install revision of this vote, see 7.4 |
| `action` | `save` or `unsave` | Saving a word adds the vote; removing the saved word retracts it |
| `day` | `2026-10-05` | Date only, UTC |
| `form` | `II` | Optional verb form, only if known |

Per envelope: `installId`, `sig`, `nonce`, `appVersion`. The server also sees the network address during a request, for rate limiting only; it is not stored with votes and its counters expire in minutes.

**Never collected:** book text, sentences or sentence hashes (phase 1), notes, highlights, reading history, lookup logs, device names, IP stored after rate-limiting (rate-limit counters expire in minutes), email, name.

Optional later signals (each needs its own switch line in Settings and a spec amendment): lookup rate per `lemmaKey`, saved-to-card rate. Both are sent as per-day counts, not events.

## 7. Backend

### 7.1 Components

| Component | Job | Notes |
|---|---|---|
| **Ingest API** | Validate, rate-limit, write votes | One small stateless service |
| **Votes store** | Latest vote per `(installId, bookKey, lemmaKey, providerId, entryKey)` | SQL table |
| **Aggregation job** | Count, weight, apply thresholds, write packs | Nightly, idempotent |
| **Pack storage + CDN** | Serve signed ranking files | Static, cacheable |
| **Admin console** | See the backend table, roll back, kill-switch | A few authenticated pages or a CLI |

### 7.2 Suggested hosting (cheap, scales to zero)

Cloudflare Workers (ingest) + D1 (votes) + R2 (packs) behind the CDN, with a scheduled worker for aggregation. Any equivalent works (a small VPS with SQLite and a cron job is also fine at first). Choose one and record it in the repo README. Expect single-digit dollars per month at low volume.

### 7.3 Votes store schema

```
installs(
  installId      TEXT PRIMARY KEY,
  publicKey      BLOB NOT NULL,
  firstSeenDay   TEXT NOT NULL,      -- date, UTC
  weight         REAL NOT NULL,      -- computed nightly, 0..1
  banned         INTEGER NOT NULL DEFAULT 0,
  maxRev         INTEGER NOT NULL DEFAULT 0,   -- highest rev applied for this install, see 7.4
  lastSeenDay    TEXT NOT NULL                 -- for the 12-month inactivity expiry
)

deletions(
  installId      TEXT PRIMARY KEY,
  deletedAt      TEXT NOT NULL                 -- kept 35 days, see 12.1
)

votes(
  installId  TEXT NOT NULL,
  bookKey    TEXT NOT NULL,
  lemmaKey   TEXT NOT NULL,
  providerId TEXT NOT NULL,
  entryKey   TEXT NOT NULL,
  senseKey   TEXT,                 -- optional finer signal, see 10.5
  source     TEXT NOT NULL,        -- entry | selection | edit
  pos        INTEGER NOT NULL,     -- position shown at save time, for bias correction
  saved      INTEGER NOT NULL,     -- 1 = saved, 0 = retracted (a tombstone)
  rev        INTEGER NOT NULL,     -- per-install revision, see 7.4
  form       TEXT,
  day        TEXT NOT NULL,
  PRIMARY KEY (installId, bookKey, lemmaKey, providerId, entryKey)   -- one live vote per entry per word per book
)

snapshots(
  id INTEGER PRIMARY KEY, createdAt TEXT, manifestSha TEXT, note TEXT
)
```

There is no vote history table. An `unsave` keeps its row with `saved = 0` and its `rev` as a tombstone (section 7.4). A reader can save several entries of the same word in one dictionary; each is its own vote.

### 7.4 Ordering of offline votes

A device can queue saves and un-saves while offline and retry after a timeout, so arrival order is not edit order. Every vote therefore carries a revision.

- The client keeps one monotonic counter `seq` per install and stamps each change to a vote with the next value as its `rev`. It is persisted before the item is queued.
- The server applies an item only if `rev` is **greater** than the stored `rev` for that vote key. An equal or lower `rev` is ignored and reported as already applied, so a retried request is **idempotent** and an old queued pick can never overwrite a newer clear (or the reverse).
- Within one request, items are processed in ascending `rev`. Two items for the same vote key in one request are legal; the highest `rev` wins.
- A `clear` is stored as a tombstone. Tombstones are kept 30 days, longer than the 14-day age limit below, so a stale pick cannot arrive after its tombstone is purged. Tombstones are excluded from aggregation.
- **Age limit, enforced by the server.** Every item carries `day`, the UTC date of the change. The server rejects an item whose `day` is more than 15 days before the request's date (14 days plus one day of timezone slack) with `too_old`, and one dated in the future with `bad_item`. The client also drops queued items past 14 days, but correctness does not depend on clients doing so. A delayed `pick` therefore cannot land after the tombstone that superseded it has been purged. `too_old` is not retryable; the client drops the item.
- **Accepted window.** The server stores `installs.maxRev`, the highest `rev` it has applied for the install. An item is accepted only if `rev <= maxRev + 10000`. A legitimate client cannot exceed this: it increments `rev` once per local change, coalesces a queue to at most one item per vote key, and a reader would have to make ten thousand changes while offline. An item beyond the window is rejected with `rev_too_far`.
- `maxRev` is updated once per request, in the same transaction as the vote writes, to the highest `rev` applied.
- **Per-item results.** `POST /votes` returns `200` with a result for each item: `applied`, `stale` (ignored, nothing to do), or `rejected` with a code (`rev_too_far`, `too_old`, `unknown_sense`, `bad_item`). The client removes `applied` and `stale` items from its queue and keeps `rejected` ones only if the code is retryable (none are, so they are dropped and logged locally). The response always includes the install's current `maxRev`.
- **Recovery never rewrites history.** If the client's local counter is below the server's `maxRev` (a restored device, or the same key reused after a reinstall), the client raises its counter to `maxRev` so that **new** user actions get revisions above everything the server has seen. **Pending items keep the revision they were created with.** They are never re-stamped, because that would let an old pick outrank a clear the server has already accepted (a queued pick at `rev=3`, a newer clear accepted at `rev=4`, and the old pick re-stamped to `rev=5` would win).
- **The server alone decides whether a pending item is stale**, per vote key: it applies the item only if its `rev` is higher than the stored `rev` for that `(installId, bookKey, lemmaKey, providerId, entryKey)`, or no row exists. A pending item at `rev=3` against a stored `rev=4` is reported `stale` and the client drops it. A pending item for a key the server has never seen is applied even though its `rev` is below `maxRev`, since revisions are per install and `maxRev` reflects other votes. Equal revisions are always `stale`.
- **After a stale result the local pick may differ from the server's state.** That is harmless: rankings are the only consumer. The reader's own popup keeps showing their local choice, and saving the word again is a new user action that gets a fresh revision above `maxRev` and takes effect.
- A client whose counter is above the accepted window sends nothing until it has read `maxRev` from a response and reset its counter to it. These rules mean a legitimate offline queue is never rejected unpredictably and never overrides a newer server state.

### 7.3.1 Rate-limit counters

Kept in memory or in the edge cache, keyed by `installId` and IP, expiring in minutes. Not written to the votes store.

## 8. Aggregation

### 8.1 Weighting

Each vote counts as the install's `weight`:

```
weight = min(1, ageDays / 14) × min(1, distinctBooks / 2)
```

- A brand-new install counts little. After two weeks and two books it counts fully.
- The client cannot prove reading time, so none is trusted. Reading minutes may later be a soft client-reported input, never a gate.

### 8.2 Two levels of ranking

1. **Pooled by lemma and dictionary** (all books): needs far fewer readers, covers every word.
2. **Per book**: more specific, only when the book has enough readers.

**Rankings are computed per `(lemmaKey, providerId)`, never across dictionaries.** Sense keys include the provider, readers see different sets of dictionaries, and a reader cannot pick a meaning they were never shown. Pooling all dictionaries' meanings for one lemma would bias shares towards whichever dictionary is most often enabled. Each dictionary's senses compete only with that dictionary's other senses, so the app reorders senses inside each dictionary group and does not reorder the groups themselves (that remains the reader's dictionary order).

**Entry level and meaning level.** A save names an entry, so ranking works in two steps inside each dictionary:

1. **Entries.** An install's weight for a word in a dictionary is split equally across the entries it saved, so saving everything adds no more than saving one. An entry's score is the sum of those shares. Entries are reordered by score.
2. **Meanings inside an entry.** Only votes that carry a `senseKey` (a saved selection or an edited meaning that matches one meaning) count here. Meanings are reordered only when this level passes its own thresholds; otherwise they keep the dictionary's order inside the entry. An entry with one meaning needs no second step.

**Position bias.** Readers tend to save what is shown first, and a ranking that moves X to the top makes X more likely to be saved, which entrenches it. Each vote carries `pos` so aggregation can down-weight saves of whatever was shown first. Open decision 11 covers an optional hold-out: a fixed share of installs (chosen from the `installId`) always see dictionary order, and their saves calibrate the rest.

The "Best fit here" tag, if the app shows one, is shown on the top entry (and its top meaning, when meaning level passes) of the reader's primary (first) dictionary group only. Other groups are reordered without a tag. A dictionary with a single entry that has a single meaning for the word has nothing to rank and is skipped. Two dictionaries that give the same meaning do not share votes; merging near-duplicate meanings across dictionaries is a later phase (section 15, phase 4).

Final order for a word in a book uses smoothing so a thin per-book signal leans on the pooled prior:

```
share_book(s) = ( votes_book(s) + K × share_pooled(s) ) / ( n_book + K )     K = 20
```

Rank by `share_book`. The top meaning is tagged "Best fit" only when the thresholds below pass.

### 8.3 Thresholds (all must hold, otherwise dictionary order is used)

| Rule | Value |
|---|---|
| Weighted saves for the word in that dictionary (pooled level). Applied to entries, and separately to meanings inside an entry | at least 30 |
| Distinct installs for the word in that dictionary | at least 10 |
| Top meaning's share | at least 40% |
| Lead over the second meaning | at least 10 points |
| Contributors to the book (per-book level only) | at least 20 |

These live in server config and are written into each pack, so they can change without an app update.

### 8.4 Hard-word marking

A word is marked when its lookup rate is in the top 15% for the book. Lookup counts are **not** collected in phase 1. Until then the marking is computed locally from the reader's own lookups. See phase 3.

### 8.5 Sensitive texts

A `deny` list (by `bookKey`, `lemmaKey` or a tag) forces dictionary order. Quranic, hadith and sectarian texts start on the list. The list is part of the manifest.

### 8.6 Snapshots and rollback

Every nightly run writes a dated pack set and records it in `snapshots`. The manifest points at the live set. Rolling back means pointing the manifest at an earlier set. Keep 30 days.

### 8.7 Trust tiers and optional Apple sign-in (proposed, phase 4)

Everyone can contribute without signing in. Signing in is optional and makes a reader's votes count for more, because it is harder to fake.

| Tier | Who | Base weight | Notes |
|---|---|---|---|
| 0 | Anonymous install | 0.3 | Fully functional, as in sections 5 to 8 |
| 1 | Signed in with Apple | 1.0 | One person counts once across all their devices |
| 2 | Established reader | up to 1.5 | Tier 1 or 0 plus the earned factors below |
| 3 | Curator (invited) | 3.0, capped | Maintainer-flagged, used for sensitive texts and disputes |

**Final weight** = base × `ageFactor` × `breadthFactor` × `consistencyFactor`, each in 0..1, with a hard cap per voter of 3.0 and a cap that no tier can supply more than 50% of the weight behind one word's top meaning.

**Earned factors (computed nightly on the server, never shown to the reader):**

- `ageFactor`: rises over 14 days of activity.
- `breadthFactor`: rises with the number of distinct books and words the voter has picked in.
- `consistencyFactor`: falls for a voter who flips the same pick often or votes in bursts.
- Optional later: a soft proficiency signal reported by the client (for example, how many of the reader's saved words they retain). It is unverifiable, so it can raise weight only slightly and never above Tier 2.
- Agreement with consensus is **not** used as a reward. It entrenches the majority and punishes legitimate expert minorities. It may only be used to down-weight a voter who disagrees with consensus on almost every word over a large sample, as an abuse signal.

**How Apple sign-in works:**

1. The app starts Sign in with Apple, with a nonce, and sends the resulting identity token to the server.
2. The server verifies the token (Apple's public keys, audience equal to our app/service ID, nonce, expiry).
3. The server stores only `accountId = HMAC(serverSecret, appleSub)`. It does **not** store the Apple email or the raw Apple user ID.
4. The app signs a link request with its install key, binding that `installId` to the `accountId`. One account can link several installs (phone, desktop).
5. Aggregation counts at most **one vote per account per `(bookKey, lemmaKey, providerId)`**: where several linked installs voted, the one the server applied most recently wins (the votes table gains `appliedAt` for this). Anonymous installs still count per install.
6. Votes stay keyed by `installId` in the votes store. The install-to-account map lives in a separate table readable only by the aggregation job, which limits how widely the linkage is visible.

**Account lifecycle and privacy:**

- Signing in is optional, and signing out unlinks the installs; their votes revert to Tier 0 weight.
- "Delete my shared picks" also works from a signed-in account on a new device, deleting every linked install's votes. That solves the lost-key case in section 11 for signed-in readers.
- Deleting an account must be possible in the app and must revoke the Apple token, as the platform's account-deletion rules require. Check the current App Store requirements before shipping.
- Linking raises the identifiability of votes: the account ties several installs together. The consent text and privacy page must say so when the reader signs in.
- Apple sign-in does not stop abuse by itself. A determined attacker can create many Apple IDs, so Tier 1 raises cost, not certainty. Rate limits on account creation and linking, and bans at account level, still apply.

**Platforms:** native on iOS and macOS. Windows, Android and web use Apple's web flow, which needs a services ID and a redirect URL, so confirm it works inside the Electron and Capacitor shells before promising it everywhere.

## 9. Pack format and signing

### 9.1 Files

```
/manifest.json                    small, fetched daily with ETag
/packs/v1/book/{bookKey}.json     per-book ranking, gzip, target <= 100 KB
/packs/v1/pooled/{shard}.json     pooled by lemma, sharded by first 2 chars of lemmaKey (256 shards)
```

### 9.2 `manifest.json`

```json
{
  "formatVersion": 1,
  "sequence": 412,
  "generatedAt": "2026-10-05T03:00:00Z",
  "expiresAt": "2026-10-12T03:00:00Z",
  "enabled": true,
  "minAppVersion": "0.30.0",
  "thresholds": { "minPicks": 30, "minInstalls": 10, "minShare": 0.4, "minLead": 0.1, "minBookContributors": 20 },
  "deny": { "bookKeys": ["..."], "lemmaKeys": [] },
  "packs": { "book/k7q2m9": "sha256-…", "pooled/a4": "sha256-…" },
  "signature": "ed25519:…"
}
```

### 9.3 A book pack

```json
{
  "formatVersion": 1,
  "bookKey": "k7q2m9…",
  "words": {
    "p4d8x1…": { "order": ["h2v9c0…", "q1m3z8…", "t7b5w2…"], "best": "h2v9c0…", "hard": true, "also": ["p9x2…","m1c7…"] }
  }
}
```

- Each word has one record per dictionary it has a ranking for: `"p4d8x1…": { "baranov": { "entries": ["e5t1…", "c9k2…"], "bestEntry": "e5t1…", "senses": { "e5t1…": { "order": ["h2v9…", "q1m3…"], "best": "h2v9…" } } } }`. `entries` lists entry keys, best first. `senses` has a record only for an entry whose meaning-level ranking passed its thresholds. `bestEntry` and `best` are present only when the thresholds pass.
- **No counts** are in a pack. They stay in the backend.
- `hard` and `also` (co-lookups) arrive in later phases.

### 9.4 Freshness and anti-rollback

A valid signature does not prove a file is current. A CDN or device cache could keep serving an old manifest after the kill switch changed or a rollback happened.

- `sequence` increases with every manifest the server publishes. The app stores the highest `sequence` it has accepted and **rejects any manifest with a lower one**.
- `expiresAt` is the generation time plus 7 days. After `expiresAt` the app keeps using the cached packs for up to a **14-day grace period**, then falls back to dictionary order until a fresh manifest arrives. The reader's own picks are unaffected.
- A rollback (section 8.6) publishes a **new manifest with a new, higher `sequence`** that points at the earlier packs. Sequence numbers are never reused, so a rollback cannot be undone by replaying an old manifest.
- The manifest is served with a short cache lifetime (1 hour) and the app checks it at least daily when online, so `enabled: false` reaches clients quickly.
- The signed manifest covers `sequence`, `generatedAt`, `expiresAt`, `enabled`, the deny list and every pack hash.

### 9.5 Signing

- Packs are hashed in the manifest; the manifest is signed with an **Ed25519 private key held offline or in the host's secret store**. The public key is **compiled into the app**.
- The app verifies the signature and each pack's hash before use. A bad signature means the file is ignored and dictionary order is kept.
- Key rotation: the app embeds two public keys (current and next). Document the rotation procedure before launch.

## 10. Client integration

All of this is behind a single feature flag (`crowdRanking`) that also respects the manifest's `enabled` and `minAppVersion`.

| Piece | Where (to verify against current code) | Change |
|---|---|---|
| Meaning keys | new `src/crowd/senseKey.ts` | `senseKey`, `lemmaKey`, `bookKey` helpers, with unit tests |
| Ranking cache | new `src/crowd/packStore.ts` | Fetch manifest, verify signature, cache packs in IndexedDB, refresh daily |
| Applying a ranking | `src/dictionary/` (alongside `providerOrder.ts`) | Reorder entries inside each dictionary, and meanings inside an entry, before the popup groups them |
| Popup | `src/components/reader/DictionaryPopup.tsx` | **No new controls.** Optional, off-by-default visual markers only (a line beside the best entry, faded or folded other meanings). The default is order only |
| Save hooks | the popup's existing save callbacks (`onSaveEntry`, `onSaveSelection`) and the edit-save path | Emit a vote when a save happens, per 10.5 |
| Personal saves | new local table (see below) | The entry the reader saved comes first in their own popup |
| Consent gate | new `src/crowd/consent.ts` | Single place every send goes through |
| Outbox | new `src/crowd/queue.ts` | Capped, expiring, cleared on opt-out |
| Settings | `src/components/shared/settings/` | The switches mocked up in the mockup (best-fit order, hard-word marks, related words, card default, chapter preview, sharing) |
| Flashcards | existing Alt+F / Alt+N code | Default definition = the entry the reader saved, else the best-fit entry's first meaning |

### 10.1 Local tables

- `sensePicks` (local, per user): `{ bookKey, lemmaKey, providerId, entryKey, senseKey?, source, updatedAt }`, one row per saved entry per word per book, filled by the reader's own saves and used to put their saved entries first. **Note:** the Phase 0 table already committed on `feat/crowd-sense-phase0` is keyed by `(bookKey, lemmaKey, providerId)` and holds one `senseKey`; it must be re-keyed by `entryKey` before the popup is wired, which is safe because it has not shipped. It **may** be added to the synced tables later so personal picks follow the reader across devices. That is a separate decision under [storage-and-sync.md](storage-and-sync.md).
- `crowdQueue` and the install key are **local only and excluded from sync and backup**. Add them to the exclusion list in `src/persistence/syncedTables.ts` and add a test that fails if they ever appear in a synced table.

### 10.2 Consent behaviour

- Off by default. The wording shown at opt-in: "Help improve meanings for everyone. When you save a word from the dictionary popup, we receive which book, which word and which dictionary entry you saved (and which meaning, if you saved only part of an entry), linked to a random ID for this app install, not your name or email. We see your network address when you connect but do not keep it with your saves. Saves are combined with others to order entries and meanings in this app and are never sold or given to anyone else. Our hosting provider runs the server and can see network addresses and the stored saves. You can delete what you shared any time."
- Turning it off: stop sends, clear the queue, offer "Delete my shared picks" (section 12).
- A test proves that no network call to the crowd host happens while sharing is off.

### 10.5 Which saves count

The reader already has these actions; none of them changes. Only saves made from a popup opened on a word **in a book** count, because a vote needs a `bookKey`. Saves from dictionary search or without a book are ignored.

| Existing action | Counts as | `source` |
|---|---|---|
| Round + on an entry | A vote for that entry. No `senseKey` | `entry` |
| Save selection (picked words in an entry) | A vote for that entry. If the selected words fall inside exactly one meaning, the vote also carries that `senseKey`; otherwise it stays entry-level | `selection` |
| Edit, then save | A vote for the entry whose meaning the saved text matches, with a `senseKey` when it matches one meaning. **Not counted if the reader left the prefilled default unchanged**, because the app chose it, not the reader | `edit` |
| Main Save Vocabulary (every entry) | Nothing. It says nothing about which entry fits | none |
| Round + on a whole section heading | Nothing, for the same reason | none |
| Removing the saved word | Retracts every vote the reader made for that word in that book (`unsave`) | none |

Saving the same entry again, or in another session, replaces the same vote. The client records `pos` (where the entry or meaning was shown) when it builds the vote.

### 10.3 Rendering rule

Pack content is only meaning keys, so there is no free text to render. Any text the client shows still comes from its own dictionaries. This also keeps iOS scripted-content handling unaffected.

### 10.4 Failure behaviour

| Failure | App does |
|---|---|
| No network | Use cached packs, queue picks |
| Bad signature | Ignore the pack, dictionary order |
| Pack missing a word | Dictionary order for that word |
| Server says `enabled: false` | Dictionary order, stop sending |
| App older than `minAppVersion` | Ignore packs |

## 11. API

Base: `https://<host>/v1`. HTTPS only, TLS 1.2+. All bodies JSON, max 8 KB.

### `POST /votes`

```json
{
  "installId": "…",
  "publicKey": "…",            // only on the first request
  "nonce": "…",                // 16 random bytes, base64
  "seq": 17,                   // highest rev in this request (see 7.4)
  "sentAt": "2026-10-05T10:02:11Z",
  "appVersion": "0.30.0",
  "items": [ { "bookKey":"…", "lemmaKey":"…", "providerId":"baranov", "entryKey":"…", "senseKey":null, "source":"entry", "pos":0, "rev":17, "action":"save", "day":"2026-10-05", "form":"II" } ],
  "sig": "ed25519:…"           // over the canonical JSON of everything above
}
```

Server checks, in order: size, schema, signature, `sentAt` within ±10 min, nonce not seen, rate limit, banned flag, then per item: `(lemmaKey, providerId, entryKey)` is on the allow-list and, when present, so is `(entryKey, senseKey)` (11.1) and `rev` is within the accepted window (7.4). Returns `200` with per-item results (7.4), or a `4xx` with a short code if the whole request is invalid. Maximum 50 items per request.

### `POST /delete`

Authenticated by **either** a signature from the install key **or** the recovery code issued at registration (sent as an HMAC, never in clear). Deletes every vote and tombstone for the `installId` and the install record. Returns `204`.

If both the key and the recovery code are lost, the server cannot prove who is asking, so it does not delete on request. Those votes expire with the install after 12 months of inactivity. The privacy page says this. A manual request cannot be verified either, and the page says that too.

**What deletion affects, copy by copy** (details in 12.1):

| Copy | Effect of a deletion |
|---|---|
| Live votes store | Rows removed immediately |
| Nightly backups | Not edited. Never restored without replaying the deletion ledger (12.1). Expire after 30 days |
| Published packs and snapshots | Hold only an order of meanings, no counts and no install IDs, so nothing of the reader's is in them. They are rebuilt without the deleted votes at the next nightly run. Older copies leave the public path within 7 days and are removed after 30 |

### `GET /manifest.json` and `GET /packs/...`

Static, cacheable, `ETag`/`If-None-Match`.

### 11.1 Rejecting made-up meanings

The server holds an allow-list of valid `(lemmaKey, providerId, entryKey)` **triples**, and of `(entryKey, senseKey)` pairs, built from the same dictionary data the app ships. An item whose triple (and pair, when it has a `senseKey`) is not on the list is rejected, so an entry or meaning can only be voted for under the dictionary it belongs to and the check matches the ranking model (8.2). The list is regenerated from the data build, and updated before any dictionary change ships.

## 12. Privacy, retention and deletion

- Data minimisation as in section 6. A privacy page states exactly this list.
- **What the server can infer.** Votes are pseudonymous and linkable by `installId` for as long as the install is retained. Book and word hashes are guessable, so the server (and anyone with the votes store) can tell which books an install reads and which meanings it chose. The consent text and privacy page say this plainly and do not call the data anonymous. The network address is visible to the server and the hosting provider during a request.
- **Retention:** votes are kept while the install is active. Installs with no activity for 12 months are deleted.
- **Deletion:** the in-app "Delete my shared picks" calls `/delete` (authentication and limits in section 11).
- **Release safeguards:** nothing is published for a word below the thresholds or a book below the contributor minimum. Raw votes are never exported outside the backend.
- **Legal:** get a short review of the privacy page and consent wording before the first public release. Data protection law in the reader's country may apply.

### 12.1 Deletion across retained copies

A deletion has to hold after a backup restore and after cached or archived packs. The rules:

1. **Deletion ledger.** `/delete` writes `(installId, deletedAt)` to the `deletions` table in the same transaction that removes the votes. Ledger rows are kept **35 days**, longer than the 30-day backup retention, then purged.
   - **A deleted ID can never be used again.** While its ledger row exists the server rejects registration, votes and further `/delete` calls for that `installId` with `install_deleted`, and the client never reuses it (the ID is derived from the public key, so a new key means a new ID). Once the row is purged no restorable backup predates the deletion, so the rule can lapse safely. Without it, a later restore, replaying the ledger, would also wipe votes the same ID submitted after its deletion.
   - **The client creates a new key pair when it deletes.** "Delete my shared picks" calls `/delete`, then discards the old key, recovery code, `rev` counter and queue, and generates fresh ones if sharing stays on.
2. **Restore procedure.** Before a restored votes store serves any traffic or feeds an aggregation run, the deletion ledger from the live system is replayed against it (all `installId` rows removed). A restore without that step is a runbook violation. Because the ledger outlives every backup, no restorable backup can bring a deleted vote back into service.
3. **Backups.** Encrypted, access-restricted, kept at most 30 days, and not edited per deletion. After 30 days no backup contains the vote. The privacy page states this.
4. **Published packs and snapshots.** A pack contains only the order and best meaning per word per dictionary: no counts, no install IDs, no per-reader data. A single deleted vote therefore has no recoverable trace in a pack, and any effect it had on an order is removed when aggregation next runs without it. Superseded packs are dropped from the manifest at once, removed from the CDN origin after 7 days (the cache lifetime), and kept in private snapshots for at most 30 days for rollback only.
5. **Rollback and deletion.** A rollback never republishes a snapshot older than a deletion that affects it. If any deletion has occurred since the chosen snapshot, the server re-runs aggregation from the live store (which has the deletions applied) with the earlier configuration and exclusion list instead of reusing the old pack files.
6. **Device copies.** Packs already on readers' devices are unaffected by one reader's deletion and are replaced at the next manifest refresh. Reader devices hold no votes except their own local queue, which "Delete my shared picks" clears.

## 13. Security

Full threat table is in the mockup's Threat model tab. Summary of the controls this spec builds:

| Threat | Control in this design |
|---|---|
| Fake votes and installs | One vote per install per word per dictionary per book, install-age and book-count weighting, registration and per-IP rate limits, optional small proof-of-work on first registration |
| Coordinated campaigns | Distinct-install minimum, lead requirement, spike alerts, deny list for sensitive texts |
| Slow drift | Nightly diff against the previous snapshot, alert when a `best` meaning changes, rollback |
| Replay and stale offline votes | Nonce store, a ±10 minute `sentAt` window, and per-vote `rev` ordering (7.4) |
| Stale or rolled-back manifest | `sequence`, `expiresAt` and grace period (9.4) |
| Malformed input | Strict schema, allow-list of valid meaning pairs, 8 KB cap, no free text |
| Flooding | CDN/WAF in front, rate limits, queue |
| Database theft | No names or emails stored, raw votes separate from published packs, encryption at rest |
| Tampered packs | Signed manifest with hashes, key embedded in the app |
| Sending without consent | Single consent gate and a test |
| Admin compromise | Least-privilege roles, short-lived credentials, audit log, offline signing key |

Residual risk accepted: signing ties a request to a key, not to a real reader, so a determined attacker with many aged installs can still shift a lightly-read word. The thresholds and weighting raise the cost, and the worst outcome is a reordering.

## 14. Operations

- **Backend table** (admin only): per word, picks, installs, top share, status (applied, low data, split). The mockup's "What you see" tab is the model.
- **Alerts:** spike in votes for one word or book, a `best` flip, sudden drop in contributors, ingest error rate, nonce-replay rate.
- **Kill switch:** `enabled: false` in the manifest, plus a Cloudflare/host-level block on `/votes`.
- **Backups:** nightly encrypted export of the votes store to private storage, 30-day retention, restored only with the deletion ledger replayed (12.1).
- **Runbook** (write before launch): rotate the signing key, roll back a snapshot, ban an install, handle a deletion request, respond to a poisoning incident.

## 15. Rollout phases

Each phase has an exit test. Stop or change course if it fails.

### Phase 0: Measure and prepare (no server)

- Implement `senseKey`, `lemmaKey`, `bookKey` with tests.
- Add the local `sensePicks` table (re-keyed by `entryKey`) and fill it from the reader's own saves, so the entries they saved come first in their own popup. No new control, tag or setting is needed for this.
- Estimate readers per book and picks per word from real usage.
- **Exit:** the ranking order works locally. A decision on pooling vs per-book is based on measured numbers. If expected readers per book are under about 50, ship pooled-only.

### Phase 1: Backend and saves

- Ingest API, votes store, nightly aggregation, signed packs, admin table.
- App: consent gate, queue, pack cache, applying a ranking, kill switch.
- Closed testing with a small invite group.
- **Exit:** a save travels device → server → pack → another device and changes the order there. Tests show nothing is sent while off. Roll back works.

### Phase 2: Public opt-in release

- Privacy page, consent text, deletion flow, legal review.
- Monitoring and alerts live.
- **Exit:** 2 weeks without incident, no unexplained rank flips.

### Phase 3: More signals

- Lookup rate (hard-word marks, "Before this chapter"), co-lookups ("Readers also checked"), saved-to-card rate (glossary order).
- Each signal ships with its own consent line and a spec amendment.

### Phase 4: Later ideas

- Optional sign-in with Apple (section 8.7), so signed-in votes weigh more.
- Verb-form hints from picks grouped by form.
- Sentence-context disambiguation.
- Merging near-duplicate meanings across dictionaries so their votes combine.

## 16. Testing

- Unit: key helpers (stable across normalisation and dictionary rebuilds), threshold logic, smoothing, weighting, signature verification, canonical JSON.
- Aggregation: deterministic fixtures, idempotent reruns, snapshot rollback.
- Ingest: schema fuzzing, replay, bad signature, rate limits, unknown meaning pair.
- Client: consent-off sends nothing, offline queue caps and expiry, bad pack ignored, popup falls back to dictionary order, crowd tables absent from sync and backup.
- Abuse simulation: scripted fake installs against a staging instance to see how many it takes to flip a word.
- Load: a spike of votes does not slow reading (read path is static).

## 17. Open decisions

1. **Hosting provider.** Section 7.2 suggests Cloudflare. Confirm or pick another.
2. **Per-book vs pooled in v1.** Phase 0 measurements decide.
3. **Do personal picks sync across devices?** It needs a synced table and a spec change.
4. **Who can read the backend table.** Only the maintainer, or a small named group.
5. **Edition handling.** When to use `editionKey` over `bookKey`.
6. **Sensitive-text deny list:** initial entries and who maintains it.
7. **Legal jurisdiction** for the privacy page.
8. **Retention length** (12 months of inactivity) against the privacy cost of keeping linkable votes at all.
9. **Trust tiers (8.7):** whether to launch with Apple sign-in, the weights, and who is allowed to be a curator.
10. **What happens to the feature if we stop running the server.** Proposal: the last signed manifest stays cached, `enabled` flips to false at the final release, and the app shows dictionary order.
11. **Position-bias hold-out (8.2):** whether a fixed share of installs (for example 10%) always sees dictionary order so their saves calibrate the rest, and how large that share should be.
12. **Entry-level ranking only in v1?** Meaning-level ranking relies on the less common selection and edit saves. Launching with entries only is simpler and may be enough.

## 18. Risks

| Risk | Likelihood | Impact | Response |
|---|---|---|---|
| Too few readers per book (cold start) | High | Feature looks empty | Pooled ranking by lemma, phase 0 measurement, seed with a known group |
| Low opt-in | Medium | Less data | One-tap opt-in, show the benefit early |
| Poisoned rankings | Medium | Wrong order | Section 13 controls, rollback |
| Privacy complaint or legal issue | Low–Medium | High | Minimal data, aggregate-only, review before launch |
| Server cost or outage | Low | Low | Static read path, serverless hosting, graceful fallback |
| Saves are noisier than an explicit pick | High | Weak or mixed votes | Entry-level first, ignore save-all, split weight across saved entries, thresholds, prefilled edits do not count |
| Position bias entrenches the top entry | Medium | A ranking that confirms itself | `pos` on every vote, down-weighting, optional hold-out (decision 11) |
| Popularity is not correctness | Medium | Misleading "best fit" | Wording "fits most readers", other meanings always visible, easy to disagree |
| Maintenance burden | Medium | Time | Small scope, automated alerts, monthly review |
