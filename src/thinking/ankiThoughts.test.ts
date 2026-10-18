import { describe, expect, it } from 'vitest';
import type { DeskItem } from '../studyDesk/types';
import { THOUGHT_MODEL, thoughtNote } from './ankiThoughts';

const item = (extra: Partial<DeskItem>): DeskItem => ({ id: 'x', deskId: 'd', type: 'quote', text: '', inInbox: true, createdAt: 1, updatedAt: 1, ...extra });

describe('thoughtNote', () => {
  const passage = item({ id: 'p', text: 'إنما الأعمال بالنيات', ar: true, source: { bookId: 'b', bookTitle: 'Riyāḍ <1>', location: 'pdf:62:0:0:1:1' } });
  const thought = item({ id: 't1', type: 'line', body: 'Two jobs & one "root"\nSecond line <b>' });

  it('puts the passage and its source on the front and the thought on the back', () => {
    const note = thoughtNote(thought, passage, 'Arabic Vocabulary');
    expect(note.modelName).toBe(THOUGHT_MODEL);
    expect(note.deckName).toBe('Arabic Vocabulary');
    expect(note.fields.Passage).toBe('إنما الأعمال بالنيات');
    expect(note.fields.Source).toBe('Riyāḍ &lt;1&gt;, p. 62');
    expect(note.fields.ReaderId).toBe('t1');
  });

  it('escapes HTML and turns new lines into breaks', () => {
    const note = thoughtNote(thought, passage, 'D');
    expect(note.fields.Thought).toBe('Two jobs &amp; one &quot;root&quot;<br>Second line &lt;b&gt;');
  });

  it('keeps several thoughts on one passage apart by their id, and allows the shared first field', () => {
    const a = thoughtNote(thought, passage, 'D');
    const b = thoughtNote({ ...thought, id: 't2' }, passage, 'D');
    expect(a.fields.Passage).toBe(b.fields.Passage);
    expect(a.fields.ReaderId).not.toBe(b.fields.ReaderId);
    expect(a.options?.allowDuplicate).toBe(true);
  });

  it('never leaves the first field empty when the thought has no passage', () => {
    const placed = thoughtNote(item({ id: 't3', type: 'note', body: 'Idea', source: { bookId: 'b', bookTitle: 'Book', location: 'clean:2:10:10' } }), undefined, 'D');
    expect(placed.fields.Passage).toBe('Book');
    expect(placed.fields.Source).toBe('');
    const bare = thoughtNote(item({ id: 't4', type: 'note', body: 'Idea' }), undefined, 'D');
    expect(bare.fields.Passage).not.toBe('');
  });
});
