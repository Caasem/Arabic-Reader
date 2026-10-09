import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { InkDB } from './db';
import { addStroke, bookSketches, bookStrokes, deleteStrokes, isEmptySketch, newSketch, onInkChange, readAll, restoreStrokes, saveSketch, setInkDBForTests } from './inkStore';

let n = 0;
beforeEach(() => setInkDBForTests(new InkDB(`ink-test-${++n}`)));

const stroke = (bookId: string, key: string) => ({ bookId, key, tool: 'pen' as const, color: 'ink' as const, width: 2, pts: [[0, 0, 0.5], [10, 10, 0.5]] as [number, number, number][] });

describe('strokes', () => {
  it('adds, lists per book, erases and restores', async () => {
    let calls = 0;
    const off = onInkChange(() => calls++);
    const a = await addStroke(stroke('b1', 'pdf:1'));
    const b = await addStroke({ ...stroke('b1', 'clean:0'), offset: 12 });
    await addStroke(stroke('b2', 'pdf:1'));
    expect((await bookStrokes('b1')).map((s) => s.id)).toEqual([a.id, b.id]);
    await deleteStrokes([a.id]);
    expect((await bookStrokes('b1')).map((s) => s.id)).toEqual([b.id]);
    await restoreStrokes([a]);
    expect((await bookStrokes('b1')).find((s) => s.id === a.id)).toEqual(a);
    expect(calls).toBe(5);
    off();
  });
});

describe('sketches', () => {
  it('saves per book and stamps the change', async () => {
    const s = newSketch('b1', 'clean:2', 'clean:2:10:90');
    expect(isEmptySketch(s)).toBe(true);
    s.nodes.push({ id: 'n1', x: 0, y: 0, w: 100, h: 40, text: 'العصبية', kind: 'plain' });
    await saveSketch(s);
    await saveSketch(newSketch('b2', 'pdf:3', 'pdf:3'));
    const got = await bookSketches('b1');
    expect(got).toHaveLength(1);
    expect(got[0].nodes[0].text).toBe('العصبية');
    expect(got[0].updatedAt).toBeGreaterThanOrEqual(s.createdAt);
    expect(await readAll('sketches')).toHaveLength(2);
  });
});
