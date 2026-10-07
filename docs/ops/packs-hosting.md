# Pack hosting: staging and how to publish

Status: staging live (2026-10-07). Production does not exist yet. ADRs: [0005](../adr/0005-cloudflare-hosting.md), [0007](../adr/0007-static-pack-hosting.md). Design: [data-architecture.md](../specs/data-architecture.md) 5.3 and 7.

## What exists

| | |
|---|---|
| Cloudflare account | the one `wrangler` is logged in to (it also holds the `shamela` bucket) |
| Bucket | `arabic-reader-packs-staging` (R2) |
| Public URL | `https://pub-35996e80c4544075a4024a8396d9a8c6.r2.dev` (the r2.dev address; no custom domain yet) |
| CORS | `scripts/packs/cors.json`: GET and HEAD from the app's origins and localhost |
| Content | `manifest.json` (signed, sequence 1) and the two files of the `alsihah` pack v1 at `p/<sha256>` |
| App | `npm run dev` reads `VITE_PACKS_BASE_URL` from `.env.development` and uses this host. Release builds set none, so packs stay dormant there |
| Keys | two ECDSA P-256 keys, public halves in `src/packManager/publicKeys.ts` |

The private keys are in `%USERPROFILE%\.arabic-reader-keys\` (`pack-signing-current.jwk`, `pack-signing-next.jwk`), readable only by the maintainer's Windows user. They are not in the repository and never go in CI. **Move a copy to offline storage** (an encrypted USB stick or a password manager's file store): this folder is on a connected disk, and losing both keys means an app release to trust new ones.

## Publish a pack

```
node scripts/packs/stage-dictionary-pack.mjs alsihah <work>/packs
node scripts/packs/build.mjs <work>/packs <work>/out --key-file %USERPROFILE%\.arabic-reader-keys\pack-signing-current.jwk
# files first, manifest last, so no client sees a manifest naming files that are not there yet
for each file in <work>/out/p:
  npx wrangler r2 object put arabic-reader-packs-staging/p/<hash> --file <work>/out/p/<hash> \
    --content-type application/octet-stream --cache-control "public, max-age=31536000, immutable" --remote
npx wrangler r2 object put arabic-reader-packs-staging/manifest.json --file <work>/out/manifest.json \
    --content-type application/json --cache-control "public, max-age=300, must-revalidate" --remote
```

Build into the same `<work>/out` each time: the builder reads the previous `manifest.json` there to raise the sequence and to refuse a rewritten or older version. Keep `<work>` (not in the repo) between releases; the first one is at `%USERPROFILE%\.arabic-reader-staging`.

To withdraw a pack, set `"enabled": false` in its `pack.json`, rebuild and upload the manifest. Apps stop offering and using it on their next refresh.

## Rotate the signing key

The app trusts two keys. Sign with the current one; to rotate, sign the next manifest with the `next` key (apps already trust it), then generate a new `next` with `node scripts/packs/gen-key.mjs <file>` and ship its public half in the next app release. Retire the old key from `publicKeys.ts` in that release.

## Cost and limits (decision 2026-10-07)

The maintainer chose to stay inside Cloudflare's free tier, with an alert at 80%, and a budget of $0.

- R2 free tier: 10 GB stored, 1 million class A (write) and 10 million class B (read) operations a month. The staging bucket holds about 7 MB.
- **Cloudflare has no hard spending cap.** Beyond the free tier it bills. "A cap of $0" therefore means: stay small, and watch the alert. The alert is not set up yet: it needs the dashboard (Notifications → add an R2 usage alert at 80% of the free tier) because the `wrangler` login here has no notifications scope. **This one step is still the maintainer's.**
- The r2.dev address is for staging and tests: Cloudflare rate-limits it and does not recommend it for production. The production host needs a custom domain (ADR 0007), which is a separate decision.
- The privacy text must say that the host sees the requesting IP address and the file requested, once packs ship in a release build.

## Checked on 2026-10-07

Against the live host: the manifest verifies with the compiled-in current key and is rejected by the `next` key alone; a ranged request returns 206 with the right `Content-Range`; the file's SHA-256 matches the manifest; CORS and cache headers are as above; and in a real browser (dev build pointed at staging) the Al-Ṣiḥāḥ row appears, downloads, verifies, installs and still shows Ready with the network switched off.
