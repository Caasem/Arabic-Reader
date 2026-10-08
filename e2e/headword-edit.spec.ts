import { test, expect, type Page } from '@playwright/test';

/** The dictionary popup's headword can be corrected in place (a misread scan, a typo, another form). */
test.use({ viewport: { width: 1440, height: 900 } });

async function openSample(page: Page) {
  await page.goto('/');
  await page.waitForSelector('.navbar__settings', { timeout: 15000 });
  await page.locator('.navbar__item', { hasText: 'Library' }).click();
  await page.waitForSelector('text=Try the sample book', { timeout: 10000 });
  if ((await page.locator('.book-card').count()) === 0) await page.click('text=Try the sample book');
  await page.locator('.book-card').first().click();
  await page.waitForSelector('.qr-chapter .ar-word', { timeout: 15000 });
}

test('clicking the headword edits it, Enter looks up the corrected word, Esc cancels', async ({ page }) => {
  await openSample(page);
  await page.locator('.qr-chapter .ar-word').first().click();
  const popup = page.locator('.dict-popup');
  await expect(popup).toBeVisible({ timeout: 8000 });
  const original = (await popup.locator('.dict-popup__word-text').textContent())!.trim();

  // Escape leaves the word as it was.
  await popup.locator('.dict-popup__word-text').click();
  const input = popup.locator('.dict-popup__word-input');
  await expect(input).toBeFocused();
  await input.fill('xyz');
  await page.keyboard.press('Escape');
  await expect(popup.locator('.dict-popup__word-text')).toHaveText(original);
  await expect(popup).toBeVisible();

  // Enter looks the corrected word up, in the same popup.
  await popup.locator('.dict-popup__word-text').click();
  await popup.locator('.dict-popup__word-input').fill('كتاب');
  await page.keyboard.press('Enter');
  await expect(popup.locator('.dict-popup__word-text')).toHaveText('كتاب');
  await expect(popup.locator('.dict-popup__entry, .dict-popup__empty').first()).toBeVisible({ timeout: 8000 });
});
