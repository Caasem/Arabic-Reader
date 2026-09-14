// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { SECTION_CSP, sanitizeSectionDocument } from './sanitizeSection';

const HOSTILE_SECTION = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:xlink="http://www.w3.org/1999/xlink">
<head><title>t</title><meta http-equiv="refresh" content="0;url=javascript:alert(1)"/></head>
<body onload="evil()">
  <p onclick="evil()">كتاب <a href=" java&#9;script:evil()">x</a> <a href="notes.xhtml#n1">note</a></p>
  <script>evil()</script>
  <img src="pic.png" onerror="evil()"/>
  <svg xmlns="http://www.w3.org/2000/svg"><script>evil()</script>
    <a xlink:href="javascript:evil()"><text>t</text></a>
    <set attributeName="href" to="javascript:evil()"/>
  </svg>
  <iframe srcdoc="&lt;script&gt;evil()&lt;/script&gt;"></iframe>
  <object data="x.swf"></object>
  <form action="javascript:evil()"><button formaction="javascript:evil()">b</button></form>
</body>
</html>`;

function parse(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xhtml+xml');
}

describe('sanitizeSectionDocument', () => {
  const doc = parse(HOSTILE_SECTION);
  sanitizeSectionDocument(doc);
  const html = new XMLSerializer().serializeToString(doc);

  it('removes script-capable elements, including inside SVG', () => {
    expect(doc.getElementsByTagNameNS('*', 'script')).toHaveLength(0);
    expect(doc.getElementsByTagNameNS('*', 'iframe')).toHaveLength(0);
    expect(doc.getElementsByTagNameNS('*', 'object')).toHaveLength(0);
    expect(doc.getElementsByTagNameNS('*', 'set')).toHaveLength(0);
  });

  it('removes inline event handlers and script URLs', () => {
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).not.toContain('javascript');
    expect(html).not.toMatch(/http-equiv="refresh"/i);
  });

  it('keeps ordinary content and links intact', () => {
    expect(doc.querySelector('p')?.textContent).toContain('كتاب');
    expect(html).toContain('href="notes.xhtml#n1"');
    expect(html).toContain('src="pic.png"');
  });

  it('injects a restrictive CSP as the first element in <head>', () => {
    const head = doc.getElementsByTagNameNS('*', 'head')[0];
    const first = head.firstElementChild!;
    expect(first.getAttribute('http-equiv')).toBe('Content-Security-Policy');
    expect(first.getAttribute('content')).toBe(SECTION_CSP);
  });

  it('creates a <head> when the section has none', () => {
    const bare = parse('<html xmlns="http://www.w3.org/1999/xhtml"><body><p>x</p></body></html>');
    sanitizeSectionDocument(bare);
    expect(bare.getElementsByTagNameNS('*', 'head')[0]?.firstElementChild?.getAttribute('content')).toBe(SECTION_CSP);
  });
});
