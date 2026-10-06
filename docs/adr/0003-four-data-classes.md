# ADR 0003: Four data classes with separate storage paths

Status: accepted (maintainer, 2026-10-06)
Date: 2026-10-06

## Context
The app is adding PDFs, audio, video, hosted books, crowd data and plug-ins. Each would otherwise invent its own storage, download and privacy rules. Sync already protects user records and must stay simple.

## Decision
All data is classified as A (user records), B (user files), C (reference packs) or D (aggregate data), as defined in docs/specs/data-architecture.md. Each class has one storage path: repos plus write layer for A, BlobStore for B and C bytes, PackManager for C, CrowdClient for D. A references B and C by hash or pack id and never contains them. D never merges into A.

## Consequences
New features must say which class their data is and use that path. Book files move to a content-addressed BlobStore (de-duplication for free). Privacy review reduces to "does it touch class D or leave the device". More up-front structure, less per-feature invention.

## Alternatives considered
Per-feature storage: faster for the first feature, expensive for the fifth. A single cloud database for everything: contradicts the local-first principle in ADR 0002.
