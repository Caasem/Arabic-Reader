# Lane's Lexicon data

`lane.tsv` is Edward William Lane's *An Arabic-English Lexicon* (1863–93), in the
public domain: the `lanelexcon` table of the bundled SQLite database of the
[arabic_lexicons](https://github.com/wizsk/arabic_lexicons) project (GPL-3.0;
`assets/data/db/db.sqlite.zip` at tag v3.5.0).

Regenerate it with `python scripts/extract-lexicon-data.py path/to/db.sqlite`.

## Format

One line per root, tab-separated `word<TAB>meanings` (about 5,060 roots).

- `word` is the root (`حسد`).
- `meanings` separates the article's sub-entries with `<br>`, in source order.
- The source marks its text up with HTML (italics, headings, a few tables, entities such as
  `&darr;`). The extraction flattens every sub-entry to plain text, so the app shows it as
  text and never renders markup. Roots that share a spelling are merged into one line.

## Licensing status

Lane's Lexicon is a 19th-century work in the public domain. The digital text was compiled by
others; it is included as the upstream project includes it. Off by default in Settings.
