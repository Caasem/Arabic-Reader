import { describe, expect, it } from 'vitest';
import type { DeskItem } from '../studyDesk/types';
import { groupPiles } from '../studyDesk/piles';
import { isImplicit, pilePlan, rootClaim } from './piling';
import type { ArgumentRole } from './roles';

const it_ = (id: string, role: ArgumentRole, f: string | null, typed = false, extra: Partial<DeskItem> = {}): DeskItem => ({
  id, deskId: 'd', type: typed ? 'note' : 'quote', text: id, inInbox: false, createdAt: Number(id.replace(/\D/g, '')) || 0, updatedAt: 0,
  source: { bookId: 'b', ...(typed ? {} : { location: 'clean:0:0:5' }) }, argument: { role, for: f, ...(typed ? { typed: true } : {}) }, ...extra,
});
const index = (items: DeskItem[]) => new Map(items.map((i) => [i.id, i]));

describe('rootClaim', () => {
  it('follows for up to the claim with none, and survives a loop', () => {
    const items = [it_('c', 'claim', null), it_('g', 'grounds', 'c'), it_('w', 'warrant', 'g', true)];
    expect(rootClaim('w', index(items))).toBe('c');
    const loop = [it_('a', 'claim', 'b'), it_('b', 'claim', 'a')];
    expect(['a', 'b']).toContain(rootClaim('a', index(loop)));
  });
});

describe('pilePlan', () => {
  const base = [it_('c', 'claim', null), it_('g1', 'grounds', 'c'), it_('g2', 'grounds', 'c')];
  it('a first reader\'s note for a claim stands alone', () => {
    const w1 = it_('w1', 'warrant', 'g1', true);
    const all = [...base, w1];
    expect(pilePlan(w1, all, index(all), 'Notes on “c”')).toEqual([]);
  });
  it('a second note for the same claim joins it in one named pile, at the first one\'s place', () => {
    const w1 = it_('w1', 'warrant', 'g1', true, { pin: { bookId: 'b', location: 'clean:0:10:11', side: 'right' } });
    const w2 = it_('w2', 'warrant', 'g2', true);
    const all = [...base, w1, w2];
    const patches = pilePlan(w2, all, index(all), 'Notes on “c”');
    expect(patches.map((p) => p.id)).toEqual(['w1', 'w2']);
    expect(patches[0].patch.pile?.name).toBe('Notes on “c”');
    expect(patches[1].patch).toMatchObject({ pin: { location: 'clean:0:10:11' } });
    const applied = all.map((i) => ({ ...i, ...(patches.find((p) => p.id === i.id)?.patch ?? {}) }) as DeskItem);
    expect(groupPiles(applied).size).toBe(1);
  });
  it('notes for another claim do not join', () => {
    const other = [it_('c2', 'claim', null), it_('g3', 'grounds', 'c2')];
    const w1 = it_('w1', 'warrant', 'g3', true);
    const w2 = it_('w2', 'warrant', 'g1', true);
    const all = [...base, ...other, w1, w2];
    expect(pilePlan(w2, all, index(all), 'x')).toEqual([]);
  });
  it('only reader\'s notes count as implicit', () => {
    expect(isImplicit(it_('w', 'warrant', 'g', true))).toBe(true);
    expect(isImplicit(it_('w', 'warrant', 'g', false))).toBe(false);
    expect(isImplicit(it_('c', 'claim', null, true))).toBe(false);
  });
});
