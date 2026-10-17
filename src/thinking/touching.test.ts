import { describe, expect, it } from 'vitest';
import type { DeskItem } from '../studyDesk/types';
import { touchCounts, touching } from './touching';

const item = (id: string, extra: Partial<DeskItem> = {}): DeskItem => ({ id, deskId: 'd', type: 'quote', text: id, inInbox: true, createdAt: 1, updatedAt: 1, ...extra });
const map = (items: DeskItem[]) => new Map(items.map((i) => [i.id, i]));

describe('touching a passage', () => {
  const passage = item('p', { body: 'my gloss', source: { bookId: 'b1', location: 'pdf:62:0.1:0.30:0.8:0.06' }, links: ['g'] });
  const here = item('t1', { type: 'line', text: '', body: 'Two jobs', pin: { bookId: 'b1', location: 'pdf:62:0:0.31:1:0', side: 'right' }, links: ['t3'] });
  const elsewhere = item('t3', { type: 'note', text: '', body: 'Al-Ghazālī: a state of the heart', source: { bookId: 'b2', location: 'pdf:4:0:0.2:1:0' }, links: ['t1'] });
  const fromGloss = item('g', { type: 'note', text: '', body: 'linked to the gloss', source: { bookId: 'b3' } });
  const otherPage = item('t4', { type: 'line', text: '', body: 'not here', pin: { bookId: 'b1', location: 'pdf:63:0:0.31:1:0', side: 'right' } });
  const dropped = item('t5', { type: 'line', text: '', body: 'dropped', droppedAt: 5, pin: { bookId: 'b1', location: 'pdf:62:0:0.31:1:0', side: 'right' } });
  const asked = item('q1', { type: 'question', text: 'Why?', source: { bookId: 'b1', location: 'pdf:62:0:0.32:1:0' } });
  const answered = item('q2', { type: 'question', text: 'Which three?', answer: 'p' });
  const unrelated = item('q3', { type: 'question', text: 'Elsewhere', source: { bookId: 'b2', location: 'pdf:62:0:0.32:1:0' } });
  const items = [passage, here, elsewhere, fromGloss, otherPage, dropped, asked, answered, unrelated];

  it('lists the gloss, thoughts here and those linked to them, and masāʾil', () => {
    const t = touching(passage, items, map(items));
    expect(t.map((x) => `${x.kind}:${x.item.id}`)).toEqual(['gloss:p', 'thought:t1', 'thought:g', 'thought:t3', 'question:q1', 'question:q2']);
    const via = t.find((x) => x.kind === 'thought' && x.item.id === 't3');
    expect(via && via.kind === 'thought' && via.via?.id).toBe('t1');
    const ans = t.find((x) => x.kind === 'question' && x.item.id === 'q2');
    expect(ans && ans.kind === 'question' && ans.answers).toBe(true);
  });

  it('counts per passage, leaving out passages nothing touches', () => {
    const lone = item('lone', { source: { bookId: 'b9', location: 'pdf:1:0.1:0.1:0.5:0.05' } });
    const counts = touchCounts([passage, lone], [...items, lone], map([...items, lone]));
    expect(counts.get('p')).toBe(6);
    expect(counts.has('lone')).toBe(false);
  });
});
