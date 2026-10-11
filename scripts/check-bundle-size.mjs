// Fails when a built file in dist/assets grows past its budget, so size regressions show up in CI
// instead of in the installer. Run after `npm run build` (CI runs it after the e2e tests, which build).
//
//   node scripts/check-bundle-size.mjs [dist folder=dist]
//
// Each file takes the budget of the first rule its name matches. "App code" is every JS and CSS file
// that is not data, a worker or WebAssembly; it also has a budget for its total. Budgets sit about 10%
// above the sizes measured when this was written; raise one on purpose, in the same commit that
// explains why. The dictionary data rules go away when the dictionaries become packs (refactor phase 3).
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const KB = 1000;
const MB = 1000 * KB;

/** [label, file name pattern, budget per file in bytes, counts toward the app code total] */
const RULES = [
  ['dictionary data', /^_virtual_[\w-]+-data-[\w-]+\.js$/, 8.6 * MB, false],
  ['AraMorph worker', /^aramorph\.worker-[\w-]+\.js$/, 4.8 * MB, false],
  ['pdf.js worker', /^pdf\.worker\.min-[\w-]+\.m?js$/, 1.3 * MB, false],
  ['WebAssembly', /\.wasm$/, 15.7 * MB, false],
  ['entry script', /^index-[\w-]+\.js$/, 730 * KB, true],
  ['entry styles', /^index-[\w-]+\.css$/, 165 * KB, true],
  ['other script', /\.m?js$/, 480 * KB, true],
  ['other styles', /\.css$/, 60 * KB, true],
];
const APP_CODE_TOTAL = 2.85 * MB;

const dist = process.argv[2] ?? 'dist';
const assets = join(dist, 'assets');
let names;
try {
  names = readdirSync(assets);
} catch {
  console.error(`No ${assets} folder. Run \`npm run build\` first.`);
  process.exit(1);
}

const fmt = (bytes) => (bytes >= MB ? `${(bytes / MB).toFixed(2)} MB` : `${(bytes / KB).toFixed(1)} kB`);
const over = [];
let appCode = 0;
let largestApp = [];

for (const name of names) {
  const rule = RULES.find(([, pattern]) => pattern.test(name));
  if (!rule) continue; // fonts, images and other static files
  const [label, , budget, isApp] = rule;
  const size = statSync(join(assets, name)).size;
  if (isApp) {
    appCode += size;
    largestApp.push([name, size]);
  }
  if (size > budget) over.push(`${name} (${label}): ${fmt(size)}, budget ${fmt(budget)}`);
}
if (appCode > APP_CODE_TOTAL) over.push(`App code total: ${fmt(appCode)}, budget ${fmt(APP_CODE_TOTAL)}`);

largestApp = largestApp.sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log(`App code: ${fmt(appCode)} of ${fmt(APP_CODE_TOTAL)}. Largest:`);
for (const [name, size] of largestApp) console.log(`  ${fmt(size).padStart(9)}  ${name}`);

if (over.length) {
  console.error('\nOver budget:');
  for (const line of over) console.error(`  ${line}`);
  console.error('\nShrink it, or raise the budget in scripts/check-bundle-size.mjs and say why in the commit.');
  process.exit(1);
}
console.log('All files within budget.');
