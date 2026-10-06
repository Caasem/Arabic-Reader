# ADR 0005: Cloudflare as the single hosting provider

Status: accepted (maintainer, 2026-10-06)
Date: 2026-10-06

## Context
Several pieces need hosting: Shamela books as static files, signed data packs (dictionaries, frequency lists, later audio), and the crowd ranking service. The crowd server was already written for Cloudflare (a Worker, a D1 database, an R2 bucket and a cron, in `crowd-server/wrangler.toml`), and the Shamela uploader (`scripts/shamela-host/upload.mjs`) targets R2. The app must keep working with none of it (local-first).

## Decision
Use one Cloudflare account for all hosting:
- R2 for static files (Shamela, packs, ranking files).
- Workers for the crowd service.
- D1 for its database.

There are staging and production environments, cost caps inside the free tiers with alerts, and remote kill switches. Details are in `docs/features/infra-cloud.md`.

## Consequences
- Easier: one account, one deploy tool (Wrangler), existing code fits, and generous free tiers. R2 has no egress fees, which matters for large packs.
- Harder: the crowd service depends on Workers and D1 APIs.
- Exit plan: packs and Shamela are plain files and can move to any static host. The crowd Worker would need porting, but it is small and has its storage behind an interface (`crowd-server/src/db.ts`).

## Alternatives considered
- AWS (S3 and Lambda): more setup, and egress costs.
- Supabase: a database-first design that doesn't fit static packs.
- Fly.io: needs servers to run.
- Several providers: more accounts and secrets for no benefit at this size.
