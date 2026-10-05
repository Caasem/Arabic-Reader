// Reads the files readers exported with Alt+P and shows whether they saved the same dictionary entries.
//
//   node scripts/summarize-saved-entries.mjs path/to/one.json path/to/two.json ...
//   node scripts/summarize-saved-entries.mjs folder-of-files/
//
// Files for different books are reported separately. Nothing is sent anywhere.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { formatSummary, summarizeExports } from '../src/picksExport/summary.ts';

const inputs = process.argv.slice(2);
if (inputs.length === 0) {
  console.error('Usage: node scripts/summarize-saved-entries.mjs <file.json | folder> [...]');
  process.exit(1);
}

const paths = inputs.flatMap((p) =>
  statSync(p).isDirectory()
    ? readdirSync(p)
        .filter((f) => f.endsWith('.json'))
        .map((f) => join(p, f))
    : [p],
);

const exports = [];
for (const path of paths) {
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    if (data?.format !== 'arabic-reader-saved-entries' || data.version !== 1) throw new Error('not a saved-entries file');
    exports.push(data);
  } catch (e) {
    console.error(`Skipped ${path}: ${e.message}`);
  }
}

if (exports.length === 0) {
  console.error('No usable files.');
  process.exit(1);
}
process.stdout.write(formatSummary(summarizeExports(exports)));
