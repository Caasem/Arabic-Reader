import { test, expect } from '@playwright/test';

/**
 * Press Alt+S in the reader to search the whole book; Enter jumps to a match.
 */
test('Alt+S searches the book and jumps to a match', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  await page.click('text=Try the sample book');
  await page.waitForSelector('.book-card', { timeout: 15000 });
  await page.click('.book-card');
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 30000 });

  const word = (await page.locator('.qr-chapter p .ar-word').first().getAttribute('data-word'))!;
  const pressSInBook = () => page.keyboard.press('Alt+s');

  // Alt+S opens the palette; typing finds the word, in both modes.
  await pressSInBook();
  await expect(page.locator('.bsearch')).toBeVisible();
  await page.keyboard.type(word);
  await expect(page.locator('.bsearch__hit').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.bsearch__hit mark').first()).not.toBeEmpty();
  await page.getByRole('button', { name: 'Exact text' }).click();
  await expect(page.locator('.bsearch__hit').first()).toBeVisible({ timeout: 15000 });

  // Enter jumps to the match and closes the palette.
  await page.locator('.bsearch__input').press('Enter');
  await expect(page.locator('.bsearch')).toHaveCount(0);

  // Alt+S also closes it, and Escape too.
  await pressSInBook();
  await expect(page.locator('.bsearch')).toBeVisible();
  await page.keyboard.press('Alt+s');
  await expect(page.locator('.bsearch')).toHaveCount(0);
  await pressSInBook();
  await page.keyboard.press('Escape');
  await expect(page.locator('.bsearch')).toHaveCount(0);

  // Switched off, Alt+S does nothing.
  await page.click('.navbar__settings');
  await page.locator('label', { hasText: 'Enable the Alt+S shortcut' }).locator('input').uncheck();
  await page.click('.settings-panel__close');
  await page.keyboard.press('Alt+s');
  await expect(page.locator('.bsearch')).toHaveCount(0);
});
