# Pack tooling

Builds and checks the folder a static host serves for data packs (ADR 0007, `docs/specs/data-architecture.md`
section 5.3). Nothing here uploads anything or needs an account; upload the output with
`scripts/shamela-host/upload.mjs` or `wrangler r2 object put` (manifest last).

```
node scripts/packs/gen-key.mjs <private-key-file>          # once; keep the file offline, outside the repo
node scripts/packs/build.mjs <packs-folder> <out-folder> --key-file <private-key-file>
node scripts/packs/verify.mjs <out-folder> --public-key <base64url>
```

## Input

One folder per pack under `<packs-folder>`:

```
alsihah/
  pack.json        { "id": "alsihah", "version": 3, "title": "Al-Sihah", "kind": "dictionary",
                     "description": "...", "enabled": true,
                     "licence": { "spdx": "...", "source": "...", "attribution": "..." } }
  index.json       every other file is part of the pack (subfolders allowed)
  data/entries.json
```

`kind` is one of `dictionary`, `frequency`, `shamela-book`, `audio`, `other`. `enabled: false` is the kill switch:
apps stop offering the pack on their next manifest refresh.

## Output

```
<out-folder>/manifest.json   signed (ECDSA P-256), short cache time
<out-folder>/p/<sha256>      each file, named by its hash, cache forever
```

## Rules the builder enforces

- A pack without a recorded licence (spdx, source and attribution) is refused.
- A published version is immutable: the same id and version with different files, or an older version than the one
  in `<out-folder>/manifest.json`, is refused. Raise the version instead.
- `sequence` goes up by one with every build; apps never accept a lower one than they have seen.
- The signing key is read from `--key-file` (or `PACK_SIGNING_KEY`) and must not be inside the repository.
- After building, the result is verified the way an app would: signature, then every file's size and SHA-256.

The public key goes into `src/packManager/publicKeys.ts`; keep two there while rotating.
