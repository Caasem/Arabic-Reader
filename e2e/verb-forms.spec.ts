import { test, expect } from '@playwright/test';
import { useOriginalReader } from './originalReader';

test.beforeEach(async ({ page }) => useOriginalReader(page));

/**
 * Clean popup layout: pressing a verb's root shows its form (I-X) in the same
 * spot; tapping the verb lists the dictionary's other verbs for that root. The
 * sample book is searched word by word until a verb comes up. With the clean
 * layout off, the classic popup returns.
 */
test('the dictionary popup shows a verb form and the root family', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
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
    await page.waitForTimeout(700);
    found = (await page.locator('.dict-popup--clean .dict-popup__entry--tappable').count()) > 0;
    if (!found) await page.click('.dict-popup__close');
  }
  expect(found, 'a verb with a known form turns up in the sample book').toBe(true);

  // Pressing the root swaps it for the form, in the same spot.
  const verbEntry = page.locator('.dict-popup__entry--tappable').first();
  await verbEntry.locator('.dict-popup__morph-item[data-kind="root"]').click();
  await expect(verbEntry.locator('[data-kind="root"] .dict-popup__morph-face--label')).toHaveText(/^Form (I|II|III|IV|V|VI|VII|VIII|IX|X)$/);

  // Tapping the verb opens the root's other verbs; tapping again closes them.
  await verbEntry.locator('.dict-popup__headword').click();
  await expect(page.locator('.verb-forms__item').first()).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.verb-forms__item--current')).not.toHaveCount(0);
  await page.locator('.dict-popup').screenshot({ path: 'test-results/clean-popup.png' });
  await verbEntry.locator('.dict-popup__headword').click();
  await expect(page.locator('.verb-forms__item')).toHaveCount(0);

  // Clean layout off: the classic popup returns.
  await page.click('.dict-popup__close');
  await page.click('.navbar__settings');
  await page.locator('label', { hasText: 'Clean popup layout' }).locator('input').uncheck();
  await page.click('.settings-panel__close');
  await frame.evaluate(() => {
    document.querySelectorAll('p .ar-word')[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await page.waitForSelector('.dict-popup', { timeout: 8000 });
  await expect(page.locator('.dict-popup--clean')).toHaveCount(0);
});
