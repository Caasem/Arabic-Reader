import { test, expect } from '@playwright/test';
import { useOriginalReader } from './originalReader';

test.beforeEach(async ({ page }) => useOriginalReader(page));

/**
 * Clean popup layout: the Al-Wasit definition is open by default; pressing its
 * headword folds it to the headword row, pressing again opens it. A new lookup
 * opens it again. Each Al-Wasit sub-entry has its own round "+".
 */
test('pressing the Al-Wasit headword folds and unfolds its definition', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('.navbar__settings');
  await page.locator('.settings-row--dict').nth(1).locator('input').check();
  await page.waitForTimeout(3000);
  await page.click('.settings-panel__close');
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.reader__epub iframe', { timeout: 30000 });
  await page.waitForTimeout(2500);

  const frame = page.frames().find((f) => f !== page.mainFrame())!;
  const count = await frame.evaluate(() => document.querySelectorAll('p .ar-word').length);
  let found = false;
  for (let i = 0; i < Math.min(count, 40) && !found; i++) {
    await frame.evaluate((n) => {
      document.querySelectorAll('p .ar-word')[n].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }, i);
    await page.waitForSelector('.dict-popup', { timeout: 8000 });
    await page.waitForTimeout(1500);
    found = (await page.locator('.dict-popup__subentry .dict-popup__sense-add').count()) > 0;
    if (!found) await page.click('.dict-popup__close');
  }
  expect(found, 'a word with an Al-Wasit entry turns up in the sample book').toBe(true);

  const headword = page.locator('.dict-popup__headword--toggle').first();
  const open = await page.locator('.dict-popup__tokens').count();
  const addsOpen = await page.locator('.dict-popup__sense-add').count();
  expect(open).toBeGreaterThan(0);
  await headword.click();
  await expect(page.locator('.dict-popup__tokens')).toHaveCount(open - 1);
  await expect(page.locator('.dict-popup__sense-add')).not.toHaveCount(addsOpen);
  await expect(headword).toHaveAttribute('aria-expanded', 'false');
  await headword.click();
  await expect(page.locator('.dict-popup__tokens')).toHaveCount(open);
  await expect(headword).toHaveAttribute('aria-expanded', 'true');

  // One round "+" per sub-entry saves just that section.
  await page.locator('.dict-popup__sense-add').first().click();
  await expect(page.locator('.dict-popup__sense-add').first()).toBeDisabled();
});
