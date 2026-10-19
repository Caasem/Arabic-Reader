import { describe, expect, it } from 'vitest';
import { addImplicit, implicitFor, removeItem, tieToWords, toMargin, type ArgNode } from './edit';
import { gaps, nextOffender } from './gaps';
import { COL, ROW, layoutSheet } from './layout';
import { ROLES, linkTypeOf, numbering, rolesOf, roleForKey, tagOf, type ArgItem } from './roles';
import { OVERLAP_TOAST, overlaps, snapSelection } from './selection';
import { candidates, nothingToAttach, pickerList, pickerTitle } from './targets';

const TEXT =
  'باب العلم قبل القول والعمل لقول الله تعالى: ﴿فَاعْلَمْ أَنَّهُ لَا إِلَهَ إِلَّا اللَّهُ﴾ فبدأ بالعلم\n\nقال ابن المنير: أراد به أن العلم شرط في صحة القول والعمل، فلا يعتبران إلا به، فهو متقدم عليهما، لأنه مصحح للنية المصححة للعمل، فنبه المصنف على ذلك حتى لا يسبق إلى الذهن من قولهم: «إن العلم لا ينفع إلا بالعمل» تهوين أمر العلم والتساهل في طلبه.';

// The sample of spec 3.1: [key, role, words, target key]
const SAMPLE = [
  ['C', 'claim', 'باب العلم قبل القول والعمل', null],
  ['G', 'grounds', 'لقول الله تعالى: ﴿فَاعْلَمْ أَنَّهُ لَا إِلَهَ إِلَّا اللَّهُ﴾ فبدأ بالعلم', 'C'],
  ['S', 'claim', 'أراد به أن العلم شرط في صحة القول والعمل، فلا يعتبران إلا به', 'C'],
  ['B', 'grounds', 'لأنه مصحح للنية المصححة للعمل', 'S'],
  ['O', 'objection', '«إن العلم لا ينفع إلا بالعمل»', 'C'],
  ['P', 'reply', 'فنبه المصنف على ذلك حتى لا يسبق إلى الذهن من قولهم:', 'O'],
] as const;

function sample(): ArgNode[] {
  return SAMPLE.map(([k, role, words, tgt]) => {
    const start = TEXT.indexOf(words);
    expect(start).toBeGreaterThanOrEqual(0);
    return { id: k, role, for: tgt, spot: start, start, end: start + words.length };
  });
}

describe('roles', () => {
  it('maps keys 1 to 8 to the eight roles, calling rebuttal "Exception"', () => {
    expect(ROLES.map((r) => r.key)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(roleForKey('6')).toBe('rebuttal');
    expect(ROLES[5].label).toBe('Exception');
    expect(roleForKey('9')).toBeNull();
  });
  it('derives Claim · Grounds from a target, never from storage', () => {
    expect(rolesOf({ role: 'claim', for: 'x' })).toEqual(['claim', 'grounds']);
    expect(tagOf({ role: 'claim', for: 'x' })).toBe('Claim · Grounds');
    expect(rolesOf({ role: 'claim', for: null })).toEqual(['claim']);
  });
  it('makes grounds, attacks and replies links, and none for warrants and the like', () => {
    expect(linkTypeOf({ role: 'grounds', for: 'a' })).toBe('grounds');
    expect(linkTypeOf({ role: 'claim', for: 'a' })).toBe('grounds');
    expect(linkTypeOf({ role: 'objection', for: 'a' })).toBe('attacks');
    expect(linkTypeOf({ role: 'reply', for: 'a' })).toBe('replies');
    expect(linkTypeOf({ role: 'warrant', for: 'a' })).toBeNull();
    expect(linkTypeOf({ role: 'grounds', for: null })).toBeNull();
  });
});

describe('the sample (acceptance 5)', () => {
  it('numbers in reading order: #1 C, #2 G, #3 S, #4 B, #5 P, #6 O', () => {
    const n = numbering(sample());
    expect(['C', 'G', 'S', 'B', 'P', 'O'].map((k) => n.get(k))).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('has exactly one gap: 3 steps with no warrant (#2, #3, #4)', () => {
    const g = gaps(sample());
    expect(g).toHaveLength(1);
    expect(g[0].title).toBe('Steps with no warrant');
    expect([...g[0].ids].sort()).toEqual(['B', 'G', 'S']);
  });
  it('lays out 6 boxes with 5 links', () => {
    const items = sample();
    expect(layoutSheet(items).boxes).toHaveLength(6);
    expect(items.filter((n) => linkTypeOf(n))).toHaveLength(5);
  });
  it('puts level-0 claims rightmost, one column left per level, with no overlaps (acceptance 9)', () => {
    const { pos, level, maxLevel } = layoutSheet(sample());
    expect(level.get('C')).toBe(0);
    expect(level.get('B')).toBe(2);
    expect(level.get('P')).toBe(2);
    expect(maxLevel).toBe(2);
    expect(pos.get('C')!.x).toBeGreaterThan(pos.get('S')!.x);
    expect(pos.get('S')!.x).toBeGreaterThan(pos.get('B')!.x);
    expect(pos.get('C')!.x - pos.get('S')!.x).toBe(COL);
    const spots = [...pos.values()].map((p) => `${p.x},${p.y}`);
    expect(new Set(spots).size).toBe(spots.length);
    const col1 = ['G', 'S', 'O'].map((k) => pos.get(k)!.y);
    expect(col1).toEqual([24, 24 + ROW, 24 + 2 * ROW]);
  });
});

describe('warrants (acceptance 6)', () => {
  it('adding an implicit warrant to #2 is a margin-only note and takes the chip count from 3 to 2', () => {
    const items = sample();
    const after = addImplicit(items, 'W1', 'warrant', 'G', 'The order of Scripture shows which comes first.');
    const w = after.find((n) => n.id === 'W1')!;
    expect(w.marginOnly).toBe(true);
    expect(w.typed).toBe(true);
    expect(w.start).toBeNull();
    expect(w.spot).toBe(items[1].spot);
    expect(gaps(after)[0].ids.sort()).toEqual(['B', 'S']);
    expect(layoutSheet(after).boxes).toHaveLength(6);
  });
  it('offers + Warrant and + Exception on a step, + Backing on a warrant, and nothing twice', () => {
    const items = sample();
    expect(implicitFor(items[1], items)).toEqual(['warrant', 'rebuttal']);
    expect(implicitFor(items[0], items)).toEqual([]);
    const withW = addImplicit(items, 'W1', 'warrant', 'G', 'x');
    expect(implicitFor(withW[1], withW)).toEqual(['rebuttal']);
    expect(implicitFor(withW.find((n) => n.id === 'W1')!, withW)).toEqual(['backing']);
    const withB = addImplicit(withW, 'K1', 'backing', 'W1', 'y');
    expect(implicitFor(withB.find((n) => n.id === 'W1')!, withB)).toEqual([]);
  });
  it('ignores an empty note and an unknown target', () => {
    const items = sample();
    expect(addImplicit(items, 'W', 'warrant', 'G', '   ')).toHaveLength(6);
    expect(addImplicit(items, 'W', 'warrant', 'nope', 'x')).toHaveLength(6);
  });
});

describe('conversions (acceptance 7)', () => {
  it('To margin keeps role, target and text and drops the span; Tie to words restores it', () => {
    const items = sample();
    const words = (n: ArgNode) => TEXT.slice(n.start!, n.end!);
    const moved = toMargin(items, 'O', words);
    const o = moved.find((n) => n.id === 'O')!;
    expect(o).toMatchObject({ role: 'objection', for: 'C', marginOnly: true, start: null });
    expect(o.text).toBe('«إن العلم لا ينفع إلا بالعمل»');
    expect(layoutSheet(moved).boxes).toHaveLength(6);
    const orig = items.find((n) => n.id === 'O')!;
    const back = tieToWords(moved, 'O', { start: orig.start!, end: orig.end! }).find((n) => n.id === 'O')!;
    expect(back).toEqual(orig);
  });
});

describe('deleting', () => {
  it('clears the target of whatever pointed at the deleted item, which then shows as not attached', () => {
    const after = removeItem(sample(), 'C');
    expect(after.find((n) => n.id === 'G')!.for).toBeNull();
    expect(gaps(after).find((g) => g.key === 'orphan')!.ids.sort()).toEqual(['G', 'O']); // a claim needs no target, so S is not an orphan
  });
});

describe('targets (acceptance 3)', () => {
  const claims = (spots: [string, number, string | null][]): ArgItem[] =>
    spots.map(([id, spot, f]) => ({ id, role: 'claim', for: f, spot }));
  it('suggests the nearer claim for grounds', () => {
    const items = claims([['near', 100, null], ['far', 900, null]]);
    expect(candidates(items, 'grounds', 150)[0].id).toBe('near');
    expect(candidates(items, 'grounds', 800)[0].id).toBe('far');
  });
  it('suggests a top-level claim for an objection even when a sub-claim is nearer', () => {
    const items = claims([['main', 0, null], ['sub', 500, 'main']]);
    expect(candidates(items, 'objection', 520).map((n) => n.id)).toEqual(['main', 'sub']);
    expect(candidates(items, 'grounds', 520)[0].id).toBe('sub');
  });
  it('lets a claim pick "not a step" first, and caps the list at 8', () => {
    const many = claims(Array.from({ length: 12 }, (_, i) => [`c${i}`, i, null] as [string, number, string | null]));
    const list = pickerList('claim', candidates(many, 'claim', 0));
    expect(list[0]).toBeNull();
    expect(list).toHaveLength(8);
    expect(pickerList('grounds', candidates(many, 'grounds', 0))[0]).not.toBeNull();
  });
  it('never offers the item itself', () => {
    const items = claims([['a', 0, null]]);
    expect(candidates(items, 'claim', 0, 'a')).toEqual([]);
  });
  it('titles the picker by role and toasts when nothing can be attached', () => {
    expect(pickerTitle('claim')).toBe('Also grounds for…');
    expect(pickerTitle('objection')).toBe('For which claim?');
    expect(pickerTitle('warrant')).toBe('For which step (its grounds)?');
    expect(pickerTitle('backing')).toBe('Backs which warrant?');
    expect(pickerTitle('reply')).toBe('Replies to which objection?');
    expect(nothingToAttach('grounds', [])).toBe('Grounds added, but there is nothing to attach it to yet');
    expect(nothingToAttach('claim', [])).toBeNull();
  });
});

describe('selection (acceptance 2)', () => {
  const text = 'alpha beta gamma delta';
  it('snaps a mid-word start and end to whole words', () => {
    expect(snapSelection(text, 2, 13)).toEqual({ start: 0, end: 16 });
  });
  it('trims spaces and gives the same result for a right-to-left selection', () => {
    expect(snapSelection(text, 5, 11)).toEqual({ start: 6, end: 10 });
    expect(snapSelection(text, 11, 5)).toEqual(snapSelection(text, 5, 11));
  });
  it('ignores a selection under 2 characters', () => {
    expect(snapSelection('a b c', 0, 1)).toBeNull();
    expect(snapSelection(text, 5, 6)).toBeNull();
  });
  it('refuses an overlap but not a touching neighbour', () => {
    const spans = [{ start: 10, end: 20 }];
    expect(overlaps(spans, { start: 15, end: 25 })).toBe(true);
    expect(overlaps(spans, { start: 20, end: 30 })).toBe(false);
    expect(overlaps(spans, { start: 0, end: 10 })).toBe(false);
    expect(OVERLAP_TOAST).toBe('That overlaps another highlight. Select clear words.');
  });
});

describe('layout robustness', () => {
  it('does not hang on a cycle in `for`', () => {
    const items: ArgItem[] = [
      { id: 'a', role: 'claim', for: 'b', spot: 0 },
      { id: 'b', role: 'claim', for: 'a', spot: 10 },
    ];
    const { level, pos } = layoutSheet(items);
    expect(level.size).toBe(2);
    expect(pos.size).toBe(2);
  });
  it('an empty sheet has one row', () => {
    expect(layoutSheet([]).rows).toBe(1);
  });
  it('lays out 200 items at once', () => {
    const items: ArgItem[] = Array.from({ length: 200 }, (_, i) => ({ id: `n${i}`, role: i % 2 ? 'grounds' : 'claim', for: i ? `n${i - 1}` : null, spot: i }));
    expect(layoutSheet(items).maxLevel).toBe(199);
    expect(gaps(items).length).toBeGreaterThan(0);
  });
});

describe('gap jumping (acceptance 10)', () => {
  it('goes to the first offender, then the next, then cycles', () => {
    const ids = ['a', 'b', 'c'];
    expect(nextOffender(ids, null)).toBe('a');
    expect(nextOffender(ids, 'a')).toBe('b');
    expect(nextOffender(ids, 'c')).toBe('a');
    expect(nextOffender([], null)).toBeNull();
  });
});
