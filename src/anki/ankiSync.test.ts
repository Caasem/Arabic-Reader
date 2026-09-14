import { afterEach, describe, expect, it, vi } from 'vitest';
import { escapeHtml, syncToAnki, toAnkiNote } from './ankiSync';
import type { VocabularyItem } from '../types';

const item = (id: string, surfaceForm: string, meaning: string, sentence?: string) =>
  ({ id, surfaceForm, meaning, sentence }) as VocabularyItem;

describe('toAnkiNote', () => {
  it('escapes HTML and separates meaning from sentence with line breaks', () => {
    const note = toAnkiNote('Deck', item('1', 'كتاب', 'book <n.> & "tome"', 'قرأت الكتاب'));
    expect(note.fields.Front).toBe('كتاب');
    expect(note.fields.Back).toBe('book &lt;n.&gt; &amp; &quot;tome&quot;<br><br>قرأت الكتاب');
    expect(escapeHtml('<b>')).toBe('&lt;b&gt;');
  });
});

describe('syncToAnki', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('adds new notes in one batch, and marks duplicates and additions as synced', async () => {
    const calls: { action: string; params: { notes: unknown[] } }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        calls.push(body);
        const result = body.action === 'canAddNotes' ? [true, false, true] : [101, null];
        return new Response(JSON.stringify({ result, error: null }));
      })
    );

    const items = [item('a', 'واحد', 'one'), item('b', 'اثنان', 'two'), item('c', 'ثلاثة', 'three')];
    const marked: string[] = [];
    const result = await syncToAnki('Deck', items, async (i) => marked.push(i.id));

    expect(result).toEqual({ added: 1, alreadyInAnki: 1, failed: 1 });
    expect(marked.sort()).toEqual(['a', 'b']);
    expect(calls.map((c) => c.action)).toEqual(['canAddNotes', 'addNotes']);
    expect(calls[1].params.notes).toHaveLength(2);
  });
});
