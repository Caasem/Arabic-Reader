# Maqāyīs al-Lugha data

`almaqayis.tsv` is "مقاييس اللغة" (Maqāyīs al-Lugha) by Aḥmad ibn Fāris
(d. 1004), the `maqayeesul_luga` table of the bundled SQLite database of the
[arabic_lexicons](https://github.com/wizsk/arabic_lexicons) project (GPL-3.0;
`assets/data/db/db.sqlite.zip` at tag v3.5.0).

Regenerate it with `python scripts/extract-lexicon-data.py path/to/db.sqlite`.

## Format

One line per root, tab-separated `word<TAB>meanings` (5,274 roots).

- `word` is the root, in the dictionary's own spelling (`وفى`, not `وفي`).
- `meanings` separates paragraphs and verse lines with `<br>`. Every article opens
  with its root in parentheses, `(وَفَى) ...`.
- Maqāyīs explains each root's core meaning(s) rather than listing derived words,
  so it has no entry for `استوفى` itself; the root's article mentions its derived
  forms in running text. The text is fully vowelled.

## Licensing status

Maqāyīs is a medieval work, in the public domain. The digital text was compiled
by others from a modern edition. Off by default in Settings.
