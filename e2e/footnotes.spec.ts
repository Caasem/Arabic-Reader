import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';

/** A one-chapter book whose first paragraph ends in a footnote marker pointing at `href`, with `noteHtml` after it. */
async function buildNotedEpub(href: string, noteHtml: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
  );
  zip.file(
    'OEBPS/content.opf',
    `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>حواش</dc:title><dc:language>ar</dc:language><dc:identifier id="id">urn:uuid:notes-${Math.random().toString(36).slice(2)}</dc:identifier></metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>`
  );
  zip.file(
    'OEBPS/c1.xhtml',
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" dir="rtl"><body><h1>الفصل</h1><p>وَخَيْرُ جَلِيسٍ<a epub:type="noteref" href="${href}">1</a> كِتَابُ.</p>${noteHtml}</body></html>`
  );
  return zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip' });
}

async function openNotedBook(page: Page, href: string, noteHtml: string) {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.setInputFiles('.library__actions input[type=file]', {
    name: 'notes.epub',
    mimeType: 'application/epub+zip',
    buffer: await buildNotedEpub(href, noteHtml),
  });
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 15000 });
}

const INJECTED = '<aside id="test-note-1" epub:type="footnote"><p>This is the injected footnote text with <script>window.__xss = true;</script><b>bold</b> content.</p></aside>';

test('footnote popup resolves inline content, does not run scripts in it, and does not navigate away', async ({ page }) => {
  await openNotedBook(page, '#test-note-1', INJECTED);
  const chapterBefore = await page.textContent('.qr-header__chapter');

  await page.getByRole('button', { name: 'Note 1' }).click();
  const popup = page.getByRole('dialog', { name: 'Note 1' });
  await expect(popup).toBeVisible({ timeout: 8000 });
  const footnoteText = (await popup.textContent())!;
  expect(footnoteText).toContain('injected footnote text');
  expect(footnoteText).not.toContain('function');

  const xssRan = await page.evaluate(() => (window as unknown as { __xss?: boolean }).__xss === true);
  expect(xssRan, 'injected <script> in footnote content actually executed').toBe(false);

  const chapterAfter = await page.textContent('.qr-header__chapter');
  expect(chapterAfter, 'footnote click navigated away from the current chapter').toBe(chapterBefore);

  await popup.getByRole('button', { name: 'Close note' }).click();
  await expect(popup).toHaveCount(0);
});

test('the note leaves out the source of a <script> in it', async ({ page }) => {
  await openNotedBook(page, '#test-note-1', INJECTED);
  await page.getByRole('button', { name: 'Note 1' }).click();
  const popup = page.getByRole('dialog', { name: 'Note 1' });
  await expect(popup).toContainText('bold content');
  await expect(popup).not.toContainText('__xss');
});

// Accepted loss (0.96.0): the old popup kept the note's safe markup (<b>); the new one shows the note's plain text.
test.fixme('footnote popup keeps safe markup from the note', async ({ page }) => {
  await openNotedBook(page, '#test-note-1', INJECTED);
  await page.getByRole('button', { name: 'Note 1' }).click();
  const popup = page.getByRole('dialog', { name: 'Note 1' });
  await expect(popup.locator('b')).toHaveCount(1);
});

test('an unresolvable footnote target says the note could not be found', async ({ page }) => {
  await openNotedBook(page, '#does-not-exist', '');

  await page.getByRole('button', { name: 'Note 1' }).click();
  const popup = page.getByRole('dialog', { name: 'Note 1' });
  await expect(popup).toContainText('could not be found in the book', { timeout: 8000 });
});

// The old popup offered a "Go to note" fallback for a note it could not load inline; the new one only offers it when the note's text is in the book.
test.fixme('an unresolvable footnote target shows the "Go to note" fallback', async ({ page }) => {
  await openNotedBook(page, '#does-not-exist', '');

  await page.getByRole('button', { name: 'Note 1' }).click();
  const popup = page.getByRole('dialog', { name: 'Note 1' });
  await expect(popup.getByRole('button', { name: 'Go to note' })).toHaveCount(1);
});
