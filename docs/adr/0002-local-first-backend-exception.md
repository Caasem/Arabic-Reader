# ADR 0002: Local-first, with narrow exceptions for servers

Status: accepted (maintainer, 2026-10-06; revised before acceptance to allow an opt-in third-party sync service)
Date: 2026-10-06

## Context
The app promises that nothing you read leaves your device, and `storage-and-sync.md` lists "no backend of ours" as a principle. Several planned features need something server-side:
- Hosted Shamela books and data packs.
- Crowd ranking.
- An account-based sync option (Dexie Cloud), kept in milestone M1, which stores the reader's records on a third-party server.

## Decision
1. **Offline first, always.** The app is fully usable offline and without an account. That never changes.
2. **Our servers never hold your records or files.** They only serve public data (data packs, Shamela books) and receive opt-in crowd votes (class D in ADR 0003). Each server-side piece must be one the app works without.
3. **A third-party sync service may hold your records, only by your choice.** Dexie Cloud (or a later equivalent) may store class A records only when the reader picks it in Settings. It is off by default, the privacy text names the provider and what it stores, and the reader can delete their data from it. Your own files (class B) never go to any server (decided 2026-10-06): they sync only through the reader's own folder.
4. **Every send is opt-in and can be switched off.** Each network feature has a remote kill switch and a local setting.
5. **The promise in the README** becomes: "Nothing you read leaves your device unless you turn on a sync or sharing option." Change the wording when the first such option ships (crowd ranking deployment or Dexie Cloud).

## Consequences
- One shared hosting stack (Cloudflare, ADR 0005) serves packs, Shamela and the crowd service.
- Dexie Cloud may go ahead, but it still needs its own ADR on provider terms, pricing, data region and sign-in.
- Privacy copy must list each opt-in option with what it sends and to whom.
- Anything that would put records or files on **our** servers needs a new ADR that supersedes this one.

## Alternatives considered
- **Strictly no servers:** rules out crowd ranking, hosted packs and account sync.
- **Our own account and sync server:** contradicts the local-first premise and makes us responsible for user content.
- **The earlier draft of this ADR** ("server-side pieces hold no user content", with no third-party exception): it would have ruled out Dexie Cloud.
