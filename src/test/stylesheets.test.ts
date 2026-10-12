import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A stylesheet nobody imports never reaches the page, and nothing else notices: typecheck, lint and the build all
 * pass. In 0.97.0 a file split dropped `import './DictionaryPopup.css'` and the popup lost every style. This test
 * fails when any .css file under src/ is not imported (by name) from some .ts, .tsx or .css file.
 */
const SRC = join(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

describe('stylesheets', () => {
  it('every .css file under src/ is imported somewhere', () => {
    const files = walk(SRC);
    const sources = files.filter((f) => /\.(tsx?|css)$/.test(f) && !f.endsWith('.test.ts')).map((f) => readFileSync(f, 'utf8'));
    const unimported = files
      .filter((f) => f.endsWith('.css'))
      .filter((css) => {
        const name = basename(css);
        return !sources.some((text) => text.includes(`/${name}'`) || text.includes(`/${name}"`));
      })
      .map((f) => relative(SRC, f).replaceAll('\\', '/'));
    expect(unimported).toEqual([]);
  });
});
