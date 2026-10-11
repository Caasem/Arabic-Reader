# Baranov (Arabic-Russian) data

`russian.txt` is a tab-separated Arabic-Russian dictionary dump (about 38,000
articles): `id`, headword, then scattered columns for vocalized form, homograph
number, part of speech and the Russian translation. It matches the `dic.txt`
file in ApayRus/meteor-arabic-dictionary (`imports/my-playground/`), which
resembles Kh. K. Baranov's *Arabic-Russian Dictionary*.

## Provenance and licensing: unverified

Neither this file nor that repository states its source or license (there is no
`LICENSE`, and no author or license in its `package.json`). Baranov's dictionary
is a copyrighted work. The repository owner has said this data is open source, but
no license text backs that up yet. Add the license or the owner's statement here
before redistributing the app beyond personal use.

The dictionary defaults to **off** in Settings, and its data is a separate chunk
downloaded only when switched on. Users can also load their own copy through
Settings → Dictionaries → Load dictionary file.

## Which file the build reads

The build reads `baranov-data/russian.txt` (the complete file, about 39,000
lines). It used to sit at the repo root, next to an incomplete 7,000-line copy
here; the full file replaced that copy. If the file is missing, the
build still succeeds and the Baranov dictionary is simply empty.
