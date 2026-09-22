// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { extractSentence } from './extractSentence';

function wordIn(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.querySelector<HTMLElement>('.ar-word')!;
}

describe('extractSentence', () => {
  it('returns the punctuated sentence containing the word', () => {
    const el = wordIn('<p>جملة أولى. <span class="ar-word">كلمة</span> هنا ثانية! وثالثة.</p>');
    expect(extractSentence(el)).toBe('كلمة هنا ثانية!');
  });

  it('falls back to a bounded window when there is no sentence punctuation', () => {
    const long = 'كلمة '.repeat(80);
    const el = wordIn(`<p>${long}<span class="ar-word">هدف</span> ${long}</p>`);
    const sentence = extractSentence(el)!;
    expect(sentence).toContain('هدف');
    expect(sentence.startsWith('…')).toBe(true);
    expect(sentence.length).toBeLessThan(long.length);
  });

  it('returns null when the word has no block-level ancestor', () => {
    document.body.innerHTML = '';
    const span = document.createElement('span');
    span.className = 'ar-word';
    span.textContent = 'كلمة';
    document.body.appendChild(span);
    expect(extractSentence(span)).toBeNull();
  });
});
