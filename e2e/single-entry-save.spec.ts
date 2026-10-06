import { test, expect } from '@playwright/test';
import { useOriginalReader } from './originalReader';

test.beforeEach(async ({ page }) => useOriginalReader(page));

/** Rows in one IndexedDB table of the app's database. */
async function count(page: import('@playwright/test').Page, table: string): Promise<number> {
  return page.evaluate(
    (name) =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('arabic-reader');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction(name, 'readonly').objectStore(name).count();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        };
      }),
    table
  );
}

/**
 * A word whose lookup returns a single entry shows the same round "+" that each entry shows when
 * there are several. Pressing it saves that entry once and records it as the reader's pick.
 */
test('the per-entry "+" appears and saves when a word has only one entry', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.reader__epub iframe', { timeout: 30000 });
  await page.waitForTimeout(2500);
  const frame = page.frames().find((f) => f !== page.mainFrame())!;

  // Find a word with exactly one dictionary entry.
  const total = await frame.evaluate(() => document.querySelectorAll('p .ar-word').length);
  let found = false;
  for (let i = 0; i < Math.min(total, 60) && !found; i++) {
    await frame.evaluate((n) => document.querySelectorAll('p .ar-word')[n].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })), i);
    await page.waitForSelector('.dict-popup', { timeout: 8000 });
    await page.waitForTimeout(700);
    found = (await page.locator('.dict-popup__entry').count()) === 1 && !(await page.locator('.dict-popup__save--saved').count());
    if (!found) await page.click('.dict-popup__close');
  }
  expect(found, 'a word with exactly one dictionary entry turns up in the sample book').toBe(true);

  const plus = page.locator('.dict-popup__entry .dict-popup__entry-save');
  await expect(plus).toHaveCount(1);
  const before = await count(page, 'vocabulary');
  await plus.click();
  await expect(plus).toHaveText('✓');
  await expect(plus).toBeDisabled();
  await expect(page.locator('.dict-popup__save')).toHaveText('✓ Vocabulary');

  await expect.poll(() => count(page, 'vocabulary')).toBe(before + 1);
  await expect.poll(() => count(page, 'sensePicks')).toBe(1);
});
