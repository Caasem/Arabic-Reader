# Al-Muʿjam al-Wasīṭ data

`alwasit.tsv` is the "المعجم الوسيط" (al-Muʿjam al-Wasīṭ) table extracted from
the bundled SQLite database of the [arabic_lexicons](https://github.com/wizsk/arabic_lexicons)
project (GPL-3.0), which in turn compiled it from public digitisations of the
dictionary. Format: one line per headword, tab-separated `word<TAB>meanings`;
`word` may list more than one headword separated by `|`; `meanings` uses
`<br>` to separate distinct sub-entries (different derived forms/senses under
the same root).

## Licensing status

Al-Muʿjam al-Wasīṭ was first published in 1960 by Cairo's Arabic Language
Academy (Majmaʿ al-Lugha al-ʿArabiyya), a state institution, with later
revised editions. Unlike the app's classical sources (Lisān al-ʿArab, Lane's
Lexicon — both centuries old and unambiguously public domain), al-Wasīṭ is a
20th-century work whose exact copyright status is **not clean-cut**:

- It is not commercially sold or enforced the way a modern Western-published
  dictionary (e.g. Hans Wehr) is, and it circulates freely across many
  Arabic dictionary sites and apps with no known takedown history.
- Egypt's institutional copyright term is roughly 50 years from publication,
  which the 1960 first edition has cleared, but later revised editions may
  extend protection for the material added in those revisions.

This data is included in good faith, on the same footing as the upstream
`arabic_lexicons` project's own inclusion of it, and this feature defaults to
**off** in Settings. If you plan to redistribute this app more broadly than
personal use, verify the licensing status for your jurisdiction first.
