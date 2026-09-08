# Setting up Vocabulary Levels (one command)

This zip does **not** include the CAMeL Arabic Frequency Lists data file —
at ~65MB compressed, it's too large to deliver through this chat, so it's
left out of the zip and needs to be added once before the Vocabulary
Levels feature (rarity badges, the "Vocab Levels" tab) will work.
Everything else in this release works without it.

## Setup

From the project folder, with dependencies installed (`npm install`):

```sh
npm run setup:vocab-data
```

That's it — this downloads the official dataset from CAMeL Lab's GitHub
release, extracts it, and writes it to
`public/frequency-data/MSA_freq_lists.tsv.gzbin` in the format the app
expects. It uses only Node's built-in `fetch` and `zlib` (no extra
dependencies, no `unzip`/`gzip` command-line tools required), so it works
the same on macOS, Linux, and Windows. Takes a minute or two depending on
your connection (~65MB download).

Then restart `npm run dev` (or rebuild with `npm run build`) — the file is
served from `public/`, so no code changes are needed. "Enable vocabulary
levels" in Settings or the Vocab Levels panel will now work.

## If you'd rather do it manually

See `scripts/fetch-vocab-data.mjs` for exactly what the script does — it's
a short, readable file. The short version: download
[`MSA_freq_lists.tsv.zip`](https://github.com/CAMeL-Lab/Camel_Arabic_Frequency_Lists/releases/download/v1.0/MSA_freq_lists.tsv.zip),
extract the `.tsv` inside it, re-compress that as **gzip** (not zip), and
save the result as `public/frequency-data/MSA_freq_lists.tsv.gzbin`. The
`.gzbin` extension (instead of `.gz`) is deliberate — see the comment at
the top of `src/vocabRarity/frequencyIndex.ts`.

A common mistake doing this by hand is renaming the downloaded `.zip`
straight to `.gzbin` without actually re-compressing it — a ZIP file and a
GZIP file are different formats, so this produces a file that looks right
but isn't, and the app will fail with a clear error message telling you
so (rather than a cryptic browser exception, as of this build).

See `CAMEL-NOTICE.txt` (already in `public/frequency-data/`) for the
dataset's license (CC BY-SA 4.0) and attribution requirements if you
redistribute it further.
