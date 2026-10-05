import { test, expect } from '@playwright/test';
import { useOriginalReader } from './originalReader';

test.beforeEach(async ({ page }) => useOriginalReader(page));

/**
 * The optional Baranov (Arabic-Russian) dictionary in the popup: its section is headed
 * "Baranov · Russian", many entries start folded, long entries show a few examples with a
 * "more" button, and words can be picked out and saved on their own.
 */
test('Baranov entries fold, expand, show more examples and save a word selection', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.click('.navbar__settings');
  await page.waitForSelector('.settings-panel');
  await page.getByRole('checkbox', { name: 'Baranov (Arabic-Russian)' }).check();
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape');
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.reader__epub iframe', { timeout: 30000 });
  await page.waitForTimeout(2500);

  const frame = page.frames().find((f) => f !== page.mainFrame())!;
  await frame.evaluate(() =>
    document.querySelectorAll('p .ar-word')[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })),
  );
  await page.waitForSelector('.dict-popup', { timeout: 8000 });

  const group = page
    .locator('.dict-popup__group')
    .filter({ has: page.locator('.dict-popup__group-header', { hasText: 'Baranov · Russian' }) });
  await expect(group).toBeVisible({ timeout: 20000 });

  const headwords = group.locator('.dict-popup__headword--toggle');
  expect(await headwords.count()).toBeGreaterThan(2);
  await expect(headwords.first()).toHaveAttribute('aria-expanded', 'false');
  await headwords.first().click();
  await expect(headwords.first()).toHaveAttribute('aria-expanded', 'true');

  const examples = group.locator('.dict-popup__example-ar');
  const shown = await examples.count();
  await group.locator('.dict-popup__examples-more button').first().click();
  expect(await examples.count()).toBeGreaterThan(shown);

  const words = group.locator('.dict-popup__senses--words .dict-popup__token');
  for (const n of [0, 3]) {
    await words.nth(n).dispatchEvent('pointerdown', { pointerId: 1, bubbles: true });
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
  }
  await expect(page.locator('.dict-popup__token--selected')).toHaveCount(2);
  await page.locator('.dict-popup__save-selection').click();
  await expect(page.locator('.dict-popup__token--selected')).toHaveCount(0);
});
