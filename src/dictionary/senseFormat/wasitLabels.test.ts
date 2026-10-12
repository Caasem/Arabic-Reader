import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { annotateGloss } from '../../wasitStructure/parse';
import { badgeOf } from './wasitLabels';

describe('badgeOf', () => {
  it('reads the four labels, plural markers and nothing else', () => {
    expect(badgeOf('(مج).')).toMatchObject({ kind: 'label', text: 'مج' });
    expect(badgeOf('(مو)')).toMatchObject({ kind: 'label' });
    expect(badgeOf('(د).')).toMatchObject({ kind: 'label', text: 'د' });
    expect(badgeOf('(ج)')).toMatchObject({ kind: 'plural', title: 'Plural' });
    expect(badgeOf('(انظر:')).toBeNull();
    expect(badgeOf('(الباشا):')).toBeNull();
  });
});

describe('the Al-Wasit data', () => {
  it('finds the labels and plurals the editors printed', () => {
    const rows = readFileSync('public/alwasit-data/alwasit.tsv', 'utf8').split('\n');
    const n: Record<string, number> = { 'مج': 0, 'مو': 0, 'مع': 0, 'د': 0, plural: 0 };
    for (const row of rows) {
      const meanings = row.slice(row.indexOf('\t') + 1);
      for (const block of meanings.split(/<br\s*\/?>/i).flatMap((b) => b.split(/(?=\sو-\s)/))) {
        for (const w of annotateGloss(block.trim()).words) {
          if (w.role === 'tag' && w.display! in n) n[w.display!]++;
          if (w.role === 'plural-mark') n.plural++;
        }
      }
    }
    // Printed: 1,279 / 531 / 326 / 232 labels and 8,507 plurals; the few missing sit glued to the next word or open a gloss.
    expect(n['مج']).toBeGreaterThan(1250);
    expect(n['مو']).toBeGreaterThan(515);
    expect(n['مع']).toBeGreaterThan(320);
    expect(n['د']).toBeGreaterThan(220);
    expect(n['مج']).toBeLessThanOrEqual(1279);
    expect(n.plural).toBeGreaterThan(8400);
    expect(n.plural).toBeLessThanOrEqual(8507);
  });
});
