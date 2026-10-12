import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Popup features follow the shape of the entries (src/types DictionaryEntry) and the data-level traits a
 * dictionary declares (src/dictionary/providerTraits.ts), never a dictionary's name. This fails when feature
 * code compares a provider id to a string literal, or brings back one of the old lists of ids.
 */
const SRC = path.resolve(__dirname, '..');
const IDS = 'aramorph|alwasit|alsihah|almaqayis|lane|hanswehr|baranov|personal';

/** The only places that may name a dictionary: its adapters and the registry of traits / providers. */
const MAY_NAME_A_DICTIONARY = [
  path.join('dictionary', 'providers') + path.sep,
  path.join('dictionary', 'providerTraits.ts'),
  path.join('dictionary', 'DictionaryManager.ts'),
];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(d.name) && !/\.test\.tsx?$/.test(d.name) && !d.name.endsWith('.d.ts') ? [full] : [];
  });
}

const FEATURE_FILES = sourceFiles(SRC).filter((f) => {
  const rel = path.relative(SRC, f);
  return !MAY_NAME_A_DICTIONARY.some((allowed) => rel.startsWith(allowed));
});

const RULES: { name: string; pattern: RegExp }[] = [
  { name: 'compares a providerId to a string literal', pattern: /providerId\s*[!=]==?\s*['"`]|['"`]\s*[!=]==?\s*[\w.?]*providerId\b/ },
  { name: 'switches on a providerId', pattern: /switch\s*\(\s*[\w.?]*providerId\s*\)/ },
  { name: 'lists dictionary ids in a Set or array to gate a feature', pattern: new RegExp(String.raw`new Set\(\[[^\]]*['"](?:${IDS})['"]`) },
  { name: 'uses one of the removed id lists', pattern: /TOKENIZED_PROVIDER_IDS|EXAMPLE_PROVIDERS|ENGLISH_SENSE_PROVIDERS|isTokenizedProvider|HEADED\b|INDEXED\b/ },
];

describe('the guard itself', () => {
  const caught = (code: string) => RULES.some((r) => r.pattern.test(code));
  it('catches the ways a feature used to name a dictionary', () => {
    expect(caught("if (entry.providerId === 'lane') return;")).toBe(true);
    expect(caught("const x = g.providerId !== \"alwasit\";")).toBe(true);
    expect(caught("'hanswehr' === entry.providerId")).toBe(true);
    expect(caught('switch (entry.providerId) {')).toBe(true);
    expect(caught("const GATE = new Set(['alwasit', 'alsihah']);")).toBe(true);
    expect(caught('isTokenizedProvider(entry.providerId)')).toBe(true);
  });
  it('lets data-driven checks through', () => {
    expect(caught('traitsOf(entry.providerId).structure')).toBe(false);
    expect(caught('last.providerId === entry.providerId')).toBe(false);
    expect(caught('switch (traitsOf(providerId).headReader) {')).toBe(false);
  });
});

describe('no dictionary is named by feature code', () => {
  it('scans the feature code', () => {
    expect(FEATURE_FILES.length).toBeGreaterThan(100);
    expect(FEATURE_FILES.some((f) => f.endsWith('entryList.tsx'))).toBe(true);
    expect(FEATURE_FILES.some((f) => f.includes(path.join('dictionary', 'providers')))).toBe(false);
  });

  for (const rule of RULES) {
    it(`nothing outside the adapters ${rule.name}`, () => {
      const hits = FEATURE_FILES.flatMap((file) =>
        fs
          .readFileSync(file, 'utf8')
          .split('\n')
          .map((line, i) => ({ file: path.relative(SRC, file), line: i + 1, text: line.trim() }))
          .filter(({ text }) => !text.startsWith('//') && !text.startsWith('*') && rule.pattern.test(text)),
      );
      expect(hits).toEqual([]);
    });
  }
});
