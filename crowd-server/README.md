# Crowd ranking server

The service behind "Shared meanings" (see `docs/specs/crowd-sense-ranking.md`). It counts the dictionary entries readers
save, and publishes small signed ranking files the app uses to put the most-saved entry first. It runs on Cloudflare:
a Worker (the API), D1 (votes) and R2 (ranking files). It is built and tested here but **not deployed**.

```
crowd-server/
  src/protocol.ts   wire format, limits, canonical JSON          (shared with the app)
  src/crypto.ts     hashing, Ed25519, HMAC                      (shared with the app)
  src/db.ts         storage interfaces and the D1 schema
  src/ingest.ts     POST /v1/votes and /v1/delete
  src/aggregate.ts  votes -> rankings, manifest
  src/publish.ts    sign and publish, snapshots, rollback, daily maintenance, alerts
  src/admin.ts      maintainer endpoints (/v1/admin/*)
  src/account.ts    optional sign in with Apple (/v1/account/*)
  src/worker.ts     HTTP routing and the Cloudflare entry point
  scripts/          key generation, schema, allow-list, deletion replay
  test/             run with `npx vitest run crowd-server`
```

## What you need to do once (I could not do these for you)

You need a Cloudflare account and `wrangler` logged in (`npx wrangler login`). Nothing below has been run.

1. **Create the resources**
   ```bash
   npx wrangler d1 create arabic-reader-crowd           # copy the database_id into wrangler.toml
   npx wrangler r2 bucket create arabic-reader-crowd-packs
   npm run crowd:schema                                  # regenerates schema.sql
   npx wrangler d1 execute arabic-reader-crowd --remote --file crowd-server/schema.sql
   ```
2. **Make the signing key** (keep the private file out of git; `.gitignore` already skips `*.jwk.json`)
   ```bash
   node crowd-server/scripts/gen-signing-key.mjs crowd-server/signing-key.jwk.json
   npx wrangler secret put SIGNING_KEY < crowd-server/signing-key.jwk.json
   ```
   Paste the **public** key it prints into `src/crowdSync/publicKeys.ts` (`TRUSTED_PUBLIC_KEYS`).
3. **Set the admin token** (at least 16 random characters; without it the admin routes are off)
   ```bash
   npx wrangler secret put ADMIN_TOKEN
   ```
4. **Deploy**, then confirm `GET /health` answers
   ```bash
   npx wrangler deploy --config crowd-server/wrangler.toml
   ```
5. **Point the app at it**: build the app with `VITE_CROWD_API=https://<your worker address>` (no trailing slash).
   Until you do, the Settings switch says "Not available in this build" and nothing is sent or fetched.
6. **First ranking**: the cron trigger runs daily at 03:17 UTC. To publish at once:
   ```bash
   curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://<worker>/v1/admin/aggregate
   ```

Optional: `node crowd-server/scripts/build-allowlist.mjs entries.jsonl allowlist.json` and upload it to R2 as
`allowlist.json` to reject made-up entries (see the script's header). Without it any entry of a known dictionary is accepted.

Optional, sign in with Apple: set the `APPLE_AUDIENCE` var and a `SERVER_SECRET` secret (32+ characters) and the
`/v1/account/*` routes switch on. The app has no sign-in button yet (needs Apple credentials and a native plugin).

## Admin endpoints

All need `Authorization: Bearer <ADMIN_TOKEN>`.

| Call | What it does |
|---|---|
| `GET /v1/admin/summary` | installs, votes, tombstones, deletions, current config |
| `GET /v1/admin/words` | the backend table: per word and dictionary, picks, installs, top share, status |
| `GET /v1/admin/snapshots` | the last 60 published snapshots |
| `GET /v1/admin/alerts` | best entry changed, vote spike, contributors dropped |
| `POST /v1/admin/aggregate` | aggregate, sign and publish now |
| `POST /v1/admin/rollback {"id": n}` | publish snapshot n again, under a new higher sequence |
| `POST /v1/admin/kill {"enabled": false}` | switch the feature off for every app at its next manifest check |
| `POST /v1/admin/ban` / `unban {"installId"}` | exclude an install from rankings and refuse its votes |
| `POST /v1/admin/deny {"bookKeys":[], "lemmaKeys":[]}` | force dictionary order for books or words (sensitive texts) |
| `POST /v1/admin/thresholds {"minPicks": 40}` | change a threshold without a deploy |
| `POST /v1/admin/tier {"installId", "tier": 0-3}` | curator and trust tiers (used when `trustTiers` is on) |

## Runbook

**Poisoning suspected** (a ranking flips, or an alert says "vote spike"):
1. `POST /kill {"enabled": false}`. Apps go back to dictionary order at their next manifest check (within a day; the
   manifest is cached for an hour).
2. `GET /words` and `GET /alerts` to find the word and book. Find the installs with
   `wrangler d1 execute ... "SELECT installId, COUNT(*) FROM votes WHERE lemmaKey='…' GROUP BY installId"`.
3. `POST /ban` each one, `POST /deny` the word or book if needed.
4. `POST /rollback {"id": <last good snapshot>}`. A ban since that snapshot makes it aggregate again from the live
   votes (which already leave the banned installs out) instead of reusing the old files.
5. `POST /kill {"enabled": true}` when satisfied.

**A reader asks for their data to be deleted**: they use "Delete what I shared" in Settings, or send the recovery code.
If they lost both the key and the code, the server cannot prove who is asking and does not delete on request; their
votes expire after 12 months of inactivity. The privacy page says so.

**Restoring a backup** (D1 export, kept 30 days): the restored database must never bring a deleted vote back.
1. Before restoring, save the live ledger: `wrangler d1 execute ... --remote --command "SELECT installId FROM deletions" --json > ledger.json`
2. Restore, then run `node crowd-server/scripts/replay-deletions.mjs ledger.json > replay.sql` and execute `replay.sql`.
3. Only then let traffic in and run an aggregation.

**Rotating the signing key**:
1. Make a new key pair (`gen-signing-key.mjs`). Add its public key to `TRUSTED_PUBLIC_KEYS` **next to** the old one and ship
   an app release. Wait until most readers have updated.
2. `wrangler secret put SIGNING_KEY` with the new private key, publish (`/aggregate`).
3. In a later release, remove the old public key.

**Changing a threshold or the hold-out share**: `POST /thresholds`, or edit the `config` row. Both go into the next manifest.

## Limits and decisions worth knowing

- **Allow-list** checks `(providerId, entryKey)` pairs, not the spec's `(lemmaKey, providerId, entryKey)` triples: a word's
  lemma comes from analysis at look-up time, so it cannot be listed ahead. The lemma key is checked for shape only.
- **Scale:** aggregation reads all saved votes into memory once a day. That is fine for thousands of readers; at a much
  larger scale it should move to SQL aggregation or a queue.
- **Rate limits** live in D1 rows (`rate`), purged daily. They count an address per hour and per day; a shared address
  (a school, a university) shares the allowance.
- **Consistency factor** (spec 8.7) needs a vote history the spec deliberately does not keep, so it is not implemented;
  age and breadth are. Tier 2 ("established") is set by the maintainer with `/tier`.
- **Revoking the Apple token** on account deletion needs Apple client credentials and is not implemented; unlinking and
  deleting votes are.
- **Cost:** at low volume this should be a few dollars a month. Check Cloudflare's current pricing before relying on it.
