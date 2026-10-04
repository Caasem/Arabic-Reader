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

## Data file is not in git

`baranov-data/russian.txt` is gitignored. Copy the file there before building to
include the dictionary; without it the build succeeds and the Baranov dictionary
is simply empty. (A copy also lives at the repo root as `russian.txt`.)
