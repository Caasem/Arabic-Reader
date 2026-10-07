import { test, expect, type Page } from '@playwright/test';

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

test.use({ viewport: { width: 1440, height: 900 } });

test('the per-entry + saves that entry, and pressing it again removes it', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  if ((await page.locator('.book-card').count()) === 0) await page.click('text=Try the sample book');
  await page.locator('.book-card').first().click();
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 15000 });

  await page.locator('.qr-text .ar-word', { hasText: 'تُشْرِقُ' }).first().click();
  const popup = page.locator('.dict-popup');
  await expect(popup.locator('.dict-popup__loading')).toHaveCount(0, { timeout: 10000 });
  const plus = popup.locator('.dict-popup__entry-save').first();
  await expect(plus).toHaveText('+');

  const before = await vocabCount(page);
  await plus.click();
  await expect(plus).toHaveText('✓');
  await expect.poll(() => vocabCount(page)).toBe(before + 1);
  await expect(popup.locator('.dict-popup__save')).toHaveText('✓ Vocabulary');

  await plus.click();
  await expect(plus).toHaveText('+');
  await expect.poll(() => vocabCount(page)).toBe(before);
  await expect(popup.locator('.dict-popup__save')).toHaveText('Save Vocabulary');
});
