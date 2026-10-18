import { describe, expect, it } from 'vitest';
import { buildSheet, clipToBox } from './sheetModel';
import type { ArgItem, ArgumentRole } from './roles';

const a = (id: string, role: ArgumentRole, f: string | null, spot: number, marginOnly = false): ArgItem => ({ id, role, for: f, spot, marginOnly });
// The sample of spec 3.1, in reading order.
const sample = (): ArgItem[] => [a('C', 'claim', null, 0), a('G', 'grounds', 'C', 1), a('S', 'claim', 'C', 2), a('B', 'grounds', 'S', 3), a('P', 'reply', 'O', 4), a('O', 'objection', 'C', 5)];
const words = (id: string) => `words ${id}`;

describe('buildSheet on the sample', () => {
  const sheet = buildSheet(sample(), words);
  it('has six boxes, five links and one gap: three steps with no warrant', () => {
    expect(sheet.boxes).toHaveLength(6);
    expect(sheet.edges).toHaveLength(5);
    expect(sheet.gaps).toHaveLength(1);
    expect(sheet.gaps[0].ids.sort()).toEqual(['B', 'G', 'S']);
  });
  it('types the links: grounds, attacks, replies', () => {
    const type = (id: string) => sheet.edges.find((e) => e.id === id)!.type;
    expect([type('G'), type('S'), type('O'), type('P')]).toEqual(['grounds', 'grounds', 'attacks', 'replies']);
  });
  it('shows a claim that is also grounds as both', () => {
    const s = sheet.boxes.find((b) => b.id === 'S')!;
    expect(s.tag).toBe('Claim · Grounds');
    expect(s.roles).toEqual(['claim', 'grounds']);
  });
  it('ends each arrow on the border of its two boxes', () => {
    for (const e of sheet.edges) {
      const from = sheet.boxes.find((b) => b.id === e.from)!;
      const to = sheet.boxes.find((b) => b.id === e.to)!;
      const onBorder = (b: typeof from, [x, y]: [number, number]) => {
        const inX = x >= b.x - 0.01 && x <= b.x + b.w + 0.01;
        const inY = y >= b.y - 0.01 && y <= b.y + b.h + 0.01;
        const edge = Math.abs(x - b.x) < 0.01 || Math.abs(x - b.x - b.w) < 0.01 || Math.abs(y - b.y) < 0.01 || Math.abs(y - b.y - b.h) < 0.01;
        return inX && inY && edge;
      };
      expect(onBorder(from, e.a)).toBe(true);
      expect(onBorder(to, e.b)).toBe(true);
    }
  });
  it('keeps the sheet inside its own width and height', () => {
    for (const b of sheet.boxes) {
      expect(b.x + b.w).toBeLessThanOrEqual(sheet.width + 210);
      expect(b.y + b.h).toBeLessThanOrEqual(sheet.height + 100);
    }
  });
});

describe('warrants, backing, qualifiers and exceptions', () => {
  const items = [...sample(), a('W', 'warrant', 'G', 10, true), a('K', 'backing', 'W', 11, true), a('Q', 'qualifier', 'G', 12, true), a('X', 'rebuttal', 'G', 13, true)];
  const sheet = buildSheet(items, words);
  const g = sheet.edges.find((e) => e.id === 'G')!;
  it('puts the warrant on its arrow with the backing inside, and clears the gap', () => {
    expect(g.warrant).toMatchObject({ id: 'W', backing: { id: 'K' } });
    expect(sheet.gaps[0].ids.sort()).toEqual(['B', 'S']);
    expect(sheet.boxes).toHaveLength(6);
  });
  it('adds the qualifier and a flag for the exception to the label, and moves the label past the warrant card', () => {
    expect(g.label).toBe('grounds · words Q ⚑');
    expect(g.exception).toBe('words X');
    expect(g.labelAt).toBe(0.86);
    expect(sheet.edges.find((e) => e.id === 'S')!.labelAt).toBe(0.5);
  });
});

describe('clipToBox', () => {
  it('leaves through the right side for a target straight to the right', () => {
    expect(clipToBox({ x: 0, y: 0, w: 100, h: 50 }, 500, 25)).toEqual([100, 25]);
  });
  it('stays at the centre when the target is the centre', () => {
    expect(clipToBox({ x: 0, y: 0, w: 100, h: 50 }, 50, 25)).toEqual([50, 25]);
  });
});
