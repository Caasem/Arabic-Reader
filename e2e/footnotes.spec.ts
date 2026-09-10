import { test, expect } from '@playwright/test';

async function openSampleBook(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.reader__epub iframe', { timeout: 15000 });
  await page.waitForTimeout(1800);
  return page.frames().find((f) => f !== page.mainFrame())!;
}

test('footnote popup resolves inline content, sanitizes it, and does not navigate away', async ({ page }) => {
  const readerFrame = await openSampleBook(page);
  const chapterBefore = await page.textContent('.reader__chapter');

  await readerFrame.evaluate(() => {
    const p = document.querySelector('p')!;
    const marker = document.createElement('a');
    marker.setAttribute('epub:type', 'noteref');
    marker.setAttribute('href', '#test-note-1');
    marker.textContent = '1';
    p.appendChild(marker);

    const note = document.createElement('div');
    note.id = 'test-note-1';
    note.innerHTML = 'This is the injected footnote text with <script>window.__xss = true;</script><b>bold</b> content.';
    note.style.display = 'none';
    document.body.appendChild(note);

    marker.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });

  await page.waitForSelector('.footnote-popup', { timeout: 8000 });
  await page.waitForTimeout(400);
  const footnoteText = (await page.textContent('.footnote-popup'))!;
  expect(footnoteText).toContain('injected footnote text');
  expect(footnoteText).not.toContain('function');
  expect(footnoteText).not.toContain('__xss');

  const xssRan = await readerFrame.evaluate(() => (window as unknown as { __xss?: boolean }).__xss === true);
  expect(xssRan, 'injected <script> in footnote content actually executed').toBe(false);

  const chapterAfter = await page.textContent('.reader__chapter');
  expect(chapterAfter, 'footnote click navigated away from the current chapter').toBe(chapterBefore);

  await expect(page.locator('.footnote-popup__body b')).toHaveCount(1);

  await page.click('.footnote-popup__close');
  await page.waitForTimeout(200);
  await expect(page.locator('.footnote-popup')).toHaveCount(0);
});

test('an unresolvable footnote target shows the "Go to note" fallback', async ({ page }) => {
  const readerFrame = await openSampleBook(page);

  await readerFrame.evaluate(() => {
    const p = document.querySelector('p')!;
    const marker = document.createElement('a');
    marker.setAttribute('epub:type', 'noteref');
    marker.setAttribute('href', '#does-not-exist');
    marker.textContent = '2';
    p.appendChild(marker);
    marker.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });

  await page.waitForSelector('.footnote-popup', { timeout: 8000 });
  await page.waitForTimeout(400);
  const failedText = (await page.textContent('.footnote-popup'))!;
  expect(failedText).toContain("Couldn't load this note inline");
  await expect(page.locator('.footnote-popup__goto')).toHaveCount(1);
});
