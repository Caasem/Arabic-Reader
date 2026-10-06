// Writes FAKE reader files in the Alt+P format, to try out scripts/summarize-saved-entries.mjs.
// Everything here is invented. Each file says "synthetic": true and the book title says so, so it
// cannot be mistaken for the real reader test (docs/specs/crowd-sense-ranking.md, phase 0).
//
//   node scripts/make-dummy-saved-entries.mjs <output folder> [readers=15] [seed=1]
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [outDir, readersArg, seedArg] = process.argv.slice(2);
if (!outDir) {
  console.error('Usage: node scripts/make-dummy-saved-entries.mjs <output folder> [readers=15] [seed=1]');
  process.exit(1);
}
const READERS = Math.max(1, Number(readersArg ?? 15));
let state = Number(seedArg ?? 1) >>> 0 || 1;
// A tiny seeded generator, so the same seed gives the same files.
const random = () => {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (weights) => {
  let r = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) if ((r -= weights[i]) < 0) return i;
  return weights.length - 1;
};
const key = (label) => createHash('sha256').update(label).digest('base64url').replace(/[^a-z0-9]/gi, '').slice(0, 16).toLowerCase();

const BOOK = { title: 'SAMPLE (synthetic data, not real readers)', key: 'dummybookdummybook12' };

// word, dictionary, entries (headword, verb form), how likely each is to be saved, how likely a reader saves anything
const WORDS = [
  ['كتبت', 'aramorph', [['كَتَبَ', 'I'], ['كَتَّبَ', 'II'], ['كَاتَبَ', 'III']], [0.82, 0.12, 0.06], 0.9],
  ['فصلا', 'aramorph', [['فَصْل', ''], ['فَصَلَ', 'I']], [0.9, 0.1], 0.8],
  ['علم', 'aramorph', [['عِلْم', ''], ['عَلَمٌ', ''], ['عَلِمَ', 'I']], [0.7, 0.2, 0.1], 0.85],
  ['حصل', 'aramorph', [['حَصَلَ', 'I'], ['حَصَّلَ', 'II']], [0.45, 0.55], 0.7],
  ['قرأ', 'aramorph', [['قَرَأَ', 'I'], ['أَقْرَأَ', 'IV'], ['قَارَأَ', 'III']], [0.4, 0.35, 0.25], 0.75],
  ['ملك', 'aramorph', [['مَلِك', ''], ['مَلَكَ', 'I'], ['مُلْك', '']], [0.34, 0.33, 0.33], 0.8],
  ['رقيم', 'aramorph', [['رَقِيم', ''], ['رَقَمَ', 'I']], [0.6, 0.4], 0.25],
  ['كتب', 'baranov', [['كَتَبَ', 'I'], ['كُتُب', ''], ['كَتَّبَ', 'II']], [0.75, 0.15, 0.1], 0.5],
  ['قال', 'aramorph', [['قَالَ', 'I']], [1], 0.9],
  ['بيت', 'aramorph', [['بَيْت', ''], ['بَيَّتَ', 'II']], [0.88, 0.12], 0.6],
];

mkdirSync(outDir, { recursive: true });
for (let r = 1; r <= READERS; r++) {
  const words = [];
  for (const [word, dictionary, entries, weights, participation] of WORDS) {
    if (random() > participation) continue;
    const chosen = new Set([pick(weights)]);
    if (entries.length > 2 && random() < 0.12) chosen.add(pick(weights)); // now and then a reader saves two entries
    words.push({
      lemmaKey: key(word),
      word,
      saves: [...chosen].map((i) => ({
        dictionary,
        entryKey: key(`${word}|${dictionary}|${entries[i][0]}|${entries[i][1]}`),
        headword: entries[i][0],
        ...(entries[i][1] ? { verbForm: entries[i][1] } : {}),
        source: 'entry',
        day: '2026-10-0' + (1 + Math.floor(random() * 5)),
      })),
    });
  }
  const file = {
    format: 'arabic-reader-saved-entries',
    version: 1,
    synthetic: true,
    exportedAt: '2026-10-06T09:00:00.000Z',
    appVersion: 'synthetic',
    book: BOOK,
    words,
  };
  writeFileSync(join(outDir, `saved-entries-dummy-reader-${String(r).padStart(2, '0')}.json`), JSON.stringify(file, null, 2));
}
console.log(`Wrote ${READERS} synthetic reader files to ${outDir}`);
