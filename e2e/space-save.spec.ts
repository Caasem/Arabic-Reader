import { test, expect, type Page } from '@playwright/test';

/** Rows in the app's vocabulary table. */
const vocabCount = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('arabic-reader');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('vocabulary', 'readonly').objectStore('vocabulary').count();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        };
      })
  );

test.describe('new reader', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('Space saves the open word, never un-saves it, and still turns the page without a popup', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.navbar__settings', { timeout: 15000 });
    await page.locator('.navbar__item', { hasText: 'Library' }).click();
    await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
    if ((await page.locator('.book-card').count()) === 0) await page.click('text=Try the sample book');
    await page.locator('.book-card').first().click();
    await page.waitForSelector('.qr-chapter .ar-word', { timeout: 15000 });
    const chapter = page.locator('.qr-header__chapter');
    await expect(chapter).toHaveText('الفصل الأول: القرية');

    const word = page.locator('.qr-text .ar-word', { hasText: 'تُشْرِقُ' }).first();
    await word.click();
    const popup = page.locator('.dict-popup');
    await expect(popup.locator('.dict-popup__save')).toHaveText('Save Vocabulary', { timeout: 10000 });
    // The Save button shows while the lookup is still loading; Space only saves once it has finished.
    await expect(popup.locator('.dict-popup__loading')).toHaveCount(0);
    await expect(popup.locator('.dict-popup__shortcut', { hasText: 'Space' })).toBeVisible();

    const before = await vocabCount(page);
    await page.keyboard.press('Space');
    await expect(page.locator('.reader__touch-toast')).toContainText('Saved');
    await expect(popup.locator('.dict-popup__save')).toHaveText('✓ Vocabulary');
    await expect(word).toHaveClass(/ar-word--saved/);
    await expect.poll(() => vocabCount(page)).toBe(before + 1);
    // The popup is still open and the page did not turn.
    await expect(chapter).toHaveText('الفصل الأول: القرية');

    // A second Space never removes it.
    await page.keyboard.press('Space');
    await expect(page.locator('.reader__touch-toast')).toContainText('already in your vocabulary');
    await expect.poll(() => vocabCount(page)).toBe(before + 1);

    // Undo from the first save's toast is gone by now; save again via a fresh word and undo it.
    await popup.locator('.dict-popup__close').click();
    const other = page.locator('.qr-text .ar-word', { hasText: 'الشَّمْسَ' }).first();
    await other.click();
    await expect(popup.locator('.dict-popup__save')).toHaveText('Save Vocabulary', { timeout: 10000 });
    await expect(popup.locator('.dict-popup__loading')).toHaveCount(0);
    await page.keyboard.press('Space');
    await expect(page.locator('.reader__touch-toast-undo')).toBeVisible();
    await page.locator('.reader__touch-toast-undo').click();
    await expect.poll(() => vocabCount(page)).toBe(before + 1);
    await expect(other).not.toHaveClass(/ar-word--saved/);

    // With no popup open, Space turns the page as before.
    await popup.locator('.dict-popup__close').click();
    await expect(popup).toHaveCount(0);
    await page.keyboard.press('Space');
    await expect(chapter).toHaveText('الفصل الثاني: المدرسة');
  });

  /** Opens the sample book and the popup of its first word, ready to save. */
  async function openFirstWord(page: Page) {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
    await page.click('text=Try the sample book');
    await page.waitForSelector('.book-card', { timeout: 15000 });
    await page.click('.book-card');
    await page.waitForSelector('.qr-chapter .ar-word', { timeout: 30000 });
    await page.locator('.qr-chapter p .ar-word').first().click();
    await expect(page.locator('.dict-popup__save')).toHaveText('Save Vocabulary', { timeout: 10000 });
  }

  test('Space saves the word whose popup is open', async ({ page }) => {
    await openFirstWord(page);

    const before = await vocabCount(page);
    await page.keyboard.press('Space');
    await expect(page.locator('.dict-popup__save')).toHaveText('✓ Vocabulary');
    await expect.poll(() => vocabCount(page)).toBe(before + 1);
  });

  test('Space types a space in the edit box instead of saving', async ({ page }) => {
    await openFirstWord(page);

    const before = await vocabCount(page);
    await page.locator('.dict-popup__edit').click();
    const box = page.locator('textarea').first();
    await box.click();
    await box.press('End');
    await page.keyboard.press('Space');
    await page.keyboard.type('x');
    await expect(box).toHaveValue(/ x$/);
    expect(await vocabCount(page)).toBe(before);
  });
});
