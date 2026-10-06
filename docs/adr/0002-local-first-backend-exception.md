# ADR 0002: Local-first, with one narrow backend exception

Status: proposed
Date: 2026-10-06

## Context
The app promises that nothing you read leaves your device, and storage-and-sync.md lists "no backend of ours" as a principle. Crowd ranking and hosted Shamela books both need something server-side.

## Decision
The app stays fully functional offline with no account. Server-side pieces are allowed only if (a) the app works without them, (b) they hold no user content, (c) every send is opt-in and has a kill switch. Static hosting of public data (Shamela books) and the crowd-ranking ingest/ranking service qualify. Sync stays server-free.

## Consequences
One shared hosting stack serves both features. Privacy copy and the README promise must be reworded to match when either ships. Anything needing accounts or stored user content needs a new ADR.

## Alternatives considered
Staying backend-free: rules out crowd ranking. Full accounts: contradicts the product's premise.
