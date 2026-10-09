# Browse library

Roadmap id: `browse-library` · Area: Content · Status: built (v0.68.0)

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

## The panel (v0.67.0)

Mockup: the clickable page the layout was settled on. Arabic reads right to left, so each result has the book's text on the right and the **Text** and **PDF** buttons on the left.

- **One press adds a single-volume book** in that format; the button shows the file's size (a HEAD request once the row is on screen, a few at a time).
- **Several volumes:** a press opens a row of choices (All volumes, Vol. 1, 2, 3 …, each with its size) and an "On a shelf" checkbox; each volume becomes its own book, on a shelf named after the book. A **double-press** adds every missing volume at once. The row opens after a short pause (0.26 s), because opening it on the first press moves the layout and the second press would land elsewhere.
- **Tap the title** to preview the first page or two (the first 40 KB of the text, read as a stream). There is no separate Preview link.
- **Tap the author** to show only their books.
- **Quality badge** (Settings, Browse library; off by default): Clean, Some errors or Poor scan from the share of a sample's words that AraMorph reads as real words. A poor scan adds a note that the PDF is the better choice.
- **Known words** ("Fits you" ranking and the rules behind it) are not built; the logic will be set up separately.
- **Add the next volume (v0.68.0):** a book added from Browse library remembers its catalogue entry, format and volume (`BookMeta.browse`). Its details in the Library show "Volume 2 of 4. 3 not added yet" with a button per missing volume (the same format, put on the shelves this volume is on), or "All 4 volumes are in your library". The catalogue comes from the on-device copy; offline and never opened, the row is simply absent.
