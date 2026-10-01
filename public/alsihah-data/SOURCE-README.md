# Al-Ṣiḥāḥ data

`alsihah.tsv` is "الصحاح تاج اللغة وصحاح العربية" (al-Ṣiḥāḥ) by Ismāʿīl al-Jawharī
(d. c. 1002), the `mujamul_shihah` table of the bundled SQLite database of the
[arabic_lexicons](https://github.com/wizsk/arabic_lexicons) project (GPL-3.0;
`assets/data/db/db.sqlite.zip` at tag v3.5.0). It is the full text, not the
abridged Mukhtār al-Ṣiḥāḥ, even though that project's README calls it "Mukhtar":
the articles keep the verse and the editor's notes.

Regenerate it with `python scripts/extract-lexicon-data.py path/to/db.sqlite`.

## Format

One line per root, tab-separated `word<TAB>meanings` (5,650 roots).

- `word` is the root, in the dictionary's own spelling (`وفى`, not `وفي`).
- `meanings` separates the article's lines with `<br>`. In the source each line is
  one unit: a headword form and its definition, or a verse line.
- The source's editor's notes (`[[...]]`) are numbered "(١)" in the text and
  listed as the article's last lines — the same treatment arabic_lexicons gives them.
- `(*)` marks are kept as they are in the source.

## Licensing status

al-Ṣiḥāḥ is a medieval work, in the public domain. The digital text was compiled
by others from a modern critical edition; its editor's notes are included as the
upstream project includes them. Off by default in Settings.
