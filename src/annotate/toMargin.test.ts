import { describe, expect, it } from 'vitest';
import { sketchOutline, sketchPin, sketchSvg } from './toMargin';

const node = (id: string, text: string, x = 0, y = 0) => ({ id, x, y, w: 100, h: 40, text, kind: 'plain' as const });

describe('sketchOutline', () => {
  it('puts each arrow target under its node, and notes the ink', () => {
    const s = {
      nodes: [node('a', 'الكلام'), node('b', 'اسم'), node('c', 'فعل'), node('d', 'Signs'), node('e', 'Loose')],
      edges: [{ id: '1', a: 'a', b: 'b', dir: true }, { id: '2', a: 'a', b: 'c', dir: true }, { id: '3', a: 'b', b: 'd', dir: true }],
      strokes: [{ id: 's', color: 'ink' as const, width: 2, pts: [[0, 0, 0.5] as [number, number, number]] }],
    };
    expect(sketchOutline(s)).toBe('الكلام\n→ اسم\n  → Signs\n→ فعل\nLoose\n(+ 1 handwritten mark on the sheet)');
  });
  it('still lists nodes that only sit in a loop', () => {
    const s = { nodes: [node('a', 'A'), node('b', 'B')], edges: [{ id: '1', a: 'a', b: 'b', dir: true }, { id: '2', a: 'b', b: 'a', dir: true }], strokes: [] };
    expect(sketchOutline(s)).toBe('A\n→ B');
  });
});

describe('sketchPin', () => {
  it('pins a PDF sheet near the top of its page and a passage sheet to its first line', () => {
    expect(sketchPin({ key: 'pdf:4', location: 'pdf:4' })).toBe('pdf:4:0.0000:0.1000:1.0000:0.0000');
    expect(sketchPin({ key: 'clean:2', location: 'clean:2:120:900' })).toBe('clean:2:120:121');
    expect(sketchPin({ key: 'clean:2', location: 'nowhere' })).toBeNull();
  });
});

describe('sketchSvg', () => {
  it('draws nodes, arrows and ink on paper with escaped text', () => {
    const { svg } = sketchSvg({ nodes: [node('a', 'A & B'), node('b', 'C', 300)], edges: [{ id: '1', a: 'a', b: 'b', dir: true }], strokes: [] });
    expect(svg).toContain('A &amp; B');
    expect(svg).toContain('marker-end="url(#a)"');
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
  });
});
