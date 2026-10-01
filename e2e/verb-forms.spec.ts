import { test, expect } from '@playwright/test';

/**
 * Tapping a verb shows its form (I-X) under the headword, and "Other forms of
 * <root>" lists the dictionary's other verbs for that root. The sample book is
 * searched word by word until a verb comes up.
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
    found = (await page.locator('.verb-forms').count()) > 0;
    if (!found) await page.click('.dict-popup__close');
  }
  expect(found, 'a verb with a known form turns up in the sample book').toBe(true);

  await expect(page.locator('.verb-forms__mark').first()).toHaveText(/^(I|II|III|IV|V|VI|VII|VIII|IX|X)$/);
  await page.locator('.verb-forms__toggle').first().click();
  await expect(page.locator('.verb-forms__item').first()).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.verb-forms__item--current')).not.toHaveCount(0);

  // Switched off in Settings, the form disappears.
  await page.click('.dict-popup__close');
  await page.click('.navbar__settings');
  await page.locator('label', { hasText: 'Show the verb form (I-X) in the dictionary' }).locator('input').uncheck();
  await page.click('.settings-panel__close');
  await expect(page.locator('.verb-forms')).toHaveCount(0);
});
