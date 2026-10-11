# Hans Wehr data

Hans Wehr's *A Dictionary of Modern Written Arabic* is under copyright, so the app ships an
**empty placeholder** (`hanswehr.tsv`, one comment line and no entries). With the placeholder,
switching Hans Wehr on in Settings shows a single note saying the dictionary isn't included.

If you have the right to use the text, you can generate your own copy locally from the
[arabic_lexicons](https://github.com/wizsk/arabic_lexicons) database (its `hanswehr` table):

    python scripts/extract-lexicon-data.py path/to/db.sqlite --hanswehr

That overwrites `hanswehr.tsv` in this folder with the real text (same format as
`public/lane-data/lane.tsv`: `root<TAB>sub-entries joined with <br>`), and the next build
bundles it.

**Never commit the generated file.** Before committing, run
`git checkout -- public/hanswehr-data/hanswehr.tsv` to put the placeholder back.
