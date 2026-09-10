import { test, expect } from '@playwright/test';

/**
 * The main reading path: open the sample book, tap a word, save it, confirm
 * it shows up in Vocabulary, then TOC navigation, highlighting, and that
 * everything survives a full page reload (fresh JS context, same IndexedDB).
 */
test('word lookup, save, highlight, and TOC survive a reload', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  // First book open in the whole suite -- epub.js's own asset fetches (the
  // sample EPUB itself, first-run AraMorph table build in its worker) are
  // slower cold than every later navigation, hence the longer timeout here
  // specifically rather than raising the global default for every test.
  await page.waitForSelector('.reader__epub iframe', { timeout: 30000 });
  await page.waitForTimeout(2500); // epub.js render + word-wrapping

  const readerFrame = page.frames().find((f) => f !== page.mainFrame());
  expect(readerFrame, 'epub iframe not found among page frames').toBeTruthy();

  const wordCount = await readerFrame!.evaluate(() => document.querySelectorAll('.ar-word').length);
  expect(wordCount, 'no .ar-word spans found -- word wrapping failed').toBeGreaterThan(0);

  const clicked = await readerFrame!.evaluate(() => {
    const el = document.querySelector('p .ar-word') || document.querySelector('.ar-word');
    if (!el) return null;
    (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return (el as HTMLElement).dataset.word;
  });
  expect(clicked).toBeTruthy();

  await page.waitForSelector('.dict-popup', { timeout: 8000 });
  await page.waitForTimeout(800);
  const popupText = await page.textContent('.dict-popup');
  expect(popupText).not.toContain('No entry found');
  await expect(page.locator('.dict-popup__save')).toBeVisible();

  const saveDisabled = await page.getAttribute('.dict-popup__save', 'disabled');
  if (saveDisabled === null) {
    await page.click('.dict-popup__save');
    await page.waitForSelector('.dict-popup__save--saved', { timeout: 5000 });
  }
  await page.click('.dict-popup__close');
  await page.waitForTimeout(300);

  await page.locator('.navbar__item', { hasText: 'Vocabulary' }).click();
  await page.waitForSelector('.vocab', { timeout: 5000 });
  const vocabCardCount = await page.locator('.vocab-card').count();
  expect(vocabCardCount, 'vocabulary tab shows 0 saved words after saving one').toBeGreaterThan(0);

  // --- TOC ---
  await page.locator('.navbar__label', { hasText: /^Read$/ }).click();
  await page.waitForSelector('.reader__epub iframe', { timeout: 10000 });
  await page.waitForTimeout(1500);
  await page.click('text=Contents');
  await page.waitForSelector('.reader__toc', { timeout: 5000 });
  const tocItemCount = await page.locator('.toc-list__item').count();
  expect(tocItemCount, 'expected at least 2 TOC entries for the 3-chapter sample book').toBeGreaterThanOrEqual(2);

  // --- Highlighting ---
  await page.locator('.navbar__label', { hasText: /^Read$/ }).click();
  await page.waitForSelector('.reader__epub iframe', { timeout: 10000 });
  await page.waitForTimeout(1500);
  const hlFrame = page.frames().find((f) => f !== page.mainFrame())!;

  const selectionInfo = await hlFrame.evaluate(() => {
    const p = document.querySelector('p');
    if (!p) return null;
    const words = p.querySelectorAll('.ar-word');
    if (words.length < 3) return null;
    const range = document.createRange();
    range.setStart(words[0].firstChild!, 0);
    range.setEnd(words[2].firstChild!, words[2].firstChild!.textContent!.length);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    return { text: sel.toString() };
  });
  expect(selectionInfo, 'could not create a text selection in the rendered section').toBeTruthy();
  await hlFrame.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));

  await page.waitForSelector('.selection-toolbar', { timeout: 8000 });
  await page.click('.selection-toolbar__swatch--yellow');
  await page.waitForTimeout(400);

  await page.locator('.navbar__item', { hasText: 'Highlights' }).click();
  await page.waitForSelector('.hl-card', { timeout: 5000 });
  await expect(page.locator('.hl-card')).toHaveCount(1);

  // --- Persistence across a full reload ---
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.book-card', { timeout: 10000 });
  expect(await page.locator('.book-card').count()).toBeGreaterThanOrEqual(1);

  await page.locator('.navbar__item', { hasText: 'Vocabulary' }).click();
  await page.waitForSelector('.vocab-card', { timeout: 5000 });
  expect(await page.locator('.vocab-card').count()).toBeGreaterThanOrEqual(1);

  await page.locator('.navbar__item', { hasText: 'Highlights' }).click();
  await page.waitForSelector('.hl-card', { timeout: 5000 });
  expect(await page.locator('.hl-card').count()).toBeGreaterThanOrEqual(1);

  // Highlight actually re-renders visually (SVG overlay in the main
  // document, positioned over the iframe -- not inside it) after reopening.
  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('.book-card', { timeout: 5000 });
  await page.click('.book-card');
  await page.waitForSelector('.reader__epub iframe', { timeout: 10000 });
  // Saved highlights are re-registered asynchronously (an IndexedDB read,
  // see Reader.tsx) and epub.js queues/renders them as their section comes
  // into view -- poll instead of a fixed wait, since exactly how long that
  // takes depends on both of those finishing, not a fixed render delay.
  await expect(page.locator('[ref="ar-highlight"]')).not.toHaveCount(0, { timeout: 10000 });
});
