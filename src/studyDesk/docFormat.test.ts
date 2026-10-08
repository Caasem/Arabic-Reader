// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { applyLineStart, lineStart } from './docFormat';

describe('line starts in the desk document', () => {
  it('knows headings, lists and quotations, and the text after the marker', () => {
    expect(lineStart('# Notes')).toEqual({ kind: 'heading', rest: 'Notes' });
    expect(lineStart('- first')).toEqual({ kind: 'bullets', rest: 'first' });
    expect(lineStart('* first')).toEqual({ kind: 'bullets', rest: 'first' });
    expect(lineStart('1. one')).toEqual({ kind: 'numbers', rest: 'one' });
    expect(lineStart('> قال')).toEqual({ kind: 'quote', rest: 'قال' });
    expect(lineStart(' - no')).toBeNull();
    expect(lineStart('-no space')).toBeNull();
    expect(lineStart('2. two')).toBeNull();
  });

  it('turns the paragraph into the block and gives back where the caret goes', () => {
    const ed = document.createElement('div');
    ed.innerHTML = '<p>- </p><p>> said</p>';
    const li = applyLineStart(ed.children[0] as HTMLElement)!;
    expect(li.tagName).toBe('LI');
    expect(ed.innerHTML).toBe('<ul><li><br></li></ul><p>&gt; said</p>');
    const q = applyLineStart(ed.children[1] as HTMLElement)!;
    expect(q.outerHTML).toBe('<blockquote>said</blockquote>');
  });
});
