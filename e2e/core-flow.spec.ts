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
  // First book open in the whole suite -- the sample EPUB itself and the
  // first-run AraMorph table build in its worker are slower cold than every
  // later navigation, hence the longer timeout here specifically rather than
  // raising the global default for every test.
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 30000 });

  const wordCount = await page.locator('.qr-chapter .ar-word').count();
  expect(wordCount, 'no .ar-word spans found -- word wrapping failed').toBeGreaterThan(0);

  const firstWord = page.locator('.qr-chapter p .ar-word').first();
  const clicked = await firstWord.getAttribute('data-word');
  expect(clicked).toBeTruthy();
  await firstWord.click();

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
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 10000 });
  await page.getByRole('button', { name: 'Contents', exact: true }).click();
  await page.getByRole('complementary', { name: 'Book' }).waitFor({ timeout: 5000 });
  const tocItemCount = await page.locator('.qr-chapter-row').count();
  expect(tocItemCount, 'expected at least 2 TOC entries for the 3-chapter sample book').toBeGreaterThanOrEqual(2);

  // --- Highlighting ---
  await page.locator('.navbar__label', { hasText: /^Read$/ }).click();
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 10000 });

  const selectionInfo = await page.evaluate(() => {
    const p = document.querySelector('.qr-chapter p');
    if (!p) return null;
    const words = p.querySelectorAll('.ar-word');
    if (words.length < 3) return null;
    const range = document.createRange();
    range.setStart(words[0].firstChild!, 0);
    range.setEnd(words[2].firstChild!, words[2].firstChild!.textContent!.length);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    document.querySelector('.qr-stage')!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    return { text: sel.toString() };
  });
  expect(selectionInfo, 'could not create a text selection in the rendered section').toBeTruthy();

  await page.getByRole('button', { name: 'Highlight yellow' }).click({ timeout: 8000 });
  await page.waitForTimeout(400);

  await page.locator('.navbar__item', { hasText: 'Highlights' }).click();
  await page.waitForSelector('.hl-card', { timeout: 5000 });
  await expect(page.locator('.hl-card')).toHaveCount(1);

  // --- Persistence across a full reload ---
  // A reload keeps the screen it was on (hash routing), so go back to the Library to see the book.
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('.book-card', { timeout: 10000 });
  expect(await page.locator('.book-card').count()).toBeGreaterThanOrEqual(1);

  await page.locator('.navbar__item', { hasText: 'Vocabulary' }).click();
  await page.waitForSelector('.vocab-card', { timeout: 5000 });
  expect(await page.locator('.vocab-card').count()).toBeGreaterThanOrEqual(1);

  await page.locator('.navbar__item', { hasText: 'Highlights' }).click();
  await page.waitForSelector('.hl-card', { timeout: 5000 });
  expect(await page.locator('.hl-card').count()).toBeGreaterThanOrEqual(1);

  // Highlight actually re-paints visually after reopening.
  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('.book-card', { timeout: 5000 });
  await page.click('.book-card');
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 10000 });
  // Saved highlights are drawn asynchronously (an IndexedDB read) as blocks behind the text
  // (readerCore/markBlocks.ts) -- poll instead of a fixed wait.
  await expect(page.locator('.qr-blocks[data-layer="highlights"] .qr-block--yellow').first()).toBeAttached({ timeout: 10000 });
});
