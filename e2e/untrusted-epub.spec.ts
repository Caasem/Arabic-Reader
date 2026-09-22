import { test, expect } from '@playwright/test';
import JSZip from 'jszip';

/**
 * A hostile EPUB must render as inert content: section iframes are
 * sandboxed with scripts allowed (needed for iOS taps), so the app strips
 * every script source out of each section before it renders. Each payload
 * below would otherwise reach the host page's window/localStorage.
 */
const HOSTILE_BODY = `
  <p onclick="parent.__pwnedClick = true">كتاب جميل <a href="javascript:parent.__pwnedHref = true">رابط</a></p>
  <script>try { parent.__pwnedScript = true; parent.localStorage.setItem('pwned', '1'); } catch (e) {}</script>
  <img src="missing.png" onerror="parent.__pwnedImg = true"/>
  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>parent.__pwnedSvg = true</script></svg>
  <iframe srcdoc="&lt;script&gt;parent.parent.__pwnedFrame = true&lt;/script&gt;"></iframe>
`;

async function buildEpub(body: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`
  );
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Hostile</dc:title><dc:language>ar</dc:language><dc:identifier id="BookId">urn:uuid:hostile-0001</dc:identifier>
  </metadata>
  <manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine page-progression-direction="rtl"><itemref idref="ch1"/></spine>
</package>`
  );
  zip.file(
    'OEBPS/ch1.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ar" dir="rtl">
<head><title>ch1</title></head>
<body dir="rtl">${body}</body>
</html>`
  );
  return zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip' });
}

test('scripts embedded in an EPUB never run, and word taps still work', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });

  await page.setInputFiles('.library__actions input[type=file]', {
    name: 'hostile.epub',
    mimeType: 'application/epub+zip',
    buffer: await buildEpub(HOSTILE_BODY),
  });
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.reader__epub iframe', { timeout: 30000 });

  const frame = () => page.frames().find((f) => f !== page.mainFrame())!;
  await expect.poll(() => frame().evaluate(() => document.querySelectorAll('.ar-word').length), { timeout: 15000 }).toBeGreaterThan(0);

  // Give any surviving payload (image error handler, etc.) a chance to fire.
  await page.waitForTimeout(1000);
  await frame().evaluate(() => {
    document.querySelector('p')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });

  const pwned = await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    return {
      flags: ['__pwnedClick', '__pwnedHref', '__pwnedScript', '__pwnedImg', '__pwnedSvg', '__pwnedFrame'].filter((k) => w[k]),
      storage: localStorage.getItem('pwned'),
    };
  });
  expect(pwned.flags, 'book-supplied script executed in the app').toEqual([]);
  expect(pwned.storage).toBeNull();

  const sectionState = await frame().evaluate(() => ({
    scripts: document.getElementsByTagNameNS('*', 'script').length,
    handlers: document.querySelectorAll('[onclick], [onerror]').length,
    csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? null,
  }));
  expect(sectionState.scripts).toBe(0);
  expect(sectionState.handlers).toBe(0);
  expect(sectionState.csp).toContain("script-src 'none'");

  // Tapping a word still opens the dictionary.
  await frame().evaluate(() => {
    document.querySelector('.ar-word')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await expect(page.locator('.dict-popup')).toBeVisible({ timeout: 8000 });
});
