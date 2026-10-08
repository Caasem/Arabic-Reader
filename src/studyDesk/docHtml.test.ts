// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { appendEmbed, embedHtml, fileUnderHeading, moveEmbedBefore, outline, removeEmbed, replaceEmbedWithHeading, sanitizeDocHtml, shiftEmbed } from './docHtml';

const ids = (html: string) => outline(html).flatMap((e) => (e.kind === 'item' ? [e.id] : []));

describe('sanitizeDocHtml', () => {
  it('keeps text, paragraphs, headings and embeds; drops scripts, attributes and unknown tags', () => {
    const dirty = '<p onclick="x()">Hi <b>there</b> <a href="javascript:1">link</a></p><script>alert(1)</script><h1 style="color:red">Title</h1>' + embedHtml('a1') + '<img src=x onerror=alert(1)>';
    const clean = sanitizeDocHtml(dirty);
    expect(clean).not.toMatch(/script|onclick|onerror|href|style|img/);
    expect(clean).toContain('<p>Hi <b>there</b> link</p>');
    expect(clean).toContain('<h3>Title</h3>');
    expect(clean).toContain('data-item="a1"');
  });

  it('wraps bare top-level text in a paragraph and turns divs into paragraphs', () => {
    expect(sanitizeDocHtml('loose text<div>line</div>')).toBe('<p>loose text</p><p>line</p>');
  });

  it('cleans the item id inside an embed', () => {
    expect(sanitizeDocHtml('<div class="desk-embed" data-item="a&quot;1"></div>')).toContain('data-item="a1"');
  });
});

describe('embeds', () => {
  it('appends before a trailing empty line and keeps a line to type on', () => {
    let html = '<p>notes</p><p><br></p>';
    html = appendEmbed(html, 'a');
    expect(html).toBe('<p>notes</p>' + embedHtml('a') + '<p><br></p>');
    html = appendEmbed('<p>no trailing line</p>', 'b');
    expect(html.endsWith('<p><br></p>')).toBe(true);
    expect(ids(html)).toEqual(['b']);
  });

  it('removes, moves and shifts items', () => {
    let html = '<p><br></p>';
    for (const id of ['a', 'b', 'c']) html = appendEmbed(html, id);
    expect(ids(html)).toEqual(['a', 'b', 'c']);
    expect(ids(moveEmbedBefore(html, 'c', 'a'))).toEqual(['c', 'a', 'b']);
    expect(ids(moveEmbedBefore(html, 'a', null))).toEqual(['b', 'c', 'a']);
    expect(ids(shiftEmbed(html, 'b', -1))).toEqual(['b', 'a', 'c']);
    expect(ids(shiftEmbed(html, 'b', 1))).toEqual(['a', 'c', 'b']);
    expect(ids(shiftEmbed(html, 'c', 1))).toEqual(['a', 'b', 'c']);
    expect(ids(removeEmbed(html, 'b'))).toEqual(['a', 'c']);
  });

  it('files an item under a heading', () => {
    let html = '<h3>One</h3><p>x</p><h3>Two</h3><p>y</p><p><br></p>';
    html = appendEmbed(html, 'a');
    const filed = fileUnderHeading(html, 'a', 0);
    const o = outline(filed);
    expect(o.find((e) => e.kind === 'item')).toEqual({ kind: 'item', id: 'a', heading: 0 });
    expect(outline(fileUnderHeading(filed, 'a', null))[0]).toEqual({ kind: 'item', id: 'a', heading: null });
    expect(outline(fileUnderHeading(filed, 'a', 1)).find((e) => e.kind === 'item')).toEqual({ kind: 'item', id: 'a', heading: 1 });
  });
});

describe('replaceEmbedWithHeading', () => {
  it('puts the heading where the item was', () => {
    let html = '<p><br></p>';
    for (const id of ['a', 'b']) html = appendEmbed(html, id);
    const out = replaceEmbedWithHeading(html, 'a', 'Rule <b>and</b> dynasty');
    expect(outline(out)).toEqual([{ kind: 'heading', text: 'Rule <b>and</b> dynasty', index: 0 }, { kind: 'item', id: 'b', heading: 0 }]);
  });
});
