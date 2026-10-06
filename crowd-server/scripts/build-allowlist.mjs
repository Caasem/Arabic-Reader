// Builds the allow-list the server uses to reject made-up entries (docs/specs/crowd-sense-ranking.md, section 11.1)
// from a plain list of dictionary entries, one JSON object per line:
//
//   {"providerId":"alsihah","headword":"كَتَبَ","root":"كتب","verbForm":"I"}
//
//   node crowd-server/scripts/build-allowlist.mjs entries.jsonl allowlist.json
//   wrangler r2 object put arabic-reader-crowd-packs/allowlist.json --file allowlist.json
//
// The key is computed exactly as the app does (src/sensePicks/keys.ts: provider, headword and root without
// vowel marks, verb form). Dictionaries the app builds at run time, such as AraMorph, are not listed: until a
// list exists for them the server accepts any entry of a known dictionary, so leave their `providerId` out.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node crowd-server/scripts/build-allowlist.mjs <entries.jsonl> <allowlist.json>');
  process.exit(1);
}

const TASHKEEL = /[ً-ٰٟـ]/g;
const text = (s) => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
const arabic = (s) => text(s.replace(TASHKEEL, ''));
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
function base32(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
const entryKey = (e) => base32(createHash('sha256').update([e.providerId, arabic(e.headword), arabic(e.root ?? ''), text(e.verbForm ?? '')].join('|')).digest().subarray(0, 10));

const entries = new Set();
for (const line of readFileSync(input, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const e = JSON.parse(line);
  entries.add(`${e.providerId}:${entryKey(e)}`);
}
writeFileSync(output, JSON.stringify({ entries: [...entries].sort() }));
console.log(`Wrote ${entries.size} entries to ${output}`);
