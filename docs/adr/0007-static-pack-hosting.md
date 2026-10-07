# ADR 0007: Static pack hosting on Cloudflare R2, signed manifest

Status: accepted (maintainer, 2026-10-06)
Date: 2026-10-06

## Context
Reference packs (dictionaries, Shamela books, poetry, audio) are large, public and versioned. ADR 0002 allows server pieces only if the app works without them, they hold no user content, and use is opt-in with a kill switch. docs/specs/data-architecture.md section 5.3 defines the PackManager and its signed manifest. `scripts/shamela-host` already targets R2.

## Decision
The provider is Cloudflare ([ADR 0005](0005-cloudflare-hosting.md), accepted). This ADR fixes how packs are hosted on it.

Host packs as immutable, hash-named objects in a Cloudflare R2 bucket behind its CDN on a custom domain, with CORS limited to the app's origins. One `manifest.json` (short cache time) lists packs, hashes, sizes, licences, a minimum app version and per-pack kill flags, and is signed with ECDSA P-256; the app embeds the public key plus one spare for rotation. The signing key is kept offline. The manifest URL is a setting so mirrors and self-hosting work. A spending cap and alert are configured on the account (amount to be set before the first public pack). The crowd service (Worker plus D1) later uses the same account.

## Consequences
No egress fees at our scale and no servers to run. We depend on one vendor, mitigated by the configurable manifest URL and by the format being plain static files that any host can serve. The privacy text must state that the host sees the requesting IP and the file requested. Losing the signing key requires an app release to trust a new one, hence the spare key.

## Alternatives considered
GitHub Pages or Releases: size and bandwidth limits and no control over caching. S3 plus CloudFront: egress cost and more setup. Bundling everything in the installer: bloats every download and blocks updates without a release. A custom server: operational burden that ADR 0002 says to avoid.

## Update 2026-10-07: staging live, keys and spending decided
- A staging bucket (`arabic-reader-packs-staging`, public r2.dev address) is live and serves a signed manifest and the Al-Ṣiḥāḥ pack. How it was set up and how to publish: `docs/ops/packs-hosting.md`.
- Two signing keys exist (current and next); their public halves are compiled into the app, the private halves are held by the maintainer outside the repository.
- Spending: the maintainer chose to stay inside the free tier with a $0 budget. Cloudflare offers no hard cap and no percentage-of-free-tier alert for R2, so this is watched by a dollar budget alert (threshold $1, created 2026-10-07) that emails when real spend begins; it does not stop anything.
- The Al-Ṣiḥāḥ licence record (public-domain work, GPL-3.0 compilation) was confirmed by the maintainer.
- Still open: a custom domain for production (r2.dev is not meant for it). The maintainer owns none and chose on 2026-10-07 to wait; release builds stay dormant until then.
