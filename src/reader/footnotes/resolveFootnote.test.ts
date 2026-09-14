// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isFootnoteLink, sanitizeFootnoteHtml } from './resolveFootnote';

function anchor(attrs: Record<string, string>, text = '1'): HTMLAnchorElement {
  const a = document.createElement('a');
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  a.textContent = text;
  return a;
}

describe('isFootnoteLink', () => {
  it('recognizes semantic and conventional footnote markers', () => {
    expect(isFootnoteLink(anchor({ href: '#n1', 'epub:type': 'noteref' }, 'x'))).toBe(true);
    expect(isFootnoteLink(anchor({ href: 'notes.xhtml#n1', role: 'doc-noteref' }, 'x'))).toBe(true);
    expect(isFootnoteLink(anchor({ href: '#n1', class: 'footnote-ref' }, 'x'))).toBe(true);
    expect(isFootnoteLink(anchor({ href: '#n3' }, '[3]'))).toBe(true);
  });

  it('ignores external and ordinary links', () => {
    expect(isFootnoteLink(anchor({ href: 'https://example.com', 'epub:type': 'noteref' }))).toBe(false);
    expect(isFootnoteLink(anchor({ href: 'chapter2.xhtml' }, 'Next chapter'))).toBe(false);
  });
});

describe('sanitizeFootnoteHtml', () => {
  it('keeps inline formatting and drops scripts, handlers, and unsafe links', () => {
    const html = sanitizeFootnoteHtml(
      '<b>bold</b><script>alert(1)</script><a href="javascript:evil()">bad</a>' +
        '<a href="https://example.com" onclick="evil()">good</a><img src="x" onerror="evil()"><custom>kept text</custom>'
    );
    expect(html).toContain('<b>bold</b>');
    expect(html).not.toContain('script');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('<img');
    expect(html).toContain('kept text');
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const links = parsed.querySelectorAll('a');
    expect(links[0].hasAttribute('href')).toBe(false);
    expect(links[1].getAttribute('href')).toBe('https://example.com');
    expect(links[1].getAttribute('target')).toBe('_blank');
    expect(links[1].getAttribute('rel')).toBe('noopener noreferrer');
  });
});
