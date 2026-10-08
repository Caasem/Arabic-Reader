# Browse library

Roadmap id: `browse-library` · Area: Content · Status: built (v0.61.0)

## Purpose

Library → **Browse library** lets a reader find a book in a public collection of Arabic books and add it in one tap, without owning a file. It runs entirely on the device against open datasets, so it needs no server of ours.

## Sources

The ieasybooks collections on Hugging Face (MIT licence): `waqfeya-library` (about 10,000 books) and `shamela-waqfeya-library`. `prophets-mosque-library` is gated (401) and left out. Sources are listed in `src/browseLibrary/catalog.ts` (`BROWSE_SOURCES`); adding one is a line there.

## How it works

- **Catalogue:** each dataset's `index.tsv` (17 MB for Waqfeya, 6 MB for Shamela Waqfeya) is fetched once, parsed in the page and kept in the browser's Cache API for a week. Later opens are instant and work offline. Search is local: title, author and subject, with alef, ya, ta marbuta, vowel marks and tatweel folded.
- **Add:** each volume's `txt/…` file is fetched from `huggingface.co/datasets/<dataset>/resolve/main/<path>` (CORS is open on both the redirect and the CDN). The text is split on the dataset's `PAGE_SEPARATOR` line into pages, and pages become chapters of ten with a `[ص N]` marker on each page, so citing by page still works. `writeEpub` builds the EPUB and `libraryService.importEpub` adds it (`format: 'txt'`).
- **Already added:** the catalogue key is remembered in `localStorage` (`browseLibrary.added`) and checked against the shelf, so a book shows "In your library".

## Known limits

- The text is machine-read from scans (Google Document AI), so there are mistakes, and no footnote or heading structure. The panel says so.
- Chapters are ten pages each, not the book's real chapters.
- A very large book downloads whole before it is built; there is no byte progress.
- Hugging Face is a third party: if it rate-limits or moves files the panel shows an error. A copy on our own host (see `shamela-host`) would remove that.

## Off-switch

Delete `src/browseLibrary/`, the button and panel in `src/components/library/Library.tsx`, and revert the version bump.
