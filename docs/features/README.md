# Feature specs

There is one standalone spec per roadmap item (`docs/roadmap/roadmap.json`, ids match file names). Each spec has the same ten sections:

1. Purpose
2. Expected Behaviour
3. User Flows
4. UI / UX Behaviour
5. Data & State
6. Technical Requirements
7. Edge Cases & Error Handling
8. Acceptance Criteria
9. Development Prompt
10. Future Extensions

**To build one:**
1. Open a new session.
2. Copy the spec's section 9 (the fenced block) into it.

The prompt is self-contained: it carries the shared project context (from [_context.md](_context.md), already embedded), says what exists and what to build, and tells the session to read the full spec first. If you change `_context.md`, re-embed it in every prompt. Search for "PROJECT CONTEXT (read this first)" to find the copies.

Written 2026-10-06 against the code in PR Caasem/Arabic-Reader#13 (v0.33.0). Specs for built items describe the code as it is; specs for unbuilt items describe the intended behaviour. Where code and spec disagree later, the code wins and the spec should be updated in the same PR.

## Index

Status values are from the roadmap.

| Area | Spec | Status | Needs first |
|---|---|---|---|
| Foundation | [sync-v10](sync-v10.md) Storage and sync | in progress (v1 built) | — |
| Foundation | [governance](governance.md) Governance and docs | in progress | — |
| Foundation | [data-arch-spec](data-arch-spec.md) Data architecture | in progress (draft) | governance |
| Foundation | [infra-cloud](infra-cloud.md) Shared cloud hosting | planned | data-arch-spec |
| Foundation | [blob-store](blob-store.md) BlobStore | planned | data-arch-spec, sync-v10 |
| Foundation | [pack-manager](pack-manager.md) PackManager | planned | blob-store, infra-cloud |
| Foundation | [dexie-cloud](dexie-cloud.md) Dexie Cloud sync | planned, **needs an ADR first** | sync-v10 |
| Content and data | [shamela-host](shamela-host.md) Host Shamela books | in progress | infra-cloud (pack-manager preferred) |
| Content and data | [crowd-ranking](crowd-ranking.md) Shared meanings | built, not deployed | infra-cloud |
| Reader | [alt-note-flash](alt-note-flash.md) Alt+N note, Alt+F flashcard | done | — |
| Reader | [plus-lookup](plus-lookup.md) "+" on single-entry lookups | planned | — |
| Reader | [click-space-save](click-space-save.md) Click, then Space saves | planned | — |
| Reader | [dict-fullpage](dict-fullpage.md) Full-page dictionary | planned | — |
| Reader | [root-explorer](root-explorer.md) Root explorer | idea | dict-fullpage |
| Reader | [sentence-mining](sentence-mining.md) Sentences and cloze cards | idea | — |
| Reader | [tts](tts.md) Pronunciation audio | idea | — |
| Reader | [book-readiness](book-readiness.md) Book difficulty, pre-reading list | idea | — |
| Reader | [storage-ux](storage-ux.md) Storage screen and full export | planned | blob-store |
| Formats and export | [formats-simple](formats-simple.md) TXT, Markdown, MOBI, AZW3 | planned | — |
| Formats and export | [formats-pdf](formats-pdf.md) PDF | idea | formats-simple (page view: popup-extract) |
| Formats and export | [anki-e2e](anki-e2e.md) Anki end to end | planned | — |
| Formats and export | [export-hub](export-hub.md) Quizlet, Notion, CSV | idea | anki-e2e |
| Formats and export | [kindle-import](kindle-import.md) Kindle highlights and vocab | idea | — |
| Formats and export | [watch-folder](watch-folder.md) Watched folders | idea | sync-v10, blob-store |
| Formats and export | [device-scan](device-scan.md) Scan the device for books | idea | watch-folder |
| New surfaces | [popup-extract](popup-extract.md) Standalone lookup module | planned | — |
| New surfaces | [web-extension](web-extension.md) Web extension | idea | popup-extract |
| New surfaces | [video](video.md) Video with tappable subtitles | idea (prototype exists) | popup-extract |
| New surfaces | [audiobooks](audiobooks.md) Read-along audio | idea | popup-extract |
| New surfaces | [ocr-camera](ocr-camera.md) Camera and scanned pages | idea | popup-extract |
| New surfaces | [hashiya](hashiya.md) Hashiya annotation canvas | idea | plugin-api (or core) |
| Platform | [plugin-api](plugin-api.md) Plug-in API | idea | popup-extract + two surfaces |
| Platform | [community](community.md) Registry, later a website | idea | plugin-api |

**Parked, no spec on purpose:**
- `poetry-web`: developed in its own folder and session. It may be integrated later as a plug-in, and is not ready yet.
- `poetry` (the earlier "encyclopedia edition" idea): superseded by `poetry-web`.

## Quick wins (no dependencies)

These can start now, in any order:
- `plus-lookup`
- `click-space-save`
- `dict-fullpage`
- `formats-simple`
- `anki-e2e`
- `sentence-mining`
- `tts`
- `book-readiness`
- `kindle-import`
- `popup-extract`

## Decisions needed before some items can start

- **dexie-cloud:** user records on a third-party server, and an account. This needs an ADR.
- **infra-cloud:** Cloudflare as the single provider (ADR 0005), plus ADRs 0002 and 0003 accepted.
- **device-scan:** the Android permission scope for the Play build versus other builds. This needs an ADR.
- **plugin-api:** the API, permission model and licensing position. This needs an ADR.
- **anki-e2e:** whether the AnkiDroid API library's licence is compatible with GPL-2.0.
- **hashiya:** build it as a plug-in or in core, depending on whether the plug-in API exists.
