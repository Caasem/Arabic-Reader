# Vocabulary frequency list

`the-list.tsv` is a lemma-frequency ranking (~23,500 entries) derived from
the **Annotated King Saud University Corpus of Classical Arabic (KSUCCA)** --
50.6M tokens of Classical Arabic (7th-11th century CE) across 410 texts in 6
genres, morphologically annotated (lemma, stem, POS, gender, number) by
Yonatan Belinkov using MADA+TOKAN. See KSUCCA's own project page for the raw
corpus and its user manual for the annotation scheme.

## How this list was built

- 409 of the 410 annotated files were used (all but the single Qur'an file,
  which is annotated with a different, morpheme-segmented scheme -- Qur'anic
  text is 0.15% of the corpus by token count and is quoted extensively
  throughout the other 409 files anyway, so nothing meaningful is lost by
  excluding just that one file rather than special-casing its format).
- Each file is `word<TAB>lemma<TAB>stem<TAB>pos<TAB>gender<TAB>number`, one
  row per whitespace-delimited word (clitics included in `word`, already
  stripped out of `lemma` by the annotation tool -- e.g. `وسننه` / `سنن`).
- Rows tagged `punc`, `abbrev`, `latin`, or with no POS at all were skipped
  (stray punctuation/footnote-letter artifacts in the source text).
- Occurrences were counted by `lemma` (falling back to the word itself when
  the annotator couldn't resolve one), not by raw surface form -- so a
  lexeme's rank reflects how often it's actually used, not how many of its
  ~44.6M content-word occurrences happened to land on any one inflected
  spelling.
- Lemmas with fewer than 3 attested occurrences were dropped (long-tail
  hapax legomena, proper nouns, and stray OCR/tagging noise -- not
  meaningful frequency signal either way).
- Each kept lemma's line lists every distinct surface form the corpus
  actually attested for it (comma-separated), most-frequent lemma first.

## Known limitations

- MADA+TOKAN's own reported accuracy (per KSUCCA's user manual) is 87.8%
  for lemmatizing on this corpus -- most mis-lemmatizations just cost a
  little frequency-mass precision, but unvocalized-script homograph
  collisions can occasionally group two unrelated words under one lemma
  (e.g. `لبن` can be "milk" or "li-bn" / "to the son of" -- genuinely
  ambiguous without diacritics, and the annotator's per-occurrence choice
  isn't always separable after the fact).
- The corpus's own genre balance drives the ranking as-is -- Hadith and its
  heavily-repeated chains of transmission (`حدثنا`, `عن`, ...) are
  proportionally large in the source corpus, so that vocabulary ranks very
  high. Left this way deliberately rather than hand-weighted: this app is
  specifically for reading Classical Arabic texts, where that vocabulary is
  genuinely common.
